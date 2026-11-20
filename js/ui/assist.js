/* Asistente de escritura con IA, con la clave de API de cada persona (Claude, de Anthropic) o con un modelo
   local de Ollama. Panel lateral con acciones rápidas (mejorar, corregir, resumir, traducir…) y peticiones
   libres; la respuesta llega en directo y se puede reemplazar, insertar debajo o aplicar como sugerencia
   con control de cambios (autor «Asistente IA»). El texto que escribe la IA queda marcado en la autoría.
   El documento no sale del equipo hasta que se pide algo al asistente. */
(function () {
  'use strict';
  const PT = window.PT, ui = PT.ui, h = ui.h, O = PT.ops, M = PT.marks, R = PT.runs;
  const A = () => PT.app;
  const STORE = 'pt.ai', KEY_SESSION = 'pt.ai.key';
  const API_VERSION = '2026-10-21';
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (recomendado)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (más rápido)'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5 (el más económico)'],
    ['claude-fable-5-2', 'Claude Fable 5.2 (el más capaz)'],
  ];
  // modelos que admiten el reintento automático con otro modelo si el primero rechaza la petición
  const FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2']);
  const DEF = { provider: 'anthropic', key: '', model: 'claude-opus-5-5', effort: 'medium', remember: true, base: 'https://api.anthropic.com', ollama: 'http://localhost:11434', ollamaModel: 'llama3.2', compat: {} };
  // otros proveedores con la API de chat compatible con la de OpenAI (comprobado: todos admiten llamadas
  // directas desde el navegador, también con el procesador abierto con doble clic)
  const COMPAT = [
    { id: 'openai', name: 'OpenAI (ChatGPT)', base: 'https://api.openai.com/v1', keys: 'platform.openai.com/api-keys', ex: 'el modelo GPT que prefieras' },
    { id: 'gemini', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keys: 'aistudio.google.com/apikey', ex: 'un modelo gemini-…' },
    { id: 'mistral', name: 'Mistral AI', base: 'https://api.mistral.ai/v1', keys: 'console.mistral.ai', ex: 'mistral-large-latest' },
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', keys: 'platform.deepseek.com', ex: 'deepseek-chat' },
    { id: 'groq', name: 'Groq (muy rápido)', base: 'https://api.groq.com/openai/v1', keys: 'console.groq.com/keys', ex: 'un modelo llama o qwen' },
    { id: 'openrouter', name: 'OpenRouter (cientos de modelos)', base: 'https://openrouter.ai/api/v1', keys: 'openrouter.ai/keys', ex: 'proveedor/modelo' },
    { id: 'xai', name: 'xAI (Grok)', base: 'https://api.x.ai/v1', keys: 'console.x.ai', ex: 'un modelo grok-…' },
    { id: 'together', name: 'Together AI', base: 'https://api.together.xyz/v1', keys: 'api.together.ai', ex: 'organización/modelo' },
    { id: 'perplexity', name: 'Perplexity', base: 'https://api.perplexity.ai', keys: 'perplexity.ai/settings/api', ex: 'sonar' },
    { id: 'lmstudio', name: 'LM Studio (local, sin internet)', base: 'http://localhost:1234/v1', local: true, ex: 'el modelo que tengas cargado' },
    { id: 'custom', name: 'Otro servicio compatible con OpenAI', base: '', ex: 'nombre del modelo' },
  ];

  const SYSTEM = 'Eres el asistente de escritura de un procesador de texto. Trabajas sobre el texto que te da la persona usuaria entre las etiquetas <texto> y </texto>. ' +
    'Responde únicamente con el resultado, listo para insertarse en el documento, en Markdown sencillo: párrafos separados por una línea en blanco, **negrita**, *cursiva*, listas con «- » o «1. », títulos con «#» y tablas solo si se piden. ' +
    'No añadas introducciones, explicaciones, despedidas ni comentarios sobre lo que has hecho, y no rodees la respuesta con comillas ni bloques de código. ' +
    'Conserva el idioma del texto salvo que se te pida traducir; si no hay texto, escribe en español. No inventes datos concretos (cifras, nombres, fechas, citas o fuentes) que no estén en el texto o en la petición.';

  // acciones rápidas · scope: 'auto' (selección o párrafo), 'doc' (selección o documento), 'before' (texto anterior al cursor)
  // put: lo que propone el botón principal: 'replace', 'below' o 'after'
  const ACTIONS = [
    { id: 'improve', l: 'Mejorar la redacción', i: 'wand', put: 'replace', p: 'Mejora la redacción del texto para que sea más claro, fluido y correcto, sin cambiar su significado ni añadir información.' },
    { id: 'fix', l: 'Corregir ortografía y gramática', i: 'spell', put: 'replace', p: 'Corrige la ortografía, la gramática y la puntuación del texto. Cambia solo lo imprescindible y respeta el estilo del autor.' },
    { id: 'shorter', l: 'Acortar', i: 'minus', put: 'replace', p: 'Reescribe el texto de forma más breve, aproximadamente a la mitad, conservando las ideas principales.' },
    { id: 'longer', l: 'Desarrollar', i: 'plus', put: 'replace', p: 'Desarrolla el texto con más detalle y ejemplos, manteniendo el tono y sin inventar datos concretos.' },
    { id: 'formal', l: 'Tono más formal', i: 'book', put: 'replace', p: 'Reescribe el texto con un tono más formal y profesional.' },
    { id: 'friendly', l: 'Tono más cercano', i: 'comment', put: 'replace', p: 'Reescribe el texto con un tono más cercano y amable, sin perder la corrección.' },
    { id: 'simple', l: 'Lectura fácil', i: 'help', put: 'replace', p: 'Reescribe el texto en lectura fácil: frases cortas, palabras sencillas, una idea por frase y sin tecnicismos innecesarios.' },
    { id: 'summary', l: 'Resumir', i: 'stats', put: 'below', scope: 'doc', p: 'Resume el texto en un párrafo breve con las ideas clave.' },
    { id: 'bullets', l: 'Puntos clave', i: 'listBullet', put: 'below', scope: 'doc', p: 'Extrae los puntos clave del texto como una lista con viñetas (como mucho siete).' },
    { id: 'outline', l: 'Proponer un esquema', i: 'outline', put: 'below', scope: 'doc', p: 'Propón un esquema para este documento: títulos y subtítulos en Markdown (# y ##) con una línea que explique cada sección.' },
    { id: 'questions', l: 'Preguntas de repaso', i: 'help', put: 'below', scope: 'doc', p: 'Escribe cinco preguntas de repaso sobre el texto (de comprensión y de reflexión) como lista numerada y, después, un apartado «Respuestas esperadas» con una respuesta breve para cada una.' },
    { id: 'titles', l: 'Proponer títulos', i: 'header', put: 'below', scope: 'doc', p: 'Propón cinco títulos posibles para el texto, como lista numerada.' },
    { id: 'continue', l: 'Continuar escribiendo', i: 'right', put: 'after', scope: 'before', p: 'Continúa el texto desde donde termina, con el mismo estilo y tono, en uno o dos párrafos. Devuelve solo la continuación, sin repetir lo anterior.' },
    { id: 'translate', l: 'Traducir…', i: 'globe', put: 'replace', ask: 'lang' },
  ];
  const LANGS = ['inglés', 'español', 'francés', 'alemán', 'italiano', 'portugués', 'catalán', 'gallego', 'euskera', 'chino', 'japonés', 'árabe'];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* almacenamiento bloqueado */ } },
    sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* almacenamiento bloqueado */ } },
  };

  const ai = (PT.ai = {
    cfg: null, busy: null, last: null,

    // ------------------------------------------------------------ configuración
    config() {
      if (this.cfg) return this.cfg;
      let saved = {};
      try { saved = JSON.parse(store.get(STORE) || '{}') || {}; } catch (e) { saved = {}; }
      this.cfg = Object.assign({}, DEF, saved);
      this.cfg.compat = Object.assign({}, saved.compat || {});
      if (!this.cfg.remember) {
        // las claves solo se guardaron para esta sesión del navegador
        let ses = {};
        const raw = store.sget(KEY_SESSION) || '';
        try { ses = raw[0] === '{' ? JSON.parse(raw) : { key: raw }; } catch (e) { ses = {}; }
        this.cfg.key = ses.key || '';
        for (const id in ses.compat || {}) this.cfg.compat[id] = Object.assign({}, this.cfg.compat[id], { key: ses.compat[id] });
      }
      return this.cfg;
    },
    saveConfig(c) {
      this.cfg = Object.assign({}, DEF, c);
      this.cfg.compat = JSON.parse(JSON.stringify(c.compat || {}));
      const copy = JSON.parse(JSON.stringify(this.cfg));
      if (!copy.remember) {
        const ses = { key: copy.key || '', compat: {} };
        for (const id in copy.compat) { if (copy.compat[id].key) ses.compat[id] = copy.compat[id].key; delete copy.compat[id].key; }
        copy.key = '';
        store.sset(KEY_SESSION, JSON.stringify(ses));
      } else store.sset(KEY_SESSION, null);
      store.set(STORE, JSON.stringify(copy));
    },
    preset(c) { c = c || this.config(); return COMPAT.find((p) => p.id === c.provider) || null; },
    ready() {
      const c = this.config();
      if (c.provider === 'ollama') return !!c.ollamaModel;
      const pre = this.preset(c);
      if (pre) { const s = c.compat[pre.id] || {}; return !!s.model && (!!s.key || !!pre.local || pre.id === 'custom') && !!(s.base || pre.base); }
      return !!c.key;
    },
    label() {
      const c = this.config(), pre = this.preset(c);
      if (c.provider === 'ollama') return 'Ollama · ' + c.ollamaModel;
      if (pre) return pre.name.replace(/ \(.*\)$/, '') + ' · ' + ((c.compat[pre.id] || {}).model || '');
      return (MODELS.find((m) => m[0] === c.model) || [c.model, c.model])[1].replace(/ \(.*\)$/, '');
    },

    configure(then) {
      const c = Object.assign({}, this.config());
      c.compat = JSON.parse(JSON.stringify(c.compat || {}));
      // selector de proveedor: Claude, Ollama y los compatibles con la API de OpenAI
      const prov = h('select.inp');
      prov.append(h('option', { value: 'anthropic' }, 'Claude (Anthropic) con tu clave de API'), h('option', { value: 'ollama' }, 'Modelo local con Ollama (sin internet)'),
        h('optgroup', { label: 'Otros proveedores (API compatible con OpenAI)' }, ...COMPAT.map((p) => h('option', { value: p.id }, p.name))));
      prov.value = c.provider;
      if (prov.value !== c.provider) prov.value = 'anthropic';
      const key = h('input.inp', { type: 'password', value: c.key || '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Clave de API' });
      const show = h('button.btn.small', { type: 'button', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; show.textContent = key.type === 'password' ? 'Mostrar' : 'Ocultar'; } }, 'Mostrar');
      const model = ui.select(MODELS, c.model);
      const effort = ui.select([['low', 'Bajo: respuestas más rápidas'], ['medium', 'Medio (recomendado)'], ['high', 'Alto: piensa más a fondo']], c.effort);
      const remember = ui.check('Recordar la clave en este navegador', c.remember);
      const base = h('input.inp', { type: 'text', value: c.base, spellcheck: false });
      const ourl = h('input.inp', { type: 'text', value: c.ollama, spellcheck: false });
      const omodel = h('input.inp', { type: 'text', value: c.ollamaModel, spellcheck: false, placeholder: 'llama3.1:8b, qwen2.5:7b, gemma3…', list: 'pt-ollama-models' });
      const olist = h('datalist#pt-ollama-models');
      const ostatus = h('span.muted.small');
      const loadModels = async () => {
        ostatus.textContent = 'Buscando modelos…';
        try {
          const names = await this.ollamaModels(ourl.value.trim().replace(/\/+$/, '') || DEF.ollama);
          olist.replaceChildren(...names.map((n) => h('option', { value: n })));
          ostatus.textContent = names.length ? names.length + ' modelos instalados: elige uno en la lista.' : 'No hay modelos: descarga uno con «ollama pull llama3.1:8b».';
          if (names.length && !names.includes(omodel.value)) omodel.value = names.find((n) => /^llama3/.test(n)) || names[0];
        } catch (e) { ostatus.textContent = location.protocol === 'file:' ? 'No se pudo leer la lista (página abierta como archivo: ver OLLAMA_ORIGINS).' : 'No se encontró Ollama en esa dirección.'; }
      };
      const result = h('div.ai-test.muted');
      const claudeBox = h('div.ai-cfg-group',
        ui.field('Clave de API', h('div.row', key, show), 'Créala en console.anthropic.com. Se usa solo desde este navegador para hablar con la API de Anthropic.'),
        ui.field('Modelo', model), ui.field('Esfuerzo', effort), remember,
        h('details.ai-adv', h('summary', 'Avanzado'), ui.field('Servidor de la API', base, 'Déjalo como está salvo que uses un proxy propio.')));
      const ollamaBox = h('div.ai-cfg-group',
        ui.field('Dirección de Ollama', ourl), ui.field('Modelo', h('div', omodel, olist), 'Los de 7–9 B (llama3.1:8b, qwen2.5:7b…) escriben bien en español. Si abres el procesador con doble clic, Ollama necesita la variable OLLAMA_ORIGINS=*.'),
        h('div.row', h('button.btn.small', { type: 'button', onclick: loadModels }, 'Buscar modelos instalados'), ostatus));
      // proveedores compatibles con OpenAI: cada uno guarda su clave, su modelo y su dirección
      const ckey = h('input.inp', { type: 'password', autocomplete: 'off', spellcheck: false, 'aria-label': 'Clave de API del proveedor' });
      const cshow = h('button.btn.small', { type: 'button', onclick: () => { ckey.type = ckey.type === 'password' ? 'text' : 'password'; cshow.textContent = ckey.type === 'password' ? 'Mostrar' : 'Ocultar'; } }, 'Mostrar');
      const cmodel = h('input.inp', { type: 'text', spellcheck: false, list: 'pt-compat-models' });
      const clist = h('datalist#pt-compat-models');
      const cbase = h('input.inp', { type: 'text', spellcheck: false });
      const cstatus = h('span.muted.small');
      const keyHint = h('span.field-hint');
      const loadCompat = async () => {
        const pre = COMPAT.find((p) => p.id === prov.value);
        if (!pre) return;
        cstatus.textContent = 'Buscando modelos…';
        try {
          const names = await this.compatModels(cbase.value.trim().replace(/\/+$/, '') || pre.base, ckey.value.trim());
          clist.replaceChildren(...names.map((n) => h('option', { value: n })));
          cstatus.textContent = names.length ? names.length + ' modelos disponibles: elige uno en la lista o escribe su nombre.' : 'El servicio no devolvió modelos: escribe el nombre a mano.';
          if (names.length && !cmodel.value) cmodel.value = names[0];
        } catch (e) { cstatus.textContent = e.message; }
      };
      const compatBox = h('div.ai-cfg-group',
        ui.field('Clave de API', h('div.row', ckey, cshow)), keyHint,
        ui.field('Modelo', h('div', cmodel, clist)),
        h('div.row', h('button.btn.small', { type: 'button', onclick: loadCompat }, 'Buscar modelos disponibles'), cstatus),
        ui.field('Dirección del servicio', cbase, 'Termina en la versión de la API (…/v1). Las peticiones van a esta dirección + /chat/completions.'));
      let curCompat = null;
      // guarda lo escrito del proveedor que se deja y carga el que se elige
      const swapCompat = () => {
        if (curCompat) c.compat[curCompat] = { key: ckey.value.trim(), model: cmodel.value.trim(), base: cbase.value.trim().replace(/\/+$/, '') };
        const pre = COMPAT.find((p) => p.id === prov.value);
        curCompat = pre ? pre.id : null;
        if (!pre) return;
        const s = c.compat[pre.id] || {};
        ckey.value = s.key || ''; cmodel.value = s.model || ''; cbase.value = s.base || pre.base;
        cmodel.placeholder = 'Por ejemplo: ' + pre.ex;
        ckey.placeholder = pre.local ? 'No hace falta en un servidor local' : 'Tu clave de ' + pre.name.replace(/ \(.*\)$/, '');
        keyHint.textContent = pre.keys ? 'Consíguela en ' + pre.keys + '. Se usa solo desde este navegador para hablar con ese servicio.' : pre.local ? 'Arranca el servidor local de ' + pre.name.replace(/ \(.*\)$/, '') + ' y carga un modelo.' : 'Indica la dirección del servicio y, si la pide, su clave.';
        clist.replaceChildren(); cstatus.textContent = '';
        if (pre.local || s.key) loadCompat();
      };
      let loaded = false;
      const sync = () => {
        swapCompat();
        claudeBox.hidden = prov.value !== 'anthropic'; ollamaBox.hidden = prov.value !== 'ollama'; compatBox.hidden = !curCompat;
        if (!ollamaBox.hidden && !loaded) { loaded = true; loadModels(); }
      };
      prov.addEventListener('change', sync); sync();
      ckey.addEventListener('change', () => { if (ckey.value.trim() && !cmodel.value) loadCompat(); });
      const read = () => {
        if (curCompat) c.compat[curCompat] = { key: ckey.value.trim(), model: cmodel.value.trim(), base: cbase.value.trim().replace(/\/+$/, '') };
        return { provider: prov.value, key: key.value.trim(), model: model.value, effort: effort.value, remember: remember.input.checked, base: base.value.trim().replace(/\/+$/, '') || DEF.base, ollama: ourl.value.trim().replace(/\/+$/, '') || DEF.ollama, ollamaModel: omodel.value.trim() || DEF.ollamaModel, compat: c.compat };
      };
      const test = async () => {
        const prev = this.cfg;
        this.cfg = Object.assign({}, DEF, read());
        if (!this.ready()) { result.textContent = '✗ Falta ' + (this.preset() ? 'el modelo o la clave' : prov.value === 'ollama' ? 'el modelo' : 'la clave') + '.'; this.cfg = prev; return; }
        result.textContent = 'Probando…';
        try {
          const r = await this.complete({ prompt: 'Responde solo con la palabra: listo', effort: 'low', maxTokens: 2000 });
          result.textContent = '✓ Conexión correcta (' + (r.model || this.label()) + '): «' + r.text.trim().slice(0, 40) + '»';
        } catch (e) { result.textContent = '✗ ' + e.message; }
        this.cfg = prev;
      };
      ui.dialog({
        title: 'Asistente de IA', width: 520,
        body: h('div.ai-cfg',
          h('p.dlg-msg', 'El asistente envía al proveedor que elijas solo el texto con el que le pides trabajar, cuando se lo pides. Con Ollama o LM Studio todo se queda en tu equipo.'),
          ui.field('Proveedor', prov), claudeBox, ollamaBox, compatBox, h('div.row', h('button.btn.small', { type: 'button', onclick: test }, 'Probar la conexión'), result)),
        buttons: [
          { left: true, el: h('button.btn.small.danger-text', { type: 'button', onclick: () => { key.value = ''; ckey.value = ''; } }, 'Olvidar la clave') },
          { label: 'Cancelar' },
          { label: 'Guardar', primary: true, action: () => { this.saveConfig(read()); if (PT.chrome._panel === 'ai') this.render(PT.chrome.els.side); if (then) setTimeout(then, 0); } },
        ],
      });
    },

    // ------------------------------------------------------------ llamada al modelo
    // opts: {prompt | content, system, effort, maxTokens, signal, onText(texto acumulado), onThink(resumen), onStatus(estado)}
    async complete(opts) {
      const c = this.config();
      if (!this.ready()) throw new Error('Configura antes el asistente (proveedor y clave).');
      if (c.provider === 'ollama') return this.callOllama(c, opts);
      if (this.preset(c)) return this.callCompat(c, opts);
      return this.callClaude(c, opts);
    },
    async callClaude(c, opts) {
      const fb = FALLBACK.has(c.model);
      const body = {
        model: c.model, max_tokens: opts.maxTokens || 64000, stream: true,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: opts.effort || c.effort || 'medium' },
        system: opts.system || SYSTEM,
        messages: [{ role: 'user', content: opts.content || opts.prompt }],
      };
      if (fb) body.fallbacks = 'default';
      const headers = { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': API_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' };
      if (fb) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      let resp;
      try { resp = await fetch((c.base || DEF.base) + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }); }
      catch (e) { if (e.name === 'AbortError') throw e; throw new Error('No se pudo conectar con la API de Anthropic. Comprueba la conexión a internet.'); }
      if (!resp.ok) throw new Error(await httpError(resp));
      const out = { text: '', think: '', stop: null, model: c.model, usage: {}, fellBack: false };
      for await (const { ev, data } of sse(resp)) {
        if (ev === 'error' || data.type === 'error') throw new Error(apiMessage(data.error && data.error.type, data.error && data.error.message));
        if (data.type === 'message_start' && data.message) { out.model = data.message.model || out.model; Object.assign(out.usage, data.message.usage || {}); }
        else if (data.type === 'content_block_start' && data.content_block) {
          const t = data.content_block.type;
          if (t === 'thinking' && opts.onStatus) opts.onStatus('Pensando…');
          else if (t === 'text' && opts.onStatus) opts.onStatus('Escribiendo…');
          else if (t === 'fallback') { out.fellBack = true; if (opts.onStatus) opts.onStatus('Continúa otro modelo…'); }
        } else if (data.type === 'content_block_delta' && data.delta) {
          if (data.delta.type === 'text_delta') { out.text += data.delta.text; if (opts.onText) opts.onText(out.text); }
          else if (data.delta.type === 'thinking_delta' && data.delta.thinking) { out.think += data.delta.thinking; if (opts.onThink) opts.onThink(out.think); }
        } else if (data.type === 'message_delta') {
          if (data.delta && data.delta.stop_reason) out.stop = data.delta.stop_reason;
          if (data.usage) Object.assign(out.usage, data.usage);
        }
      }
      if (out.stop === 'refusal') throw new Error('El modelo ha rechazado esta petición por sus normas de uso. Prueba a reformularla.');
      return out;
    },
    async callOllama(c, opts) {
      const messages = [{ role: 'system', content: opts.system || SYSTEM }];
      if (typeof (opts.content || opts.prompt) === 'string') messages.push({ role: 'user', content: opts.content || opts.prompt });
      else {
        const parts = opts.content;
        messages.push({ role: 'user', content: parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n\n'), images: parts.filter((p) => p.type === 'image' && p.source.type === 'base64').map((p) => p.source.data) });
      }
      let resp;
      try { resp = await fetch(c.ollama + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: c.ollamaModel, messages, stream: true }), signal: opts.signal }); }
      catch (e) { if (e.name === 'AbortError') throw e; throw new Error(ollamaHelp(c)); }
      if (resp.status === 403) throw new Error(ollamaHelp(c));
      if (!resp.ok) {
        let msg = 'Ollama respondió con un error ' + resp.status + '.';
        try { const j = await resp.json(); if (j.error) msg = /not found/i.test(j.error) ? 'Ollama no tiene el modelo «' + c.ollamaModel + '». Descárgalo con «ollama pull ' + c.ollamaModel + '» o elige otro en la configuración.' : 'Ollama: ' + j.error; } catch (e) { /* sin cuerpo */ }
        throw new Error(msg);
      }
      const out = { text: '', think: '', stop: null, model: c.ollamaModel, usage: {} };
      if (opts.onStatus) opts.onStatus('Escribiendo…');
      const reader = resp.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let j; try { j = JSON.parse(line); } catch (e) { continue; }
          if (j.error) throw new Error('Ollama: ' + j.error);
          if (j.message && j.message.content) { out.text += j.message.content; if (opts.onText) opts.onText(out.text); }
          if (j.done) { out.stop = j.done_reason || 'end_turn'; out.usage = { input_tokens: j.prompt_eval_count, output_tokens: j.eval_count }; }
        }
      }
      return out;
    },

    // proveedores con la API de OpenAI: POST …/chat/completions con «stream», respuesta en eventos SSE
    async callCompat(c, opts) {
      const pre = this.preset(c), s = c.compat[pre.id] || {};
      const base = String(s.base || pre.base || '').replace(/\/+$/, '');
      const name = pre.name.replace(/ \(.*\)$/, '');
      const content = opts.content || opts.prompt;
      const msg = typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: p.source.type === 'base64' ? 'data:' + p.source.media_type + ';base64,' + p.source.data : p.source.url } }));
      const body = { model: s.model, stream: true, messages: [{ role: 'system', content: opts.system || SYSTEM }, { role: 'user', content: msg }] };
      const headers = { 'content-type': 'application/json' };
      if (s.key) headers.authorization = 'Bearer ' + s.key;
      let resp;
      try { resp = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }); }
      catch (e) { if (e.name === 'AbortError') throw e; throw new Error(pre.local ? 'No se pudo conectar con ' + name + ' en ' + base + '. ¿Está en marcha su servidor local con un modelo cargado?' : 'No se pudo conectar con ' + name + '. Comprueba la conexión a internet y la dirección del servicio.'); }
      if (!resp.ok) throw new Error(await compatError(resp, name, s.model));
      const out = { text: '', think: '', stop: null, model: s.model, usage: {} };
      if (opts.onStatus) opts.onStatus('Esperando la respuesta…');
      for await (const { data } of sse(resp)) {
        if (data.error) throw new Error(name + ': ' + (data.error.message || 'error del servicio'));
        if (data.model) out.model = data.model;
        if (data.usage) out.usage = { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens };
        const ch = data.choices && data.choices[0];
        if (!ch) continue;
        const d = ch.delta || ch.message || {};
        const think = d.reasoning_content || d.reasoning;
        if (think && !out.text) { out.think += think; if (opts.onThink) opts.onThink(out.think); if (opts.onStatus) opts.onStatus('Pensando…'); }
        if (d.content) { if (!out.text && opts.onStatus) opts.onStatus('Escribiendo…'); out.text += d.content; if (opts.onText) opts.onText(out.text); }
        if (ch.finish_reason) out.stop = ch.finish_reason === 'length' ? 'max_tokens' : ch.finish_reason === 'content_filter' ? 'refusal' : 'end_turn';
      }
      if (out.stop === 'refusal' && !out.text.trim()) throw new Error('El modelo ha rechazado esta petición por sus normas de uso. Prueba a reformularla.');
      return out;
    },
    // modelos disponibles en un servicio compatible con OpenAI (GET …/models)
    async compatModels(base, key) {
      let r;
      try { r = await fetch(base + '/models', { headers: key ? { authorization: 'Bearer ' + key } : {} }); }
      catch (e) { throw new Error('No se pudo conectar con el servicio para listar sus modelos.'); }
      if (r.status === 401 || r.status === 403) throw new Error(key ? 'La clave no es válida para este servicio.' : 'Escribe primero la clave de API y vuelve a buscar.');
      if (!r.ok) throw new Error('El servicio no permite listar sus modelos (' + r.status + '): escribe el nombre a mano.');
      const j = await r.json();
      const list = Array.isArray(j) ? j : j.data || j.models || [];
      return Array.from(new Set(list.map((m) => String((m && (m.id || m.name)) || '').replace(/^models\//, '')).filter((n) => n && !/embed|tts|whisper|dall-e|image|audio|moderation|realtime|transcri|rerank|guard/i.test(n)))).sort();
    },

    // texto alternativo para una imagen (lo usa el comprobador de accesibilidad)
    async describeImage(src) {
      const img = await imageSource(src);
      const content = [img, { type: 'text', text: 'Escribe el texto alternativo de esta imagen para personas que usan lector de pantalla: una sola frase en español, concreta, de menos de 125 caracteres, sin empezar por «Imagen de» ni «Foto de». Si contiene texto importante, inclúyelo. Responde solo con el texto alternativo.' }];
      const r = await this.complete({ content, effort: 'low', maxTokens: 4000, system: 'Describes imágenes para hacer documentos accesibles. Respondes solo con el texto pedido.' });
      return r.text.trim().replace(/^["«“]|["»”]$/g, '').trim();
    },

    // ------------------------------------------------------------ panel lateral
    open(actionId) {
      const C = PT.chrome;
      if (C._panel !== 'ai' || C.els.side.hidden) C.showPanel('ai');
      if (actionId) setTimeout(() => this.runAction(actionId), 0);
    },
    // ámbito de trabajo según la selección y la acción
    scopeFor(kind) {
      const a = A(), ed = a.editor, doc = a.doc;
      if (!ed || !ed.sel) return null;
      const [from, to] = O.ordered(doc, ed.sel);
      const story = ed.story;
      // las imágenes van como «[Imagen: descripción]»: su contenido en base64 solo gastaría tókenes y confundiría al modelo
      const lite = (t) => t.replace(/!\[([^\]]*)\]\((?:data:[^)]*|[^)]*)\)/g, (m0, alt) => '[Imagen' + (alt ? ': ' + alt : '') + ']');
      const md = (x, y) => lite(PT.convert.toMarkdown(doc, O.slice(doc, x, y)).trim());
      const want = this._scope && this._scope !== 'auto' ? this._scope : null;
      if (kind === 'before' && !want) {
        const ids = doc.parasOf(story);
        const k = ids.indexOf(to.id);
        const start = { id: ids[Math.max(0, k - 30)], off: 0 };
        let text = md(start, to);
        if (text.length > 12000) text = text.slice(-12000);
        return { kind: 'before', label: 'el texto anterior al cursor', from: to, to, text, story, editor: ed };
      }
      if ((want === 'sel' || !want) && !O.same(from, to)) {
        const text = md(from, to);
        return { kind: 'sel', label: 'la selección', from, to, text, story, editor: ed };
      }
      if (want === 'doc' || (!want && kind === 'doc')) {
        const ids = doc.parasOf(story);
        const first = { id: ids[0], off: 0 }, lastId = ids[ids.length - 1], last = { id: lastId, off: PT.para.len(doc.block(lastId)) };
        // «insertar debajo» de un resumen o un esquema va bajo el párrafo del cursor, no al final
        return { kind: 'doc', label: story === 'body' ? 'todo el documento' : 'todo este texto', from: first, to: last, caret: to, text: story === 'body' ? lite(PT.convert.toMarkdown(doc).trim()) : md(first, last), story, editor: ed };
      }
      const p = doc.block(to.id);
      const pa = { id: p.id, off: 0 }, pb = { id: p.id, off: PT.para.len(p) };
      return { kind: 'para', label: 'el párrafo actual', from: pa, to: pb, text: md(pa, pb), story, editor: ed };
    },
    runAction(id, extra) {
      const act = ACTIONS.find((x) => x.id === id);
      if (!act) return;
      if (act.ask === 'lang' && !extra) {
        const anchor = PT.chrome.els.side.querySelector('[data-act="translate"]') || PT.chrome.els.side;
        ui.menu(LANGS.map((l) => ({ label: l[0].toUpperCase() + l.slice(1), action: () => this.runAction('translate', l) })), anchor);
        return;
      }
      const prompt = act.ask === 'lang' ? 'Traduce el texto al ' + extra + ', conservando el formato Markdown.' : act.p;
      this.ask({ instruction: prompt, scopeKind: act.scope || 'auto', put: act.put, title: act.ask === 'lang' ? 'Traducir al ' + extra : act.l });
    },
    async ask(o) {
      if (!this.ready()) { this.configure(() => this.open()); return; }
      if (this.busy) this.busy.abort();
      const scope = this.scopeFor(o.scopeKind || 'auto');
      if (!scope) { ui.toast('Coloca el cursor en el documento.'); return; }
      const free = !!o.free;
      // una petición libre sin selección no se refiere al párrafo del cursor: el resultado se inserta ahí
      const hasText = !!(scope.text && scope.text.trim()) && !(free && scope.kind === 'para' && (this._scope || 'auto') === 'auto');
      const words = PT.countWords(scope.text || '');
      if (scope.text && scope.text.length > 600000) { ui.alert('El texto es demasiado largo para enviarlo de una vez (' + words.toLocaleString('es-ES') + ' palabras). Selecciona una parte del documento.', 'Asistente de IA'); return; }
      const doc = A().doc;
      const ctx = 'Documento: «' + (doc.meta.title || 'sin título') + '».';
      const prompt = ctx + '\n\nPetición: ' + o.instruction + (hasText ? '\n\n<texto>\n' + scope.text + '\n</texto>' : '');
      const ctrl = new AbortController();
      this.busy = ctrl;
      const run = this.last = { title: o.title || 'Petición', instruction: o.instruction, scope, put: o.put || (hasText && scope.kind !== 'before' ? 'replace' : 'after'), text: '', status: 'Enviando…', think: '', done: false, error: null, started: Date.now(), free, hasText };
      if (!hasText) { run.put = 'after'; scope.from = scope.to = O.ordered(doc, scope.editor.sel)[1]; }
      this.paintResult();
      try {
        const r = await this.complete({
          prompt, signal: ctrl.signal,
          onStatus: (s) => { run.status = s; this.paintStatus(); },
          onThink: (t) => { run.think = t; this.paintStatus(); },
          onText: (t) => { run.text = t; this.paintText(); },
        });
        run.text = cleanAnswer(r.text);
        run.model = r.model; run.usage = r.usage; run.stop = r.stop; run.fellBack = r.fellBack;
        run.status = r.stop === 'max_tokens' ? 'Respuesta cortada por longitud' : 'Listo';
      } catch (e) {
        if (e.name === 'AbortError') { run.status = 'Detenido'; }
        else { run.error = e.message; run.status = 'Error'; }
      } finally {
        run.done = true;
        if (this.busy === ctrl) this.busy = null;
        this.paintResult();
      }
    },
    stop() { if (this.busy) this.busy.abort(); },

    // aplica el resultado: 'replace' | 'below' | 'after' | 'suggest'
    async apply(mode, sure) {
      const run = this.last;
      if (!run || !run.text.trim()) return;
      const a = A(), doc = a.doc, scope = run.scope, ed = scope.editor;
      // el texto de la IA no trae las imágenes ni las fichas: avisar antes de sustituirlas
      if ((mode === 'replace' || mode === 'suggest') && !sure && scope.from && scope.to && doc.block(scope.from.id) && doc.block(scope.to.id)) {
        const hasObj = O.parasIn(doc, scope.from, scope.to).some(({ p, from: x, to: y }) => R.text(p.runs).slice(x, y).includes(PT.OBJ));
        if (hasObj && !(await ui.confirm('El texto que vas a sustituir contiene imágenes, fichas u otros objetos que el asistente no puede reproducir y se perderían. ¿Sustituirlo de todos modos? (Con «Insertar debajo» se conservan.)', { title: 'Asistente de IA', ok: 'Sustituir' }))) return;
      }
      if (a.readOnly) { ui.toast('El documento está en modo de solo lectura.'); return; }
      if (ed !== a.editor) { ui.toast('Vuelve al texto donde hiciste la petición para aplicar el resultado.'); return; }
      const parsed = PT.convert.fromMarkdown(run.text);
      const blocks = parsed.body.map((b) => markAI(PT.cloneBlock(b)));
      ed.mergeStyles({ lists: parsed.lists });
      // si el texto cambió mientras tanto, se usa la selección actual
      const valid = (p) => p && doc.block(p.id) && p.off <= PT.para.len(doc.block(p.id));
      let from = scope.from, to = scope.to;
      if (mode === 'below' && scope.kind === 'doc' && valid(scope.caret)) from = to = scope.caret;
      if (!valid(from) || !valid(to) || doc.cmp(from, to) > 0) { [from, to] = O.ordered(doc, ed.sel); ui.toast('El texto cambió mientras respondía el asistente: se usa la posición actual del cursor.'); }
      const slice = blocks.length === 1 && blocks[0].t === 'p' && (mode === 'after' || scope.kind === 'sel') ? { inline: true, runs: blocks[0].runs } : { blocks };
      // reescrituras: solo se tocan las palabras que cambian (se conserva el formato y, como sugerencia, se revisa palabra a palabra)
      const plans = mode === 'replace' || mode === 'suggest' ? wordPlans(doc, from, to, blocks) : null;
      if (plans && !plans.some((pl) => pl.oldText !== pl.newText)) { ui.toast('El asistente no propone ningún cambio en el texto.'); return; }
      a.focusEditor();
      const label = mode === 'suggest' ? 'Sugerencia de la IA' : 'Asistente de IA';
      const go = () => ed.exec(label, () => {
        if (plans) return applyPlans(doc, plans);
        if (mode === 'below') {
          const end = { id: to.id, off: PT.para.len(doc.block(to.id)) };
          const at = O.split(doc, end);
          return O.insertSlice(doc, O.caret(at), { blocks });
        }
        if (mode === 'after') {
          const lead = slice.inline && to.off > 0 && !/\s$/.test(doc.paraText(to.id).slice(0, to.off)) ? [{ x: ' ', m: M.intern({ src: 'ai' }) }] : [];
          return O.insertSlice(doc, O.caret(to), slice.inline ? { inline: true, runs: lead.concat(slice.runs) } : slice);
        }
        return O.insertSlice(doc, { a: from, h: to }, slice);
      });
      if (mode === 'suggest') {
        const prevTrack = doc.track, prevAuthor = O.author;
        doc.track = true; O.author = () => 'Asistente IA';
        try { go(); } finally { doc.track = prevTrack; O.author = prevAuthor; PT.chrome.updateAll(); }
        ui.toast('Sugerencia aplicada como cambios controlados: acéptala o recházala en Revisar.');
      } else go();
      run.applied = mode;
      this.paintResult();
    },

    render(side) {
      const C = PT.chrome;
      const head = h('div.side-head', h('span', 'Asistente de IA'),
        C.tbButton('gear', 'Configurar el asistente', () => this.configure()),
        C.tbButton('close', 'Cerrar panel', () => C.closePanel()));
      if (!this.ready()) {
        side.replaceChildren(head, h('div.ai-body',
          h('div.ai-intro',
            h('p', h('b', 'Escribe mejor con un asistente de IA.'), ' Mejora, corrige, resume, traduce o continúa tu texto; pide un esquema, preguntas de repaso o lo que necesites.'),
            h('p.muted', 'Funciona con tu propia clave de Claude, OpenAI, Gemini, Mistral, DeepSeek, Groq, OpenRouter y otros servicios, o con un modelo local de Ollama o LM Studio, sin que el texto salga de tu equipo. Lo que propone la IA puede aplicarse como sugerencia con control de cambios y queda marcado en la autoría del texto.'),
            h('button.btn.primary', { type: 'button', onclick: () => this.configure() }, 'Configurar el asistente'))));
        return;
      }
      const scopeSel = ui.select([['auto', 'Automático'], ['sel', 'La selección'], ['para', 'El párrafo actual'], ['doc', 'Todo el documento']], this._scope || 'auto', (v) => { this._scope = v; this.paintScope(); });
      scopeSel.classList.add('ai-scope-sel');
      const chips = h('div.ai-actions', ACTIONS.map((act) => {
        const b = h('button.ai-chip', { type: 'button', title: act.l, 'data-act': act.id }, ui.icon(act.i, 14), h('span', act.l));
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', () => this.runAction(act.id));
        return b;
      }));
      const ta = h('textarea.inp.ai-prompt', { rows: 3, placeholder: 'Pide lo que quieras: «escribe una introducción», «convierte esto en una tabla», «redacta un correo para…»', 'aria-label': 'Petición al asistente' });
      const send = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } this.ask({ instruction: t, free: true, title: t.length > 60 ? t.slice(0, 57) + '…' : t }); };
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
      this.els = { scope: h('div.ai-scope'), out: h('div.ai-out'), ta };
      side.replaceChildren(head, h('div.ai-body',
        h('div.ai-scope-row', h('span.muted', 'Trabajar con'), scopeSel), this.els.scope,
        chips,
        h('div.ai-ask', ta, h('div.row', h('span.muted.small', this.label()), h('span.grow'), h('button.btn.primary.small', { type: 'button', onclick: send }, 'Enviar'))),
        this.els.out));
      this.paintScope();
      this.paintResult();
    },
    update() { this.paintScope(); },
    paintScope() {
      if (!this.els || !this.els.scope.isConnected) return;
      const s = this.scopeFor(this._scope === 'doc' ? 'doc' : 'auto');
      const n = s && s.text ? PT.countWords(s.text) : 0;
      this.els.scope.textContent = s ? 'Ahora: ' + s.label + (n ? ' · ' + n.toLocaleString('es-ES') + (n === 1 ? ' palabra' : ' palabras') : '') : '';
    },
    paintStatus() {
      const el = this.els && this.els.out.querySelector('.ai-status');
      if (!el || !this.last) return;
      el.querySelector('.ai-status-text').textContent = this.last.status;
      const th = this.els.out.querySelector('.ai-think');
      if (th) { const t = this.last.think.trim(); th.textContent = t ? t.split('\n').filter(Boolean).slice(-1)[0].slice(0, 180) : ''; th.hidden = !t || !!this.last.text; }
    },
    paintText() {
      const el = this.els && this.els.out.querySelector('.ai-text');
      if (!el || !this.last) { this.paintResult(); return; }
      el.textContent = this.last.text;
      el.scrollTop = el.scrollHeight;
      this.paintStatus();
    },
    paintResult() {
      if (!this.els || !this.els.out.isConnected) return;
      const run = this.last, out = this.els.out;
      if (!run) { out.replaceChildren(h('p.muted.ai-hint', 'Elige una acción o escribe una petición. El resultado aparecerá aquí y podrás decidir cómo aplicarlo.')); return; }
      const busy = !run.done;
      const status = h('div.ai-status' + (run.error ? '.err' : ''), busy ? h('span.ai-spin') : null, h('span.ai-status-text', run.status), h('span.grow'),
        busy ? h('button.btn.small', { type: 'button', onclick: () => this.stop() }, 'Detener') : null);
      const items = [h('div.ai-title', run.title), status, h('div.ai-think.muted', { hidden: true })];
      if (run.error) items.push(h('p.ai-error', run.error), h('div.row', h('button.btn.small', { type: 'button', onclick: () => this.configure() }, 'Revisar la configuración')));
      items.push(h('div.ai-text', run.text));
      if (run.done && run.text.trim()) {
        const btn = (label, mode, primary, title) => h('button.btn.small' + (primary ? '.primary' : ''), { type: 'button', title: title || label, onclick: () => this.apply(mode) }, label);
        const canReplace = run.scope.kind !== 'before' && run.hasText;
        items.push(h('div.ai-apply',
          canReplace ? btn('Reemplazar', 'replace', run.put === 'replace', 'Sustituye ' + run.scope.label) : null,
          btn(run.scope.kind === 'before' || !canReplace ? 'Insertar' : run.scope.kind === 'doc' ? 'Insertar bajo el cursor' : 'Insertar debajo', run.scope.kind === 'before' || !canReplace ? 'after' : 'below', run.put !== 'replace'),
          canReplace ? btn('Como sugerencia', 'suggest', false, 'Aplica el cambio con control de cambios para revisarlo') : null,
          h('button.btn.small', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(run.text); ui.toast('Copiado.'); } catch (e) { ui.toast('No se pudo copiar.'); } } }, 'Copiar'),
          h('button.btn.small', { type: 'button', onclick: () => { this.last = null; this.paintResult(); } }, 'Descartar')));
        const u = run.usage || {};
        items.push(h('div.ai-meta.muted', (run.model || '') + (u.output_tokens ? ' · ' + ((u.input_tokens || 0) + (u.output_tokens || 0)).toLocaleString('es-ES') + ' tókenes' : '') + (run.fellBack ? ' · respondió un modelo de respaldo' : '') + (run.applied ? ' · aplicado' : '')));
      }
      out.replaceChildren(...items.filter(Boolean));
      this.paintStatus();
      const tx = out.querySelector('.ai-text');
      if (tx) tx.scrollTop = tx.scrollHeight;
    },
  });

  // ------------------------------------------------------------ utilidades
  // por qué no conecta Ollama: al abrir el archivo con doble clic el navegador se presenta como «null»
  function ollamaHelp(c) {
    if (location.protocol === 'file:') return 'Ollama no acepta peticiones de una página abierta como archivo (doble clic). Solución: en Windows ejecuta «setx OLLAMA_ORIGINS *» en una consola, cierra Ollama desde la bandeja del sistema y vuelve a abrirlo; o abre el procesador desde un servidor local.';
    return 'No se pudo conectar con Ollama en ' + c.ollama + '. Comprueba que está en marcha («ollama serve») y que la dirección es correcta.';
  }
  // modelos instalados en Ollama que sirven para escribir (sin los de «embeddings»)
  ai.ollamaModels = async function (url) {
    const r = await fetch((url || ai.config().ollama) + '/api/tags');
    if (!r.ok) throw new Error('Ollama respondió ' + r.status);
    const j = await r.json();
    return (j.models || []).map((m) => m.name).filter((n) => !/embed/i.test(n)).sort();
  };
  // eventos del flujo SSE de la API
  async function* sse(resp) {
    const reader = resp.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of chunk.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
        if (!data) continue;
        let json; try { json = JSON.parse(data); } catch (e) { continue; }
        yield { ev, data: json };
      }
    }
  }
  function apiMessage(type, msg) {
    switch (type) {
      case 'authentication_error': return 'La clave de API no es válida. Revísala en la configuración del asistente.';
      case 'permission_error': return 'Tu clave no tiene permiso para usar este modelo.';
      case 'not_found_error': return 'El modelo elegido no existe o no está disponible para tu cuenta.';
      case 'rate_limit_error': return 'Has alcanzado el límite de uso de la API. Espera un momento y vuelve a intentarlo.';
      case 'overloaded_error': return 'El servicio está saturado ahora mismo. Inténtalo de nuevo en unos segundos.';
      case 'request_too_large': return 'El texto es demasiado largo para una sola petición. Selecciona una parte.';
      default: return 'La API respondió con un error' + (msg ? ': ' + msg : '.');
    }
  }
  // errores de los proveedores compatibles con OpenAI (cada uno responde con un formato algo distinto)
  async function compatError(resp, name, model) {
    let msg = '';
    try { const j = await resp.json(); const e = Array.isArray(j) ? j[0] && j[0].error : j.error; msg = (e && (e.message || e.msg)) || j.message || j.detail || (typeof e === 'string' ? e : ''); } catch (e) { /* sin cuerpo JSON */ }
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    switch (resp.status) {
      case 401: return 'La clave de API de ' + name + ' no es válida. Revísala en la configuración del asistente.';
      case 402: return name + ': no queda saldo en la cuenta.';
      case 403: return name + ': la clave no tiene permiso para usar este modelo.';
      case 404: return name + ' no encuentra el modelo «' + model + '». Usa «Buscar modelos disponibles» en la configuración.';
      case 429: return name + ': límite de uso alcanzado o sin saldo. Espera un momento y vuelve a intentarlo.';
      default: return name + ' respondió con un error ' + resp.status + (msg ? ': ' + msg.slice(0, 200) : '.');
    }
  }
  async function httpError(resp) {
    let type = '', msg = '';
    try { const j = await resp.json(); type = j.error && j.error.type; msg = j.error && j.error.message; } catch (e) { /* sin cuerpo JSON */ }
    if (!type) type = { 401: 'authentication_error', 403: 'permission_error', 404: 'not_found_error', 413: 'request_too_large', 429: 'rate_limit_error', 529: 'overloaded_error' }[resp.status] || '';
    return apiMessage(type, msg || 'código ' + resp.status);
  }
  // quita envoltorios habituales (bloque de código o comillas que rodean toda la respuesta)
  function cleanAnswer(t) {
    let s = String(t || '').trim();
    const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(s);
    if (fence) s = fence[1].trim();
    return s;
  }
  // ¿se puede aplicar la respuesta como ediciones palabra a palabra? Mismo número de párrafos, sin tablas,
  // sin objetos en el texto original y sin que la IA cambie el estilo o la lista de los párrafos
  function wordPlans(doc, from, to, blocks) {
    if (!PT.compare || !blocks.length || blocks.some((b) => b.t !== 'p' || (b.st && b.st !== 'normal') || b.ls)) return null;
    const segs = O.parasIn(doc, from, to).filter((s) => s.to > s.from || s.p.id === from.id);
    if (segs.length !== blocks.length) return null;
    const plans = [];
    for (let i = 0; i < segs.length; i++) {
      const { p, from: a, to: b } = segs[i];
      const oldText = R.text(p.runs).slice(a, b);
      if (oldText.includes(PT.OBJ) || p.runs.some((r) => r.m.del)) return null;
      plans.push({ id: p.id, base: a, oldText, newText: R.text(blocks[i].runs.filter((r) => !r.o)) });
    }
    return plans;
  }
  // aplica las ediciones de cada párrafo, del final al principio para que las posiciones sigan valiendo
  function applyPlans(doc, plans) {
    const weight = (t) => (/^\s+$/.test(t) ? 1 : /^[\p{L}\p{N}_]+$/u.test(t) ? 4 : 2);
    let last = null;
    for (let i = plans.length - 1; i >= 0; i--) {
      const pl = plans[i];
      const A = PT.compare.tokens(pl.oldText), B = PT.compare.tokens(pl.newText);
      const ops = PT.compare.diffSeq(A.map((t) => t.s), B.map((t) => t.s), null, weight);
      const endA = (k) => (k + 1 < A.length ? A[k + 1].at : pl.oldText.length), endB = (k) => (k + 1 < B.length ? B[k + 1].at : pl.newText.length);
      const regions = [];
      let posA = 0, k = 0;
      while (k < ops.length) {
        if (ops[k][0] === '=') { posA = endA(ops[k][1]); k++; continue; }
        let a0 = posA, a1 = posA, b0 = -1, b1 = -1;
        while (k < ops.length && ops[k][0] !== '=') {
          const [t, x, y] = ops[k];
          if (t === '-') { if (a1 === posA && a0 === posA) a0 = A[x].at; a1 = endA(x); posA = a1; }
          else { if (b0 < 0) b0 = B[y].at; b1 = endB(y); }
          k++;
        }
        regions.push({ a0, a1, text: b0 < 0 ? '' : pl.newText.slice(b0, b1) });
      }
      for (let r = regions.length - 1; r >= 0; r--) {
        const rg = regions[r];
        const s = { id: pl.id, off: pl.base + rg.a0 }, e = { id: pl.id, off: pl.base + rg.a1 };
        const marks = M.with(O.typingMarks(doc, s), { src: 'ai' });
        const end = O.insertText(doc, { a: s, h: e }, rg.text, marks);
        if (!last) last = end;
      }
      if (!last) last = { id: pl.id, off: pl.base + pl.oldText.length };
    }
    return last;
  }
  // marca la autoría «IA» en los tramos de un bloque (también en tablas)
  function markAI(b) {
    if (b.t === 'p') b.runs = R.normalize(b.runs.map((r) => (r.o ? { o: r.o, m: M.with(r.m, { src: 'ai' }) } : { x: r.x, m: M.with(r.m, { src: 'ai' }) })));
    else if (b.t === 'table') for (const row of b.rows) for (const c of row.cells) c.blocks = (c.blocks || []).map(markAI);
    return b;
  }
  // imagen para la API: base64 (PNG, JPEG, GIF, WebP) o por dirección web; los SVG se convierten a PNG
  async function imageSource(src) {
    const m = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(src || '');
    if (m && /^image\/(png|jpeg|gif|webp)$/.test(m[1])) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
    if (/^https?:/i.test(src || '') && ai.config().provider !== 'ollama') return { type: 'image', source: { type: 'url', url: src } };
    const png = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.naturalWidth || 600; cv.height = im.naturalHeight || 400; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); try { res(cv.toDataURL('image/png')); } catch (e) { rej(new Error('No se pudo leer la imagen.')); } };
      im.onerror = () => rej(new Error('No se pudo leer la imagen.'));
      im.crossOrigin = 'anonymous'; im.src = src;
    });
    return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.split(',')[1] } };
  }
  ai.ACTIONS = ACTIONS;

  // panel registrado en el marco de la aplicación
  (PT.panels = PT.panels || {}).ai = { render: (side) => ai.render(side), update: () => ai.update(), onClose: () => {} };
})();
