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
  decide: (id, decision) => ipcRenderer.send('alero:decision', id, decision),
  dismissAlert: () => ipcRenderer.send('alero:alert:dismiss'),
  hooksPreview: (install) => ipcRenderer.invoke('alero:hooks:preview', install),
  hooksApply: (install, fingerprint) => ipcRenderer.invoke('alero:hooks:apply', install, fingerprint),
  hooksInstalled: () => ipcRenderer.invoke("alero:hooks:installed"),

  keysStatus: () => ipcRenderer.invoke("alero:keys:status"),
  setKey: (provider, key) => ipcRenderer.invoke("alero:keys:set", provider, key),

  chatStart: (req) => ipcRenderer.send("alero:chat:start", req),
  chatStop: (id) => ipcRenderer.send("alero:chat:stop", id),
  chatHistory: (profileId) => ipcRenderer.invoke("alero:chat:history", profileId),
  chatSave: (profileId, messages) => ipcRenderer.invoke("alero:chat:save", profileId, messages),
  chatModels: (provider, baseUrl) => ipcRenderer.invoke("alero:chat:models", provider, baseUrl),

  onChatDelta: (cb) => ipcRenderer.on("alero:chat:delta", (_e, data) => cb(data)),
  onChatDone: (cb) => ipcRenderer.on("alero:chat:done", (_e, data) => cb(data)),
  onChatError: (cb) => ipcRenderer.on("alero:chat:error", (_e, data) => cb(data)),
  logoData: (rel) => ipcRenderer.invoke('alero:logo:data', rel),
  readClipboard: () => ipcRenderer.invoke('alero:clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('alero:clipboard:write', text),

  onData: (cb) => ipcRenderer.on('alero:pty:data', (_e, id, data) => cb(id, data)),
  onExit: (cb) => ipcRenderer.on('alero:pty:exit', (_e, id, exit) => cb(id, exit)),
  onState: (cb) => ipcRenderer.on('alero:state', (_e, state) => cb(state)),
  onNewTab: (cb) => ipcRenderer.on('alero:new-tab', () => cb()),
  onAlert: (cb) => ipcRenderer.on('alero:alert', (_e, alert) => cb(alert)),
  onAlertClear: (cb) => ipcRenderer.on('alero:alert:clear', () => cb()),
});
