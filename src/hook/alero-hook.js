// Aviso de Alero para los hooks de Claude Code.
//
// Lo lanza Claude Code en cada evento (Stop, Notification, PermissionRequest y
// PreToolUse de AskUserQuestion). Lee el JSON de stdin, lo manda a la app por un
// pipe local y, solo para PermissionRequest, espera la decisión y la imprime en
// stdout con el formato que documenta Claude Code.
//
// Reglas que no se rompen:
// - Si Alero no está abierto, sale en silencio: Claude Code sigue igual.
// - Nunca imprime nada que permita algo sin una decisión humana.
// - Todo tiene tope de tiempo: pase lo que pase, termina.

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const event = process.argv[2] || '';
const permission = event === 'PermissionRequest';

// Tope propio, por debajo del timeout que se escribe en settings.json.
const WAIT_MS = 115000;

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const configPath = path.join(appData, 'Alero', 'hook.json');

function config() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function reply(decision) {
  if (decision === 'allow' && permission) {
    return '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';
  }
  if (decision === 'deny' && permission) {
    return '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denegado desde Alero"}}}';
  }
  return '';
}

function finish(text) {
  if (text) process.stdout.write(text);
  process.exit(0);
}

let input = '';
let started = false;

function run() {
  if (started) return;
  started = true;
  // Si no hay app o configuración, no hay nada que hacer.
  const conf = config();
  if (!conf || !conf.pipe || !conf.token) finish('');

  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
  } catch {
    payload = {};
  }

  const line = `${JSON.stringify({
    token: conf.token,
    event,
    payload,
    tab: process.env.ALERO_TAB || '',
    profile: process.env.ALERO_PROFILE || '',
  })}\n`;

  const socket = net.connect(conf.pipe);
  let buffer = '';
  let answered = false;

  const close = (text) => {
    if (answered) return;
    answered = true;
    try { socket.destroy(); } catch { /* ya cerrado */ }
    finish(text);
  };

  // Sin respuesta a tiempo, silencio: Claude Code pregunta en la terminal.
  const timer = setTimeout(() => close(''), permission ? WAIT_MS : 2500);

  socket.setEncoding('utf8');
  socket.on('connect', () => socket.write(line));
  socket.on('data', (chunk) => {
    buffer += chunk;
    const end = buffer.indexOf('\n');
    if (end === -1) return;
    clearTimeout(timer);

    let decision = '';
    try {
      decision = JSON.parse(buffer.slice(0, end)).decision || '';
    } catch {
      decision = '';
    }
    close(reply(decision));
  });
  socket.on('error', () => { clearTimeout(timer); close(''); });
  socket.on('close', () => { clearTimeout(timer); close(''); });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > 1024 * 1024) finish(''); // payload absurdo: no es asunto nuestro
});
process.stdin.on('end', run);
process.stdin.on('close', run);

// Claude Code cierra stdin; si algún día no lo hiciera, no nos quedamos colgados.
setTimeout(run, 1500);
