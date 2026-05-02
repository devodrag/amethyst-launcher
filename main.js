const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL, URLSearchParams } = require('url');

/**
 * =============================================================================
 * КОНФИГУРАЦИЯ (РАБОЧИЕ ПАРАМЕТРЫ)
 * =============================================================================
 */
let mainWindow;
let msAuth = null;

// Официальный ID клиента Mojang Launcher (рабочая связка без Azure DevOps)
const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT = 'https://login.live.com/oauth20_desktop.srf';
/** Важно: не использовать service::..., иначе RPS-токен не подходит под Xbox Authenticate */
const MS_SCOPES = 'XboxLive.signin offline_access';
const STORE_KEY_MS_SESSION = 'ms-session';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 680,
        minWidth: 960,
        minHeight: 620,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadFile('index.html');
}

function restoreMicrosoftSessionFromDisk() {
    try {
        const row = readStore()[STORE_KEY_MS_SESSION];
        if (row && row.msRefreshToken && row.profile?.id && row.mcAccessToken) msAuth = row;
    } catch {}
}

app.whenReady().then(() => {
    restoreMicrosoftSessionFromDisk();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

/**
 * =============================================================================
 * УПРАВЛЕНИЕ ОКНОМ
 * =============================================================================
 */
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow?.close());

ipcMain.on('open-external', (e, url) => shell.openExternal(url));
ipcMain.on('open-folder', (e, p) => {
    const target = p || getDefaultGamePath();
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
    shell.openPath(target);
});

/** Папка инстанса: отдельная на каждую пару «версия + тип загрузчика» (моды не перемешиваются). */
ipcMain.handle('get-instance-path', (_, cfg) => ({
    path: getInstanceRoot(cfg?.version, cfg?.loader),
}));

/**
 * =============================================================================
 * ХРАНИЛИЩЕ
 * =============================================================================
 */
const storePath = path.join(app.getPath('userData'), 'amethyst-store.json');

function readStore() {
    try {
        if (!fs.existsSync(storePath)) return {};
        return JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (e) { return {}; }
}

function writeStore(data) {
    try {
        fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
}

ipcMain.handle('store-get', (e, key) => readStore()[key]);
ipcMain.handle('store-set', (e, key, val) => {
    const s = readStore();
    s[key] = val;
    writeStore(s);
});

ipcMain.handle('get-system-info', () => ({
    totalRam: Math.floor(os.totalmem() / 1024 / 1024 / 1024),
    platform: process.platform,
}));

ipcMain.handle('fetch-versions', async () => {
    try {
        const data = await new Promise((resolve, reject) => {
            https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', (res) => {
                let body = '';
                res.on('data', (d) => { body += d; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`manifest HTTP ${res.statusCode}`));
                    }
                    try {
                        resolve(JSON.parse(body));
                    } catch (parseErr) {
                        reject(parseErr);
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        });
        return { success: true, versions: data.versions };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * =============================================================================
 * MICROSOFT AUTH — OAuth + Xbox Services + Mojang Minecraft Services
 * =============================================================================
 */
function saveMsSession(snapshot) {
    msAuth = snapshot;
    const s = readStore();
    s[STORE_KEY_MS_SESSION] = snapshot;
    writeStore(s);
}

function normalizeUuid(mcId) {
    if (!mcId) return mcId;
    const s = String(mcId).replace(/-/g, '');
    if (s.length !== 32) return String(mcId);
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function newClientToken() {
    try {
        return crypto.randomUUID();
    } catch {
        const b = crypto.randomBytes(16);
        const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
}

async function minecraftLoginChainFromMicrosoftAccessToken(msAccess) {
    const xbl = await msPost('user.auth.xboxlive.com', '/user/authenticate',
        JSON.stringify({
            Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccess}` },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        }), 'application/json');

    let xsts;
    try {
        xsts = await msPost('xsts.auth.xboxlive.com', '/xsts/authorize',
            JSON.stringify({
                Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
                RelyingParty: 'rp://api.minecraftservices.com/',
                TokenType: 'JWT'
            }), 'application/json');
    } catch (e) {
        const hint = parseXstsError(e.message);
        throw new Error(hint || e.message || 'Не удалось получить XSTS (Xbox)');
    }

    const uhs = xbl?.DisplayClaims?.xui?.[0]?.uhs;
    if (!uhs) throw new Error('Нет Userhash (DisplayClaims.xui) после Xbox авторизации.');
    const token = xsts?.Token;
    if (!token) throw new Error('Пустой XSTS токен.');

    const mc = await msPost('api.minecraftservices.com', '/authentication/login_with_xbox',
        JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${token}` }), 'application/json');

    const prof = await httpsGetAuthorizedJson('/minecraft/profile', mc.access_token);
    if (!prof || !prof.id || !prof.name) {
        throw new Error('Не удалось получить профиль Minecraft Java. Убедитесь, что на аккаунте есть покупка Java Edition.');
    }
    return { mc, profile: prof };
}

function parseXstsError(msgOrErr) {
    const s = String(msgOrErr || '');
    let o;
    try {
        o = JSON.parse(s);
    } catch {
        const j = /\{[\s\S]*"XErr"[\s\S]*\}/.exec(s);
        if (!j) return null;
        try {
            o = JSON.parse(j[0]);
        } catch {
            return null;
        }
    }
    if (!o || o.XErr == null) return null;
    const code = Number(o.XErr);
    if (code === 2148916233) return 'На аккаунте Microsoft нет Xbox-профиля — создайте gamertag (Xbox приложение или xbox.com).';
    if (code === 2148916238) return 'Этот Microsoft-аккаунт не может войти в Xbox Live (ограничения / детский аккаунт).';
    if (code === 2148916236) return 'Подтвердите дату рождения и соглашения в учётной записи Microsoft.';
    return `Ошибка Xbox XSTS (XErr=${o.XErr}).`;
}

async function finalizeFromMicrosoftOAuthTokens(msTok) {
    if (!msTok?.access_token || !msTok?.refresh_token) {
        throw new Error('Не получены access_token или refresh_token от Microsoft.');
    }
    const clientToken = (msAuth && msAuth.clientToken) || newClientToken();
    const { mc, profile } = await minecraftLoginChainFromMicrosoftAccessToken(msTok.access_token);

    const now = Math.floor(Date.now() / 1000);
    const mcExp = mc.expires_in ? now + Number(mc.expires_in) : now + 86400;
    const msExp = msTok.expires_in ? now + Number(msTok.expires_in) : now + 3600;

    saveMsSession({
        msRefreshToken: msTok.refresh_token,
        mcAccessToken: mc.access_token,
        mcExpiresAt: mcExp - 120,
        msExpiresAt: msExp - 60,
        profile: { id: profile.id, name: profile.name },
        clientToken,
    });

    return profile.name;
}

async function refreshMicrosoftMinecraftTokens() {
    if (!msAuth?.msRefreshToken) throw new Error('Нет refresh_token Microsoft. Войдите заново.');
    const attempt = async (withRedirect) => {
        const p = new URLSearchParams({
            client_id: MS_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: msAuth.msRefreshToken,
        });
        if (withRedirect) p.set('redirect_uri', MS_REDIRECT);
        return msPost('login.live.com', '/oauth20_token.srf', p.toString(), 'application/x-www-form-urlencoded');
    };
    let msTok;
    try {
        msTok = await attempt(true);
    } catch (e1) {
        msTok = await attempt(false).catch(() => {
            throw e1;
        });
    }
    return finalizeFromMicrosoftOAuthTokens(msTok);
}

async function ensureMcTokenReadyForLaunch() {
    const now = Math.floor(Date.now() / 1000);
    if (!msAuth?.mcAccessToken) throw new Error('Нет сохранённого Minecraft токена. Войдите через Microsoft заново.');
    let okProfile = msAuth.mcExpiresAt && now < msAuth.mcExpiresAt;
    if (okProfile) {
        const prof = await httpsGetAuthorizedJson('/minecraft/profile', msAuth.mcAccessToken, true).catch(() => null);
        if (prof?.id && prof?.name) {
            if (prof.name !== msAuth.profile?.name || prof.id !== msAuth.profile?.id) {
                msAuth.profile = { id: prof.id, name: prof.name };
                saveMsSession(msAuth);
            }
            return;
        }
    }
    await refreshMicrosoftMinecraftTokens();
}

ipcMain.handle('auth-ms-login', async () => {
    try {
        const code = await openMicrosoftAuthModal();
        const body = new URLSearchParams({
            client_id: MS_CLIENT_ID,
            code,
            grant_type: 'authorization_code',
            redirect_uri: MS_REDIRECT,
            scope: MS_SCOPES,
        }).toString();
        const msTok = await msPost('login.live.com', '/oauth20_token.srf', body, 'application/x-www-form-urlencoded');
        const username = await finalizeFromMicrosoftOAuthTokens(msTok);
        return { success: true, username };
    } catch (err) {
        console.error('Auth Error:', err);
        return { success: false, error: String(err.message || err) };
    }
});

ipcMain.handle('auth-ms-logout', async () => {
    msAuth = null;
    const s = readStore();
    delete s[STORE_KEY_MS_SESSION];
    writeStore(s);
    return { ok: true };
});

ipcMain.handle('auth-ms-status', async () => {
    if (!msAuth?.profile?.name || !msAuth?.mcAccessToken) {
        return { loggedIn: false };
    }
    try {
        const prof = await httpsGetAuthorizedJson('/minecraft/profile', msAuth.mcAccessToken, true);
        if (prof?.id && prof?.name) {
            if (prof.id !== msAuth.profile.id || prof.name !== msAuth.profile.name) {
                msAuth.profile = { id: prof.id, name: prof.name };
                saveMsSession(msAuth);
            }
            return { loggedIn: true, username: prof.name };
        }
    } catch {
        /* игнорируем */
    }
    return { loggedIn: !!msAuth.msRefreshToken, username: msAuth.profile.name };
});

function openMicrosoftAuthModal() {
    return new Promise((resolve, reject) => {
        let settled = false;
        const url = [
            `https://login.live.com/oauth20_authorize.srf`,
            '?client_id=' + encodeURIComponent(MS_CLIENT_ID),
            '&response_type=code',
            '&redirect_uri=' + encodeURIComponent(MS_REDIRECT),
            '&scope=' + encodeURIComponent(MS_SCOPES),
            '&prompt=select_account',
        ].join('');

        const win = new BrowserWindow({
            width: 520,
            height: 720,
            parent: mainWindow || undefined,
            modal: !!mainWindow,
            autoHideMenuBar: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        function done(ok, payload) {
            if (settled) return;
            settled = true;
            try {
                if (win && !win.isDestroyed()) win.close();
            } catch (_) {}
            if (ok) resolve(payload); else reject(payload);
        }

        function tryExtractFromUrl(navUrl) {
            if (!navUrl || settled) return;
            let parsed;
            try {
                parsed = new URL(navUrl);
            } catch {
                const mCode = navUrl.match(/(?:\?|#|&)code=([^&#]+)/);
                if (mCode) return decodeURIComponent(mCode[1]);
                const mErr = navUrl.match(/(?:\?|#|&)error=([^&#]+)/);
                if (mErr) done(false, new Error(`Microsoft: ${decodeURIComponent(mErr[1])}`));
                return;
            }
            const oauthErr = parsed.searchParams.get('error');
            if (oauthErr) {
                const desc = parsed.searchParams.get('error_description');
                done(false, new Error(`Microsoft OAuth: ${oauthErr}${desc ? ': ' + desc : ''}`));
                return null;
            }
            const code = parsed.searchParams.get('code');
            if (!code && /oauth20_desktop\.srf/i.test(parsed.pathname || '')) return null;
            return code || null;
        }

        win.webContents.on('will-redirect', (_ev, navigated) => {
            const code = tryExtractFromUrl(navigated);
            if (code) done(true, code);
        });
        win.webContents.on('did-navigate', (_ev, navigated) => {
            const code = tryExtractFromUrl(navigated);
            if (code) done(true, code);
        });
        win.webContents.on('did-navigate-in-page', (_ev, navigated) => {
            const code = tryExtractFromUrl(navigated);
            if (code) done(true, code);
        });

        win.on('closed', () => {
            if (!settled) done(false, new Error('Окно входа закрыто.'));
        });

        win.loadURL(url).catch((e) => done(false, e));
    });
}

/**
 * =============================================================================
 * ЗАГРУЗКА И ЗАПУСК
 * =============================================================================
 */
ipcMain.handle('modrinth-download', async (e, { fileUrl, fileName, gameDir }) => {
    try {
        const mods = path.join(gameDir || getDefaultGamePath(), 'mods');
        if (!fs.existsSync(mods)) fs.mkdirSync(mods, { recursive: true });
        const dest = path.join(mods, fileName);
        
        await new Promise((res, rej) => {
            const dl = (u) => {
                const protocol = u.startsWith('https') ? https : http;
                protocol.get(u, { headers: { 'User-Agent': 'AmethystLauncher/1.0.3' } }, (r) => {
                    if (r.statusCode >= 300 && r.headers.location) return dl(r.headers.location);
                    if (r.statusCode !== 200) {
                        return rej(new Error(`Скачивание: HTTP ${r.statusCode}`));
                    }
                    const s = fs.createWriteStream(dest);
                    r.pipe(s);
                    s.on('finish', () => { s.close(); res(); });
                }).on('error', rej);
            };
            dl(fileUrl);
        });
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('launch-game', async (e, config) => {
    try {
        const { Client, Authenticator } = require('minecraft-launcher-core');
        const launcher = new Client();
        const root = getInstanceRoot(config.version, config.loader);
        if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

        if (config.accountType === 'offline') await injectServers(root);

        let auth;
        if (config.accountType === 'microsoft') {
            if (!msAuth) return { success: false, error: 'Сессия Microsoft не найдена. Нажми «Лицензия Microsoft» и войди заново.' };
            try {
                await ensureMcTokenReadyForLaunch();
            } catch (re) {
                return { success: false, error: String(re.message || re) };
            }
            auth = {
                access_token: msAuth.mcAccessToken,
                client_token: msAuth.clientToken || newClientToken(),
                uuid: normalizeUuid(msAuth.profile.id),
                name: msAuth.profile.name,
                meta: { type: 'msa' },
                user_properties: '{}',
            };
            if (!msAuth.clientToken) saveMsSession({ ...msAuth, clientToken: auth.client_token });
        } else {
            auth = Authenticator.getAuth(config.username || 'Player');
        }

        launcher.on('debug', (m) => mainWindow?.webContents?.send('log', { msg: String(m), type: 'debug' }));
        launcher.on('data', (m) => mainWindow?.webContents?.send('log', { msg: String(m), type: 'info' }));
        launcher.on('progress', (ev) => mainWindow?.webContents?.send('progress', ev));
        launcher.on('close', (code) => mainWindow?.webContents?.send('game-close', code));

        const launchOpts = {
            authorization: auth,
            root,
            version: { number: config.version, type: config.versionType === 'snapshot' ? 'snapshot' : 'release' },
            memory: { max: `${config.ram || 2}G`, min: '512M' },
            customArgs: (config.jvmArgs && String(config.jvmArgs).trim())
                ? String(config.jvmArgs).split(/\s+/).filter(Boolean)
                : [],
        };
        if (process.platform === 'win32' && !launchOpts.javaPath) launchOpts.javaPath = 'javaw';
        if (config.fullscreen) launchOpts.window = { fullscreen: true };
        else if (config.width && config.height) {
            launchOpts.window = { width: parseInt(config.width, 10), height: parseInt(config.height, 10) };
        }

        await launcher.launch(launchOpts);
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err.message || err) };
    }
});

/**
 * =============================================================================
 * СЕТЕВЫЕ ХЕЛПЕРЫ (С ЗАЩИТОЙ ОТ ПУСТЫХ ОТВЕТОВ)
 * =============================================================================
 */
function msPost(hostname, pathReq, body, type) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: hostname,
            path: pathReq,
            method: 'POST',
            headers: {
                'Content-Type': type,
                'Content-Length': Buffer.byteLength(body),
                Accept: 'application/json',
                'User-Agent': 'AmethystLauncher/1.0.3 MinecraftAuth',
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                if (!data) return reject(new Error(`${hostname}${pathReq}: пустой ответ (${res.statusCode}).`));
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        if (json.XErr != null) {
                            reject(new Error(JSON.stringify(json)));
                        } else {
                            const msg =
                                json.error_description || json.errorMessage || json.detail || json.message || JSON.stringify(json);
                            reject(new Error(msg || `HTTP ${res.statusCode}`));
                        }
                    } else resolve(json);
                } catch (parseErr) {
                    reject(new Error(`${hostname}${pathReq}: невалидный JSON (${res.statusCode}).`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function httpsGetAuthorizedJson(pathSuffix, bearer, softFail) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.minecraftservices.com',
            path: pathSuffix,
            method: 'GET',
            headers: {
                Authorization: `Bearer ${bearer}`,
                Accept: 'application/json',
                'User-Agent': 'AmethystLauncher/1.0.3',
            },
        };
        https.get(opts, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    if (res.statusCode === 401 || res.statusCode === 404) {
                        if (softFail) return resolve(null);
                        return reject(new Error(res.statusCode === 404
                            ? 'Профиль Minecraft Java не найден (нет игры или неверный аккаунт).'
                            : 'Minecraft token истёк — войдите снова.'));
                    }
                    if (!data) return softFail ? resolve(null) : reject(new Error('Пустой ответ профиля.'));
                    resolve(JSON.parse(data));
                } catch (e) {
                    if (softFail) resolve(null); else reject(e);
                }
            });
        }).on('error', (e) => (softFail ? resolve(null) : reject(e)));
    });
}

function getDefaultGamePath() {
    const h = os.homedir();
    if (process.platform === 'win32') return path.join(h, 'AppData', 'Roaming', '.minecraft');
    if (process.platform === 'darwin') return path.join(h, 'Library', 'Application Support', 'minecraft');
    return path.join(h, '.minecraft');
}

function sanitizeInstancePart(s) {
    const t = String(s || '').replace(/[/\\:*?"<>|]/g, '_').trim();
    return t || 'default';
}

function getInstanceRoot(version, loader) {
    const v = sanitizeInstancePart(version || 'default');
    const l = sanitizeInstancePart(loader || 'vanilla');
    return path.join(getDefaultGamePath(), 'amethyst_instances', `${v}__${l}`);
}

async function injectServers(dir) {
    const file = path.join(dir, 'servers.dat');
    try {
        const nbt = require('prismarine-nbt');
        let data = { value: { servers: { type: 'list', value: { type: 'compound', value: [] } } } };
        if (fs.existsSync(file)) data = (await nbt.parse(fs.readFileSync(file))).parsed;
        if (!data?.value?.servers?.value) {
            data.value.servers = { type: 'list', value: { type: 'compound', value: [] } };
        }
        const listWrap = data.value.servers.value;
        if (!listWrap || typeof listWrap !== 'object') {
            data.value.servers = { type: 'list', value: { type: 'compound', value: [] } };
        }
        const lw = data.value.servers.value;
        if (!Array.isArray(lw.value)) lw.value = [];
        const list = lw.value;
        if (!list.some(s => s.ip?.value === 'godbox.pw')) {
            list.push({ name: { type: 'string', value: 'GodBox' }, ip: { type: 'string', value: 'godbox.pw' } });
            fs.writeFileSync(file, nbt.writeUncompressed(data));
        }
    } catch (e) {
        console.warn('[injectServers]', e.message);
    }
}