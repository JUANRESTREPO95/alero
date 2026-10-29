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
};

const THEME = {
  background: '#0e1117',
  foreground: '#e6e9ef',
  cursor: '#0a84ff',
  cursorAccent: '#0e1117',
  selectionBackground: '#2a3a55',
  black: '#1b1f27', red: '#ff6b6b', green: '#5ad07a', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dae0',
  brightBlack: '#5c6370', brightRed: '#ff8787', brightGreen: '#7ee2a0',
  brightYellow: '#f0d29a', brightBlue: '#8cc4ff', brightMagenta: '#ddb3ef',
  brightCyan: '#7fd4de', brightWhite: '#ffffff',
};

/** ptyId → { id, profile, title, color, term, fit, holder, dead } */
const tabs = new Map();
let activeId = null;
let settings = null;
let profiles = [];
let expanded = false;

// ── Pestañas ─────────────────────────────────────────────────────────────────

function newTerm() {
  const term = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
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

function renderMenu() {
  el.menu.textContent = '';

  for (const p of profiles) {
    const button = document.createElement('button');
    button.dataset.profile = p.id;
    button.style.setProperty('--accent', p.color || '#0a84ff');
    const dot = document.createElement('span');
    dot.className = 'menu-dot';
    const label = document.createElement('span');
    label.textContent = p.label;
    button.append(dot, label);
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
  renderProfileEditor();
  el.settings.classList.remove('hidden');
  const first = el.profileList.querySelector('input[type="text"]');
  if (first) first.focus();
}

function closeSettings() {
  el.settings.classList.add('hidden');
  const tab = tabs.get(activeId);
  if (tab && expanded) tab.term.focus();
}

function field(className, node) {
  const wrap = document.createElement('label');
  wrap.className = className;
  wrap.appendChild(node);
  return wrap;
}

function renderProfileEditor() {
  el.profileList.textContent = '';

  draft.forEach((profile, index) => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    row.dataset.id = profile.id;

    const color = document.createElement('input');
    color.type = 'color';
    color.value = profile.color || '#0a84ff';
    color.title = 'Color';
    color.className = 'color';

    const label = document.createElement('input');
    label.type = 'text';
    label.value = profile.label;
    label.placeholder = 'Nombre';
    label.className = 'label';

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
    cwd.placeholder = 'Carpeta (vacío = tu usuario)';
    cwd.className = 'cwd';
    cwd.title = 'Carpeta donde arranca la terminal';

    const command = document.createElement('input');
    command.type = 'text';
    command.value = profile.command || '';
    command.placeholder = 'Comando (p. ej. ssh usuario@servidor) — vacío = shell limpia';
    command.className = 'command';

    const remove = document.createElement('button');
    remove.className = 'icon remove';
    remove.textContent = '×';
    remove.title = 'Quitar perfil';
    remove.addEventListener('click', () => {
      draft.splice(index, 1);
      renderProfileEditor();
    });

    row.append(color, label, shell, cwd, command, remove);
    el.profileList.appendChild(row);
  });

  if (!draft.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No hay perfiles. Añade uno para poder abrir pestañas.';
    el.profileList.appendChild(empty);
  }
}

function readEditor() {
  const rows = [...el.profileList.querySelectorAll('.profile-row')];
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
    color: '#7f8cff',
  });
  renderProfileEditor();
  el.profileList.lastElementChild?.querySelector('.label')?.select();
}

async function saveProfiles() {
  const rows = readEditor();
  const taken = new Set();

  const clean = rows.map((p) => {
    const id = p.id || slugify(p.label, taken);
    taken.add(id);
    return {
      id,
      label: p.label,
      shell: p.shell === 'cmd' ? 'cmd' : 'powershell',
      cwd: p.cwd || '',
      command: p.command,
      color: p.color || '#0a84ff',
    };
  });

  if (!clean.length) {
    // Sin perfiles no habría forma de abrir nada: no se guarda el vacío.
    return;
  }

  const saved = await window.alero.saveSettings({ profiles: clean });
  profiles = saved.profiles || clean;
  renderMenu();
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!el.menu.classList.contains('hidden')) {
      closeMenu();
      return;
    }
    if (isSettingsOpen()) {
      closeSettings();
      return;
    }
    window.alero.collapse();
    return;
  }

  // El editor de perfiles usa estas teclas: no interceptarlas allí.
  if (isSettingsOpen()) return;

  if (!el.menu.classList.contains('hidden')) {
    const index = Number(e.key);
    if (index >= 1 && index <= profiles.length) {
      e.preventDefault();
      closeMenu();
      addTab(profiles[index - 1].id);
      return;
    }
  }

  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    cycle(e.shiftKey ? -1 : 1);
    return;
  }

  if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    const tab = tabs.get(activeId);
    const selection = tab?.term.getSelection();
    if (selection) {
      e.preventDefault();
      window.alero.writeClipboard(selection);
      tab.term.clearSelection();
    }
    return;
  }

  if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
    e.preventDefault();
    window.alero.readClipboard().then((text) => {
      const tab = tabs.get(activeId);
      if (tab && text) window.alero.input(tab.id, text);
    });
  }
});

window.addEventListener('resize', () => {
  for (const tab of tabs.values()) fitTab(tab);
});

// ── Arranque ─────────────────────────────────────────────────────────────────

async function init() {
  settings = await window.alero.getSettings();
  profiles = Array.isArray(settings.profiles) ? settings.profiles : [];

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
  el.saveProfiles.addEventListener('click', saveProfiles);

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
