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
  launchGame: cfg => ipcRenderer.invoke('launch-game', cfg),
  msLogin:        () => ipcRenderer.invoke('ms-login'),
  msLogout:       () => ipcRenderer.invoke('ms-logout'),
  msStatus:       () => ipcRenderer.invoke('ms-status'),
  modrinthSearch:  (query) => ipcRenderer.invoke('modrinth-search', query),
  modrinthVersions:(projectId) => ipcRenderer.invoke('modrinth-versions', projectId),
  modrinthDownloadVersion:(req) => ipcRenderer.invoke('modrinth-download-version', req),

  // Events
  onLog:       cb => ipcRenderer.on('log',        (_, d) => cb(d)),
  onGameClose: cb => ipcRenderer.on('game-close', (_, c) => cb(c)),
});
