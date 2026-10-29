// Ajustes de Alero: un JSON pequeño en %APPDATA%\Alero\settings.json.
// Nada de dependencias: leer, mezclar y guardar.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Perfiles de terminal: cada uno es una entrada del menú «+».
// `shell` decide dónde se escribe `command` al abrir la pestaña.
const DEFAULT_PROFILES = [
  {
    id: 'claude',
    label: 'Claude Code',
    shell: 'powershell',
    cwd: '',
    command: 'ollama launch claude --model deepseek-v4.1-flash:1017-cloud',
    color: '#c2703f',
    logo: '',
  },
  { id: 'powershell', label: 'PowerShell', shell: 'powershell', cwd: '', command: '', color: '#6f9fd8', logo: '' },
  { id: 'cmd', label: 'cmd', shell: 'cmd', cwd: '', command: '', color: '#8a8c92', logo: '' },
];

// Atajos en sintaxis de Electron. Los dos primeros son globales (Windows los
// registra); el resto se atiende dentro de la ventana.
const DEFAULT_SHORTCUTS = {
  toggle: 'Control+Alt+Space',
  newTab: 'Control+Alt+T',
  closeTab: 'Control+Shift+W',
  nextTab: 'Control+Tab',
  prevTab: 'Control+Shift+Tab',
  copy: 'Control+Shift+C',
  paste: 'Control+Shift+V',
};

const DEFAULTS = {
  expanded: false,
  width: 900,
  height: 420,
  opacity: 0.97,
  focusOnOpen: true,
  autostart: false,
  profiles: DEFAULT_PROFILES,
  shortcuts: DEFAULT_SHORTCUTS,
  tabs: [{ profile: 'claude', label: 'Claude Code' }],
};

/** Atajos que registra Windows (el resto los atiende la interfaz). */
const GLOBAL_SHORTCUTS = ['toggle', 'newTab'];

let current = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** Ajusta lo que venga de versiones anteriores a la forma actual. */
function migrate(loaded) {
  const next = { ...DEFAULTS, ...loaded };

  if (!Array.isArray(next.profiles) || next.profiles.length === 0) {
    next.profiles = DEFAULT_PROFILES.map((p) => ({ ...p }));
  }

  // Atajos que falten en un settings.json viejo se completan con el defecto.
  next.shortcuts = { ...DEFAULT_SHORTCUTS, ...(next.shortcuts || {}) };

  // Pestañas antiguas: { type, title } → { profile, label }.
  if (Array.isArray(next.tabs)) {
    next.tabs = next.tabs.map((t) => {
      if (t && t.profile) return { profile: t.profile, label: t.label || t.profile };
      return { profile: t?.type || 'claude', label: t?.title || 'Claude Code' };
    });
  } else {
    next.tabs = DEFAULTS.tabs;
  }

  return next;
}

function load() {
  if (current) return current;
  try {
    const raw = fs.readFileSync(file(), 'utf8');
    current = migrate(JSON.parse(raw));
  } catch {
    // Sin archivo o JSON roto: se empieza limpio, nunca se rompe el arranque.
    current = migrate({});
  }
  return current;
}

function save(patch) {
  current = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(current, null, 2), 'utf8');
  } catch (err) {
    console.error('alero: no se pudieron guardar los ajustes:', err);
  }
  return current;
}

module.exports = { load, save, DEFAULTS, DEFAULT_PROFILES, DEFAULT_SHORTCUTS, GLOBAL_SHORTCUTS };
