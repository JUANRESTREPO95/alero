// Puente seguro entre la interfaz y el proceso principal.
// contextIsolation está activo: aquí se expone solo lo necesario.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alero', {
  toggle: () => ipcRenderer.send('alero:toggle'),
  expand: () => ipcRenderer.send('alero:expand'),
  collapse: () => ipcRenderer.send('alero:collapse'),

  createTab: (opts) => ipcRenderer.invoke('alero:pty:create', opts),
  input: (id, data) => ipcRenderer.send('alero:pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('alero:pty:resize', id, cols, rows),
  killTab: (id) => ipcRenderer.send('alero:pty:kill', id),

  getSettings: () => ipcRenderer.invoke('alero:settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('alero:settings:set', patch),
  defaultProfiles: () => ipcRenderer.invoke('alero:profile-defaults'),
  applyShortcuts: (map) => ipcRenderer.invoke('alero:shortcuts:apply', map),
  pickLogo: () => ipcRenderer.invoke('alero:logo:pick'),
  logoData: (rel) => ipcRenderer.invoke('alero:logo:data', rel),
  readClipboard: () => ipcRenderer.invoke('alero:clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('alero:clipboard:write', text),

  onData: (cb) => ipcRenderer.on('alero:pty:data', (_e, id, data) => cb(id, data)),
  onExit: (cb) => ipcRenderer.on('alero:pty:exit', (_e, id, exit) => cb(id, exit)),
  onState: (cb) => ipcRenderer.on('alero:state', (_e, state) => cb(state)),
  onNewTab: (cb) => ipcRenderer.on('alero:new-tab', () => cb()),
});
