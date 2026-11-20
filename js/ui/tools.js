/* Herramientas y diálogos generales: símbolos y emoji, ecuaciones, recuento de palabras y legibilidad,
   preferencias, idioma, propiedades, versiones, biblioteca, plantillas, atajos, guía, lectura en voz alta y dictado. */
(function () {
  'use strict';
  const PT = window.PT, O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para, ui = PT.ui, h = ui.h;
  const A = () => PT.app;
  const row = (...kids) => h('div.row', ...kids);

  // ---------------------------------------------------------------- datos: emoji (nombre y palabras clave)
  PT.EMOJI = [
    ['😀', 'sonrisa feliz cara'], ['😃', 'alegre sonrisa'], ['😄', 'risa ojos'], ['😁', 'radiante dientes'], ['😂', 'lagrimas risa carcajada'], ['🤣', 'revolcarse risa'], ['😊', 'sonrojado sonrisa'], ['😇', 'angel inocente'],
    ['🙂', 'sonrisa leve'], ['😉', 'guino guiño'], ['😍', 'enamorado corazones'], ['🥰', 'cariño amor'], ['😘', 'beso'], ['😋', 'delicioso rico'], ['😎', 'gafas genial'], ['🤓', 'empollon gafas'],
    ['🤔', 'pensando duda'], ['🤨', 'ceja sospecha'], ['😐', 'neutral serio'], ['😴', 'dormir sueño'], ['😌', 'aliviado tranquilo'], ['😅', 'sudor nervios'], ['😬', 'mueca'], ['🙄', 'ojos blanco'],
    ['😢', 'triste llorar lagrima'], ['😭', 'llanto'], ['😡', 'enfadado ira'], ['🤯', 'explota mente sorpresa'], ['😱', 'grito miedo'], ['🥳', 'fiesta celebracion'], ['🤗', 'abrazo'], ['🤝', 'acuerdo manos trato'],
    ['👍', 'bien pulgar ok si'], ['👎', 'mal pulgar no'], ['👏', 'aplausos'], ['🙌', 'manos arriba celebrar'], ['🙏', 'gracias por favor rezar'], ['💪', 'fuerza musculo'], ['👋', 'hola adios mano'], ['✌️', 'paz victoria'],
    ['👀', 'ojos mirar'], ['🧠', 'cerebro idea'], ['❤️', 'corazon amor rojo'], ['💙', 'corazon azul'], ['💚', 'corazon verde'], ['💛', 'corazon amarillo'], ['💔', 'corazon roto'], ['🔥', 'fuego tendencia'],
    ['⭐', 'estrella'], ['✨', 'brillos magia'], ['🎉', 'fiesta confeti'], ['🎂', 'cumpleaños tarta'], ['🎁', 'regalo'], ['🏆', 'trofeo premio ganador'], ['🥇', 'oro medalla primero'], ['🎯', 'diana objetivo meta'],
    ['✅', 'hecho check correcto'], ['☑️', 'casilla marcada'], ['❌', 'error equis no'], ['⚠️', 'aviso advertencia'], ['❗', 'exclamacion importante'], ['❓', 'pregunta interrogacion'], ['💡', 'idea bombilla'], ['📌', 'chincheta fijar'],
    ['📎', 'clip adjunto'], ['📝', 'nota escribir memo'], ['📄', 'documento pagina'], ['📁', 'carpeta'], ['📅', 'calendario fecha'], ['⏰', 'alarma reloj hora'], ['⌛', 'reloj arena espera'], ['📈', 'grafico subida crecimiento'],
    ['📉', 'grafico bajada'], ['📊', 'barras estadisticas'], ['💼', 'maletin trabajo'], ['💻', 'portatil ordenador computadora'], ['📱', 'movil telefono celular'], ['✉️', 'sobre correo carta'], ['📧', 'email correo'], ['📞', 'telefono llamada'],
    ['🔒', 'candado seguridad'], ['🔑', 'llave clave'], ['🔗', 'enlace vinculo'], ['🔍', 'lupa buscar'], ['⚙️', 'engranaje ajustes'], ['🛠️', 'herramientas'], ['🚀', 'cohete lanzamiento'], ['✈️', 'avion viaje'],
    ['🚗', 'coche auto'], ['🏠', 'casa hogar'], ['🏢', 'oficina edificio'], ['🏫', 'escuela colegio'], ['🌍', 'mundo tierra planeta'], ['☀️', 'sol'], ['🌧️', 'lluvia'], ['❄️', 'nieve frio'],
    ['🌱', 'planta brote'], ['🌳', 'arbol'], ['🌸', 'flor cerezo'], ['🍎', 'manzana'], ['☕', 'cafe'], ['🍕', 'pizza'], ['🎵', 'musica nota'], ['📚', 'libros estudiar'],
    ['🎓', 'graduacion birrete'], ['✏️', 'lapiz'], ['🖊️', 'boligrafo'], ['📣', 'megafono anuncio'], ['🔔', 'campana notificacion'], ['💬', 'bocadillo mensaje chat'], ['💯', 'cien perfecto'], ['➡️', 'flecha derecha'],
    ['⬅️', 'flecha izquierda'], ['⬆️', 'flecha arriba'], ['⬇️', 'flecha abajo'], ['🔴', 'circulo rojo'], ['🟢', 'circulo verde'], ['🟡', 'circulo amarillo'], ['🔵', 'circulo azul'], ['⚪', 'circulo blanco'],
    ['🐶', 'perro'], ['🐱', 'gato'], ['🦄', 'unicornio'], ['🐝', 'abeja'], ['⚽', 'futbol balon'], ['🏀', 'baloncesto'], ['🎨', 'arte pintura paleta'], ['🎬', 'cine claqueta'],
  ];
  const SYMBOLS = {
    'Puntuación': '¿¡«»“”‘’„‚…–—•·§¶†‡‰′″‹›¦©®™℗',
    'Moneda': '€$£¥¢₩₹₽₺₿₱₡₲₴₦',
    'Matemáticas': '±×÷≠≈≡≤≥∞√∛∑∏∫∮∂∆∇∈∉∋⊂⊃⊆⊇∪∩∧∨¬∀∃∅∝∠⊥∥°′″‰½⅓⅔¼¾⅛¹²³⁴⁵ⁿ₀₁₂₃',
    'Griego': 'αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ',
    'Flechas': '←→↑↓↔↕⇐⇒⇑⇓⇔↖↗↘↙↩↪⟶⟵➔➜➤',
    'Formas y marcas': '✓✔✗✘☐☑☒★☆♠♣♥♦●○◆◇■□▲△▼▽◀▶♪♫☎✉✂✏⌚⌛☀☁☂☃♀♂⚠',
    'Letras': 'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÂÊÎÔÛâêîôûÇçÆæŒœØøÅåßÐðÞþªº',
  };

  // ---------------------------------------------------------------- ecuaciones: subconjunto de LaTeX -> MathML
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
  const OPS = { pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', forall: '∀', exists: '∃', partial: '∂', nabla: '∇', ldots: '…', cdots: '⋯', degree: '°', propto: '∝', angle: '∠', perp: '⊥', neg: '¬', land: '∧', lor: '∨', emptyset: '∅' };
  const BIG = { sum: '∑', prod: '∏', int: '∫', oint: '∮', iint: '∬', lim: 'lim', max: 'max', min: 'min', log: 'log', ln: 'ln', sin: 'sin', cos: 'cos', tan: 'tan', exp: 'exp' };
  PT.math = {
    toMathML(tex) {
      const s = String(tex || '');
      let i = 0;
      const esc = PT.esc;
      const peek = () => s[i];
      const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
      const group = () => {
        skip();
        if (s[i] === '{') { i++; const out = seq('}'); i++; return '<mrow>' + out + '</mrow>'; }
        return atom();
      };
      const cmd = () => {
        i++;
        let name = '';
        while (i < s.length && /[a-zA-Z]/.test(s[i])) name += s[i++];
        if (!name && i < s.length) name = s[i++];
        if (name === 'frac') { const a = group(), b = group(); return '<mfrac>' + a + b + '</mfrac>'; }
        if (name === 'sqrt') { skip(); if (s[i] === '[') { i++; let idx = ''; while (i < s.length && s[i] !== ']') idx += s[i++]; i++; return '<mroot>' + group() + '<mn>' + esc(idx) + '</mn></mroot>'; } return '<msqrt>' + group() + '</msqrt>'; }
        if (name === 'text' || name === 'mathrm') { skip(); let t = ''; if (s[i] === '{') { i++; while (i < s.length && s[i] !== '}') t += s[i++]; i++; } return '<mtext>' + esc(t) + '</mtext>'; }
        if (name === 'left' || name === 'right') { skip(); const ch = s[i++] || ''; return ch === '.' ? '' : '<mo stretchy="true">' + esc(ch === '\\' ? s[i++] : ch) + '</mo>'; }
        if (name === 'vec' || name === 'hat' || name === 'bar' || name === 'overline') { const acc = { vec: '→', hat: '^', bar: '¯', overline: '¯' }[name]; return '<mover accent="true">' + group() + '<mo>' + acc + '</mo></mover>'; }
        if (name === ',' || name === ';' || name === 'quad') return '<mspace width="' + (name === 'quad' ? '1em' : '0.3em') + '"/>';
        if (name === '{' || name === '}') return '<mo>' + name + '</mo>';
        if (GREEK[name]) return '<mi>' + GREEK[name] + '</mi>';
        if (OPS[name]) return '<mo>' + OPS[name] + '</mo>';
        if (BIG[name]) return BIG[name].length === 1 ? '<mo largeop="true">' + BIG[name] + '</mo>' : '<mi>' + BIG[name] + '</mi>';
        return '<mi>' + esc(name) + '</mi>';
      };
      const atom = () => {
        skip();
        const c = peek();
        if (c == null) return '';
        if (c === '\\') return cmd();
        if (/[0-9.,]/.test(c)) { let n = ''; while (i < s.length && /[0-9.,]/.test(s[i])) n += s[i++]; return '<mn>' + esc(n) + '</mn>'; }
        if (/[a-zA-ZÀ-ɏ]/.test(c)) { i++; return '<mi>' + esc(c) + '</mi>'; }
        i++;
        return '<mo>' + esc(c) + '</mo>';
      };
      const seq = (end) => {
        let out = '';
        while (i < s.length && s[i] !== end) {
          skip();
          if (i >= s.length || s[i] === end) break;
          let base = s[i] === '{' ? group() : atom();
          skip();
          let sub = null, sup = null;
          for (let k = 0; k < 2; k++) { if (s[i] === '_') { i++; sub = group(); skip(); } else if (s[i] === '^') { i++; sup = group(); skip(); } }
          const big = /largeop|>lim</.test(base);
          if (sub && sup) out += big ? '<munderover>' + base + sub + sup + '</munderover>' : '<msubsup>' + base + sub + sup + '</msubsup>';
          else if (sub) out += big ? '<munder>' + base + sub + '</munder>' : '<msub>' + base + sub + '</msub>';
          else if (sup) out += big ? '<mover>' + base + sup + '</mover>' : '<msup>' + base + sup + '</msup>';
          else out += base;
        }
        return out;
      };
      try { return '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>' + seq(null) + '</mrow></math>'; } catch (e) { return esc(s); }
    },
    // texto lineal aproximado (para exportar a formatos sin ecuaciones)
    toText(tex) {
      return String(tex || '').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
        .replace(/\\([a-zA-Z]+)/g, (m, n) => GREEK[n] || OPS[n] || BIG[n] || n).replace(/[{}]/g, '');
    },
  };

  const dlg = PT.dlg;
  Object.assign(dlg, {
    // ------------------------------------------------------------ símbolos y emoji
    symbols(tab) {
      const a = A();
      const insert = (t) => { a.focusEditor(); a.edit('Insertar símbolo', () => O.insertText(a.doc, a.editor.sel, t)); recent(t); };
      const recentList = () => { try { return JSON.parse(PT.LS.get('pt.recentSym') || '[]'); } catch (e) { return []; } };
      const recent = (t) => { const l = recentList().filter((x) => x !== t); l.unshift(t); PT.LS.set('pt.recentSym', JSON.stringify(l.slice(0, 20))); };
      const grid = (chars, cls) => h('div.sym-grid' + (cls ? '.' + cls : ''), ...chars.map((c) => {
        const ch = Array.isArray(c) ? c[0] : c;
        const b = h('button.sym', { type: 'button', title: Array.isArray(c) ? c[1].split(' ')[0] : 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') }, ch);
        b.addEventListener('click', () => insert(ch));
        return b;
      }));
      const sections = [];
      const rc = recentList();
      if (rc.length) sections.push(h('div.field-label', 'Usados recientemente'), grid(rc));
      for (const k in SYMBOLS) sections.push(h('div.field-label', k), grid(Array.from(SYMBOLS[k])));
      const q = h('input.inp', { type: 'search', placeholder: 'Buscar emoji (por ejemplo: corazón, fiesta, idea)' });
      const egrid = h('div');
      const fill = () => { const f = PT.fold(q.value.toLowerCase().trim()); egrid.replaceChildren(grid(PT.EMOJI.filter(([e, n]) => !f || PT.fold(n).includes(f)), 'emoji')); };
      q.addEventListener('input', fill);
      fill();
      const code = h('input.inp', { type: 'text', placeholder: 'Código Unicode, por ejemplo 2603 o U+1F600' });
      const codeBtn = h('button.btn.small', { type: 'button', onclick: () => { const m = /^(?:u\+)?([0-9a-f]{2,6})$/i.exec(code.value.trim()); if (!m) { ui.toast('Escribe un código hexadecimal.'); return; } try { insert(String.fromCodePoint(parseInt(m[1], 16))); } catch (e) { ui.toast('Código no válido.'); } } }, 'Insertar');
      ui.dialog({
        title: 'Símbolos y emoji', width: 520,
        body: ui.tabs([{ label: 'Símbolos', body: [h('div.sym-scroll', ...sections), row(code, h('div.fixed', codeBtn))] }, { label: 'Emoji', body: [q, h('div.sym-scroll', egrid), h('p.muted', 'Consejo: escribe dos puntos (:) seguidos de una palabra en el texto, por ejemplo :fiesta.')] }], tab === 'emoji' ? 1 : 0),
        buttons: [{ label: 'Cerrar', primary: true }],
      });
    },
    // ------------------------------------------------------------ ecuación
    equation() {
      const a = A(), doc = a.doc, sel = a.sel();
      if (!sel) return;
      const [x, y] = O.ordered(doc, sel);
      const p = doc.block(x.id), at = x.id === y.id && y.off === x.off + 1 ? R.at(p.runs, x.off) : null;
      const cur = at && at.run.o && at.run.o.k === 'eq' ? at.run.o : null;
      const inp = h('textarea.inp.eq-input', { rows: 3, spellcheck: false, placeholder: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' }, cur ? cur.tex : '');
      const prev = h('div.eq-preview');
      const upd = () => { prev.innerHTML = PT.math.toMathML(inp.value || ''); };
      inp.addEventListener('input', upd);
      const ex = [['Fórmula cuadrática', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'], ['Pitágoras', 'a^2 + b^2 = c^2'], ['Sumatoria', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}'], ['Integral', '\\int_0^1 x^2 \\, dx = \\frac{1}{3}'], ['Área del círculo', 'A = \\pi r^2'], ['Euler', 'e^{i\\pi} + 1 = 0']];
      const exs = h('div.preset-row', ...ex.map(([n, t]) => h('button.btn.small', { type: 'button', onclick: () => { inp.value = t; upd(); } }, n)));
      upd();
      ui.dialog({
        title: cur ? 'Editar ecuación' : 'Insertar ecuación', width: 560,
        body: [ui.field('Ecuación (notación LaTeX: \\frac{a}{b}, x^2, x_i, \\sqrt{x}, \\alpha, \\sum, \\int…)', inp), h('div.field-label', 'Vista previa'), prev, h('div.field-label', 'Ejemplos'), exs],
        buttons: [{ label: 'Cancelar' }, { label: cur ? 'Actualizar' : 'Insertar', primary: true, action: () => {
          const tex = inp.value.trim();
          if (!tex) return false;
          if (cur) a.edit('Ecuación', () => { O.updateAtom(doc, x, { tex }); return sel; });
          else a.insertAtom('Ecuación', { k: 'eq', tex });
          return undefined;
        } }],
      });
    },
    // ------------------------------------------------------------ recuento de palabras
    wordCount() {
      const a = A(), doc = a.doc, sel = a.editor.story === 'body' ? a.sel() : null;
      const hasSel = sel && !O.isCollapsed(sel);
      const s = O.stats(doc, 'body', hasSel ? sel : null);
      const fh = s.fh, level = fh >= 90 ? 'muy fácil' : fh >= 80 ? 'fácil' : fh >= 70 ? 'algo fácil' : fh >= 60 ? 'normal' : fh >= 50 ? 'algo difícil' : fh >= 30 ? 'difícil' : 'muy difícil';
      const n = (v) => Math.round(v).toLocaleString('es-ES');
      const min = (v) => (v < 1 ? 'menos de 1 min' : Math.round(v) + ' min');
      const rows = [
        ['Páginas', hasSel ? '—' : n(a.layout.count)], ['Palabras', n(s.words)], ['Caracteres (sin espacios)', n(s.noSpace)], ['Caracteres (con espacios)', n(s.chars)],
        ['Párrafos', n(s.paras)], ['Oraciones', n(s.sentences)], ['Tiempo de lectura', min(s.readMin)], ['Tiempo para leerlo en voz alta', min(s.speakMin)],
        ['Legibilidad (Fernández Huerta)', s.words ? PT.fmtNum(fh, 0) + ' · ' + level : '—'],
      ];
      ui.dialog({
        title: hasSel ? 'Recuento de la selección' : 'Recuento de palabras', width: 400,
        body: [h('table.kv-table', ...rows.map(([k, v]) => h('tr', h('td', k), h('td', v)))), h('p.muted', 'La legibilidad va de 0 (muy difícil) a 100 (muy fácil) y está pensada para textos en español.')],
        buttons: [{ label: 'Cerrar', primary: true }],
      });
    },
    // ------------------------------------------------------------ preferencias
    settings(tab) {
      const a = A(), s = Object.assign({}, a.settings);
      const author = h('input.inp', { type: 'text', value: s.author || '', placeholder: 'Tu nombre (para comentarios y cambios)' });
      const units = ui.select([['cm', 'Centímetros'], ['in', 'Pulgadas']], s.units || 'cm');
      const dark = ui.check('Tema oscuro', !!s.dark);
      const spell = ui.check('Revisar la ortografía mientras escribo', s.spell !== false);
      const paper = ui.select(Object.keys(PT.PAPER).map((k) => [k, PT.PAPER[k].name]), s.paper || 'A4');
      const ck = (label, key, def) => { const c = ui.check(label, s[key] == null ? def : !!s[key]); c.key = key; return c; };
      const checks = [ck('Formato automático al escribir', 'autoformat', true), ck('Atajos de Markdown (# título, - viñeta, 1. lista, **negrita**, ---)', 'markdown', true), ck('Mayúscula al principio de cada oración', 'capitalize', true), ck('Reemplazar al escribir: (c) → ©, -- → —, -> → →, 1/2 → ½…', 'replace', true), ck('Menú de emoji al escribir dos puntos (:)', 'emoji', true)];
      const quotes = ui.select([['smart', 'Tipográficas “ ” ‘ ’'], ['angular', 'Angulares « » (castellano)'], ['none', 'Rectas " \'']], s.quotes || 'smart');
      const custom = h('textarea.inp', { rows: 4, placeholder: 'abreviatura = texto completo\nej. q = que' }, Object.entries(s.autocorrect || {}).map(([k, v]) => k + ' = ' + v).join('\n'));
      ui.dialog({
        title: 'Preferencias', width: 520,
        body: ui.tabs([
          { label: 'General', body: [ui.field('Nombre de autor', author), row(ui.field('Unidad de medida', units), ui.field('Papel de los documentos nuevos', paper)), spell, dark, h('p.muted', 'El documento se guarda solo en este navegador. Para conservarlo o llevarlo a otro equipo, descárgalo desde Archivo.')] },
          { label: 'Autocorrección', body: [...checks, ui.field('Comillas', quotes), ui.field('Reemplazos propios (uno por línea)', custom)] },
        ], tab || 0),
        buttons: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, action: () => {
          s.author = author.value.trim(); s.units = units.value; s.dark = dark.input.checked; s.spell = spell.input.checked; s.paper = paper.value;
          for (const c of checks) s[c.key] = c.input.checked;
          s.quotes = quotes.value;
          const ac = {};
          for (const line of custom.value.split('\n')) { const m = /^\s*(\S+)\s*=\s*(.+?)\s*$/.exec(line); if (m) ac[m[1]] = m[2]; }
          s.autocorrect = ac;
          Object.assign(a.settings, s);
          a.applySettings(true);
          for (const ed of [a.bodyEditor, a.activeHost && a.activeHost.editor]) if (ed) ed.host.spellcheck = s.spell;
          PT.chrome.updateAll(); PT.chrome.updateRuler();
          return undefined;
        } }],
      });
    },
    // ------------------------------------------------------------ idioma
    LANGS: [['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-AR', 'Español (Argentina)'], ['es-CO', 'Español (Colombia)'], ['es-CL', 'Español (Chile)'], ['es-PE', 'Español (Perú)'], ['es-US', 'Español (Estados Unidos)'], ['es-419', 'Español (Latinoamérica)'], ['ca-ES', 'Catalán'], ['gl-ES', 'Gallego'], ['eu-ES', 'Euskera'], ['en-US', 'Inglés (Estados Unidos)'], ['en-GB', 'Inglés (Reino Unido)'], ['pt-BR', 'Portugués (Brasil)'], ['pt-PT', 'Portugués (Portugal)'], ['fr-FR', 'Francés'], ['it-IT', 'Italiano'], ['de-DE', 'Alemán']],
    langName(code) { const l = this.LANGS.find((x) => x[0] === code); return l ? l[1] : code || 'Español'; },
    language() {
      const a = A(), doc = a.doc;
      const lang = ui.select(this.LANGS, doc.meta.lang || 'es-ES');
      const spell = ui.check('Revisar la ortografía', a.settings.spell !== false);
      ui.dialog({
        title: 'Ortografía e idioma', width: 420,
        body: [ui.field('Idioma del documento', lang), spell, h('p.muted', 'La revisión usa el corrector del navegador: las palabras dudosas aparecen subrayadas. Con Ctrl + clic derecho sobre una palabra verás las sugerencias. Si el idioma no se revisa, añade su diccionario en la configuración de idiomas del navegador.')],
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          doc.tx('Idioma', () => doc.set(['meta', 'lang'], lang.value));
          a.settings.spell = spell.input.checked; a.saveSettings();
          for (const ed of [a.bodyEditor, a.activeHost && a.activeHost.editor]) if (ed) { ed.host.lang = lang.value; ed.host.spellcheck = spell.input.checked; }
          a.refresh({ noScroll: true });
          return undefined;
        } }],
      });
    },
    // ------------------------------------------------------------ propiedades del documento
    docProps() {
      const a = A(), doc = a.doc, m = doc.meta;
      const f = (k, ph) => h('input.inp', { type: 'text', value: m[k] || '', placeholder: ph || '' });
      const title = f('title'), author = f('author', a.settings.author || ''), subject = f('subject'), keywords = f('keywords', 'separadas por comas');
      const st = O.stats(doc, 'body');
      ui.dialog({
        title: 'Propiedades del documento', width: 440,
        body: [ui.field('Título', title), ui.field('Autor', author), ui.field('Asunto', subject), ui.field('Palabras clave', keywords),
          h('table.kv-table', h('tr', h('td', 'Creado'), h('td', m.created ? PT.dateText(new Date(m.created), 'long') + ', ' + PT.timeText(new Date(m.created)) : '—')), h('tr', h('td', 'Modificado'), h('td', m.modified ? PT.agoText(m.modified) : '—')), h('tr', h('td', 'Páginas'), h('td', String(a.layout.count))), h('tr', h('td', 'Palabras'), h('td', st.words.toLocaleString('es-ES'))))],
        buttons: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, action: () => {
          doc.tx('Propiedades', () => { doc.set(['meta', 'title'], title.value.trim() || 'Documento sin título'); doc.set(['meta', 'author'], author.value.trim()); doc.set(['meta', 'subject'], subject.value.trim()); doc.set(['meta', 'keywords'], keywords.value.trim()); });
          a.refresh({ noScroll: true });
          return undefined;
        } }],
      });
    },
    // ------------------------------------------------------------ versiones
    async versions() {
      const a = A();
      const list = await PT.files.listVersions();
      const box = h('div.list.ver-list');
      const render = (items) => {
        box.replaceChildren();
        if (!items.length) box.appendChild(h('div.list-item.muted', 'Todavía no hay versiones de este documento. Usa «Guardar una versión» para crear una.'));
        for (const v of items) {
          const it = h('div.ver-item', h('div.grow', h('b', v.name), h('div.muted', PT.agoText(v.date) + ' · ' + (v.words || 0).toLocaleString('es-ES') + ' palabras' + (v.auto ? ' · automática' : ''))),
            h('button.btn.small', { type: 'button', onclick: async () => { const d = await PT.files.loadVersion(v.id); if (!d) return; close(); PT.files.preview(d, v.name); } }, 'Ver'),
            h('button.btn.small', { type: 'button', onclick: async () => { if (!(await ui.confirm('¿Restaurar «' + v.name + '»? El estado actual se guardará antes como versión automática.', { ok: 'Restaurar' }))) return; await PT.files.restoreVersion(v.id); close(); } }, 'Restaurar'),
            PT.chrome.tbButton('trash', 'Eliminar versión', async () => { await PT.files.deleteVersion(v.id); render(await PT.files.listVersions()); }));
          box.appendChild(it);
        }
      };
      render(list);
      const close = ui.dialog({ title: 'Historial de versiones', width: 560, body: [h('p.muted', 'Las versiones se guardan en este navegador junto al documento «' + a.doc.meta.title + '».'), box], buttons: [{ label: 'Guardar versión ahora', action: () => { setTimeout(() => a.run('saveVersion'), 0); } }, { label: 'Cerrar', primary: true }] });
    },
    // ------------------------------------------------------------ biblioteca
    async library() {
      const docs = await PT.files.listDocs();
      const box = h('div.list.lib-list');
      const q = h('input.inp', { type: 'search', placeholder: 'Buscar por título' });
      const render = (items) => {
        const f = PT.fold(q.value.toLowerCase());
        box.replaceChildren();
        const shown = items.filter((d) => !f || PT.fold((d.title || '').toLowerCase()).includes(f));
        if (!shown.length) box.appendChild(h('div.list-item.muted', 'No hay documentos.'));
        for (const d of shown) {
          const it = h('div.ver-item' + (d.id === PT.files.currentId ? '.on' : ''), h('div.grow', h('b', d.title || 'Sin título'), h('div.muted', PT.agoText(d.modified) + ' · ' + (d.words || 0).toLocaleString('es-ES') + ' palabras')),
            h('button.btn.small', { type: 'button', onclick: () => { close(); PT.files.openStored(d.id); } }, 'Abrir'),
            PT.chrome.tbButton('copy', 'Duplicar', async () => { await PT.files.duplicateStored(d.id); render(await PT.files.listDocs()); }),
            PT.chrome.tbButton('trash', 'Eliminar', async () => { if (d.id === PT.files.currentId) { ui.toast('No puedes eliminar el documento abierto.'); return; } if (await ui.confirm('¿Eliminar «' + (d.title || 'Sin título') + '» de este navegador? No se puede deshacer.', { ok: 'Eliminar', danger: true })) { await PT.files.deleteStored(d.id); render(await PT.files.listDocs()); } }));
          box.appendChild(it);
        }
      };
      q.addEventListener('input', () => render(docs));
      render(docs);
      const close = ui.dialog({ title: 'Mis documentos', width: 560, body: [q, box, h('p.muted', 'Se guardan en este navegador. Descarga una copia (.docx o .json) para conservarlos en otro lugar.')], buttons: [{ label: 'Nuevo documento', action: () => { setTimeout(() => A().run('newDoc'), 0); } }, { label: 'Cerrar', primary: true }] });
    },
    templates() {
      const grid = h('div.tpl-grid');
      for (const t of PT.TEMPLATES) {
        const card = h('button.tpl-card', { type: 'button' }, h('div.tpl-thumb', { html: t.thumb || '' }), h('b', t.name), h('span.muted', t.desc));
        card.addEventListener('click', () => { close(); PT.files.fromTemplate(t.id); });
        grid.appendChild(card);
      }
      const close = ui.dialog({ title: 'Nuevo desde plantilla', width: 720, body: grid, buttons: [{ label: 'Cancelar' }] });
    },
    // ------------------------------------------------------------ ayuda
    shortcuts() {
      const S = [
        ['Edición', [['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+X, C, V', 'Cortar, copiar, pegar'], ['Ctrl+Mayús+V', 'Pegar sin formato'], ['Ctrl+A', 'Seleccionar todo'], ['Ctrl+F / Ctrl+H', 'Buscar / reemplazar'], ['Ctrl+G', 'Ir a una página o título'], ['Ctrl+Retroceso', 'Borrar la palabra anterior'], ['Ctrl+Mayús+P o Alt+/', 'Paleta de comandos'], ['@', 'Insertar fichas, bloques, variables, firma o pedir a la IA']]],
        ['Formato de texto', [['Ctrl+B / I / U', 'Negrita / cursiva / subrayado'], ['Alt+Mayús+5', 'Tachado'], ['Ctrl+. / Ctrl+,', 'Superíndice / subíndice'], ['Ctrl+] / Ctrl+[', 'Aumentar / reducir tamaño'], ['Ctrl+\\ o Ctrl+Espacio', 'Borrar formato'], ['Ctrl+K', 'Insertar vínculo']]],
        ['Párrafos', [['Ctrl+Alt+1…6', 'Título 1 a 6'], ['Ctrl+Alt+0', 'Texto normal'], ['Ctrl+Mayús+L, E, R, J', 'Alinear izquierda, centro, derecha, justificar'], ['Ctrl+Mayús+7 / 8 / 9', 'Lista numerada / viñetas / casillas'], ['Tab / Mayús+Tab', 'Bajar / subir nivel de la lista'], ['Ctrl+M', 'Aumentar sangría'], ['Mayús+Intro', 'Salto de línea'], ['Ctrl+Intro', 'Salto de página']]],
        ['Insertar y revisar', [['Ctrl+Alt+M', 'Comentario'], ['Ctrl+Alt+F', 'Nota al pie'], ['@', 'Menú de inserción rápida (fecha, casilla, desplegable…)'], [':palabra', 'Emoji'], ['Ctrl+Mayús+C', 'Recuento de palabras'], ['F7', 'Ortografía e idioma'], ['Ctrl+clic', 'Seguir un vínculo']]],
        ['Archivo y vista', [['Ctrl+S', 'Descargar como Word (.docx)'], ['Ctrl+O', 'Abrir'], ['Ctrl+P', 'Imprimir o guardar como PDF'], ['Ctrl+rueda', 'Zoom'], ['Doble clic en el margen superior o inferior', 'Editar encabezado o pie'], ['Esc', 'Volver al texto principal']]],
      ];
      ui.dialog({ title: 'Atajos de teclado', width: 600, body: h('table.kbd-table', ...S.flatMap(([t, rows]) => [h('tr', h('th', { colSpan: 2 }, t)), ...rows.map(([k, d]) => h('tr', h('td', k), h('td', d)))])), buttons: [{ label: 'Cerrar', primary: true }] });
    },
    guide() {
      const sec = (t, ...ps) => h('section', h('h3', t), ...ps.map((p) => h('p', p)));
      ui.dialog({
        title: 'Guía rápida', width: 600,
        body: h('div.guide',
          sec('Menús y botones', 'Pasa el puntero por el nombre de un menú para ver todos sus botones, agrupados por tema (Fuente, Párrafo, Estilos, Campos…); haz clic para desplegar también su lista. Los botones se quedan a la vista mientras trabajas; la flecha pequeña en la esquina de un grupo abre su cuadro de diálogo completo. Si la ventana es estrecha, los grupos menos usados se recogen en un botón con su menú.', '«Inicio» reúne lo más usado, como en Word: pegar y copiar, la fuente, el párrafo (también ordenar y sombreado), los estilos, buscar y reemplazar, el dictado y el asistente. Deshacer y rehacer están siempre arriba, junto al nombre del documento.'),
          sec('Escribir y dar formato', 'Escribe directamente en la página. Usa la barra de herramientas o los atajos para el formato. Los estilos de párrafo (Normal, Título 1, Cita…) dan coherencia al documento: si modificas un estilo, cambian todos sus párrafos.', 'Atajos de Markdown: «# » crea un título, «- » una viñeta, «1. » una lista numerada, «[] » una casilla, «> » una cita y «---» seguido de Intro una línea. **texto** pone negrita y *texto* cursiva.'),
          sec('Páginas', 'El diseño de impresión muestra las páginas reales con márgenes, encabezados, pies y números. Haz doble clic en el margen superior o inferior para editar el encabezado o el pie. Ctrl+Intro inserta un salto de página. En Ver puedes cambiar al modo sin páginas.'),
          sec('Insertar', 'Imágenes (también arrastrándolas o pegándolas), tablas, vínculos, notas al pie, índice automático, ecuaciones, símbolos y fichas inteligentes. Escribe @ para ver el menú de inserción rápida.'),
          sec('Revisar', 'Activa el modo Sugerencias (arriba a la derecha) para que tus cambios queden marcados; acéptalos o recházalos en Revisar › Revisar cambios. Selecciona texto y pulsa Ctrl+Alt+M para comentar.', 'En el menú Revisar están también el revisor de estilo (oraciones largas, voz pasiva, repeticiones, muletillas, dequeísmo…), el comprobador de accesibilidad, la autoría del texto (qué escribiste tú, qué pegaste y qué hizo la IA) y la comparación con una versión guardada o con otro archivo.'),
          sec('Asistente de IA', 'En el menú IA: mejora, corrige, resume, traduce o continúa tu texto, o pídele lo que quieras. Configúralo con tu clave de Claude o con un modelo local de Ollama. Aplica sus propuestas «como sugerencia» para revisarlas palabra a palabra con el control de cambios.'),
          sec('Trabajar más rápido', 'Ctrl+Mayús+P abre la paleta de comandos. Escribe @ para insertar fichas, bloques prediseñados (notas de reunión, plan de clase, rúbrica…), variables o una firma. Con las variables y Herramientas › Combinar correspondencia creas una copia por cada fila de una hoja de cálculo. Ver › Modo presentación convierte el documento en diapositivas.'),
          sec('Guardar', 'El documento se guarda automáticamente en este navegador. Descárgalo como Word, PDF, HTML, Markdown, RTF o texto desde Archivo. Guarda versiones con nombre y vuelve a ellas desde el historial.')),
        buttons: [{ label: 'Atajos de teclado', action: () => { setTimeout(() => this.shortcuts(), 0); } }, { label: 'Cerrar', primary: true }],
      });
    },
    about() {
      ui.dialog({ title: 'Acerca del procesador de texto', width: 460, body: [h('p', h('b', 'Procesador de texto ' + PT.VERSION)), h('p', 'Funciona sin conexión y sin instalar nada: HTML, CSS y JavaScript, con las mismas técnicas que la hoja de cálculo (scripts clásicos, modelo propio con deshacer, ZIP y Office Open XML escritos a mano).'), h('p.muted', 'Los documentos se guardan en este navegador; nada se envía a internet.')], buttons: [{ label: 'Cerrar', primary: true }] });
    },
  });

  // ---------------------------------------------------------------- lectura en voz alta y dictado
  const tools = (PT.tools = {
    reading: false, dictating: false,
    readAloud() {
      const a = A();
      if (!('speechSynthesis' in window)) { ui.toast('Este navegador no puede leer en voz alta.'); return; }
      if (this.reading) { this.stopReading(); return; }
      const doc = a.doc, ed = a.bodyEditor;
      const sel = ed.sel || O.caret(doc.startPos('body'));
      let [from, to] = O.ordered(doc, sel);
      if (O.same(from, to)) to = doc.endPos('body');
      const chunks = O.parasIn(doc, from, to).map((x) => ({ id: x.p.id, from: x.from, text: R.text(R.slice(x.p.runs, x.from, x.to)).replace(/￼/g, ' ') })).filter((c) => c.text.trim());
      if (!chunks.length) { ui.toast('No hay texto que leer.'); return; }
      const lang = doc.meta.lang || 'es-ES';
      const voices = speechSynthesis.getVoices();
      const voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang && v.lang.startsWith(lang.slice(0, 2)));
      this.reading = true;
      ui.toast('Leyendo en voz alta. Vuelve a pulsar Leer en voz alta para detenerte.', 3000);
      const hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
      let k = 0;
      const next = () => {
        if (!this.reading || k >= chunks.length) { this.stopReading(); return; }
        const c = chunks[k++];
        const u = new SpeechSynthesisUtterance(c.text);
        u.lang = lang; if (voice) u.voice = voice;
        u.rate = a.settings.speechRate || 1;
        u.onboundary = (e) => {
          if (!hl || e.name !== 'word') return;
          const el = a.bodyView.paraEl(c.id);
          if (!el) return;
          const len = e.charLength || (/^\S+/.exec(c.text.slice(e.charIndex)) || [''])[0].length;
          try {
            const s = PT.view.posToDom(el, c.from + e.charIndex), t = PT.view.posToDom(el, c.from + e.charIndex + len);
            const rg = new Range(); rg.setStart(s.node, s.offset); rg.setEnd(t.node, t.offset);
            CSS.highlights.set('pt-speak', new Highlight(rg));
            const rr = rg.getBoundingClientRect(), ws = PT.chrome.els.workspace, wr = ws.getBoundingClientRect();
            if (rr.bottom > wr.bottom - 40 || rr.top < wr.top + 40) ws.scrollTop += rr.top - wr.top - wr.height / 3;
          } catch (err) { /* el texto cambió */ }
        };
        u.onend = next;
        u.onerror = () => this.stopReading();
        speechSynthesis.speak(u);
      };
      next();
    },
    stopReading() {
      this.reading = false;
      try { speechSynthesis.cancel(); } catch (e) { /* nada */ }
      if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('pt-speak');
    },
    dictate() {
      const a = A();
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { ui.toast('Este navegador no admite el dictado por voz. Prueba con Chrome o Edge.'); return; }
      if (this.dictating) { this.rec && this.rec.stop(); return; }
      const rec = (this.rec = new SR());
      rec.lang = a.doc.meta.lang || 'es-ES';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          let t = e.results[i][0].transcript.trim();
          if (!t) continue;
          t = t.replace(/\s*\b(punto y aparte|nuevo párrafo)\b\s*/gi, '\n\n').replace(/\s*\bpunto\b/gi, '.').replace(/\s*\bcoma\b/gi, ',').replace(/\s*\bdos puntos\b/gi, ':').replace(/\s*\bsigno de interrogación\b/gi, '?');
          const ed = a.editor;
          ed.readSel();
          const before = ed.sel ? a.doc.paraText(ed.sel.h.id).slice(0, ed.sel.h.off) : '';
          const sep = before && !/\s$/.test(before) && !/^[.,:?]/.test(t) ? ' ' : '';
          if (/[.?!]\s*$/.test(before) || !before.trim()) t = t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
          const parts = (sep + t).split('\n\n');
          ed.exec('Dictado', () => { let pos = O.insertText(a.doc, ed.sel, parts[0]); for (const p of parts.slice(1)) { pos = O.split(a.doc, pos); if (p) pos = O.insertRuns(a.doc, pos, [{ x: p, m: O.typingMarks(a.doc, pos) }]); } return pos; });
        }
      };
      rec.onerror = (e) => { if (e.error !== 'no-speech') ui.toast('El dictado se detuvo: ' + (e.error === 'not-allowed' ? 'no hay permiso para usar el micrófono.' : e.error === 'network' ? 'necesita conexión a internet.' : e.error)); };
      rec.onend = () => { this.dictating = false; PT.chrome.updateAll(); ui.toast('Dictado detenido.'); };
      try { rec.start(); this.dictating = true; ui.toast('Dictado activo: habla y el texto aparecerá en el cursor. Di «punto», «coma» o «nuevo párrafo».', 5000); } catch (e) { ui.toast('No se pudo iniciar el dictado.'); }
    },
  });
  void tools; void M; void P;
})();
