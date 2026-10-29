// Alero — pestaña de chat.
//
// Una pestaña de tipo «chat» muestra una conversación con el proveedor del
// perfil. Los mensajes se guardan por perfil en %APPDATA%\Alero\chats y se
// retoman al abrir. El texto llega en trozos desde el proceso principal.

(() => {
  const sessions = new Map();

  const SUGGESTIONS = {
    anthropic: ['claude-opus-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    gemini: ['gemini-2.5-pro', 'gemini-2.0-flash'],
    ollama: [],
  };

  const PROVIDER_NAMES = {
    anthropic: 'Anthropic',
    openai: 'OpenAI/compatible',
    gemini: 'Google Gemini',
    ollama: 'Ollama',
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Markdown mínimo y seguro: negrita, código, enlaces, listas y saltos. */
  function markdown(text) {
    let html = escapeHtml(text);

    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.replace(/^\n|\n$/g, '')}</code></pre>`);
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function bubble(role, text, pending = false) {
    const node = document.createElement('div');
    node.className = `chat-msg ${role}${pending ? ' pending' : ''}`;
    const body = document.createElement('div');
    body.className = 'chat-body';
    if (role === 'assistant') body.innerHTML = markdown(text);
    else body.textContent = text;
    node.appendChild(body);
    return node;
  }

  function create({ profile, id, onActivity, onModelChange }) {
    const state = {
      id,
      profileId: profile.id,
      provider: profile.provider || 'ollama',
      model: profile.model || '',
      baseUrl: profile.baseUrl || '',
      messages: [],
      running: false,
      el: null,
    };

    const wrap = document.createElement('div');
    wrap.className = 'chat';

    const log = document.createElement('div');
    log.className = 'chat-log';

    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = `Chat con ${PROVIDER_NAMES[state.provider] || state.provider}. Escribe abajo.`;
    log.appendChild(empty);

    const form = document.createElement('form');
    form.className = 'chat-compose';

    const input = document.createElement('textarea');
    input.className = 'chat-input';
    input.rows = 2;
    input.placeholder = 'Escribe un mensaje…  (Enter envía · Shift+Enter salta de línea)';

    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    const providerLabel = document.createElement('span');
    providerLabel.className = 'chat-provider';
    providerLabel.textContent = PROVIDER_NAMES[state.provider] || state.provider;

    // Modelo: se elige aquí mismo y queda guardado en el perfil.
    const modelSelect = document.createElement('select');
    modelSelect.className = 'chat-model-select';
    modelSelect.title = 'Modelo de esta conversación';

    function fillModels(list) {
      const values = [...new Set([state.model, ...(list || [])].filter(Boolean))];
      modelSelect.textContent = '';
      if (!values.length) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'sin modelo';
        modelSelect.appendChild(empty);
        modelSelect.disabled = true;
        return;
      }
      for (const id of values) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        if (id === state.model) option.selected = true;
        modelSelect.appendChild(option);
      }
      modelSelect.disabled = values.length < 2;
    }

    fillModels([]);
    window.alero.chatModels(state.provider, state.baseUrl).then(fillModels).catch(() => {});
    modelSelect.addEventListener('change', () => {
      state.model = modelSelect.value;
      onModelChange?.(state.model);
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'chat-button';
    reset.textContent = 'Nueva';
    reset.title = 'Empezar una conversación vacía';

    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'chat-button hidden';
    stop.textContent = 'Parar';

    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'chat-button primary';
    send.textContent = 'Enviar';

    actions.append(providerLabel, modelSelect, reset, stop, send);
    form.append(input, actions);
    wrap.append(log, form);
    state.el = wrap;

    function scroll() {
      log.scrollTop = log.scrollHeight;
    }

    function render() {
      log.textContent = '';
      if (!state.messages.length) {
        const hint = document.createElement('div');
        hint.className = 'chat-empty';
        hint.textContent = `Chat con ${PROVIDER_NAMES[state.provider] || state.provider}. Escribe abajo.`;
        log.appendChild(hint);
        return;
      }
      for (const message of state.messages) {
        log.appendChild(bubble(message.role, message.content));
      }
      scroll();
    }

    function persist() {
      window.alero.chatSave(state.profileId, state.messages);
    }

    function setRunning(on) {
      state.running = on;
      stop.classList.toggle('hidden', !on);
      send.disabled = on;
      input.disabled = on;
    }

    function sendMessage() {
      const text = input.value.trim();
      if (!text || state.running) return;

      input.value = '';
      state.messages.push({ role: 'user', content: text });

      const pending = bubble('assistant', '…', true);
      log.appendChild(pending);
      const body = pending.querySelector('.chat-body');
      let answer = '';

      log.querySelector('.chat-empty')?.remove();
      scroll();

      const started = [...state.messages];
      setRunning(true);
      onActivity?.();

      window.alero.chatStart({
        id: state.id,
        provider: state.provider,
        model: state.model,
        baseUrl: state.baseUrl,
        messages: started,
      });

      state.onDelta = (chunk) => {
        answer += chunk;
        body.innerHTML = markdown(answer);
        scroll();
      };
      state.onDone = () => {
        state.messages.push({ role: 'assistant', content: answer });
        state.onDelta = null;
        state.onDone = null;
        state.onError = null;
        setRunning(false);
        persist();
        render();
        input.focus();
      };
      state.onError = (message) => {
        pending.remove();
        state.messages.pop(); // el mensaje del usuario vuelve al cuadro
        input.value = text;
        state.onDelta = null;
        state.onDone = null;
        state.onError = null;
        setRunning(false);

        const warn = document.createElement('div');
        warn.className = 'chat-msg error';
        warn.textContent = message;
        log.appendChild(warn);
        scroll();
        persist();
      };
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    stop.addEventListener('click', () => window.alero.chatStop(state.id));

    reset.addEventListener('click', () => {
      if (state.running) window.alero.chatStop(state.id);
      state.messages = [];
      persist();
      render();
      input.focus();
    });

    state.onDelta = null;
    state.onDone = null;
    state.onError = null;

    window.alero.chatHistory(state.profileId).then((history) => {
      if (Array.isArray(history) && history.length) {
        state.messages = history;
        render();
      }
    });

    const api = {
      el: wrap,
      id,
      focus: () => input.focus(),
      destroy: () => {
        if (state.running) window.alero.chatStop(state.id);
        persist();
      },
      delta: (chunk) => state.onDelta?.(chunk),
      done: () => state.onDone?.(),
      error: (message) => state.onError?.(message),
      suggestions: () => SUGGESTIONS[state.provider] || [],
    };

    sessions.set(id, api);
    return api;
  }

  window.AleroChat = {
    create,
    get: (id) => sessions.get(id),
    remove: (id) => sessions.delete(id),
  };
})();
