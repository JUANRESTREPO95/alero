// Alero — barra superior con pestañas de terminal.
// Proceso principal: ventana, atajos globales, bandeja y puente con los PTY.

const path = require('path');
const {
  app, BrowserWindow, screen, globalShortcut, ipcMain,
  Tray, Menu, nativeImage, clipboard,
} = require('electron');

const settings = require('./settings');
const pty = require('./pty');

const COLLAPSED = { width: 360, height: 36 };
const TOGGLE_ACCELERATOR = 'Control+Alt+Space';
const NEW_TAB_ACCELERATOR = 'Control+Alt+T';

let win = null;
let tray = null;
let expanded = false;

// ── Geometría ────────────────────────────────────────────────────────────────

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function boundsFor(on) {
  const wa = workArea();
  const s = settings.load();
  const width = Math.min(on ? s.width : COLLAPSED.width, wa.width);
  const height = Math.min(on ? s.height : COLLAPSED.height, wa.height);
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: wa.y,
    width,
    height,
  };
}

// ── Ventana ──────────────────────────────────────────────────────────────────

function createWindow() {
  const s = settings.load();
  expanded = Boolean(s.expanded);

  win = new BrowserWindow({
    ...boundsFor(expanded),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.showInactive();
    win.webContents.send('alero:state', { expanded });
    if (expanded && s.focusOnOpen) win.focus();
  });
}

function setExpanded(on, { focus = false } = {}) {
  if (!win || win.isDestroyed()) return;
  expanded = Boolean(on);
  win.setBounds(boundsFor(expanded));
  win.webContents.send('alero:state', { expanded });
  settings.save({ expanded });
  if (expanded && focus) win.focus();
}

function toggle() {
  setExpanded(!expanded, { focus: !expanded });
}

// ── Bandeja del sistema ──────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Alero');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar / ocultar', accelerator: TOGGLE_ACCELERATOR, click: toggle },
    {
      label: 'Nueva pestaña',
      click: () => {
        setExpanded(true, { focus: true });
        win.webContents.send('alero:new-tab');
      },
    },
    { type: 'separator' },
    {
      label: 'Arrancar con Windows',
      type: 'checkbox',
      checked: settings.load().autostart,
      click: (item) => {
        settings.save({ autostart: item.checked });
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
      },
    },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggle);
}

// ── IPC ──────────────────────────────────────────────────────────────────────

function wireIpc() {
  ipcMain.on('alero:toggle', toggle);
  ipcMain.on('alero:expand', () => setExpanded(true, { focus: true }));
  ipcMain.on('alero:collapse', () => setExpanded(false));

  ipcMain.handle('alero:pty:create', (_e, opts) => {
    return pty.create(
      opts,
      (id, data) => {
        if (win && !win.isDestroyed()) win.webContents.send('alero:pty:data', id, data);
      },
      (id, exit) => {
        if (win && !win.isDestroyed()) win.webContents.send('alero:pty:exit', id, exit);
      },
    );
  });
  ipcMain.on('alero:pty:input', (_e, id, data) => pty.input(id, data));
  ipcMain.on('alero:pty:resize', (_e, id, cols, rows) => pty.resize(id, cols, rows));
  ipcMain.on('alero:pty:kill', (_e, id) => pty.kill(id));

  ipcMain.handle('alero:settings:get', () => settings.load());
  ipcMain.handle('alero:settings:set', (_e, patch) => settings.save(patch));
  ipcMain.handle('alero:profile-defaults', () =>
    settings.DEFAULT_PROFILES.map((p) => ({ ...p })));

  ipcMain.handle('alero:clipboard:read', () => clipboard.readText());
  ipcMain.handle('alero:clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));
}

// ── Arranque ─────────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => toggle());
  app.on('window-all-closed', () => {
    // Vive en la bandeja: no se cierra al cerrar la ventana.
  });

  app.whenReady().then(() => {
    settings.load();
    wireIpc();
    createWindow();
    createTray();

    globalShortcut.register(TOGGLE_ACCELERATOR, toggle);
    globalShortcut.register(NEW_TAB_ACCELERATOR, () => {
      setExpanded(true, { focus: true });
      if (win && !win.isDestroyed()) win.webContents.send('alero:new-tab');
    });

    if (process.argv.includes('--hidden')) setExpanded(settings.load().expanded, { focus: false });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    pty.killAll();
  });
}
