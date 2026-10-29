// Avisos de Claude Code: un pipe local por el que el hook cuenta lo que pasa.
//
// El pipe lleva un token aleatorio que se escribe en %APPDATA%\Alero\hook.json;
// el hook lo lee y lo manda en cada mensaje. Sin app escuchando, el hook no
// encuentra el pipe y sale en silencio.

const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

let server = null;
let token = '';
let handlers = { alert: null, permission: null };

function configPath() {
  return path.join(app.getPath('userData'), 'hook.json');
}

function shorten(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Resumen legible de lo que el agente quiere hacer. */
function toolSummary(tool, input) {
  if (!input || typeof input !== 'object') return tool;
  if (typeof input.command === 'string') return input.command;
  // Rutas: solo el nombre del archivo, que es lo que cabe y lo que importa.
  if (typeof input.file_path === 'string') return path.basename(input.file_path);
  if (typeof input.path === 'string') return path.basename(input.path);
  if (typeof input.url === 'string') return input.url;
  if (typeof input.pattern === 'string') return input.pattern;
  return tool;
}

/** Convierte el evento del hook en lo que la interfaz necesita. */
function describe(body) {
  const event = String(body.event || '');
  const payload = body.payload || {};
  const cwd = String(payload.cwd || '');
  const folder = cwd ? path.basename(cwd) : '';
  const tool = String(payload.tool_name || '');

  let key = 'notification';
  let title = 'Claude Code';
  let bodyText = folder;

  if (event === 'Stop') {
    key = 'stop';
    title = 'Claude terminó';
    bodyText = 'Listo';
  } else if (event === 'PermissionRequest') {
    key = 'permission';
    title = 'Pide permiso';
    bodyText = shorten(toolSummary(tool, payload.tool_input), 100);
  } else if (event === 'PreToolUse' && tool === 'AskUserQuestion') {
    key = 'question';
    const first = payload.tool_input?.questions?.[0]?.question;
    title = 'Te hace una pregunta';
    bodyText = shorten(first || 'Quiere saber algo', 120);
  } else if (event === 'Notification') {
    key = 'notification';
    title = 'Claude espera por ti';
    bodyText = shorten(payload.message || folder || 'Necesita tu atención', 120);
  }

  return {
    key,
    event,
    title,
    body: bodyText,
    folder,
    profile: String(body.profile || ''),
    tab: String(body.tab || ''),
    tool,
  };
}

function handle(body, socket) {
  const alert = describe(body);

  // PermissionRequest: el hook se queda esperando la decisión.
  if (alert.key === 'permission' && handlers.permission) {
    handlers.permission(alert, (decision) => {
      try {
        socket.write(`${JSON.stringify({ decision })}\n`);
      } catch {
        // El hook ya se fue: no hay a quién contestar.
      }
      socket.destroy();
    });
    return;
  }

  socket.end();
  handlers.alert?.(alert);
}

function start(next) {
  handlers = next;
  token = crypto.randomBytes(24).toString('hex');

  const pipe = `\\\\.\\pipe\\alero-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ pipe, token }), 'utf8');
  } catch {
    return false;
  }

  server = net.createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) {
        socket.destroy();
        return;
      }
      const end = buffer.indexOf('\n');
      if (end === -1) return;

      let body;
      try {
        body = JSON.parse(buffer.slice(0, end));
      } catch {
        socket.destroy();
        return;
      }
      if (!body || body.token !== token) {
        socket.destroy();
        return;
      }
      handle(body, socket);
    });
  });

  server.on('error', () => {});
  server.listen(pipe);
  return true;
}

function stop() {
  try {
    server?.close();
  } catch {
    // Ya estaba cerrado.
  }
  server = null;
}

module.exports = { start, stop, describe };
