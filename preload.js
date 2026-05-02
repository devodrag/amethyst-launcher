const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amethyst', {
  // Window
  minimize:    () => ipcRenderer.send('win-minimize'),
  maximize:    () => ipcRenderer.send('win-maximize'),
  close:       () => ipcRenderer.send('win-close'),

  // Shell
  openExternal: url => ipcRenderer.send('open-external', url),
  openFolder:   p   => ipcRenderer.send('open-folder', p),

  // Data
  getSystemInfo:  () => ipcRenderer.invoke('get-system-info'),
  fetchVersions:  () => ipcRenderer.invoke('fetch-versions'),
  getInstancePath: cfg => ipcRenderer.invoke('get-instance-path', cfg || {}),
  launchGame: cfg => ipcRenderer.invoke('launch-game', cfg),

  // Events
  onLog:       cb => ipcRenderer.on('log',        (_, d) => cb(d)),
  onGameClose: cb => ipcRenderer.on('game-close', (_, c) => cb(c)),

  // Microsoft Auth
  authMsLogin:  () => ipcRenderer.invoke('auth-ms-login'),
  authMsLogout: () => ipcRenderer.invoke('auth-ms-logout'),
  authMsStatus: () => ipcRenderer.invoke('auth-ms-status'),

  // Persistent store (для флага "попап уже показан")
  storeGet: key        => ipcRenderer.invoke('store-get', key),
  storeSet: (key, val) => ipcRenderer.invoke('store-set', key, val),

  // Modrinth download (скачивает .jar в папку mods/)
  modrinthDownload: (cfg) => ipcRenderer.invoke('modrinth-download', cfg),
});
