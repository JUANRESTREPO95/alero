// Alero — interfaz: pestañas, terminales, perfiles y ajustes.
// Todo pasa por el puente `window.alero` (preload.js): aquí no hay Node.

const el = {
  shell: document.getElementById('shell'),
  bar: document.getElementById('bar'),
  tabs: document.getElementById('tabs'),
  terminals: document.getElementById('terminals'),
  newTab: document.getElementById('newTab'),
  settingsBtn: document.getElementById('settingsBtn'),
  collapse: document.getElementById('collapse'),
  menu: document.getElementById('menu'),
  settings: document.getElementById('settings'),
  profileList: document.getElementById('profileList'),
  addProfile: document.getElementById('addProfile'),
  restoreProfiles: document.getElementById('restoreProfiles'),
  saveProfiles: document.getElementById('saveProfiles'),
  closeSettings: document.getElementById('closeSettings'),
  tabProfiles: document.getElementById('tabProfiles'),
  tabShortcuts: document.getElementById('tabShortcuts'),
  profilesPane: document.getElementById('profilesPane'),
  shortcutsPane: document.getElementById('shortcutsPane'),
  shortcutList: document.getElementById('shortcutList'),
  settingsMessage: document.getElementById('settingsMessage'),
  settingsHint: document.getElementById('settingsHint'),
  profileActions: document.getElementById('profileActions'),
  settingsTitle: document.getElementById('settingsTitle'),
};

// La terminal usa el mismo suelo que el resto: superficie del sheet, tinta
// blanca y la arcilla solo en el cursor.
const THEME = {
  background: '#131217',
  foreground: '#e6e6e8',
  cursor: '#c2703f',
  cursorAccent: '#131217',
  selectionBackground: '#2f2d33',
  black: '#1b1a1f', red: '#e5566f', green: '#44a282', yellow: '#d9a441',
  blue: '#6f9fd8', magenta: '#b48ead', cyan: '#5fa8a0', white: '#d7d7da',
  brightBlack: '#8a8c92', brightRed: '#f0788c', brightGreen: '#5fc39c',
  brightYellow: '#e8bd6e', brightBlue: '#8fb9e8', brightMagenta: '#c9a6c4',
  brightCyan: '#7cc0b8', brightWhite: '#ffffff',
};

/** ptyId → { id, profile, title, color, term, fit, holder, dead } */
const tabs = new Map();
let activeId = null;
let settings = null;
let profiles = [];
let shortcuts = {};
let draftShortcuts = {};
let recording = null;
let expanded = false;

// ── Pestañas ─────────────────────────────────────────────────────────────────

function newTerm() {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", Consolas, monospace', // taste-skill-ignore mono: la terminal es código
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 5000,
    theme: THEME,
    allowProposedApi: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}

function fitTab(tab) {
  if (!expanded) return;
  try {
    tab.fit.fit();
  } catch {
    // Terminal recién oculta o aún sin medidas.
  }
}

function profileById(id) {
  return profiles.find((p) => p.id === id) || profiles[0] || null;
}

async function addTab(profileId, { select = true } = {}) {
  const profile = profileById(profileId);
  if (!profile) return;

  const holder = document.createElement('div');
  holder.className = 'term';
  el.terminals.appendChild(holder);

  const { term, fit } = newTerm();
  term.open(holder);

  // Con la ventana plegada, xterm no tiene tamaño útil: se usa uno razonable y
  // se corrige al expandir.
  let cols = 100;
  let rows = 30;
  if (expanded) {
    try {
      fit.fit();
      cols = term.cols;
      rows = term.rows;
    } catch {
      // Tamaño por defecto.
    }
  }

  let id;
  try {
    id = await window.alero.createTab({
      shell: profile.shell,
      command: profile.command,
      cwd: profile.cwd || '',
      cols,
      rows,
    });
  } catch (err) {
    holder.remove();
    term.dispose();
    console.error('alero: no se pudo abrir la terminal:', err);
    return;
  }

  const tab = {
    id,
    profile: profile.id,
    title: profile.label,
    color: profile.color,
    term,
    fit,
    holder,
    dead: false,
  };
  tabs.set(id, tab);

  term.onData((data) => window.alero.input(id, data));
  term.onResize(({ cols: c, rows: r }) => window.alero.resize(id, c, r));

  if (select) activate(id);
  else renderTabs();

  saveTabs();
  return tab;
}

function activate(id) {
  if (!tabs.has(id)) return;
  activeId = id;
  for (const [key, tab] of tabs) {
    tab.holder.classList.toggle('active', key === id);
  }
  renderTabs();
  const tab = tabs.get(id);
  fitTab(tab);
  if (expanded && !isSettingsOpen()) tab.term.focus();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  window.alero.killTab(id);
  tab.term.dispose();
  tab.holder.remove();
  tabs.delete(id);

  if (activeId === id) {
    const next = tabs.keys().next();
    activeId = null;
    if (!next.done) activate(next.value);
  }
  renderTabs();
  saveTabs();
}

function markDead(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.dead = true;
  tab.term.write('\r\n\x1b[90m[la sesión terminó]\x1b[0m\r\n');
  renderTabs();
}

function renderTabs() {
  el.tabs.textContent = '';
  for (const [id, tab] of tabs) {
    const node = document.createElement('div');
    node.className = 'tab' + (id === activeId ? ' active' : '') + (tab.dead ? ' dead' : '');
    node.title = tab.title;
    node.style.setProperty('--tab-color', tab.color);

    const kind = document.createElement('span');
    kind.className = 'kind';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = tab.title;

    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Cerrar pestaña';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });

    node.append(kind, name, close);
    node.addEventListener('click', () => activate(id));
    el.tabs.appendChild(node);
  }
}

function saveTabs() {
  const list = [...tabs.values()].map((t) => ({ profile: t.profile, label: t.title }));
  window.alero.saveSettings({ tabs: list });
}

// ── Menú «+» ─────────────────────────────────────────────────────────────────

let menuIndex = 0;

function menuButtons() {
  return [...el.menu.querySelectorAll('button')];
}

function setMenuIndex(index) {
  const buttons = menuButtons();
  if (!buttons.length) return;
  menuIndex = (index + buttons.length) % buttons.length;
  buttons.forEach((button, n) => {
    button.classList.toggle('selected', n === menuIndex);
  });
}

function pickMenu(index = menuIndex) {
  const button = menuButtons()[index];
  if (!button) return;
  closeMenu();
  if (button.dataset.action === 'settings') openSettings();
  else if (button.dataset.profile) addTab(button.dataset.profile);
}

function renderMenu() {
  el.menu.textContent = '';

  for (const p of profiles) {
    const button = document.createElement('button');
    button.dataset.profile = p.id;
    button.style.setProperty('--accent', p.color || '#c2703f');
    const dot = document.createElement('span');
    dot.className = 'menu-dot';
    const label = document.createElement('span');
    label.textContent = p.label;
    button.append(dot, label);
    button.addEventListener('mouseenter', () => setMenuIndex(menuButtons().indexOf(button)));
    el.menu.appendChild(button);
  }

  if (profiles.length) {
    const separator = document.createElement('div');
    separator.className = 'menu-sep';
    el.menu.appendChild(separator);
  }

  const configure = document.createElement('button');
  configure.dataset.action = 'settings';
  configure.textContent = 'Configurar…';
  configure.addEventListener('mouseenter', () => setMenuIndex(menuButtons().indexOf(configure)));
  el.menu.appendChild(configure);
}

function openMenu() {
  const show = () => {
    const rect = el.newTab.getBoundingClientRect();
    const width = 170;
    el.menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    el.menu.style.top = `${rect.bottom + 4}px`;
    el.menu.style.right = 'auto';
    el.menu.classList.remove('hidden');
    setMenuIndex(0);
  };
  if (!expanded) {
    window.alero.expand();
    setTimeout(show, 120);
  } else {
    show();
  }
}

function closeMenu() {
  el.menu.classList.add('hidden');
  menuButtons().forEach((button) => button.classList.remove('selected'));
}

// ── Atajos ──────────────────────────────────────────────────────────────────

const SHORTCUT_DEFS = [
  { key: 'toggle', title: 'Mostrar / plegar', global: true },
  { key: 'newTab', title: 'Nueva pestaña', global: true },
  { key: 'closeTab', title: 'Cerrar la pestaña actual', global: false },
  { key: 'nextTab', title: 'Pestaña siguiente', global: false },
  { key: 'prevTab', title: 'Pestaña anterior', global: false },
  { key: 'copy', title: 'Copiar de la terminal', global: false },
  { key: 'paste', title: 'Pegar en la terminal', global: false },
];

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta']);
const KEY_NAMES = {
  ' ': 'Space',
  Spacebar: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Escape',
};
const KEY_LABELS = {
  Control: 'Ctrl',
  Super: 'Win',
  Space: 'Espacio',
  Tab: 'Tab',
  Return: 'Intro',
  Escape: 'Esc',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

function friendly(accel) {
  if (!accel) return 'Sin asignar';
  return accel.split('+').map((part) => KEY_LABELS[part] || part).join(' + ');
}

function eventKey(e) {
  if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

function parseAccel(accel) {
  const parts = String(accel || '').split('+').filter(Boolean);
  const key = parts.pop() || '';
  return {
    key,
    ctrl: parts.includes('Control'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    meta: parts.includes('Super'),
  };
}

function matches(accel, e) {
  if (!accel) return false;
  const a = parseAccel(accel);
  if (e.ctrlKey !== a.ctrl || e.altKey !== a.alt || e.shiftKey !== a.shift || e.metaKey !== a.meta) {
    return false;
  }
  return eventKey(e) === a.key;
}

function accelFromEvent(e) {
  if (MODIFIERS.has(e.key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  return [...parts, eventKey(e)].join('+');
}

function renderShortcuts() {
  el.shortcutList.textContent = '';

  for (const def of SHORTCUT_DEFS) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';

    const label = document.createElement('div');
    label.className = 'shortcut-label';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = def.title;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = def.global ? 'Global: funciona con cualquier app' : 'Con Alero enfocado';
    label.append(title, meta);

    const cap = document.createElement('button');
    cap.className = 'keycap' + (recording === def.key ? ' recording' : '');
    cap.textContent = recording === def.key ? 'Pulsa una combinación…' : friendly(draftShortcuts[def.key]);
    cap.setAttribute('aria-label', `Cambiar el atajo de ${def.title}`);
    cap.addEventListener('click', () => startRecording(def.key));

    row.append(label, cap);
    el.shortcutList.appendChild(row);
  }
}

function startRecording(key) {
  recording = key;
  el.settingsMessage.textContent = '';
  renderShortcuts();
  document.addEventListener('keydown', onRecord, true);
}

function stopRecording() {
  if (!recording) return;
  recording = null;
  document.removeEventListener('keydown', onRecord, true);
  renderShortcuts();
}

function onRecord(e) {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecording();
    return;
  }

  const accel = accelFromEvent(e);
  if (!accel) return; // solo modificadores: seguimos esperando

  const def = SHORTCUT_DEFS.find((d) => d.key === recording);
  if (!def) return;

  if (def.global && !accel.split('+').some((p) => ['Control', 'Alt', 'Super'].includes(p))) {
    el.settingsMessage.textContent = 'Un atajo global necesita Ctrl, Alt o Win.';
    return;
  }

  const conflict = SHORTCUT_DEFS.find(
    (d) => d.key !== recording && draftShortcuts[d.key] === accel,
  );
  if (conflict) {
    el.settingsMessage.textContent = `Esa combinación ya es «${conflict.title}».`;
    return;
  }

  draftShortcuts[recording] = accel;
  stopRecording();
}

function setSettingsTab(tab) {
  stopRecording();
  el.tabProfiles.classList.toggle('active', tab === 'profiles');
  el.tabShortcuts.classList.toggle('active', tab === 'shortcuts');
  el.profilesPane.classList.toggle('hidden', tab !== 'profiles');
  el.shortcutsPane.classList.toggle('hidden', tab !== 'shortcuts');
  el.profileActions.classList.toggle('hidden', tab !== 'profiles');
  el.settingsTitle.textContent = tab === 'profiles' ? 'Perfiles de terminal' : 'Atajos';
  el.shortcutList.scrollTop = 0;
  el.profileList.scrollTop = 0;
  el.settingsMessage.textContent = '';
  el.settingsHint.innerHTML = tab === 'profiles'
    ? 'Cada perfil es una entrada del menú <strong>+</strong>. La carpeta es donde arranca la terminal; el comando se escribe en la shell elegida.'
    : 'Pulsa un atajo y graba la combinación nueva con el teclado. <strong>Esc</strong> cancela la grabación.';
}

// ── Ajustes: perfiles ────────────────────────────────────────────────────────

let draft = [];

function isSettingsOpen() {
  return !el.settings.classList.contains('hidden');
}

function openSettings() {
  closeMenu();
  if (!expanded) window.alero.expand();
  draft = profiles.map((p) => ({ ...p }));
  draftShortcuts = { ...shortcuts };
  renderProfileEditor();
  renderShortcuts();
  el.settingsMessage.textContent = '';
  setSettingsTab('profiles');
  el.settings.classList.remove('hidden');
}

function closeSettings() {
  el.settings.classList.add('hidden');
  const tab = tabs.get(activeId);
  if (tab && expanded) tab.term.focus();
}

function field(labelText, control, wide = false) {
  const wrap = document.createElement('label');
  wrap.className = 'field' + (wide ? ' wide' : '');
  const caption = document.createElement('span');
  caption.textContent = labelText;
  wrap.append(caption, control);
  return wrap;
}

function renderProfileEditor() {
  el.profileList.textContent = '';

  draft.forEach((profile, index) => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.id = profile.id;

    const head = document.createElement('div');
    head.className = 'card-head';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = profile.color || '#c2703f';
    color.className = 'color';
    color.title = 'Color del perfil';

    const label = document.createElement('input');
    label.type = 'text';
    label.value = profile.label;
    label.placeholder = 'Nombre';
    label.className = 'label';
    label.setAttribute('aria-label', 'Nombre del perfil');

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.title = 'Quitar perfil';
    remove.setAttribute('aria-label', `Quitar ${profile.label}`);
    remove.addEventListener('click', () => {
      draft.splice(index, 1);
      renderProfileEditor();
    });

    head.append(color, label, remove);

    const shell = document.createElement('select');
    shell.className = 'shell';
    for (const [value, text] of [['powershell', 'PowerShell'], ['cmd', 'cmd']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (profile.shell === value) option.selected = true;
      shell.appendChild(option);
    }

    const cwd = document.createElement('input');
    cwd.type = 'text';
    cwd.value = profile.cwd || '';
    cwd.placeholder = 'vacío = tu usuario';
    cwd.className = 'cwd';

    const command = document.createElement('input');
    command.type = 'text';
    command.value = profile.command || '';
    command.placeholder = 'ssh usuario@servidor, claude, cd C:\\ruta…';
    command.className = 'command';

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    grid.append(
      field('Shell', shell),
      field('Carpeta', cwd),
      field('Comando', command, true),
    );

    card.append(head, grid);
    el.profileList.appendChild(card);
  });

  if (!draft.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay perfiles. Añade uno para poder abrir pestañas.';
    el.profileList.appendChild(empty);
  }
}

function readEditor() {
  const rows = [...el.profileList.querySelectorAll('.profile-card')];
  return rows.map((row) => ({
    id: row.dataset.id,
    label: row.querySelector('.label').value.trim() || 'Perfil',
    shell: row.querySelector('.shell').value,
    cwd: row.querySelector('.cwd').value.trim(),
    command: row.querySelector('.command').value.trim(),
    color: row.querySelector('.color').value,
  }));
}

function slugify(label, taken) {
  const base = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'perfil';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

function addDraftProfile() {
  draft = readEditor();
  draft.push({
    id: '', // se genera al guardar, a partir del nombre
    label: 'Nuevo perfil',
    shell: 'powershell',
    cwd: '',
    command: '',
    color: '#8a8c92',
  });
  renderProfileEditor();
  el.profileList.lastElementChild?.querySelector('.label')?.select();
}

function readProfiles() {
  const rows = readEditor();
  const taken = new Set();

  return rows.map((p) => {
    const id = p.id || slugify(p.label, taken);
    taken.add(id);
    return {
      id,
      label: p.label,
      shell: p.shell === 'cmd' ? 'cmd' : 'powershell',
      cwd: p.cwd || '',
      command: p.command,
      color: p.color || '#c2703f',
    };
  });
}

async function saveAll() {
  stopRecording();
  el.settingsMessage.textContent = '';

  // Primero los atajos globales: Windows puede negarse y hay que avisar.
  const applied = await window.alero.applyShortcuts({ ...draftShortcuts });
  const failed = Object.entries(applied.ok || {})
    .filter(([, ok]) => !ok)
    .map(([key]) => SHORTCUT_DEFS.find((d) => d.key === key)?.title || key);

  shortcuts = applied.shortcuts || shortcuts;
  draftShortcuts = { ...shortcuts };
  renderShortcuts();

  if (failed.length) {
    el.settingsMessage.textContent =
      `Windows no deja registrar ${failed.join(' y ')}. Se mantiene el atajo anterior.`;
    return;
  }

  const clean = readProfiles();
  if (clean.length) {
    const saved = await window.alero.saveSettings({ profiles: clean, shortcuts });
    profiles = saved.profiles || clean;
    renderMenu();
  }

  closeSettings();
}

async function restoreDefaults() {
  const defaults = await window.alero.defaultProfiles();
  draft = defaults.map((p) => ({ ...p }));
  renderProfileEditor();
}

// ── Estado (colapsada / expandida) ───────────────────────────────────────────

function applyState(next) {
  expanded = Boolean(next);
  el.shell.classList.toggle('collapsed', !expanded);
  if (expanded) {
    requestAnimationFrame(() => {
      for (const tab of tabs.values()) fitTab(tab);
      const tab = tabs.get(activeId) || tabs.values().next().value;
      if (tab && !isSettingsOpen()) tab.term.focus();
    });
  } else {
    closeMenu();
    el.settings.classList.add('hidden');
  }
}

// ── Atajos locales ───────────────────────────────────────────────────────────

function cycle(step) {
  const ids = [...tabs.keys()];
  if (ids.length < 2) return;
  const at = ids.indexOf(activeId);
  activate(ids[(at + step + ids.length) % ids.length]);
}

// En fase de captura: las teclas que maneja la interfaz no llegan a la
// terminal (si no, las flechas del menú se escribirían en el shell).
document.addEventListener('keydown', (e) => {
  // Grabando un atajo: las teclas son del grabador, no de la interfaz.
  if (recording) return;

  const swallow = () => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (e.key === 'Escape') {
    swallow();
    if (!el.menu.classList.contains('hidden')) closeMenu();
    else if (isSettingsOpen()) closeSettings();
    else window.alero.collapse();
    return;
  }

  // El editor de perfiles usa estas teclas: no interceptarlas allí.
  if (isSettingsOpen()) return;

  // Menú abierto: flechas para moverse, Enter para elegir, números como atajo.
  if (!el.menu.classList.contains('hidden')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      swallow();
      setMenuIndex(menuIndex + 1);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      swallow();
      setMenuIndex(menuIndex - 1);
      return;
    }
    if (e.key === 'Home') {
      swallow();
      setMenuIndex(0);
      return;
    }
    if (e.key === 'End') {
      swallow();
      setMenuIndex(menuButtons().length - 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      swallow();
      pickMenu();
      return;
    }
    const index = Number(e.key);
    if (Number.isInteger(index) && index >= 1 && index <= menuButtons().length) {
      swallow();
      pickMenu(index - 1);
      return;
    }
  }

  if (matches(shortcuts.closeTab, e)) {
    swallow();
    if (activeId) closeTab(activeId);
    return;
  }

  if (matches(shortcuts.nextTab, e)) {
    swallow();
    cycle(1);
    return;
  }

  if (matches(shortcuts.prevTab, e)) {
    swallow();
    cycle(-1);
    return;
  }

  if (matches(shortcuts.copy, e)) {
    const tab = tabs.get(activeId);
    const selection = tab?.term.getSelection();
    if (selection) {
      swallow();
      window.alero.writeClipboard(selection);
      tab.term.clearSelection();
    }
    return;
  }

  if (matches(shortcuts.paste, e)) {
    swallow();
    window.alero.readClipboard().then((text) => {
      const tab = tabs.get(activeId);
      if (tab && text) window.alero.input(tab.id, text);
    });
  }
}, true);

document.fonts?.ready.then(() => {
  for (const tab of tabs.values()) fitTab(tab);
});

window.addEventListener('resize', () => {
  for (const tab of tabs.values()) fitTab(tab);
});

// ── Arranque ─────────────────────────────────────────────────────────────────

async function init() {
  settings = await window.alero.getSettings();
  profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  shortcuts = { ...(settings.shortcuts || {}) };

  window.alero.onData((id, data) => {
    const tab = tabs.get(id);
    if (tab) tab.term.write(data);
  });
  window.alero.onExit((id) => markDead(id));
  window.alero.onState((state) => applyState(state.expanded));
  window.alero.onNewTab(() => openMenu());

  el.newTab.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu();
  });

  el.menu.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'settings') {
      openSettings();
      return;
    }
    if (button.dataset.profile) {
      closeMenu();
      addTab(button.dataset.profile);
    }
  });

  document.addEventListener('click', () => closeMenu());

  el.collapse.addEventListener('click', () => window.alero.collapse());
  el.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSettingsOpen()) closeSettings();
    else openSettings();
  });
  el.closeSettings.addEventListener('click', closeSettings);
  el.addProfile.addEventListener('click', addDraftProfile);
  el.restoreProfiles.addEventListener('click', restoreDefaults);
  el.saveProfiles.addEventListener('click', saveAll);
  el.tabProfiles.addEventListener('click', () => setSettingsTab('profiles'));
  el.tabShortcuts.addEventListener('click', () => setSettingsTab('shortcuts'));

  // Con la barra plegada, un clic en cualquier punto (salvo los botones) la abre.
  el.bar.addEventListener('click', (e) => {
    if (!expanded && !e.target.closest('.actions')) window.alero.expand();
  });

  renderMenu();

  const saved = Array.isArray(settings.tabs) && settings.tabs.length
    ? settings.tabs
    : [{ profile: profiles[0]?.id }];

  for (const item of saved) {
    await addTab(item.profile, { select: false });
  }
  if (tabs.size) activate([...tabs.keys()][0]);
  applyState(Boolean(settings.expanded));
}

init();
