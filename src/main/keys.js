// Claves de los proveedores de chat.
//
// Se guardan cifradas con safeStorage (en Windows, DPAPI: solo esta cuenta de
// usuario puede descifrarlas) en %APPDATA%\Alero\keys.json. Nunca se escriben en
// claro ni se envían al renderer: la interfaz solo sabe si existen.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const PROVIDERS = ['anthropic', 'openai', 'gemini'];

function file() {
  return path.join(app.getPath('userData'), 'keys.json');
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function write(data) {
  fs.writeFileSync(file(), JSON.stringify(data, null, 2), 'utf8');
}

/** Qué proveedores tienen clave (sin decir cuál). */
function status() {
  const data = read();
  return Object.fromEntries(PROVIDERS.map((p) => [p, Boolean(data[p])]));
}

/** La clave en claro, solo para el proceso principal. */
function get(provider) {
  const encoded = read()[provider];
  if (!encoded) return '';
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return '';
  }
}

function set(provider, key) {
  if (!PROVIDERS.includes(provider)) throw new Error('Proveedor desconocido.');

  const data = read();
  const clean = String(key || '').trim();

  if (!clean) {
    delete data[provider];
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows no ofrece cifrado para esta cuenta; no se guarda la clave.');
    }
    data[provider] = safeStorage.encryptString(clean).toString('base64');
  }

  write(data);
  return status();
}

module.exports = { PROVIDERS, status, get, set };
