// ═══════════════════════════════════════════════════════════════════════════
//  Amethyst Launcher — renderer.js
//  Модульная архитектура: nav / versions / settings / launch
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  versions:        [],      // raw manifest versions
  filteredVersions:[],
  selectedVersion: null,
  selectedLoader:  'vanilla',
  showSnapshots:   false,
  launching:       false,
  fullscreen:      false,
  jvmEnabled:      true,
  authMode:        'pirate', // 'pirate' | 'microsoft'
  msAccountName:   null,
};

// ─── DOM helpers ────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Navigation
// ═══════════════════════════════════════════════════════════════════════════
function initNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.page;
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      $$('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`page-${target}`).classList.add('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Window controls
// ═══════════════════════════════════════════════════════════════════════════
function initWindowControls() {
  $('wc-min').addEventListener('click',   () => amethyst.minimize());
  $('wc-max').addEventListener('click',   () => amethyst.maximize());
  $('wc-close').addEventListener('click', () => amethyst.close());
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: First launch auth choice + Microsoft
// ═══════════════════════════════════════════════════════════════════════════
async function initAuth() {
  const saved = localStorage.getItem('am_auth_mode');
  if (!saved) {
    await showFirstLaunchChoice();
  } else {
    state.authMode = saved;
  }

  // Insert small MS controls near nickname input (minimal UI changes)
  const wrap = $('username-input')?.parentElement;
  if (wrap && !document.getElementById('ms-controls')) {
    const div = document.createElement('div');
    div.id = 'ms-controls';
    div.className = 'mt-2 flex items-center gap-2';
    div.innerHTML = `
      <button class="social-btn no-drag" id="btn-ms-login" style="padding:8px 12px;">
        Microsoft вход
      </button>
      <button class="social-btn no-drag" id="btn-ms-logout" style="padding:8px 12px;opacity:.7;">
        Выйти
      </button>
      <div id="ms-status" class="text-xs" style="color:rgba(192,132,252,0.55);font-weight:600;"></div>
    `;
    wrap.appendChild(div);

    $('btn-ms-login').addEventListener('click', async () => {
      log('◈ Открываем вход Microsoft...', 'info');
      const r = await amethyst.msLogin();
      if (!r.success) {
        log('✖ Microsoft: ' + (r.error || 'ошибка входа'), 'error');
        return;
      }
      state.authMode = 'microsoft';
      localStorage.setItem('am_auth_mode', 'microsoft');
      await refreshMsStatus();
      applyAuthModeToUI();
      log(`✦ Microsoft: вошли как ${state.msAccountName || 'аккаунт'}`, 'ok');
    });

    $('btn-ms-logout').addEventListener('click', async () => {
      await amethyst.msLogout();
      state.msAccountName = null;
      if (state.authMode === 'microsoft') {
        state.authMode = 'pirate';
        localStorage.setItem('am_auth_mode', 'pirate');
      }
      await refreshMsStatus();
      applyAuthModeToUI();
      log('◈ Microsoft: выход выполнен', 'info');
    });
  }

  await refreshMsStatus();
  applyAuthModeToUI();
}

async function refreshMsStatus() {
  const st = await amethyst.msStatus();
  const el = document.getElementById('ms-status');
  if (!el) return;
  if (!st?.loggedIn) {
    el.textContent = 'MS: не подключен';
    state.msAccountName = null;
    return;
  }
  state.msAccountName = st.name || 'Аккаунт';
  el.textContent = `MS: ${state.msAccountName}${st.valid ? '' : ' (нужно войти заново)'}`;
}

function applyAuthModeToUI() {
  const u = $('username-input');
  const hint = u?.parentElement?.querySelector('.am-auth-hint');
  if (hint) hint.remove();

  if (!u) return;
  if (state.authMode === 'microsoft') {
    u.disabled = true;
    u.style.opacity = '.45';
    u.value = state.msAccountName || u.value;
    const p = document.createElement('div');
    p.className = 'am-auth-hint text-xs mt-1';
    p.style.color = 'rgba(192,132,252,0.45)';
    p.textContent = 'Microsoft режим: ник берётся из аккаунта, servers.dat не добавляется.';
    u.parentElement.appendChild(p);
  } else {
    u.disabled = false;
    u.style.opacity = '1';
    const p = document.createElement('div');
    p.className = 'am-auth-hint text-xs mt-1';
    p.style.color = 'rgba(192,132,252,0.45)';
    p.textContent = 'Пиратский режим: servers.dat будет обновлён (godbox.pw).';
    u.parentElement.appendChild(p);
  }
}

function showFirstLaunchChoice() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'first-launch-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,5,29,0.82)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    overlay.innerHTML = `
      <div class="glass rounded-2xl p-6" style="width:520px;max-width:92vw;">
        <div class="font-display font-900 text-xl text-mist tracking-tight">Первый запуск</div>
        <div class="text-sm mt-1" style="color:rgba(192,132,252,0.55);">
          Выберите тип входа. Можно сменить позже кнопками рядом с никнеймом.
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button class="launch-btn py-3" id="choice-pirate" style="font-size:13px;letter-spacing:.12em;">
            <span class="relative z-10">ПИРАТСКАЯ</span>
          </button>
          <button class="launch-btn py-3" id="choice-ms" style="font-size:13px;letter-spacing:.12em;animation:none;background:linear-gradient(135deg,#2A1245,#A855F7);">
            <span class="relative z-10">MICROSOFT</span>
          </button>
        </div>
        <div class="text-xs mt-4" style="color:rgba(192,132,252,0.45);line-height:1.6;">
          Пиратка: автоматически добавляем сервера <b>godbox.pw</b>.<br/>
          Microsoft: сервера не добавляем.
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#choice-pirate').addEventListener('click', () => {
      state.authMode = 'pirate';
      localStorage.setItem('am_auth_mode', 'pirate');
      overlay.remove();
      resolve();
    });
    overlay.querySelector('#choice-ms').addEventListener('click', async () => {
      state.authMode = 'microsoft';
      localStorage.setItem('am_auth_mode', 'microsoft');
      overlay.remove();
      resolve();
      // вход не форсим сразу, чтобы не было неожиданного окна; кнопка рядом
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Shell links
// ═══════════════════════════════════════════════════════════════════════════
function initShellLinks() {
  $('btn-modrinth').addEventListener('click',   () => openModrinthModal());
  $('btn-curseforge').addEventListener('click', () => amethyst.openExternal('https://www.curseforge.com'));
  $('btn-folder').addEventListener('click',     () => amethyst.openFolder());
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Modrinth modal
// ═══════════════════════════════════════════════════════════════════════════
let mrSelectedProjectId = null;

function openModrinthModal() {
  const modal = document.getElementById('mr-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('mr-query')?.focus();

  // wire once
  if (!modal.dataset.wired) {
    modal.dataset.wired = '1';
    document.getElementById('mr-close')?.addEventListener('click', closeModrinthModal);
    document.getElementById('mr-search')?.addEventListener('click', () => doModrinthSearch());
    document.getElementById('mr-query')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doModrinthSearch();
      if (e.key === 'Escape') closeModrinthModal();
    });
    // click outside closes
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModrinthModal();
    });
  }
}

function closeModrinthModal() {
  const modal = document.getElementById('mr-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function mrSetStatus(t) {
  const el = document.getElementById('mr-status');
  if (el) el.textContent = t || '—';
}

async function doModrinthSearch() {
  const q = (document.getElementById('mr-query')?.value || '').trim();
  const resultsEl = document.getElementById('mr-results');
  const versionsEl = document.getElementById('mr-versions');
  if (resultsEl) resultsEl.innerHTML = '';
  if (versionsEl) versionsEl.innerHTML = '';
  mrSelectedProjectId = null;

  if (!q) {
    mrSetStatus('Введите название мода.');
    return;
  }

  mrSetStatus('Ищем...');
  const res = await amethyst.modrinthSearch(q);
  if (!res?.success) {
    mrSetStatus('Ошибка: ' + (res?.error || 'unknown'));
    return;
  }

  const hits = res.hits || [];
  mrSetStatus(`Найдено: ${hits.length}`);
  if (!resultsEl) return;

  if (hits.length === 0) {
    resultsEl.innerHTML = `<div class="text-xs px-2 py-2" style="color:rgba(192,132,252,0.5);">Ничего не найдено</div>`;
    return;
  }

  hits.forEach(h => {
    const row = document.createElement('button');
    row.className = 'version-item';
    row.style.textAlign = 'left';
    row.style.width = '100%';
    row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;width:100%;">
        ${h.icon_url ? `<img src="${h.icon_url}" style="width:28px;height:28px;border-radius:8px;object-fit:cover;box-shadow:0 0 0 1px rgba(168,85,247,0.18);" />` : `<div style="width:28px;height:28px;border-radius:8px;background:rgba(168,85,247,0.12);"></div>`}
        <div style="display:flex;flex-direction:column;min-width:0;">
          <div style="font-weight:800;color:#E9D5FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(h.title || h.slug)}</div>
          <div style="font-size:11px;color:rgba(192,132,252,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(h.description || '')}</div>
        </div>
        <div style="margin-left:auto;font-size:10px;opacity:.5;">${(h.downloads || 0).toLocaleString()} dl</div>
      </div>
    `;
    row.addEventListener('click', async () => {
      mrSelectedProjectId = h.id;
      $$('#mr-results .version-item').forEach(x => x.classList.remove('selected'));
      row.classList.add('selected');
      await loadModrinthVersions(h.id);
    });
    resultsEl.appendChild(row);
  });
}

async function loadModrinthVersions(projectId) {
  const versionsEl = document.getElementById('mr-versions');
  if (!versionsEl) return;
  versionsEl.innerHTML = '';
  mrSetStatus('Загружаем версии...');

  const res = await amethyst.modrinthVersions(projectId);
  if (!res?.success) {
    mrSetStatus('Ошибка: ' + (res?.error || 'unknown'));
    return;
  }

  const versions = (res.versions || []).slice().sort((a, b) => {
    const da = Date.parse(a.date_published || '') || 0;
    const db = Date.parse(b.date_published || '') || 0;
    return db - da;
  });

  mrSetStatus(`Версий: ${versions.length}`);
  if (versions.length === 0) {
    versionsEl.innerHTML = `<div class="text-xs px-2 py-2" style="color:rgba(192,132,252,0.5);">Нет версий</div>`;
    return;
  }

  versions.forEach(v => {
    const file = (v.files || []).find(f => f.primary) || (v.files || [])[0];
    const row = document.createElement('button');
    row.className = 'version-item';
    row.style.textAlign = 'left';
    row.style.width = '100%';
    const gv = Array.isArray(v.game_versions) ? v.game_versions.slice(0, 4).join(', ') : '';
    const ld = Array.isArray(v.loaders) ? v.loaders.slice(0, 3).join(', ') : '';
    row.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;width:100%;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-weight:800;color:#E9D5FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.name || v.version_number || v.id)}</span>
          <span style="margin-left:auto;font-size:10px;opacity:.55;">${escapeHtml(v.version_number || '')}</span>
        </div>
        <div style="font-size:11px;color:rgba(192,132,252,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(gv)}${ld ? ' • ' + escapeHtml(ld) : ''}${file?.filename ? ' • ' + escapeHtml(file.filename) : ''}
        </div>
      </div>
    `;
    row.addEventListener('click', async () => {
      if (!file?.url) {
        mrSetStatus('У этой версии нет файла.');
        return;
      }
      mrSetStatus('Скачиваем...');
      const dl = await amethyst.modrinthDownloadVersion({ fileUrl: file.url, filename: file.filename });
      if (!dl?.success) {
        mrSetStatus('Ошибка: ' + (dl?.error || 'unknown'));
        log('✖ Modrinth: ' + (dl?.error || 'unknown'), 'error');
        return;
      }
      mrSetStatus(`Готово: ${dl.file}`);
      log(`✦ Modrinth: установлен ${dl.file}`, 'ok');
    });
    versionsEl.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Version manager
// ═══════════════════════════════════════════════════════════════════════════
function initVersions() {
  // Loader tabs
  $$('#loader-tabs .loader-btn, [data-loader]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-loader]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedLoader = btn.dataset.loader;
      renderLoaderNote();
      renderVersionList();
    });
  });

  // Release / snapshot filter
  $('tag-release').addEventListener('click', () => {
    state.showSnapshots = false;
    updateFilterTags();
    renderVersionList();
  });
  $('tag-snapshot').addEventListener('click', () => {
    state.showSnapshots = !state.showSnapshots;
    updateFilterTags();
    renderVersionList();
  });

  fetchVersionManifest();
}

async function fetchVersionManifest() {
  const result = await amethyst.fetchVersions();
  if (result.success) {
    state.versions = result.versions;
    renderVersionList();
    log('◈ Манифест версий загружен', 'ok');
  } else {
    log('✖ Не удалось загрузить манифест: ' + result.error, 'error');
    renderVersionListFallback();
  }
}

function renderVersionList() {
  const list = $('version-list');
  list.innerHTML = '';

  const loader = state.selectedLoader;

  // For non-vanilla, we still show vanilla versions as base
  let versions = state.versions.filter(v => {
    if (!state.showSnapshots && v.type !== 'release') return false;
    return true;
  }).slice(0, 60);

  if (versions.length === 0) {
    list.innerHTML = `<div class="text-center py-4 text-xs" style="color:rgba(168,85,247,0.35);">Нет доступных версий</div>`;
    return;
  }

  versions.forEach(v => {
    const div = document.createElement('div');
    div.className = 'version-item';
    const isSelected = state.selectedVersion === v.id;
    if (isSelected) div.classList.add('selected');

    const dotClass = v.type === 'release' ? 'dot-release' : v.type === 'snapshot' ? 'dot-snapshot' : 'dot-old';
    const loaderTag = loader !== 'vanilla' ? `<span style="margin-left:auto;font-size:10px;opacity:.5;">${loader}</span>` : '';

    div.innerHTML = `<div class="version-dot ${dotClass}"></div><span>${v.id}</span>${loaderTag}`;
    div.addEventListener('click', () => selectVersion(v.id));
    list.appendChild(div);
  });
}

function renderVersionListFallback() {
  const fallback = ['1.21.4','1.20.4','1.20.1','1.19.4','1.18.2','1.16.5','1.12.2','1.8.9'];
  state.versions = fallback.map(id => ({ id, type: 'release' }));
  renderVersionList();
}

function selectVersion(id) {
  state.selectedVersion = id;
  $('selected-display').textContent = `${state.selectedLoader !== 'vanilla' ? state.selectedLoader + ' ' : ''}${id}`;
  renderVersionList();
}

function updateFilterTags() {
  const rel  = $('tag-release');
  const snap = $('tag-snapshot');
  if (state.showSnapshots) {
    snap.style.background = 'rgba(168,85,247,0.2)';
    snap.style.color = '#A855F7';
    snap.style.borderColor = 'rgba(168,85,247,0.3)';
  } else {
    snap.style.background = 'rgba(42,18,69,0.5)';
    snap.style.color = '#6B7280';
    snap.style.borderColor = 'rgba(109,33,168,0.2)';
  }
}

function renderLoaderNote() {
  const note = $('loader-note');
  if (state.selectedLoader === 'vanilla') note.classList.add('hidden');
  else note.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Settings
// ═══════════════════════════════════════════════════════════════════════════
async function initSettings() {
  // RAM
  const info = await amethyst.getSystemInfo();
  const maxRam = Math.max(info.totalRam - 1, 2);
  $('ram-slider').max = maxRam;
  $('ram-max-label').textContent = `${maxRam} ГБ`;

  const savedRam = localStorage.getItem('am_ram') || '2';
  $('ram-slider').value = Math.min(parseInt(savedRam), maxRam);
  $('ram-value').textContent = $('ram-slider').value;

  $('ram-slider').addEventListener('input', () => {
    $('ram-value').textContent = $('ram-slider').value;
  });

  // Resolution presets
  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('res-w').value = btn.dataset.w;
      $('res-h').value = btn.dataset.h;
    });
  });

  // Fullscreen toggle
  const toggleFs = $('toggle-fullscreen');
  state.fullscreen = localStorage.getItem('am_fullscreen') === '1';
  if (state.fullscreen) { toggleFs.classList.add('on'); $('resolution-block').style.opacity = '.35'; }
  toggleFs.addEventListener('click', () => {
    state.fullscreen = !state.fullscreen;
    toggleFs.classList.toggle('on', state.fullscreen);
    $('resolution-block').style.opacity = state.fullscreen ? '.35' : '1';
  });

  // JVM toggle
  const toggleJvm = $('toggle-jvm');
  state.jvmEnabled = localStorage.getItem('am_jvm_enabled') !== '0';
  if (state.jvmEnabled) toggleJvm.classList.add('on');
  toggleJvm.addEventListener('click', () => {
    state.jvmEnabled = !state.jvmEnabled;
    toggleJvm.classList.toggle('on', state.jvmEnabled);
    $('jvm-block').style.opacity = state.jvmEnabled ? '1' : '.35';
  });

  // Load saved values
  const savedJvm = localStorage.getItem('am_jvm_args');
  const savedW   = localStorage.getItem('am_res_w');
  const savedH   = localStorage.getItem('am_res_h');
  if (savedJvm) $('jvm-args').value = savedJvm;
  if (savedW)   $('res-w').value    = savedW;
  if (savedH)   $('res-h').value    = savedH;

  // Save
  $('btn-save').addEventListener('click', () => {
    localStorage.setItem('am_ram',         $('ram-slider').value);
    localStorage.setItem('am_jvm_args',    $('jvm-args').value);
    localStorage.setItem('am_res_w',       $('res-w').value);
    localStorage.setItem('am_res_h',       $('res-h').value);
    localStorage.setItem('am_fullscreen',  state.fullscreen ? '1' : '0');
    localStorage.setItem('am_jvm_enabled', state.jvmEnabled ? '1' : '0');

    const toast = $('save-toast');
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  });

}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Launch
// ═══════════════════════════════════════════════════════════════════════════
function initLaunch() {
  $('btn-launch').addEventListener('click', handleLaunch);

  amethyst.onLog(({ msg, type }) => log(msg, type));
  amethyst.onGameClose(code => {
    log(`◈ Игра завершена (код выхода: ${code})`, code === 0 ? 'ok' : 'error');
    setLaunching(false);
    setStatus('idle');
  });
}

async function handleLaunch() {
  if (state.launching) return;

  if (!state.selectedVersion) {
    log('✖ Сначала выберите версию игры', 'error');
    setStatus('error', 'Версия не выбрана');
    return;
  }

  setLaunching(true);
  setStatus('launching', 'Запускаем...');
  log(`◈ Запуск ${state.selectedLoader} ${state.selectedVersion}...`, 'ok');

  const config = {
    version:   state.selectedVersion,
    username:  $('username-input').value.trim() || 'Player',
    authMode:  state.authMode || (localStorage.getItem('am_auth_mode') || 'pirate'),
    ram:       localStorage.getItem('am_ram') || '2',
    jvmArgs:   state.jvmEnabled ? ($('jvm-args').value || localStorage.getItem('am_jvm_args') || '') : '',
    fullscreen: state.fullscreen,
    width:     $('res-w').value,
    height:    $('res-h').value,
  };

  log(`  Никнейм: ${config.username} | RAM: ${config.ram}G`, 'info');
  log('  Проверка servers.dat...', 'info');

  const result = await amethyst.launchGame(config);

  if (!result.success) {
    const err = result.error || 'Неизвестная ошибка';
    log('✖ ' + err, 'error');
    if (err.toLowerCase().includes('java')) {
      log('  ⟶ Установите Java 17+ с adoptium.net', 'error');
      setStatus('error', 'Java не найдена → adoptium.net');
    } else {
      setStatus('error', 'Ошибка запуска');
    }
    setLaunching(false);
  } else {
    log('✦ Minecraft запущен!', 'ok');
    setStatus('running', 'Игра запущена');
  }
}

function setLaunching(on) {
  state.launching = on;
  const btn = $('btn-launch');
  btn.disabled = on;
  btn.querySelector('span').innerHTML = on
    ? `<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> ЗАГРУЗКА`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> ЗАПУСК`;
}

function setStatus(type, msg) {
  const dot   = $('status-dot');
  const label = $('status-label');
  const sub   = $('status-sub');

  const colors = {
    idle:      ['#6B21A8', '#6B21A8', 'Выберите версию и нажмите ЗАПУСК', 'Ожидание'],
    launching: ['#A855F7', '#A855F7', msg || 'Подготовка...', 'Запуск'],
    running:   ['#22C55E', '#22C55E', 'Игра запущена', 'Активна'],
    error:     ['#F87171', '#F87171', msg || 'Ошибка', 'Ошибка'],
  };

  const [bgColor, shadowColor, subText, labelText] = colors[type] || colors.idle;
  dot.style.background  = bgColor;
  dot.style.boxShadow   = `0 0 6px ${shadowColor}`;
  label.style.color     = bgColor;
  label.textContent     = labelText;
  sub.textContent       = subText;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Log
// ═══════════════════════════════════════════════════════════════════════════
function log(msg, type = 'info') {
  const body = $('log-body');
  const line = document.createElement('div');
  line.className = `log-${type}`;
  // Truncate long messages
  line.textContent = String(msg).substring(0, 300);
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

$('btn-log-clear').addEventListener('click', () => {
  $('log-body').innerHTML = '';
  log('◈ Консоль очищена', 'ok');
});

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════
initNav();
initWindowControls();
initShellLinks();
initVersions();
initSettings();
initLaunch();
initAuth();
