// Chat con los proveedores: Anthropic, OpenAI (y compatibles), Google Gemini y
// Ollama local. Todo con streaming y un aborto por conversación.
//
// Las claves nunca salen de aquí: el renderer manda proveedor, modelo y
// mensajes; el proceso principal añade la clave y habla con el servicio.

const keys = require('./keys');

const TIMEOUT_MS = 180000;
const sessions = new Map();

/** Parte un flujo SSE en eventos `data:` ya parseados. */
async function* sse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let cut = buffer.indexOf('\n\n');
    while (cut !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') yield payload;
      }
      cut = buffer.indexOf('\n\n');
    }
  }
}

function endpoint(base, fallback, path) {
  const root = (base || fallback).trim().replace(/\/+$/, '');
  return `${root}${path}`;
}

async function callAnthropic({ model, messages, apiKey, baseUrl, signal }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const body = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  };
  if (system) body.system = system;

  return fetch(endpoint(baseUrl, 'https://api.anthropic.com', '/v1/messages'), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
}

async function callOpenAI({ model, messages, apiKey, baseUrl, signal }) {
  return fetch(endpoint(baseUrl, 'https://api.openai.com', '/v1/chat/completions'), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
}

async function callGemini({ model, messages, apiKey, baseUrl, signal }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const root = endpoint(baseUrl, 'https://generativelanguage.googleapis.com', '');
  const url = `${root}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  return fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Convierte cada evento SSE del proveedor en texto. */
function textOf(provider, payload) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return '';
  }

  if (provider === 'anthropic') {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return data.delta.text || '';
    }
    if (data.type === 'error') throw new Error(data.error?.message || 'Error de Anthropic.');
    return '';
  }

  if (provider === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || '').join('');
  }

  // openai y ollama comparten formato.
  if (data.error) throw new Error(data.error.message || 'Error del proveedor.');
  return data.choices?.[0]?.delta?.content || '';
}

/**
 * Lanza una conversación. Llama a `onDelta` con cada trozo de texto.
 * Devuelve el texto completo al terminar.
 */
async function start({ id, provider, model, baseUrl, messages, onDelta }) {
  const controller = new AbortController();
  sessions.set(id, controller);

  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const apiKey = provider === 'ollama' ? '' : keys.get(provider);
    if (provider !== 'ollama' && !apiKey) {
      throw new Error(`No hay clave guardada para ${provider}.`);
    }
    if (!model) throw new Error('Falta el modelo.');

    const call = provider === 'anthropic' ? callAnthropic
      : provider === 'gemini' ? callGemini
        : callOpenAI;

    // Ollama vive en local; el resto usa su URL por defecto si no hay una.
    const base = baseUrl || (provider === "ollama" ? "http://127.0.0.1:11434" : "");
    const response = await call({ model, messages, apiKey, baseUrl: base, signal: controller.signal });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        detail = parsed.error?.message || parsed.error || detail;
      } catch {
        // Sin cuerpo legible: se queda el código.
      }
      throw new Error(String(detail));
    }

    let full = '';
    for await (const payload of sse(response)) {
      const text = textOf(provider, payload);
      if (text) {
        full += text;
        onDelta(text);
      }
    }
    return full;
  } finally {
    clearTimeout(timer);
    sessions.delete(id);
  }
}

function stop(id) {
  const controller = sessions.get(id);
  if (!controller) return false;
  controller.abort();
  sessions.delete(id);
  return true;
}

module.exports = { start, stop };
