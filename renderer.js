// ═══════════════════════════════════════════════════════════════════════════
//  Amethyst Launcher — renderer.js
//  Модульная архитектура: nav / versions / settings / launch
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  versions:        [],
  filteredVersions:[],
  selectedVersion: null,
  /** 'release' | 'snapshot' — для MCLC */
  selectedVersionType: 'release',
  selectedLoader:  'vanilla',
  showSnapshots:   false,
  launching:       false,
  fullscreen:      false,
  jvmEnabled:      true,
  accountType:     null,   // 'offline' | 'microsoft'
  msUsername:      null,
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
//  MODULE: Shell links
// ═══════════════════════════════════════════════════════════════════════════
function initShellLinks() {
  $('btn-modrinth').addEventListener('click', openModSearch);
  $('btn-curseforge').addEventListener('click', () => amethyst.openExternal('https://www.curseforge.com'));
  $('btn-folder').addEventListener('click', async () => {
    if (!state.selectedVersion) {
      amethyst.openFolder();
      return;
    }
    const { path: p } = await amethyst.getInstancePath({
      version: state.selectedVersion,
      loader: state.selectedLoader,
    });
    amethyst.openFolder(p);
  });
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
  const meta = state.versions.find((v) => v.id === id);
  state.selectedVersionType = meta?.type === 'snapshot' ? 'snapshot' : 'release';
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
    version:     state.selectedVersion,
    versionType: state.selectedVersionType || 'release',
    loader:      state.selectedLoader || 'vanilla',
    username:    state.msUsername || $('username-input').value.trim() || 'Player',
    accountType: state.accountType || 'offline',
    ram:         localStorage.getItem('am_ram') || '2',
    jvmArgs:     state.jvmEnabled ? ($('jvm-args').value || localStorage.getItem('am_jvm_args') || '') : '',
    fullscreen:  state.fullscreen,
    width:       $('res-w').value,
    height:      $('res-h').value,
  };

  log(`  Никнейм: ${config.username} | RAM: ${config.ram}G`, 'info');
  const inst = await amethyst.getInstancePath({ version: config.version, loader: config.loader });
  log(`  Папка инстанса: ${inst.path}`, 'info');
  if (config.accountType === 'offline') log('  Проверка servers.dat...', 'info');

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
initTgPopup();
initAccountChooser();

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Account chooser (пиратка или лицензия — один раз, сохраняется)
// ═══════════════════════════════════════════════════════════════════════════
async function initAccountChooser() {
  // Если уже выбрано — восстанавливаем
  const saved = await amethyst.storeGet('account-type');
  if (saved === 'offline') { state.accountType = 'offline'; updateAccountBadge(); return; }
  if (saved === 'microsoft') {
    const status = await amethyst.authMsStatus();
    if (status.loggedIn) { state.accountType = 'microsoft'; state.msUsername = status.username; updateAccountBadge(); return; }
  }
  // Иначе показываем менюшку
  showAccountChooser();
}

function showAccountChooser() {
  const overlay = document.createElement('div');
  overlay.id = 'acc-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(15,5,29,0.88);backdrop-filter:blur(8px);';
  overlay.innerHTML = `
    <div style="background:linear-gradient(145deg,#1a0b2e,#200d38);border:1px solid rgba(168,85,247,0.3);border-radius:20px;padding:40px;width:380px;text-align:center;font-family:'Montserrat',sans-serif;box-shadow:0 0 80px rgba(168,85,247,0.2);">
      <div style="font-size:40px;margin-bottom:14px;">🎮</div>
      <div style="font-size:20px;font-weight:800;color:#e9d5ff;margin-bottom:8px;">Выберите тип аккаунта</div>
      <div style="font-size:13px;color:rgba(192,132,252,0.6);margin-bottom:28px;line-height:1.6;">Это можно будет изменить в настройках</div>

      <button id="acc-offline" style="width:100%;padding:14px;margin-bottom:10px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.3);border-radius:12px;color:#e9d5ff;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;">
        🏴‍☠️ Пиратская версия
        <div style="font-size:11px;font-weight:400;color:rgba(192,132,252,0.5);margin-top:3px;">Играть оффлайн с любым никнеймом</div>
      </button>

      <button id="acc-ms" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;border-radius:12px;color:#fff;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;">
        🪟 Лицензия Microsoft
        <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.6);margin-top:3px;">Войти через аккаунт Microsoft</div>
      </button>

      <div id="acc-ms-status" style="margin-top:12px;font-size:12px;color:rgba(168,85,247,0.5);min-height:18px;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = async (type) => {
    overlay.style.opacity='0'; overlay.style.transition='opacity .2s';
    setTimeout(() => overlay.remove(), 220);
    state.accountType = type;
    await amethyst.storeSet('account-type', type);
    updateAccountBadge();
  };

  document.getElementById('acc-offline').addEventListener('click', () => close('offline'));

  document.getElementById('acc-ms').addEventListener('click', async () => {
    const statusEl = document.getElementById('acc-ms-status');
    statusEl.textContent = 'Открываем окно Microsoft...';
    const res = await amethyst.authMsLogin();
    if (res.success) {
      state.msUsername = res.username;
      statusEl.style.color = '#a855f7';
      statusEl.textContent = `✓ Вошли как ${res.username}`;
      setTimeout(() => close('microsoft'), 800);
    } else {
      statusEl.style.color = '#f87171';
      statusEl.textContent = '✖ Ошибка: ' + res.error;
    }
  });
}

function updateAccountBadge() {
  // Показываем текущий аккаунт в username-input или рядом
  const input = $('username-input');
  if (!input) return;
  if (state.accountType === 'microsoft' && state.msUsername) {
    input.value = state.msUsername;
    input.readOnly = true;
    input.style.color = '#a855f7';
    input.title = 'Microsoft аккаунт';
  } else {
    input.readOnly = false;
    input.style.color = '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Modrinth mod search & download
// ═══════════════════════════════════════════════════════════════════════════
function openModSearch() {
  if (document.getElementById('mod-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'mod-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(15,5,29,0.85);backdrop-filter:blur(8px);';

  overlay.innerHTML = `
    <div id="mod-box" style="background:linear-gradient(145deg,#1a0b2e,#200d38);border:1px solid rgba(168,85,247,0.25);border-radius:20px;width:560px;max-height:80vh;display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;box-shadow:0 0 80px rgba(168,85,247,0.2);">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:20px 20px 14px;border-bottom:1px solid rgba(168,85,247,0.1);flex-shrink:0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#A855F7"><path d="M12.006 0a12 12 0 100 24 12 12 0 000-24zm-.87 4.343a7.613 7.613 0 016.498 3.641l-1.925 1.11a5.495 5.495 0 00-4.573-2.64 5.512 5.512 0 00-5.493 5.547 5.506 5.506 0 003.706 5.2l-.004 2.225a7.636 7.636 0 01-5.821-7.424 7.63 7.63 0 017.612-7.66zm1.746 3.306l2.206 3.81-2.164 1.25-.008-5.06zm2.206 4.858l2.215 1.277a7.62 7.62 0 01-5.353 8.13v-2.221a5.518 5.518 0 003.138-7.186z"/></svg>
        <span style="font-size:16px;font-weight:800;color:#e9d5ff;flex:1;">Поиск модов — Modrinth</span>
        <button id="mod-close" style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:50%;width:28px;height:28px;color:#c084fc;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>

      <!-- Search input -->
      <div style="padding:14px 20px;border-bottom:1px solid rgba(168,85,247,0.1);flex-shrink:0;display:flex;gap:8px;">
        <input id="mod-search-input" placeholder="Введите название мода..." style="flex:1;background:rgba(26,11,46,0.7);border:1px solid rgba(168,85,247,0.25);border-radius:10px;color:#e9d5ff;font-family:'Montserrat',sans-serif;font-size:13px;padding:9px 14px;outline:none;" />
        <button id="mod-search-btn" style="background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;border-radius:10px;color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;cursor:pointer;">Найти</button>
      </div>

      <!-- Results -->
      <div id="mod-results" style="flex:1;overflow-y:auto;padding:10px 12px;min-height:120px;">
        <div style="text-align:center;padding:40px 0;color:rgba(168,85,247,0.35);font-size:13px;">Введите название мода и нажмите «Найти»</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Scrollbar style
  const style = document.createElement('style');
  style.id = 'mod-style';
  style.textContent = '#mod-results::-webkit-scrollbar{width:4px}#mod-results::-webkit-scrollbar-thumb{background:#6b21a8;border-radius:2px}';
  document.head.appendChild(style);

  const closeModal = () => { overlay.remove(); document.getElementById('mod-style')?.remove(); };
  document.getElementById('mod-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const doSearch = async () => {
    const q = document.getElementById('mod-search-input').value.trim();
    if (!q) return;
    const results = document.getElementById('mod-results');
    results.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(168,85,247,0.4);font-size:13px;">🔍 Поиск...</div>';

    try {
      // Используем fetch напрямую — Modrinth открытый API, CORS разрешён
      const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&facets=[["project_type:mod"]]&limit=20`);
      const data = await res.json();

      if (!data.hits || data.hits.length === 0) {
        results.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(168,85,247,0.35);font-size:13px;">Ничего не найдено</div>';
        return;
      }

      results.innerHTML = '';
      data.hits.forEach(mod => {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:12px;cursor:pointer;transition:background .15s;margin-bottom:4px;';
        card.innerHTML = `
          <img src="${mod.icon_url || ''}" onerror="this.style.display='none'" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;background:rgba(168,85,247,0.1);">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:#e9d5ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${mod.title}</div>
            <div style="font-size:11px;color:rgba(192,132,252,0.55);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${mod.description}</div>
            <div style="font-size:10px;color:rgba(168,85,247,0.45);margin-top:3px;">⬇ ${(mod.downloads||0).toLocaleString()}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
        `;
        card.addEventListener('mouseover', () => card.style.background = 'rgba(168,85,247,0.1)');
        card.addEventListener('mouseout',  () => card.style.background = 'transparent');
        card.addEventListener('click', () => openModVersions(mod, closeModal));
        results.appendChild(card);
      });
    } catch(e) {
      results.innerHTML = `<div style="text-align:center;padding:40px 0;color:#f87171;font-size:13px;">Ошибка: ${e.message}</div>`;
    }
  };

  document.getElementById('mod-search-btn').addEventListener('click', doSearch);
  document.getElementById('mod-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  setTimeout(() => document.getElementById('mod-search-input')?.focus(), 100);
}

async function openModVersions(mod, closeSearch) {
  // Закрываем поиск, открываем версии
  closeSearch();

  const overlay = document.createElement('div');
  overlay.id = 'modver-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,5,29,0.88);backdrop-filter:blur(8px);';

  overlay.innerHTML = `
    <div style="background:linear-gradient(145deg,#1a0b2e,#200d38);border:1px solid rgba(168,85,247,0.25);border-radius:20px;width:520px;max-height:75vh;display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;box-shadow:0 0 80px rgba(168,85,247,0.2);">
      <div style="display:flex;align-items:center;gap:10px;padding:20px 20px 14px;border-bottom:1px solid rgba(168,85,247,0.1);flex-shrink:0;">
        <img src="${mod.icon_url||''}" onerror="this.style.display='none'" style="width:32px;height:32px;border-radius:7px;background:rgba(168,85,247,0.1);">
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:800;color:#e9d5ff;">${mod.title}</div>
          <div style="font-size:11px;color:rgba(192,132,252,0.5);margin-top:1px;">Выберите версию для скачивания</div>
        </div>
        <button id="modver-close" style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:50%;width:28px;height:28px;color:#c084fc;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div id="modver-list" style="flex:1;overflow-y:auto;padding:10px 12px;">
        <div style="text-align:center;padding:40px 0;color:rgba(168,85,247,0.4);font-size:13px;">Загрузка версий...</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeVer = () => overlay.remove();
  document.getElementById('modver-close').addEventListener('click', closeVer);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeVer(); });

  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${mod.project_id}/version`);
    const versions = await res.json();
    const list = document.getElementById('modver-list');

    if (!versions.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(168,85,247,0.35);font-size:13px;">Версии не найдены</div>';
      return;
    }

    list.innerHTML = '';
    versions.forEach(ver => {
      const gameVers = ver.game_versions?.join(', ') || '?';
      const loaders  = ver.loaders?.join(', ')       || '?';
      const file =
        Array.isArray(ver.files)
          ? (ver.files.find((f) => f.primary) || ver.files[0])
          : null;
      if (!file?.url || !file.filename) return;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:12px;cursor:pointer;transition:background .15s;margin-bottom:3px;';
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:#e9d5ff;">${ver.name}</div>
          <div style="font-size:10px;color:rgba(192,132,252,0.5);margin-top:2px;">MC: ${gameVers} &nbsp;|&nbsp; ${loaders}</div>
        </div>
        <div id="dl-status-${ver.id}" style="font-size:11px;color:rgba(168,85,247,0.5);flex-shrink:0;"></div>
        <button data-id="${ver.id}" style="background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:8px;color:#c084fc;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer;transition:all .2s;flex-shrink:0;">⬇ Скачать</button>
      `;

      row.addEventListener('mouseover', () => row.style.background = 'rgba(168,85,247,0.08)');
      row.addEventListener('mouseout',  () => row.style.background = 'transparent');

      row.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn    = row.querySelector('button');
        const status = document.getElementById(`dl-status-${ver.id}`);
        btn.disabled = true; btn.textContent = '...'; btn.style.opacity = '.5';

        try {
          if (!state.selectedVersion) {
            status.style.color = '#f87171';
            status.textContent = '✖ Сначала выберите версию MC';
            btn.textContent = '⬇ Скачать'; btn.style.opacity = '1'; btn.disabled = false;
            return;
          }
          const { path: gameDir } = await amethyst.getInstancePath({
            version: state.selectedVersion,
            loader: state.selectedLoader,
          });
          if (amethyst.modrinthDownload) {
            await amethyst.modrinthDownload({ fileUrl: file.url, fileName: file.filename, gameDir });
            status.style.color = '#a855f7'; status.textContent = '✓ Скачан';
          } else {
            amethyst.openExternal(file.url);
            status.style.color = '#a855f7'; status.textContent = '↗ Открыт';
          }
        } catch(err) {
          status.style.color = '#f87171'; status.textContent = '✖ Ошибка';
        }
        btn.textContent = '⬇ Скачать'; btn.style.opacity = '1'; btn.disabled = false;
      });

      list.appendChild(row);
    });
  } catch(e) {
    document.getElementById('modver-list').innerHTML = `<div style="text-align:center;padding:40px 0;color:#f87171;font-size:13px;">Ошибка: ${e.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE: Telegram popup (показывается один раз при первом запуске)
// ═══════════════════════════════════════════════════════════════════════════
async function initTgPopup() {
  const seen = await amethyst.storeGet('tg-popup-seen');
  if (seen) return;

  // Создаём оверлей
  const overlay = document.createElement('div');
  overlay.id = 'tg-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(15,5,29,0.82);backdrop-filter:blur(6px);
  `;

  overlay.innerHTML = `
    <div style="
      position:relative;
      background:linear-gradient(145deg,#1a0b2e,#200d38);
      border:1px solid rgba(168,85,247,0.3);
      border-radius:20px;
      padding:36px 40px 32px;
      width:360px;
      box-shadow:0 0 60px rgba(168,85,247,0.25);
      text-align:center;
      font-family:'Montserrat',sans-serif;
    ">
      <!-- Крестик -->
      <button id="tg-close" style="
        position:absolute;top:14px;right:16px;
        background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);
        border-radius:50%;width:28px;height:28px;
        color:#c084fc;font-size:16px;line-height:1;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
        transition:all .2s;
      ">✕</button>

      <!-- Иконка -->
      <div style="font-size:48px;margin-bottom:12px;">💎</div>

      <!-- Заголовок -->
      <div style="font-size:20px;font-weight:800;color:#e9d5ff;margin-bottom:8px;letter-spacing:-.3px;">
        Добро пожаловать в Amethyst!
      </div>

      <!-- Текст -->
      <div style="font-size:13px;color:rgba(192,132,252,0.7);line-height:1.6;margin-bottom:24px;">
        Подпишись на наш Telegram-канал —<br>
        там новости, обновления и поддержка.
      </div>

      <!-- Кнопка -->
      <button id="tg-go" style="
        width:100%;padding:13px;
        background:linear-gradient(135deg,#7c3aed,#a855f7);
        border:none;border-radius:12px;
        color:#fff;font-family:'Montserrat',sans-serif;
        font-size:14px;font-weight:700;letter-spacing:.05em;
        cursor:pointer;transition:all .2s;
      ">
        ✈ Перейти в канал
      </button>

      <div style="margin-top:12px;font-size:11px;color:rgba(168,85,247,0.35);">
        Это сообщение больше не появится
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = async () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .25s';
    setTimeout(() => overlay.remove(), 260);
    await amethyst.storeSet('tg-popup-seen', true);
  };

  $('tg-close').addEventListener('click', close);
  $('tg-go').addEventListener('click', () => {
    amethyst.openExternal('https://t.me/amethyst_launcher');
    close();
  });

  // Hover на кнопке
  $('tg-go').addEventListener('mouseover',  () => { $('tg-go').style.opacity = '.85'; $('tg-go').style.transform = 'translateY(-1px)'; });
  $('tg-go').addEventListener('mouseout',   () => { $('tg-go').style.opacity = '1';   $('tg-go').style.transform = 'none'; });
}
