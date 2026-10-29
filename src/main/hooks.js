// Instalación de los avisos de Alero en ~/.claude/settings.json.
//
// Reglas: nunca se sobrescribe el archivo a ciegas (se compara con lo que se
// mostró), se hace backup fechado y solo se añaden o quitan las entradas de
// Alero: las de otros agentes (Coucou, por ejemplo) se quedan como están.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const MARKER = 'alero-hook';

/** Eventos que Alero escucha, con su timeout en segundos. */
const EVENTS = [
  { event: 'Stop', timeout: 10 },
  { event: 'Notification', timeout: 10 },
  { event: 'PermissionRequest', timeout: 125 },
  { event: 'PreToolUse', matcher: 'AskUserQuestion', timeout: 10 },
];

function settingsPath() {
  return path.join(app.getPath('home'), '.claude', 'settings.json');
}

function cmdPath() {
  return path.join(app.getPath('userData'), 'alero-hook.cmd');
}

function scriptPath() {
  return path.join(__dirname, '..', 'hook', 'alero-hook.js');
}

/** El .cmd que Claude Code ejecuta: Electron hace de Node, sin instalar nada. */
function writeCommandFile() {
  const content = [
    '@echo off',
    'set ELECTRON_RUN_AS_NODE=1',
    `"${process.execPath}" "${scriptPath()}" %*`,
    '',
  ].join('\r\n');
  fs.writeFileSync(cmdPath(), content, 'utf8');
  return cmdPath();
}

function command(event) {
  return `"${cmdPath()}" ${event}`;
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readSettings() {
  try {
    return fs.readFileSync(settingsPath(), 'utf8');
  } catch {
    return null;
  }
}

function parse(raw) {
  if (raw === null || raw.trim() === '') return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('no es un objeto');
  return value;
}

function isOurs(entry) {
  return Array.isArray(entry?.hooks)
    && entry.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(MARKER));
}

function withoutOurs(settings) {
  const next = { ...settings };
  const hooks = { ...(next.hooks || {}) };

  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((entry) => !isOurs(entry));
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }

  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

function withOurs(settings) {
  const next = { ...settings };
  const hooks = { ...(next.hooks || {}) };

  for (const item of EVENTS) {
    const list = Array.isArray(hooks[item.event]) ? hooks[item.event].filter((e) => !isOurs(e)) : [];
    const entry = {
      hooks: [{ type: 'command', command: command(item.event), timeout: item.timeout }],
    };
    if (item.matcher) entry.matcher = item.matcher;
    list.push(entry);
    hooks[item.event] = list;
  }

  next.hooks = hooks;
  return next;
}

function isInstalled() {
  const raw = readSettings();
  if (raw === null) return false;
  try {
    const settings = parse(raw);
    return Object.values(settings.hooks || {})
      .some((list) => Array.isArray(list) && list.some(isOurs));
  } catch {
    return false;
  }
}

/**
 * Vista previa: qué se escribiría, sobre qué bytes y con qué backup.
 * `install` false calcula la retirada.
 */
function preview(install) {
  const raw = readSettings();
  let settings;
  try {
    settings = parse(raw);
  } catch {
    return { error: 'settings.json no es un JSON válido. Alero no lo ha tocado.' };
  }

  const next = install ? withOurs(settings) : withoutOurs(settings);
  const before = raw === null ? '' : raw.trim();
  const after = JSON.stringify(next, null, 2);
  if (before === after) return { error: null, unchanged: true, settingsPath: settingsPath() };

  return {
    settingsPath: settingsPath(),
    before,
    after,
    fingerprint: hash(raw === null ? '' : raw),
    exists: raw !== null,
    installed: isInstalled(),
  };
}

/** Aplica la vista previa, si el archivo sigue siendo el mismo que se mostró. */
function apply(install, fingerprint) {
  const raw = readSettings();
  if (hash(raw === null ? '' : raw) !== fingerprint) {
    return { error: 'settings.json cambió desde la vista previa. No se ha escrito nada: revísalo otra vez.' };
  }

  let settings;
  try {
    settings = parse(raw);
  } catch {
    return { error: 'settings.json no es un JSON válido. Alero no lo ha tocado.' };
  }

  const next = install ? withOurs(settings) : withoutOurs(settings);

  let backup = '';
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    if (raw !== null) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      backup = `${settingsPath()}.bak-${stamp}`;
      fs.copyFileSync(settingsPath(), backup);
    }
    if (install) writeCommandFile();
    fs.writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    return { error: `No se pudo escribir: ${err.message}` };
  }

  return { backup, installed: isInstalled() };
}

module.exports = { preview, apply, isInstalled, MARKER, EVENTS };
