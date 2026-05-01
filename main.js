const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

let mainWindow;
let msLoginInProgress = false;
app.setName('Amethyst Launcher');
if (process.platform === 'win32') {
  try { app.setAppUserModelId('pw.godbox.amethyst'); } catch {}
}

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Window controls ───────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow.minimize());
ipcMain.on('win-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow.close());

// ─── Shell helpers ─────────────────────────────────────────────────────────
ipcMain.on('open-external', (_, url) => shell.openExternal(url));
ipcMain.on('open-folder', (_, p) => {
  const dir = p || getDefaultGamePath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

// ─── System info ───────────────────────────────────────────────────────────
ipcMain.handle('get-system-info', () => ({
  totalRam: Math.floor(os.totalmem() / 1024 / 1024 / 1024),
  platform: process.platform,
}));

// ─── Fetch version manifest ────────────────────────────────────────────────
ipcMain.handle('fetch-versions', async () => {
  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
        res.on('error', reject);
      }).on('error', reject);
    });
    return { success: true, versions: data.versions };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Launch game ───────────────────────────────────────────────────────────
ipcMain.handle('launch-game', async (_, config) => {
  try {
    const gameDir = config.gameDir || getDefaultGamePath();
    if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });

    const { Client, Authenticator } = require('minecraft-launcher-core');
    const launcher = new Client();

    let authorization;
    if ((config.authMode || 'pirate') === 'microsoft') {
      const ms = await loadMicrosoftProfile();
      if (!ms) {
        return { success: false, error: 'Microsoft аккаунт не привязан. Нажмите “Microsoft вход” и войдите.' };
      }
      const msmc = require('msmc');
      if (!msmc.validate(ms)) {
        return { success: false, error: 'Сессия Microsoft истекла. Войдите заново через “Microsoft вход”.' };
      }
      authorization = msmc.getMCLC().getAuth(ms);
    } else {
      authorization = Authenticator.getAuth(config.username || 'Player');
      await injectServers(gameDir);
    }

    const opts = {
      authorization,
      root: gameDir,
      version: { number: config.version, type: 'release' },
      memory: { max: `${config.ram || 2}G`, min: '512M' },
      customArgs: config.jvmArgs ? config.jvmArgs.split(' ').filter(Boolean) : [],
    };

    // Windows: javaw.exe doesn't create an extra console window (cmd)
    if (process.platform === 'win32' && !opts.javaPath) {
      opts.javaPath = 'javaw';
    }

    if (config.fullscreen) {
      opts.window = { fullscreen: true };
    } else if (config.width && config.height) {
      opts.window = { width: parseInt(config.width), height: parseInt(config.height) };
    }

    launcher.on('debug', msg => mainWindow.webContents.send('log', { msg: String(msg), type: 'debug' }));
    launcher.on('data',  msg => mainWindow.webContents.send('log', { msg: String(msg), type: 'info' }));
    launcher.on('close', code => mainWindow.webContents.send('game-close', code));

    await launcher.launch(opts);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────
function getDefaultGamePath() {
  const home = os.homedir();
  const base =
    process.platform === 'win32'
      ? path.join(home, 'AppData', 'Roaming', '.minecraft')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support', 'minecraft')
        : path.join(home, '.minecraft');
  return path.join(base, 'amethyst');
}

async function injectServers(gameDir) {
  const SERVERS = [
    { name: 'Лучший BoxPvP сервер', ip: 'godbox.pw' },
    { name: 'Лучший BoxPvP сервер', ip: 'eu.godbox.pw' },
  ];
  const serversFile = path.join(gameDir, 'servers.dat');
  try {
    const nbt = require('prismarine-nbt');
    let data = {
      value: {
        servers: { type: 'list', value: { type: 'compound', value: [] } }
      }
    };

    if (fs.existsSync(serversFile)) {
      const buf = fs.readFileSync(serversFile);
      const parsed = await nbt.parse(buf);
      data = parsed.parsed;
    }

    if (!data.value.servers) {
      data.value.servers = { type: 'list', value: { type: 'compound', value: [] } };
    }

    const list = data.value.servers.value.value || [];

    for (const srv of SERVERS) {
      if (!list.some(s => s.ip?.value === srv.ip)) {
        list.push({
          name: { type: 'string', value: srv.name },
          ip:   { type: 'string', value: srv.ip },
        });
      }
    }

    data.value.servers.value.value = list;
    fs.writeFileSync(serversFile, nbt.writeUncompressed(data));
  } catch (e) {
    console.warn('[servers.dat]', e.message);
  }
}

// ─── Microsoft auth (MSMC) ──────────────────────────────────────────────────
function getAuthStorePath() {
  return path.join(app.getPath('userData'), 'amethyst-msmc.json');
}

async function loadMicrosoftProfile() {
  const p = getAuthStorePath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function saveMicrosoftProfile(profile) {
  const p = getAuthStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(profile, null, 2), 'utf8');
}

ipcMain.handle('ms-status', async () => {
  const msmc = require('msmc');
  const profile = await loadMicrosoftProfile();
  if (!profile) return { loggedIn: false };
  return {
    loggedIn: true,
    name: profile.name || null,
    uuid: profile.uuid || profile.id || null,
    valid: !!msmc.validate(profile),
    demo: !!msmc.isDemoUser(profile),
  };
});

ipcMain.handle('ms-logout', async () => {
  const p = getAuthStorePath();
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
  return { success: true };
});

ipcMain.handle('ms-login', async () => {
  if (msLoginInProgress) return { success: false, error: 'Вход уже выполняется.' };
  msLoginInProgress = true;
  try {
    const msmc = require('msmc');
    // Raw flow uses user's existing Chromium browser and does NOT open a second Electron window.
    // It is generally more reliable than a custom localhost redirect flow on Windows.
    const result = await msmc.fastLaunch('raw', (update) => {
      try {
        mainWindow?.webContents?.send('log', { msg: `[MS] ${String(update?.message || update?.type || update)}`, type: 'info' });
      } catch {}
    });

    if (msmc.errorCheck(result)) return { success: false, error: result.reason || 'Не удалось выполнить Microsoft вход.' };

    // Store only the profile object (includes tokens under _msmc).
    const profile = result.profile ? result.profile : result;
    await saveMicrosoftProfile(profile);
    return { success: true, name: profile.name || null, uuid: profile.uuid || profile.id || null };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    msLoginInProgress = false;
  }
});

// ─── Modrinth (search → versions → download) ────────────────────────────────
ipcMain.handle('modrinth-search', async (_, query) => {
  try {
    const q = String(query || '').trim();
    if (!q) return { success: false, error: 'Пустой запрос.' };
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=20&index=relevance`;
    const data = await httpsJson(url);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return {
      success: true,
      hits: hits.map(h => ({
        id: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        icon_url: h.icon_url || null,
        downloads: h.downloads || 0,
      })),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('modrinth-versions', async (_, projectId) => {
  try {
    const pid = String(projectId || '').trim();
    if (!pid) return { success: false, error: 'projectId пустой.' };
    const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(pid)}/version`;
    const versions = await httpsJson(url);
    if (!Array.isArray(versions)) return { success: false, error: 'Modrinth: неверный ответ.' };
    return {
      success: true,
      versions: versions.map(v => ({
        id: v.id,
        name: v.name,
        version_number: v.version_number,
        game_versions: Array.isArray(v.game_versions) ? v.game_versions : [],
        loaders: Array.isArray(v.loaders) ? v.loaders : [],
        date_published: v.date_published || null,
        files: Array.isArray(v.files) ? v.files.map(f => ({
          url: f.url,
          filename: f.filename,
          primary: !!f.primary,
        })) : [],
      })),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('modrinth-download-version', async (_, req) => {
  try {
    const fileUrl = String(req?.fileUrl || '').trim();
    const filename = String(req?.filename || '').trim();
    const gameDir = String(req?.gameDir || getDefaultGamePath());
    if (!fileUrl) return { success: false, error: 'fileUrl пустой.' };

    const modsDir = path.join(gameDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });
    const outName = filename || path.basename(new URL(fileUrl).pathname) || 'mod.jar';
    const outPath = path.join(modsDir, outName);
    await httpsDownload(fileUrl, outPath);

    mainWindow?.webContents?.send('log', { msg: `◈ Modrinth: скачано ${outName}`, type: 'ok' });
    return { success: true, file: outName };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

function httpsJson(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AmethystLauncher/1.0.0 (godbox.pw)' } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsDownload(url, outPath) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(outPath); } catch {}
        return resolve(httpsDownload(res.headers.location, outPath));
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(outPath); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(outPath); } catch {}
      reject(err);
    });
  });
}
