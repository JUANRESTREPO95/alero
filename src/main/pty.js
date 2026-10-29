// Terminales reales (ConPTY en Windows) con node-pty.
// Una sesión por pestaña; el renderer nunca ve el proceso, solo texto.

const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const pty = require('node-pty');

const sessions = new Map();

function env() {
  // Heredar el entorno del sistema, salvo lo que pertenece a otra sesión de
  // Claude Code (variables CLAUDE*/ANTHROPIC_*): Alero no debe reenviar claves
  // ajenas ni arrancar dentro de un agente que ya está corriendo.
  const clean = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^CLAUDE/i.test(key) || /^ANTHROPIC_/i.test(key)) continue;
    clean[key] = value;
  }
  clean.TERM = 'xterm-256color';
  clean.COLORTERM = 'truecolor';
  clean.ALERO = '1';
  return clean;
}

function shellFor(shell) {
  if (shell === 'cmd') return { file: process.env.COMSPEC || 'cmd.exe', args: [] };
  return { file: 'powershell.exe', args: ['-NoLogo'] };
}

/**
 * Crea una sesión.
 * @param {{shell?:string, command?:string, cols:number, rows:number}} opts
 *   shell:   «powershell» (por defecto) o «cmd».
 *   command: lo que se escribe en esa shell al abrir (vacío = shell limpia).
 * @param {(id:string, data:string)=>void} onData
 * @param {(id:string, exit:{exitCode:number, signal?:number})=>void} onExit
 */
function create(opts, onData, onExit) {
  const { shell = 'powershell', command = '', cols = 80, rows = 24 } = opts || {};
  const id = crypto.randomUUID();
  const { file, args } = shellFor(shell);

  // Carpeta de trabajo del perfil; si no existe (o no se indicó), la del usuario.
  let cwd = os.homedir();
  const requested = String(opts?.cwd || '').trim();
  if (requested) {
    try {
      if (fs.statSync(requested).isDirectory()) cwd = requested;
    } catch {
      // Ruta ausente: se arranca en el usuario, sin romper la pestaña.
    }
  }

  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(20, cols | 0),
    rows: Math.max(5, rows | 0),
    cwd,
    env: env(),
    useConpty: true,
  });

  proc.onData((data) => onData(id, data));
  proc.onExit((e) => {
    sessions.delete(id);
    onExit(id, e);
  });

  sessions.set(id, { proc, shell });

  // El comando se escribe dentro de la shell: si termina, la pestaña queda viva
  // con el prompt en lugar de cerrarse sola.
  const line = String(command || '').trim();
  if (line) {
    setTimeout(() => {
      if (sessions.has(id)) proc.write(`${line}\r`);
    }, 500);
  }

  return id;
}

function input(id, data) {
  const s = sessions.get(id);
  if (s) s.proc.write(data);
}

function resize(id, cols, rows) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.proc.resize(Math.max(20, cols | 0), Math.max(5, rows | 0));
  } catch {
    // Un resize durante el cierre puede fallar: no es un error real.
  }
}

function kill(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try {
    s.proc.kill();
  } catch {
    // Ya estaba muerta.
  }
}

function killAll() {
  for (const id of [...sessions.keys()]) kill(id);
}

module.exports = { create, input, resize, kill, killAll };
