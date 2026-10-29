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
  brandMark: document.getElementById('brandMark'),
  brandName: document.getElementById('brandName'),
  brandLogo: document.getElementById('brandLogo'),
  watermark: document.getElementById('profilesWatermark'),
  terminalsEmpty: document.getElementById('terminalsEmpty'),
  newTabHint: document.getElementById('newTabHint'),

  termSearch: document.getElementById('termSearch'),
  termSearchInput: document.getElementById('termSearchInput'),
  termSearchPrev: document.getElementById('termSearchPrev'),
  termSearchNext: document.getElementById('termSearchNext'),
  termSearchClose: document.getElementById('termSearchClose'),

  alert: document.getElementById('alert'),
  alertTitle: document.getElementById('alertTitle'),
  alertBody: document.getElementById('alertBody'),
  alertActions: document.getElementById('alertActions'),
  alertAvatar: document.getElementById('alertAvatar'),

  tabAlerts: document.getElementById('tabAlerts'),
  alertsPane: document.getElementById('alertsPane'),
  hooksStatus: document.getElementById('hooksStatus'),
  hooksToggle: document.getElementById('hooksToggle'),
  hooksPreview: document.getElementById('hooksPreview'),
  hooksDiff: document.getElementById('hooksDiff'),
  hooksNote: document.getElementById('hooksNote'),
  hooksCancel: document.getElementById('hooksCancel'),
  hooksConfirm: document.getElementById('hooksConfirm'),
  alertProfiles: document.getElementById('alertProfiles'),
  alertSound: document.getElementById('alertSound'),
  alertApprove: document.getElementById('alertApprove'),
  alertSeconds: document.getElementById('alertSeconds'),
  tabBar: document.getElementById('tabBar'),
  tabChat: document.getElementById('tabChat'),
  chatPane: document.getElementById('chatPane'),
  keyList: document.getElementById('keyList'),
  barPane: document.getElementById('barPane'),
  collapseBlur: document.getElementById('collapseBlur'),
  collapseIdle: document.getElementById('collapseIdle'),
  collapseSeconds: document.getElementById('collapseSeconds'),
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
/** logo (ruta relativa) → data URL, para no depender de rutas en la interfaz. */
const logoCache = new Map();
let expanded = false;
let animating = false;
// xterm mide la celda con la fuente de la terminal; hasta que no está lista, el
// ajuste daría columnas de más. Se espera, con un tope por si nunca carga.
let fontsReady = false;

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

  const search = new SearchAddon.SearchAddon();
  term.loadAddon(search);

  // Los enlaces se abren en el navegador; el proceso principal corta la ventana.
  term.loadAddon(new WebLinksAddon.WebLinksAddon());

  return { term, fit, search };
}

function fitTab(tab) {
  if (!tab || !tab.term) return;
  if (!expanded || animating || !fontsReady) return;
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

  // Perfil de tipo chat: no hay terminal, hay conversación.
  if (profile.kind === 'chat') {
    const id = `chat-${crypto.randomUUID()}`;
    const chat = AleroChat.create({
      profile,
      id,
      onActivity: noteActivity,
      onModelChange: (model) => {
        const target = profiles.find((p) => p.id === profile.id);
        if (!target || target.model === model) return;
        target.model = model;
        window.alero.saveSettings({ profiles });
      },
    });
    el.terminals.appendChild(chat.el);

    const chatTab = {
      id,
      profile: profile.id,
      title: profile.label,
      color: profile.color,
      kind: 'chat',
      chat,
      holder: chat.el,
      dead: false,
    };
    tabs.set(id, chatTab);
    if (select) activate(id);
    else { renderTabs(); refreshChrome(); }
    saveTabs();
    return chatTab;
  }

  const holder = document.createElement('div');
  holder.className = 'term';
  el.terminals.appendChild(holder);

  const { term, fit, search } = newTerm();
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
      profile: profile.id,
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
    kind: 'terminal',
    term,
    fit,
    search,
    holder,
    dead: false,
  };
  tabs.set(id, tab);

  term.onData((data) => window.alero.input(id, data));
  term.onResize(({ cols: c, rows: r }) => window.alero.resize(id, c, r));

  if (select) activate(id);
  else { renderTabs(); refreshChrome(); }

  saveTabs();
  return tab;
}

function profileOf(tab) {
  return tab ? profiles.find((p) => p.id === tab.profile) || null : null;
}

async function ensureLogo(profile) {
  if (!profile?.logo || logoCache.has(profile.logo)) return;
  const data = await window.alero.logoData(profile.logo);
  if (data) logoCache.set(profile.logo, data);
}

function renderBrand() {
  // El logo es del perfil, así que vive en su pestaña. Al principio, abierta,
  // solo la marca; el nombre «Alero» aparece cuando la barra está plegada. Sin
  // pestañas y abierta no se ve nada: ya lo dice el estado vacío del panel.
  const hideBrand = expanded && tabs.size === 0;

  el.brandLogo.classList.add('hidden');
  el.brandMark.classList.toggle('hidden', hideBrand);
  el.brandName.classList.toggle('hidden', hideBrand || expanded);
}

/**
 * Repinta lo que depende del estado: la marca de la barra y el estado vacío
 * (sin pestañas, o con Ajustes abiertos).
 */
function refreshChrome() {
  renderBrand();
  const showEmpty = expanded && tabs.size === 0 && !isSettingsOpen();
  el.terminalsEmpty.classList.toggle('hidden', !showEmpty);
}

/** El atajo de nueva pestaña, escrito donde la interfaz lo menciona. */
function refreshShortcutLabels() {
  // Compacto para que encaje en una frase: Ctrl+Alt+T, no Ctrl + Alt + T.
  const label = (friendly(shortcuts.newTab) || 'Ctrl+Alt+T').split(' + ').join('+');
  if (el.newTabHint) el.newTabHint.textContent = label;
  el.newTab.title = `Nueva pestaña (${label})`;
  el.newTab.setAttribute('aria-label', `Nueva pestaña (${label})`);
}

/** Carga los logos que falten y repinta la barra y el menú. */
async function loadLogos() {
  await Promise.all(profiles.map((p) => ensureLogo(p)));
  renderBrand();
  renderTabs();
  renderMenu();
}

function activate(id) {
  if (!tabs.has(id)) return;
  activeId = id;
  for (const [key, tab] of tabs) {
    tab.holder.classList.toggle('active', key === id);
  }
  renderTabs();
  refreshChrome();
  const tab = tabs.get(id);
  fitTab(tab);
  if (expanded && !isSettingsOpen()) {
    if (tab.term) tab.term.focus();
    else tab.chat?.focus();
  }
}

let pendingClose = null;
let dragId = null;

function clearPrompt() {
  pendingClose = null;
  clearAlertUi();
}

function showPrompt(title, body, confirmText, onConfirm) {
  currentAlert = { prompt: true };
  el.alertTitle.textContent = title;
  el.alertBody.textContent = body;
  el.alertAvatar.textContent = '';
  el.alertActions.textContent = '';

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', clearPrompt);

  const confirm = document.createElement('button');
  confirm.className = 'primary';
  confirm.textContent = confirmText;
  confirm.addEventListener('click', () => {
    clearAlertUi();
    onConfirm();
  });

  el.alertActions.append(cancel, confirm);
  el.alert.classList.remove('hidden');
  el.shell.classList.add('alerting');
}

/** Cierra una pestaña; si su sesión sigue viva, pregunta antes. */
function requestCloseTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.dead) {
    closeTab(id);
    return;
  }
  if (!expanded) window.alero.expand();
  pendingClose = id;
  showPrompt(
    `Cerrar «${tab.title}»`,
    'Se cerrará su sesión y lo que esté corriendo dentro.',
    'Cerrar pestaña',
    () => closeTab(id),
  );
}

function closeTab(id) {
  pendingClose = null;
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.kind === 'chat') {
    tab.chat.destroy();
    AleroChat.remove(id);
  } else {
    window.alero.killTab(id);
    tab.term.dispose();
  }
  tab.holder.remove();
  tabs.delete(id);

  if (activeId === id) {
    const next = tabs.keys().next();
    activeId = null;
    if (!next.done) activate(next.value);
  }
  renderTabs();
  refreshChrome();
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
    node.title = `${tab.title} — doble clic para renombrar, arrastra para mover`;
    node.style.setProperty('--tab-color', tab.color);
    node.draggable = true;

    const kind = document.createElement('span');
    kind.className = 'kind';
    const profile = profiles.find((p) => p.id === tab.profile);
    const logo = profile?.logo ? logoCache.get(profile.logo) : '';
    if (logo) {
      const img = document.createElement('img');
      img.src = logo;
      img.alt = '';
      img.className = 'tab-logo';
      kind.classList.add('has-logo');
      kind.appendChild(img);
    }

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = tab.title;

    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Cerrar pestaña';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      requestCloseTab(id);
    });

    node.append(kind, name, close);
    node.addEventListener('click', () => activate(id));
    node.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(id);
    });

    // Arrastrar para reordenar, sin rehacer el DOM (el arrastre no se corta).
    node.addEventListener('dragstart', (e) => {
      dragId = id;
      e.dataTransfer.effectAllowed = 'move';
      // Firefox y Chromium necesitan algún dato para iniciar el arrastre.
      e.dataTransfer.setData('text/plain', id);
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      dragId = null;
      node.classList.remove('dragging');
      for (const other of el.tabs.children) other.classList.remove('drop-before');
      saveTabs();
    });
    node.addEventListener('dragover', (e) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = node.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      moveTab(dragId, id, after);
    });

    tab.node = node;
    el.tabs.appendChild(node);
  }
}

/** Coloca la pestaña `from` justo antes (o después) de `target`. */
function moveTab(from, target, after) {
  if (from === target) return;
  const order = [...tabs.keys()].filter((id) => id !== from);
  const index = order.indexOf(target);
  order.splice(after ? index + 1 : index, 0, from);

  const next = new Map();
  for (const id of order) next.set(id, tabs.get(id));
  tabs.clear();
  for (const [id, tab] of next) {
    tabs.set(id, tab);
    if (tab.node) el.tabs.appendChild(tab.node);
  }
}

/** Doble clic en una pestaña: se renombra en el sitio. */
function startRename(id) {
  const tab = tabs.get(id);
  if (!tab?.node) return;

  const name = tab.node.querySelector('.name');
  if (!name) return;

  const input = document.createElement('input');
  input.className = 'tab-rename';
  input.value = tab.title;
  input.size = Math.max(6, Math.min(22, tab.title.length));
  name.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (commit && value) tab.title = value.slice(0, 40);
    renderTabs();
    saveTabs();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
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
  { key: 'search', title: 'Buscar en la terminal', global: false },
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

  const tabs = {
    profiles: { button: el.tabProfiles, pane: el.profilesPane, title: 'Perfiles' },
    shortcuts: { button: el.tabShortcuts, pane: el.shortcutsPane, title: 'Atajos' },
    alerts: { button: el.tabAlerts, pane: el.alertsPane, title: 'Avisos' },
    bar: { button: el.tabBar, pane: el.barPane, title: 'Barra' },
    chat: { button: el.tabChat, pane: el.chatPane, title: 'Chat' },
  };

  for (const [name, item] of Object.entries(tabs)) {
    item.button.classList.toggle('active', tab === name);
    item.pane.classList.toggle('hidden', tab !== name);
  }
  el.profileActions.classList.toggle('hidden', tab !== 'profiles');
  el.settingsTitle.textContent = (tabs[tab] || tabs.profiles).title;

  el.shortcutList.scrollTop = 0;
  el.profileList.scrollTop = 0;

  el.settingsMessage.textContent = '';
  const hints = {
    profiles: 'Cada perfil es una entrada del menú <strong>+</strong>. Los de tipo <strong>terminal</strong> arrancan una shell con su carpeta y comando; los de tipo <strong>chat</strong> abren una conversación con el proveedor elegido.',
    shortcuts: 'Pulsa un atajo y graba la combinación nueva con el teclado. <strong>Esc</strong> cancela la grabación.',
    alerts: 'Alero puede avisarte cuando Claude Code termina, pide permiso o te pregunta algo, aunque la barra esté plegada.',
    bar: 'Cuándo se vuelve a plegar sola la barra. Las dos reglas son independientes y se pueden combinar.',
    chat: 'Claves de los proveedores para los perfiles de tipo chat. Se guardan cifradas y nunca se vuelven a mostrar.',
  };
  el.settingsHint.innerHTML = hints[tab] || hints.profiles;

  if (tab === 'alerts') renderAlertsPane();
  if (tab === 'bar') renderBarPane();
  if (tab === 'chat') renderChatKeys();
  if (tab === 'profiles') refreshKeyNotes();
}

// ── Ajustes: perfiles ────────────────────────────────────────────────────────

let draft = [];

function isSettingsOpen() {
  return !el.settings.classList.contains('hidden');
}

// ── Avisos ──────────────────────────────────────────────────────────────────

let draftAlerts = null;
let draftCollapse = null;
let idleTimer = null;
let pendingHooks = null;
let currentAlert = null;

function copyAlerts(source) {
  return {
    ...source,
    events: { ...(source.events || {}) },
    profiles: { ...(source.profiles || {}) },
  };
}

const CHAT_DEFAULT_BASE = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  ollama: 'http://127.0.0.1:11434',
};

/** Rellena la lista de modelos del proveedor; si no hay, se puede escribir. */
async function fillModels(input, datalist, provider, baseUrl) {
  datalist.textContent = '';
  let list = [];
  try {
    list = await window.alero.chatModels(provider, baseUrl);
  } catch {
    list = [];
  }

  for (const id of list) {
    const option = document.createElement('option');
    option.value = id;
    datalist.appendChild(option);
  }

  if (list.length && !input.value.trim()) input.value = list[0];
  input.placeholder = list.length
    ? `${list.length} modelos · escribe o elige`
    : provider === 'ollama'
      ? 'no se pudo cargar (¿Ollama encendido?)'
      : 'sin clave o sin conexión';
}

const CHAT_PROVIDERS = [
  ['anthropic', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['gemini', 'Google Gemini'],
];

async function renderChatKeys() {
  if (!el.keyList) return;
  const status = await window.alero.keysStatus();
  el.keyList.textContent = '';

  for (const [id, name] of CHAT_PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'key-row';

    const label = document.createElement('span');
    label.className = 'key-name';
    label.textContent = name;

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = status[id] ? 'Guardada · escribe para cambiarla' : 'Pega tu clave';
    input.autocomplete = 'off';

    const state = document.createElement('span');
    state.className = 'key-state';
    state.textContent = status[id] ? 'Guardada' : 'Sin clave';

    const button = document.createElement('button');
    const sync = () => {
      button.textContent = status[id] && !input.value.trim() ? 'Quitar' : 'Guardar';
    };
    input.addEventListener('input', sync);
    sync();

    button.addEventListener('click', async () => {
      const value = input.value.trim();
      if (!value && !status[id]) return;
      const result = await window.alero.setKey(id, value);
      if (!result.ok) {
        state.textContent = result.error || 'Error';
        return;
      }
      await renderChatKeys();
    });

    row.append(label, input, state, button);
    el.keyList.appendChild(row);
  }
}

const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini', ollama: 'Ollama' };

/** Avisa en cada tarjeta de chat si falta la clave de su proveedor. */
async function refreshKeyNotes() {
  const notes = [...document.querySelectorAll('.key-note')];
  if (!notes.length) return;

  let status = {};
  try {
    status = await window.alero.keysStatus();
  } catch {
    status = {};
  }

  for (const note of notes) {
    const provider = note.dataset.provider;
    if (!provider || provider === 'ollama' || status[provider]) {
      note.classList.add('hidden');
      note.textContent = '';
      continue;
    }

    note.textContent = `Sin clave de ${PROVIDER_NAMES[provider] || provider}. `;
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Ir a Ajustes → Chat';
    go.addEventListener('click', () => setSettingsTab('chat'));
    note.appendChild(go);
    note.classList.remove('hidden');
  }
}

function copyCollapse(source) {
  return { onBlur: false, idle: true, idleSeconds: 10, ...(source || {}) };
}

function renderBarPane() {
  if (!draftCollapse) draftCollapse = copyCollapse(settings.collapse);
  el.collapseBlur.checked = draftCollapse.onBlur === true;
  el.collapseIdle.checked = draftCollapse.idle !== false;
  el.collapseSeconds.value = draftCollapse.idleSeconds || 10;
}

async function renderAlertsPane() {
  if (!draftAlerts) draftAlerts = copyAlerts(settings.alerts || {});

  el.alertSound.addEventListener('change', () => { if (draftAlerts) draftAlerts.sound = el.alertSound.checked; });
  el.alertApprove.addEventListener('change', () => { if (draftAlerts) draftAlerts.approve = el.alertApprove.checked; });
  el.alertSeconds.addEventListener('input', () => { if (draftAlerts) draftAlerts.seconds = Number(el.alertSeconds.value) || 8; });
  el.collapseBlur.addEventListener('change', () => { if (draftCollapse) draftCollapse.onBlur = el.collapseBlur.checked; });
  el.collapseIdle.addEventListener('change', () => { if (draftCollapse) draftCollapse.idle = el.collapseIdle.checked; });
  el.collapseSeconds.addEventListener('input', () => { if (draftCollapse) draftCollapse.idleSeconds = Number(el.collapseSeconds.value) || 10; });

  for (const input of el.alertsPane.querySelectorAll('input[data-event]')) {
    input.checked = draftAlerts.events[input.dataset.event] !== false;
  }
  el.alertSound.checked = draftAlerts.sound !== false;
  el.alertApprove.checked = draftAlerts.approve !== false;
  el.alertSeconds.value = draftAlerts.seconds || 8;

  el.alertProfiles.textContent = '';
  if (!profiles.length) {
    const none = document.createElement('span');
    none.className = 'meta';
    none.textContent = 'Sin perfiles todavía.';
    el.alertProfiles.appendChild(none);
  }
  for (const profile of profiles) {
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = draftAlerts.profiles[profile.id] !== false;
    box.addEventListener('change', () => {
      draftAlerts.profiles[profile.id] = box.checked;
    });
    label.append(box, document.createTextNode(` ${profile.label}`));
    el.alertProfiles.appendChild(label);
  }

  const installed = await window.alero.hooksInstalled();
  el.hooksStatus.textContent = installed
    ? 'Instalados en ~/.claude/settings.json'
    : 'No instalados';
  el.hooksToggle.textContent = installed ? 'Quitar' : 'Instalar';
}

async function previewHooks() {
  el.settingsMessage.textContent = '';
  const installed = await window.alero.hooksInstalled();
  const result = await window.alero.hooksPreview(!installed);

  if (result.error) {
    el.settingsMessage.textContent = result.error;
    return;
  }
  if (result.unchanged) {
    el.settingsMessage.textContent = 'No hay nada que cambiar.';
    return;
  }

  pendingHooks = { install: !installed, fingerprint: result.fingerprint };
  let block = result.after;
  try {
    block = JSON.stringify({ hooks: JSON.parse(result.after).hooks }, null, 2);
  } catch {
    // Se muestra el archivo completo si no se puede aislar el bloque.
  }
  el.hooksDiff.textContent = block;
  el.hooksNote.textContent = `Se guardará un backup en ${result.settingsPath}.bak-…`;
  el.hooksPreview.classList.remove('hidden');
}

async function applyHooks() {
  if (!pendingHooks) return;
  const result = await window.alero.hooksApply(pendingHooks.install, pendingHooks.fingerprint);
  if (result.error) {
    el.hooksNote.textContent = result.error;
    return;
  }
  el.hooksPreview.classList.add('hidden');
  pendingHooks = null;
  await renderAlertsPane();
  el.settingsMessage.textContent = result.backup
    ? `Listo. Backup: ${result.backup}`
    : 'Listo.';
}

function addAlertButton(text, primary, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  if (primary) button.className = 'primary';
  button.addEventListener('click', onClick);
  el.alertActions.appendChild(button);
}

function showAlert(data) {
  currentAlert = data;

  // Avatar de la notificación: el logo del perfil o su punto de color.
  const profile = data.profile ? profiles.find((p) => p.id === data.profile) : null;
  const logo = profile?.logo ? logoCache.get(profile.logo) : '';
  el.alertAvatar.textContent = '';
  if (logo) {
    const img = document.createElement('img');
    img.src = logo;
    img.alt = '';
    el.alertAvatar.appendChild(img);
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--tab-color', profile?.color || 'var(--accent)');
    el.alertAvatar.appendChild(dot);
  }

  el.alertTitle.textContent = data.title;
  const who = profile?.label || data.folder;
  el.alertBody.textContent = who ? `${data.body} · ${who}` : data.body;
  el.alertActions.textContent = '';

  if (data.decisionId) {
    addAlertButton('Permitir', true, () => window.alero.decide(data.decisionId, 'allow'));
    addAlertButton('Denegar', false, () => window.alero.decide(data.decisionId, 'deny'));
    addAlertButton('Cerrar', false, () => window.alero.decide(data.decisionId, 'skip'));
  } else {
    addAlertButton('Abrir', true, () => {
      window.alero.expand();
      window.alero.dismissAlert();
    });
    addAlertButton('Cerrar', false, () => window.alero.dismissAlert());
  }

  el.alert.classList.remove('hidden');
  el.shell.classList.add('alerting');
  requestAnimationFrame(() => {
    for (const tab of tabs.values()) fitTab(tab);
  });
}

function clearAlertUi() {
  currentAlert = null;
  el.alert.classList.add('hidden');
  el.shell.classList.remove('alerting');
  noteActivity();
  requestAnimationFrame(() => {
    for (const tab of tabs.values()) fitTab(tab);
  });
}

// ── Plegado automático ───────────────────────────────────────────────────────

/** Nunca se pliega sola si hay algo que el usuario necesita ver o tocar. */
function canAutoCollapse() {
  if (!expanded || animating) return false;
  if (isSettingsOpen() || recording) return false;
  if (currentAlert) return false;
  if (el.shell.classList.contains('peek')) return false;
  return true;
}

/** Reinicia la cuenta de inactividad; llamada por cualquier uso de la barra. */
function noteActivity() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!expanded) return;

  const conf = settings.collapse || {};
  if (conf.idle === false) return;

  const seconds = Math.min(300, Math.max(5, Number(conf.idleSeconds) || 10));
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (canAutoCollapse()) window.alero.collapse();
  }, seconds * 1000);
}

function openSearch() {
  const tab = tabs.get(activeId);
  if (!tab?.search) return;
  el.termSearch.classList.remove('hidden');
  el.termSearchInput.focus();
  el.termSearchInput.select();
}

function closeSearch() {
  el.termSearch.classList.add('hidden');
  const tab = tabs.get(activeId);
  if (tab?.search?.clearDecorations) tab.search.clearDecorations();
  if (tab?.term) tab.term.focus();
}

function searchStep(back) {
  const tab = tabs.get(activeId);
  const text = el.termSearchInput.value;
  if (!tab?.search || !text) return;
  const options = { caseSensitive: false, incremental: true };
  if (back) tab.search.findPrevious(text, options);
  else tab.search.findNext(text, options);
}

function openSettings() {
  closeMenu();
  if (!expanded) window.alero.expand();
  draft = profiles.map((p) => ({ ...p }));
  draftShortcuts = { ...shortcuts };
  draftAlerts = copyAlerts(settings.alerts || {});
  draftCollapse = copyCollapse(settings.collapse);
  pendingHooks = null;
  el.hooksPreview.classList.add('hidden');
  renderProfileEditor();
  renderShortcuts();
  el.settingsMessage.textContent = '';
  setSettingsTab('profiles');
  el.settings.classList.remove('hidden');
  refreshChrome();
}

function closeSettings() {
  el.settings.classList.add('hidden');
  refreshChrome();
  noteActivity();
  const tab = tabs.get(activeId);
  if (tab && expanded) {
    if (tab.term) tab.term.focus();
    else tab.chat?.focus();
  }
}

function field(labelText, control, wide = false) {
  const wrap = document.createElement('label');
  wrap.className = 'field' + (wide ? ' wide' : '');
  const caption = document.createElement('span');
  caption.textContent = labelText;
  wrap.append(caption, control);
  return wrap;
}

async function pickLogoFor(index) {
  const picked = await window.alero.pickLogo();
  if (!picked) return;
  if (picked.error) {
    el.settingsMessage.textContent = picked.error;
    return;
  }

  draft = readEditor();
  draft[index].logo = picked.path;
  logoCache.set(picked.path, picked.dataUrl);
  el.settingsMessage.textContent = '';
  renderProfileEditor();
}

function renderProfileEditor() {
  el.profileList.textContent = '';

  draft.forEach((profile, index) => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.id = profile.id;
    card.dataset.logo = profile.logo || '';

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

    const slot = document.createElement('div');
    slot.className = 'logo-slot' + (profile.logo ? ' has-logo' : '');

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'logo-pick';
    pick.title = profile.logo ? 'Cambiar logo' : 'Elegir logo';
    pick.setAttribute('aria-label', pick.title);
    const data = profile.logo ? logoCache.get(profile.logo) : '';
    if (data) {
      const img = document.createElement('img');
      img.src = data;
      img.alt = '';
      pick.appendChild(img);
    } else {
      pick.textContent = '+';
    }
    pick.addEventListener('click', () => pickLogoFor(index));
    slot.appendChild(pick);

    if (profile.logo) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'logo-clear';
      clear.textContent = '×';
      clear.title = 'Quitar logo';
      clear.setAttribute('aria-label', 'Quitar logo');
      clear.addEventListener('click', () => {
        draft = readEditor();
        draft[index].logo = '';
        renderProfileEditor();
      });
      slot.appendChild(clear);
    }

    head.append(slot, color, label, remove);

    const kind = document.createElement('select');
    kind.className = 'ptype';
    for (const [value, text] of [['terminal', 'Terminal'], ['chat', 'Chat']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if ((profile.kind === 'chat' ? 'chat' : 'terminal') === value) option.selected = true;
      kind.appendChild(option);
    }
    kind.addEventListener('change', () => {
      draft = readEditor();
      draft[index].kind = kind.value;
      renderProfileEditor();
    });

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
    grid.append(field('Tipo', kind));

    if (profile.kind === 'chat') {
      // Chat: proveedor, modelo y URL base (para OpenAI-compatible y Ollama).
      const providerId = profile.provider || 'ollama';
      const provider = document.createElement('select');
      provider.className = 'provider';
      for (const [value, text] of [
        ['anthropic', 'Anthropic'],
        ['openai', 'OpenAI / compatible'],
        ['gemini', 'Google Gemini'],
        ['ollama', 'Ollama local'],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        if (providerId === value) option.selected = true;
        provider.appendChild(option);
      }
      provider.addEventListener('change', () => {
        // Al cambiar de proveedor, modelo y URL vuelven a los del nuevo.
        draft = readEditor();
        draft[index].provider = provider.value;
        draft[index].model = '';
        draft[index].baseUrl = '';
        renderProfileEditor();
      });

      const model = document.createElement('input');
      model.type = 'text';
      model.className = 'model';
      model.value = profile.model || '';
      model.placeholder = 'cargando modelos…';
      model.autocomplete = 'off';

      const listId = `models-${index}-${Date.now()}`;
      const datalist = document.createElement('datalist');
      datalist.id = listId;
      model.setAttribute('list', listId);

      const baseUrl = document.createElement('input');
      baseUrl.type = 'text';
      baseUrl.className = 'baseurl';
      baseUrl.value = profile.baseUrl || CHAT_DEFAULT_BASE[providerId] || '';
      baseUrl.placeholder = 'URL del proveedor';

      card.appendChild(datalist);
      fillModels(model, datalist, providerId, baseUrl.value);

      const keyNote = document.createElement('div');
      keyNote.className = 'key-note hidden';
      keyNote.dataset.provider = providerId;
      card.append(keyNote);
      refreshKeyNotes();

      grid.append(field('Proveedor', provider), field('Modelo', model), field('URL base', baseUrl, true));
    } else {
      grid.append(
        field('Shell', shell),
        field('Carpeta', cwd),
        field('Comando', command, true),
      );
    }

    card.append(head, grid);
    el.profileList.appendChild(card);
  });

  el.watermark.classList.toggle('hidden', draft.length > 0);

}

function readEditor() {
  const rows = [...el.profileList.querySelectorAll('.profile-card')];
  return rows.map((row) => {
    const kind = row.querySelector('.ptype')?.value === 'chat' ? 'chat' : 'terminal';
    return {
      id: row.dataset.id,
      label: row.querySelector('.label').value.trim() || 'Perfil',
      kind,
      shell: row.querySelector('.shell')?.value || 'powershell',
      cwd: row.querySelector('.cwd')?.value.trim() || '',
      command: row.querySelector('.command')?.value.trim() || '',
      provider: row.querySelector('.provider')?.value || 'ollama',
      model: row.querySelector('.model')?.value.trim() || '',
      baseUrl: row.querySelector('.baseurl')?.value.trim() || '',
      logo: row.dataset.logo || '',
      color: row.querySelector('.color').value,
    };
  });
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
      kind: p.kind === 'chat' ? 'chat' : 'terminal',
      shell: p.shell === 'cmd' ? 'cmd' : 'powershell',
      cwd: p.cwd || '',
      command: p.command,
      provider: p.provider || 'ollama',
      model: p.model || '',
      baseUrl: p.baseUrl === CHAT_DEFAULT_BASE[p.provider || 'ollama'] ? '' : (p.baseUrl || ''),
      color: p.color || '#c2703f',
      logo: p.logo || '',
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
  refreshShortcutLabels();

  if (failed.length) {
    el.settingsMessage.textContent =
      `Windows no deja registrar ${failed.join(' y ')}. Se mantiene el atajo anterior.`;
    return;
  }

  // Avisos: los interruptores se leen de la vista y se guardan con el resto.
  const alerts = {
    ...draftAlerts,
    events: { ...draftAlerts.events },
    profiles: { ...draftAlerts.profiles },
    sound: draftAlerts.sound !== false,
    approve: draftAlerts.approve !== false,
    seconds: Math.min(60, Math.max(3, Number(draftAlerts.seconds) || 8)),
  };

  const collapse = {
    onBlur: draftCollapse.onBlur === true,
    idle: draftCollapse.idle !== false,
    idleSeconds: Math.min(300, Math.max(5, Number(draftCollapse.idleSeconds) || 10)),
  };

  const clean = readProfiles();
  const saved = await window.alero.saveSettings({
    ...(clean.length ? { profiles: clean } : {}),
    shortcuts,
    alerts,
    collapse,
  });
  if (clean.length) {
    profiles = saved.profiles || clean;
    await loadLogos();
  }
  settings.alerts = saved.alerts || alerts;
  settings.collapse = saved.collapse || collapse;
  draftAlerts = copyAlerts(settings.alerts);
  draftCollapse = copyCollapse(settings.collapse);
  noteActivity();

  closeSettings();
}

async function restoreDefaults() {
  const defaults = await window.alero.defaultProfiles();
  draft = defaults.map((p) => ({ ...p }));
  renderProfileEditor();
}

// ── Estado (colapsada / expandida) ───────────────────────────────────────────

function applyState(state) {
  expanded = Boolean(state.expanded);
  animating = Boolean(state.animating);
  el.shell.classList.toggle('collapsed', !expanded);
  el.shell.classList.toggle('peek', Boolean(state.peek));
  refreshChrome();
  if (expanded && !animating) {
    requestAnimationFrame(() => {
      for (const tab of tabs.values()) fitTab(tab);
      const tab = tabs.get(activeId) || tabs.values().next().value;
      if (tab && !isSettingsOpen()) {
        if (tab.term) tab.term.focus();
        else tab.chat?.focus();
      }
      noteActivity();
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
  noteActivity();

  // Renombrando una pestaña: las teclas son del campo, no de la interfaz.
  if (e.target instanceof HTMLInputElement && e.target.classList.contains('tab-rename')) return;

  // Buscador de la terminal: Esc lo cierra y lo demás es del campo.
  if (e.target === el.termSearchInput) {
    if (e.key === 'Escape') {
      swallow();
      closeSearch();
    }
    return;
  }

  // Grabando un atajo: las teclas son del grabador, no de la interfaz.
  if (recording) return;

  const swallow = () => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (pendingClose) {
    if (e.key === 'Escape') { swallow(); clearPrompt(); return; }
    if (e.key === 'Enter') { swallow(); const id = pendingClose; clearAlertUi(); closeTab(id); return; }
  }

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
    if (activeId) requestCloseTab(activeId);
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

  if (matches(shortcuts.search, e)) {
    swallow();
    openSearch();
    return;
  }

  if (matches(shortcuts.copy, e)) {
    const tab = tabs.get(activeId);
    const selection = tab?.term?.getSelection();
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
      if (tab?.term && text) window.alero.input(tab.id, text);
    });
  }
}, true);

const markFontsReady = () => {
  if (fontsReady) return;
  fontsReady = true;
  for (const tab of tabs.values()) fitTab(tab);
};
if (document.fonts) {
  document.fonts.ready.then(markFontsReady);
  setTimeout(markFontsReady, 1500);
} else {
  markFontsReady();
}

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
    if (tab?.term) tab.term.write(data);
  });
  window.alero.onExit((id) => markDead(id));
  window.alero.onState((state) => applyState(state));
  window.alero.onNewTab(() => openMenu());

  // Chat: los trozos llegan por id de conversación.
  window.alero.onChatDelta((data) => AleroChat.get(data.id)?.delta(data.text));
  window.alero.onChatDone((data) => AleroChat.get(data.id)?.done());
  window.alero.onChatError((data) => AleroChat.get(data.id)?.error(data.aborted ? 'Detenido.' : data.message));
  window.alero.onAlert((data) => showAlert(data));
  window.alero.onAlertClear(() => clearAlertUi());

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
  el.tabAlerts.addEventListener('click', () => setSettingsTab('alerts'));
  el.tabBar.addEventListener('click', () => setSettingsTab('bar'));
  el.tabChat.addEventListener('click', () => setSettingsTab('chat'));

  // Buscador de la terminal.
  el.termSearchInput.addEventListener('input', () => searchStep(false));
  el.termSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchStep(e.shiftKey);
    }
  });
  el.termSearchNext.addEventListener('click', () => searchStep(false));
  el.termSearchPrev.addEventListener('click', () => searchStep(true));
  el.termSearchClose.addEventListener('click', () => closeSearch());

  el.hooksToggle.addEventListener('click', previewHooks);
  el.hooksCancel.addEventListener('click', () => {
    pendingHooks = null;
    el.hooksPreview.classList.add('hidden');
  });
  el.hooksConfirm.addEventListener('click', applyHooks);

  for (const input of el.alertsPane.querySelectorAll('input[data-event]')) {
    input.addEventListener('change', () => {
      if (!draftAlerts) return;
      draftAlerts.events[input.dataset.event] = input.checked;
    });
  }

  // Cualquier uso de la barra reinicia la cuenta de inactividad.
  for (const type of ['mousemove', 'mousedown', 'wheel']) {
    window.addEventListener(type, () => noteActivity(), { passive: true });
  }

  // Pasar a otra ventana del equipo (Alt+Tab) puede plegarla.
  window.addEventListener('blur', () => {
    if (!settings.collapse || !settings.collapse.onBlur) return;
    if (!canAutoCollapse()) return;
    window.alero.collapse();
  });

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
  refreshShortcutLabels();
  if (tabs.size) activate([...tabs.keys()][0]);
  loadLogos();
  applyState({ expanded: Boolean(settings.expanded), animating: false });
}

init();
