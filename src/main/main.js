// Alero — barra superior con pestañas de terminal.
// Proceso principal: ventana, atajos globales, bandeja y puente con los PTY.

const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, screen, globalShortcut, ipcMain,
  Tray, Menu, nativeImage, clipboard, dialog,
} = require('electron');

const settings = require('./settings');
const pty = require('./pty');

const COLLAPSED = { width: 128, height: 40 };

let win = null;
let tray = null;
let expanded = false;
/** Atajos globales registrados en este momento (para poder cambiarlos). */
let registered = { toggle: null, newTab: null };

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
    win.webContents.send('alero:state', { expanded, animating: false });
    if (expanded && s.focusOnOpen) win.focus();
  });
}

/**
 * Lleva la ventana de sus límites actuales a `target` en `duration` ms, con
 * desaceleración. Se usa para la animación de abrir y plegar.
 */
function animateTo(target, duration, done) {
  if (!win || win.isDestroyed()) return;
  const start = win.getBounds();
  const t0 = Date.now();

  const step = () => {
    if (!win || win.isDestroyed()) return;
    const k = Math.min(1, (Date.now() - t0) / duration);
    const ease = 1 - Math.pow(1 - k, 3);
    win.setBounds({
      x: Math.round(start.x + (target.x - start.x) * ease),
      y: Math.round(start.y + (target.y - start.y) * ease),
      width: Math.round(start.width + (target.width - start.width) * ease),
      height: Math.round(start.height + (target.height - start.height) * ease),
    });
    if (k < 1) setTimeout(step, 16);
    else if (done) done();
  };

  step();
}

let animating = false;

function setExpanded(on, { focus = false, then = null } = {}) {
  if (!win || win.isDestroyed()) return;
  if (animating) return;
  if (on === expanded) {
    if (on && focus) win.focus();
    if (then) then();
    return;
  }

  const target = boundsFor(on);
  const barOnly = { ...target, height: COLLAPSED.height };
  expanded = Boolean(on);
  settings.save({ expanded });
  animating = true;

  if (on) {
    if (focus) win.focus();
    // 1) la barra se estira a lo ancho (con las pestañas ya visibles)
    win.webContents.send('alero:state', { expanded: true, animating: true });
    animateTo(barOnly, 150, () => {
      // 2) el panel baja
      animateTo(target, 180, () => {
        animating = false;
        // Aviso final: la terminal se reajusta al tamaño definitivo.
        win.webContents.send('alero:state', { expanded: true, animating: false });
        if (focus) win.focus();
        if (then) then();
      });
    });
  } else {
    // 1) el panel sube (la barra sigue completa)
    win.webContents.send('alero:state', { expanded: true, animating: true });
    animateTo(barOnly, 150, () => {
      // 2) la barra se encoge y queda solo la marca
      win.webContents.send('alero:state', { expanded: false, animating: true });
      animateTo(target, 140, () => {
        animating = false;
        win.webContents.send('alero:state', { expanded: false, animating: false });
        if (then) then();
      });
    });
  }
}

function toggle() {
  setExpanded(!expanded, { focus: !expanded });
}

// ── Atajos globales ──────────────────────────────────────────────────────────

function newTab() {
  setExpanded(true, {
    focus: true,
    then: () => {
      if (win && !win.isDestroyed()) win.webContents.send('alero:new-tab');
    },
  });
}

function handlers() {
  return { toggle, newTab };
}

/**
 * Registra los atajos globales. Si uno nuevo no se puede registrar (otra app lo
 * tiene), se deja el anterior en su sitio y se informa en el resultado.
 */
function applyShortcuts(map) {
  const ok = {};

  for (const name of settings.GLOBAL_SHORTCUTS) {
    const next = String(map?.[name] || '').trim();
    const previous = registered[name];

    if (!next) {
      ok[name] = false;
      continue;
    }
    if (previous === next) {
      ok[name] = true;
      continue;
    }

    let success = false;
    try {
      success = globalShortcut.register(next, handlers()[name]);
    } catch {
      success = false;
    }

    if (success) {
      if (previous) globalShortcut.unregister(previous);
      registered[name] = next;
      ok[name] = true;
    } else {
      // El anterior sigue registrado: se mantiene para no quedarse sin atajo.
      ok[name] = false;
      map[name] = previous || '';
    }
  }

  return ok;
}

// ── Bandeja del sistema ──────────────────────────────────────────────────────

function buildTrayMenu() {
  if (!tray) return;
  const current = settings.load().shortcuts || {};
  const menu = Menu.buildFromTemplate([
    {
      label: 'Mostrar / ocultar',
      accelerator: registered.toggle || current.toggle || undefined,
      click: toggle,
    },
    {
      label: 'Nueva pestaña',
      accelerator: registered.newTab || current.newTab || undefined,
      click: newTab,
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
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Alero');
  buildTrayMenu();
  tray.on('click', toggle);
}

// ── Logos de perfil ──────────────────────────────────────────────────────────

const LOGO_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function logosDir() {
  const dir = path.join(app.getPath('userData'), 'logos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ruta absoluta de un logo guardado; nunca sale de la carpeta de logos. */
function logoFile(rel) {
  return path.join(logosDir(), path.basename(String(rel || '')));
}

/** El logo como data URL, para que la interfaz no necesite acceso a archivos. */
function logoDataUrl(rel) {
  try {
    const file = logoFile(rel);
    const mime = LOGO_TYPES[path.extname(file).toLowerCase()];
    if (!mime) return '';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return '';
  }
}

async function pickLogo() {
  const result = await dialog.showOpenDialog(win, {
    title: 'Elegir logo del perfil',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;

  const source = result.filePaths[0];
  const ext = path.extname(source).toLowerCase();
  if (!LOGO_TYPES[ext]) return { error: 'Formato no admitido.' };

  try {
    if (fs.statSync(source).size > MAX_LOGO_BYTES) {
      return { error: 'La imagen supera los 2 MB.' };
    }
  } catch {
    return { error: 'No se pudo leer la imagen.' };
  }

  const name = `logo-${Date.now().toString(36)}${ext}`;
  try {
    fs.copyFileSync(source, path.join(logosDir(), name));
  } catch {
    return { error: 'No se pudo copiar la imagen.' };
  }

  return { path: `logos/${name}`, dataUrl: logoDataUrl(name) };
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

  // Cambiar los atajos globales: se intenta primero el nuevo; si falla, el
  // anterior sigue ocupando su sitio y se devuelve el mapa realmente vigente.
  ipcMain.handle('alero:shortcuts:apply', (_e, map) => {
    const wanted = { ...(settings.load().shortcuts || {}), ...(map || {}) };
    const ok = applyShortcuts(wanted);
    const shortcuts = settings.save({ shortcuts: wanted }).shortcuts;
    buildTrayMenu();
    return { ok, shortcuts };
  });

  ipcMain.handle('alero:logo:pick', () => pickLogo());
  ipcMain.handle('alero:logo:data', (_e, rel) => logoDataUrl(rel));

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
    const s = settings.load();
    wireIpc();
    createWindow();
    createTray();

    applyShortcuts({ ...s.shortcuts });
    buildTrayMenu();

    if (process.argv.includes('--hidden')) setExpanded(s.expanded, { focus: false });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    pty.killAll();
  });
}
