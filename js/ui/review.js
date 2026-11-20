/* Revisión inteligente sin conexión: revisor de estilo en español (resaltado al estilo Hemingway con
   arreglos rápidos), comprobador de accesibilidad con arreglos, comparación de documentos y versiones
   como cambios controlados, y autoría del texto (escrito, pegado o generado por IA). */
(function () {
  'use strict';
  const PT = window.PT, ui = PT.ui, h = ui.h, O = PT.ops, M = PT.marks, R = PT.runs, V = PT.view;
  const A = () => PT.app, C = () => PT.chrome;
  const HL = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
  const W = (src, flags) => new RegExp('(?<![\\p{L}\\p{N}])(?:' + src + ')(?![\\p{L}\\p{N}])', flags || 'giu');
  const fold = (s) => PT.fold(String(s).toLowerCase());
  const nWords = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;
  const domRange = (id, from, to) => {
    const el = A().bodyView.paraEl(id);
    if (!el) return null;
    try { const s = V.posToDom(el, from), e = V.posToDom(el, to), rg = new Range(); rg.setStart(s.node, s.offset); rg.setEnd(e.node, e.offset); return rg; } catch (e) { return null; }
  };
  // seleccionar y mostrar un tramo del cuerpo
  const goTo = (id, from, to) => {
    const a = A();
    if (a.activeHost) a.editStory(null, true);
    if (!a.doc.block(id)) return;
    a.goToPara(id, from || 0);
    a.bodyEditor.setSel({ a: { id, off: from || 0 }, h: { id, off: to == null ? from || 0 : to } });
    a.focusEditor();
  };
  const bodyEdit = (label, fn) => { const a = A(); if (a.activeHost) a.editStory(null, true); return a.bodyEditor.exec(label, fn); };
  const panelHead = (title, extra) => h('div.side-head', h('span', title), ...(extra || []), C().tbButton('close', 'Cerrar panel', () => C().closePanel()));

  // =================================================================== revisor de estilo
  const CATS = [
    ['vlong', 'Oraciones muy largas', 'Más de 45 palabras: divídelas para que se lean mejor.'],
    ['long', 'Oraciones largas', 'Entre 31 y 45 palabras: valora si se pueden partir.'],
    ['passive', 'Voz pasiva', 'La voz activa suele ser más clara y directa.'],
    ['wordy', 'Expresiones mejorables', 'Fórmulas largas, redundancias, muletillas o usos desaconsejados.'],
    ['grammar', 'Gramática', 'Dequeísmo, queísmo y otras formas incorrectas frecuentes.'],
    ['punct', 'Puntuación y espacios', 'Espacios dobles, signos de apertura y comas mal colocadas.'],
    ['repeat', 'Palabras repetidas', 'La misma palabra muy cerca: busca un sinónimo o reformula.'],
    ['adverb', 'Adverbios en -mente', 'Úsalos con moderación; a veces sobran.'],
    ['para', 'Párrafos muy largos', 'Más de 200 palabras: piensa en dividirlos.'],
  ];
  const PARTICIPLE = '\\p{L}+(?:ad[oa]s?|id[oa]s?)|(?:escrit|hech|puest|vist|abiert|cubiert|dich|impres|rot|resuelt|vuelt|muert|devuelt|descubiert|compuest|propuest|dispuest|expuest|satisfech|provist|absuelt|envuelt|revuelt)[oa]s?';
  const PASSIVE = W('(?:fue|fueron|es|son|era|eran|será|serán|sería|serían|sea|sean|fuera|fueran|fuese|fuesen|ha sido|han sido|había sido|habían sido|habrá sido|haya sido|hayan sido|siendo)\\s+(?:\\p{L}+mente\\s+)?(?:' + PARTICIPLE + ')');
  const ADVERB = /(?<![\p{L}\p{N}])\p{L}{4,}mente(?![\p{L}\p{N}])/giu;
  const NOT_ADVERB = new Set(['vehemente', 'inclemente', 'demente', 'clemente', 'simiente', 'semente', 'cimiente']);
  // [expresión, sugerencia (null = quitar), explicación, categoría]
  // sugerencia: texto que la sustituye · null: se puede quitar · false: solo consejo (depende del contexto)
  const PHRASES = [
    ['a nivel de', false, '«A nivel de» solo es correcto cuando hay niveles o alturas; según el caso, mejor «en», «entre» o «con respecto a».'],
    ['en base a', 'con base en', 'La RAE recomienda «con base en», «basándose en» o «según».'],
    ['de cara a', false, '«De cara a» en sentido figurado: mejor «para», «ante» o «con vistas a».'],
    ['a día de hoy', 'hoy', 'Fórmula larga: basta con «hoy» o «actualmente».'],
    ['en el día de hoy', 'hoy', 'Redundante: basta con «hoy».'],
    ['en la actualidad', 'actualmente', 'Más breve: «actualmente» o «hoy».'],
    ['a la mayor brevedad posible', 'a la mayor brevedad', '«Posible» sobra.'],
    ['bajo (mi|tu|su|nuestro|vuestro) punto de vista', 'desde $1 punto de vista', 'Se dice «desde mi punto de vista».'],
    ['subir arriba', 'subir', 'Redundancia.'], ['bajar abajo', 'bajar', 'Redundancia.'], ['salir afuera', 'salir', 'Redundancia.'], ['entrar adentro', 'entrar', 'Redundancia.'],
    ['volver a repetir', 'repetir', 'Redundancia, salvo que se repita otra vez.'], ['lapso de tiempo', 'lapso', 'Redundancia: un lapso ya es un tiempo.'],
    ['erario público', 'erario', 'Redundancia.'], ['pero sin embargo', 'sin embargo', 'Dos conectores con el mismo sentido.'],
    ['más mejor', 'mejor', 'Incorrecto: «mejor» ya es comparativo.'], ['más peor', 'peor', 'Incorrecto: «peor» ya es comparativo.'],
    ['protagonista principal', 'protagonista', 'Redundancia.'], ['totalmente gratis', 'gratis', 'Redundancia.'], ['opinión personal', 'opinión', 'Redundancia.'],
    ['en relación a', 'en relación con', 'Lo recomendado es «en relación con» o «con relación a».'],
    ['a grosso modo', 'grosso modo', 'La locución latina no lleva «a».'], ['de motu propio', 'motu proprio', 'Se escribe «motu proprio», sin «de».'],
    ['sobretodo', 'sobre todo', '«Sobretodo» es una prenda; el adverbio se escribe en dos palabras.'],
    ['detrás (mío|mía)', 'detrás de mí', 'Con adverbios de lugar se recomienda «de mí», «de ti»…'], ['delante (mío|mía)', 'delante de mí', 'Se recomienda «delante de mí».'],
    ['encima (mío|mía)', 'encima de mí', 'Se recomienda «encima de mí».'], ['cerca (mío|mía)', 'cerca de mí', 'Se recomienda «cerca de mí».'],
    ['detrás (tuyo|tuya)', 'detrás de ti', 'Se recomienda «detrás de ti».'], ['delante (tuyo|tuya)', 'delante de ti', 'Se recomienda «delante de ti».'],
    ['con el objetivo de|con el fin de|con la finalidad de|con el propósito de', 'para', 'Más breve: «para».'],
    ['en el caso de que', false, 'Más breve: «si» (con el verbo en indicativo: «si llueve»).'], ['debido al hecho de que|debido a que', 'porque', 'Más breve: «porque».'],
    ['el hecho de que', false, 'A menudo basta con «que».'], ['la totalidad de', false, 'Más breve: «todos», «todas» o «todo».'], ['un gran número de', false, 'Más breve: «muchos» o «muchas».'],
    ['(llev[a-zñáéíóú]*) a cabo', false, 'Fórmula larga: prueba con «hacer», «realizar» o un verbo concreto.'],
    ['(tuvo|tiene|tienen|tendrá|tendrán|tuvieron|tendría) lugar', false, 'Fórmula larga: prueba con «ocurrir», «celebrarse» o «suceder».'],
    ['(pone|ponen|puso|pusieron|poner) de manifiesto', false, 'Fórmula larga: «mostrar», «demostrar» o «revelar».'],
    ['hacer mención|hizo mención|hace mención', false, 'Mejor el verbo: «mencionar».'], ['dar comienzo|dio comienzo|da comienzo', false, 'Mejor el verbo: «comenzar».'],
    ['básicamente|obviamente|evidentemente|literalmente|o sea|en plan', null, 'Muletilla: suele poder quitarse sin perder nada.'],
    ['preveer', 'prever', 'Se escribe «prever».'], ['cónyugue', 'cónyuge', 'Se escribe «cónyuge».'], ['haiga', 'haya', 'La forma correcta es «haya».'],
    ['contra más', 'cuanto más', 'En la lengua cuidada se usa «cuanto más».'], ['andó', 'anduvo', 'El pretérito de «andar» es «anduvo».'],
    ['satisfació', 'satisfizo', 'El pretérito de «satisfacer» es «satisfizo».'], ['conducí', 'conduje', 'El pretérito de «conducir» es «conduje».'], ['traducí', 'traduje', 'El pretérito de «traducir» es «traduje».'],
    ['(?:dij|hic|fu|tuv|estuv|pus|quis|vin|sup|pud|traj|anduv|conduj|d)istes', null, 'La 2.ª persona del pretérito no lleva «s» final: «dijiste», «hiciste»…', 'grammar'],
  ];
  const GRAMMAR = [
    [W('(pienso|piensa|pensamos|piensan|creo|cree|creemos|creen|opino|opina|considero|considera|supongo|supone|imagino|imagina|dijo|dije|digo|dice|comentó|afirmó|aseguró|explicó|me parece|le parece|resulta|es posible|es probable|es necesario|es importante|es evidente) de que'), (m) => m.replace(/\s+de que$/i, ' que'), 'Dequeísmo: sobra «de».'],
    [W('(me alegro|te alegras|se alegra|nos alegramos|se alegran|estoy seguro|estoy segura|está seguro|está segura|estamos seguros|estamos seguras|me di cuenta|te diste cuenta|se dio cuenta|nos dimos cuenta|se dieron cuenta|me acuerdo|te acuerdas|se acuerda|me olvidé|se olvidó|a pesar|a fin|en caso|soy consciente|es consciente|estoy convencido|estoy convencida|tengo la seguridad|tengo la certeza) que'), (m) => m.replace(/\s+que$/i, ' de que'), 'Queísmo: falta «de».'],
    [W('(habían|hubieron|habrán|habrían|han habido) (muchos|muchas|varios|varias|pocos|pocas|unos|unas|algunos|algunas|demasiados|demasiadas|bastantes|dos|tres|cuatro|cinco|cientos|miles)'), (m) => m.replace(/^(habían|hubieron|habrán|habrían|han habido)/i, (v) => ({ habían: 'había', hubieron: 'hubo', habrán: 'habrá', habrían: 'habría', 'han habido': 'ha habido' })[v.toLowerCase()] || v), '«Haber» impersonal va en singular: «había muchas personas».'],
  ];
  const STOP = new Set('para pero como porque cuando donde desde hasta entre sobre según sino también tampoco aunque mientras pues esto esta este estos estas esos esas aquel aquella aquellos aquellas eso esa ese otro otra otros otras todo toda todos todas cada mucho mucha muchos muchas poco poca pocos pocas tanto tanta tantos tantas mismo misma mismos mismas donde ellos ellas nosotros nosotras vosotros usted ustedes había habían tiene tienen puede pueden hace hacen hacer está están estaba estaban sido siendo será serán sería serían cual cuales quien quienes cuyo cuya además antes después luego siempre nunca entonces ahora aquí allí muy más menos bien tener haber estar ser fueron sus nuestra nuestro vuestra vuestro tiene'.split(' '));
  const ABBR = /(?:^|\s)(?:sr|sra|srta|dr|dra|lic|ing|prof|pág|págs|núm|art|vol|cap|aprox|ej|av|avda|tel|ud|uds|vd|vds|ee|uu|fig|ed|op|cit)\.$/i;

  // oraciones de un texto: [{from, to}]
  function sentences(text) {
    const out = [];
    let start = 0;
    const re = /[.!?…]+["»”')\]]*(?=\s|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (m[0] === '.' && ABBR.test(text.slice(Math.max(start, m.index - 8), end))) continue;
      if (/\d$/.test(text.slice(0, m.index)) && /^\.\d/.test(text.slice(m.index))) continue;
      if (text.slice(start, end).trim()) out.push({ from: start, to: end });
      start = end;
    }
    if (text.slice(start).trim()) out.push({ from: start, to: text.length });
    // recorta los espacios iniciales
    for (const s of out) while (s.from < s.to && /\s/.test(text[s.from])) s.from++;
    return out;
  }

  function analyze(doc) {
    const issues = [], stats = { sentences: 0, words: 0, long: 0 };
    for (const id of doc.parasOf('body')) {
      const p = doc.block(id);
      if (!p || p.st === 'code') continue;
      const raw = R.text(p.runs), text = raw.replace(/￼/g, ' ');
      if (!text.trim()) continue;
      const add = (cat, from, to, msg, fix) => issues.push({ cat, id, from, to, msg, fix, text: raw.slice(from, to) });
      const pw = nWords(text);
      if (pw > 200) add('para', 0, Math.min(text.length, 60), 'Párrafo de ' + pw + ' palabras.');
      const heading = (doc.style(p.st || 'normal').lvl || 0) > 0;
      for (const s of sentences(text)) {
        const st = text.slice(s.from, s.to), n = nWords(st);
        stats.sentences++; stats.words += n;
        if (!heading && n > 45) add('vlong', s.from, s.to, 'Oración de ' + n + ' palabras.');
        else if (!heading && n > 30) add('long', s.from, s.to, 'Oración de ' + n + ' palabras.');
        // signos de apertura
        if (/[?!]["»”')]*$/.test(st.trim()) && !/https?:\/\//.test(st)) {
          const close = st.trim().match(/[?!]/g);
          if (close && ((close.includes('?') && !st.includes('¿')) || (close.includes('!') && !st.includes('¡')))) {
            const k = s.from + st.search(/[?!]/);
            add('punct', k, k + 1, 'En español las preguntas y exclamaciones llevan signo de apertura (¿ ¡).');
          }
        }
      }
      let m;
      PASSIVE.lastIndex = 0;
      while ((m = PASSIVE.exec(text))) add('passive', m.index, m.index + m[0].length, 'Posible voz pasiva: «' + m[0] + '».');
      ADVERB.lastIndex = 0;
      while ((m = ADVERB.exec(text))) if (!NOT_ADVERB.has(m[0].toLowerCase())) add('adverb', m.index, m.index + m[0].length, 'Adverbio en -mente: «' + m[0] + '».');
      for (const [src, sug, why, cat] of PHRASES) {
        const re = W(src);
        while ((m = re.exec(text))) {
          const found = m[0];
          let fix = null;
          if (sug === null) fix = cat === 'grammar' ? { text: found.replace(/s$/i, '') } : { remove: true };
          else if (sug !== false) fix = { text: matchCase(found, sug.replace(/\$1/g, m[1] || '')) };
          add(cat || 'wordy', m.index, m.index + found.length, why, fix);
        }
      }
      for (const [re, fn, why] of GRAMMAR) {
        re.lastIndex = 0;
        while ((m = re.exec(text))) add('grammar', m.index, m.index + m[0].length, why, { text: matchCase(m[0], fn(m[0])) });
      }
      // espacios y comas
      const sp = / {2,}/g;
      while ((m = sp.exec(text))) if (m.index > 0) add('punct', m.index, m.index + m[0].length, 'Espacio doble.', { text: ' ' });
      const before = / +(?=[,;:.)\]](?!\.\.))/g;
      while ((m = before.exec(text))) if (m.index > 0 && !/\d/.test(text[m.index + m[0].length + 1] || '')) add('punct', m.index, m.index + m[0].length, 'Sobra el espacio antes del signo.', { remove: true });
      const after = /[,;](?=\p{L})/gu;
      while ((m = after.exec(text))) add('punct', m.index, m.index + 1, 'Falta un espacio después del signo.', { text: m[0] + ' ' });
      const dup = /,{2,}|(?<!\.)\.\.(?!\.)/g;
      while ((m = dup.exec(text))) add('punct', m.index, m.index + m[0].length, 'Signo repetido.', { text: m[0][0] });
      // palabras repetidas cerca (dentro de 20 palabras)
      const seen = new Map();
      const wre = /[\p{L}]{5,}/gu;
      let k = 0;
      while ((m = wre.exec(text))) {
        k++;
        const w = fold(m[0]);
        if (STOP.has(w) || /mente$/.test(w)) continue;
        const prev = seen.get(w);
        if (prev != null && k - prev <= 20) add('repeat', m.index, m.index + m[0].length, '«' + m[0] + '» se repite muy cerca.');
        seen.set(w, k);
      }
    }
    // dentro de una misma posición, solo el aviso más importante de cada categoría
    const key = (x) => x.cat + ':' + x.id + ':' + x.from + ':' + x.to;
    const uniq = new Map();
    for (const x of issues) if (!uniq.has(key(x))) uniq.set(key(x), x);
    const list = Array.from(uniq.values());
    const st = O.stats(doc, 'body');
    stats.fh = st.fh; stats.avg = stats.sentences ? stats.words / stats.sentences : 0;
    return { issues: list, stats };
  }
  function matchCase(found, sug) {
    if (!sug) return sug;
    if (found[0] && found[0] === found[0].toUpperCase() && found[0] !== found[0].toLowerCase()) return sug[0].toUpperCase() + sug.slice(1);
    return sug;
  }
  const fhLevel = (fh) => (fh >= 90 ? 'muy fácil' : fh >= 80 ? 'fácil' : fh >= 70 ? 'bastante fácil' : fh >= 60 ? 'normal' : fh >= 50 ? 'bastante difícil' : fh >= 30 ? 'difícil' : 'muy difícil');

  const SC = (PT.styleCheck = {
    off: new Set(), ignored: new Set(), result: null, _ver: null,
    analyze, sentences,
    open() { C().showPanel('style'); },
    run(force) {
      const doc = A().doc;
      const ver = doc.undoStack.length + ':' + doc.redoStack.length + ':' + (doc.undoStack.length ? doc.undoStack[doc.undoStack.length - 1].steps.length : 0) + ':' + PT.files.currentId;
      if (!force && this.result && ver === this._ver && this._doc === doc) return this.result;
      this._ver = ver; this._doc = doc;
      const r = analyze(doc);
      r.issues = r.issues.filter((x) => !this.ignored.has(x.cat + '|' + x.text));
      this.result = r;
      return r;
    },
    paint() {
      if (!HL) return;
      this.clear();
      if (!this.result || C()._panel !== 'style') return;
      const by = {};
      for (const x of this.result.issues) {
        if (this.off.has(x.cat) || x.cat === 'para') continue;
        const rg = domRange(x.id, x.from, x.to);
        if (rg) (by[x.cat] = by[x.cat] || []).push(rg);
      }
      for (const cat in by) { const hl = new Highlight(...by[cat]); hl.priority = cat === 'long' || cat === 'vlong' ? 0 : 1; CSS.highlights.set('pt-sc-' + cat, hl); }
    },
    clear() { if (HL) for (const [c] of CATS) CSS.highlights.delete('pt-sc-' + c); },
    // ¿sigue el texto como cuando se analizó?
    still(doc, x) { const p = doc.block(x.id); return !!p && R.text(p.runs).slice(x.from, x.to) === x.text; },
    fix(x) {
      const doc = A().doc;
      if (!this.still(doc, x)) { ui.toast('El texto cambió: se ha vuelto a analizar.'); this.refresh(); return; }
      bodyEdit('Revisor de estilo', () => this.applyFix(doc, x));
      this.refresh();
    },
    applyFix(doc, x) {
      const from = { id: x.id, off: x.from }, to = { id: x.id, off: x.to };
      if (x.fix.remove) {
        // quita también un espacio sobrante
        const t = doc.paraText(x.id);
        const extra = t[x.to] === ' ' && (x.from === 0 || t[x.from - 1] === ' ') ? 1 : 0;
        return O.deleteRange(doc, from, { id: x.id, off: x.to + extra });
      }
      return O.insertText(doc, { a: from, h: to }, x.fix.text, O.typingMarks(doc, from));
    },
    fixAll(cat) {
      const doc = A().doc;
      const list = this.result.issues.filter((x) => x.cat === cat && x.fix && this.still(doc, x)).sort((a, b) => (a.id === b.id ? b.from - a.from : doc.cmp({ id: b.id, off: 0 }, { id: a.id, off: 0 })));
      if (!list.length) return;
      bodyEdit('Revisor de estilo', () => { let last = null; for (const x of list) last = this.applyFix(doc, x); return last; });
      ui.toast(list.length === 1 ? 'Se aplicó 1 corrección.' : 'Se aplicaron ' + list.length + ' correcciones.');
      this.refresh();
    },
    refresh() { this.run(true); if (C()._panel === 'style') this.render(C().els.side); },
    render(side) {
      const r = this.run();
      const counts = {};
      for (const x of r.issues) counts[x.cat] = (counts[x.cat] || 0) + 1;
      const fh = r.stats.fh;
      const pct = Math.max(0, Math.min(100, fh || 0));
      const summary = h('div.sc-summary',
        h('div.sc-score', h('b', fh ? PT.fmtNum(fh, 0) : '—'), h('span', 'Legibilidad · ' + (fh ? fhLevel(fh) : 'sin texto'))),
        h('div.sc-bar', h('span', { style: { width: pct + '%' } })),
        h('div.muted.small', r.stats.sentences + ' oraciones · ' + PT.fmtNum(r.stats.avg || 0, 1) + ' palabras por oración de media'));
      const cats = h('div.sc-cats', CATS.map(([c, l, why]) => {
        const n = counts[c] || 0, fixable = r.issues.some((x) => x.cat === c && x.fix);
        const row = h('label.sc-cat' + (n ? '' : '.zero'), { title: why },
          h('input', { type: 'checkbox', checked: !this.off.has(c), onchange: (e) => { if (e.target.checked) this.off.delete(c); else this.off.add(c); this.paint(); this.renderList(); } }),
          h('span.sc-dot.sc-' + c), h('span.grow', l), h('b', String(n)),
          fixable ? h('button.btn.small', { type: 'button', title: 'Aplicar todas las sugerencias de este tipo', onclick: (e) => { e.preventDefault(); this.fixAll(c); } }, 'Corregir') : null);
        return row;
      }));
      this.listEl = h('div.sc-list');
      side.replaceChildren(panelHead('Revisor de estilo', [C().tbButton('restart', 'Volver a analizar', () => this.refresh())]), h('div.side-scroll', summary, cats, this.listEl));
      this.renderList();
      this.paint();
    },
    renderList() {
      if (!this.listEl || !this.result) return;
      const items = this.result.issues.filter((x) => !this.off.has(x.cat));
      const doc = A().doc;
      items.sort((a, b) => doc.cmp({ id: a.id, off: a.from }, { id: b.id, off: b.from }));
      const shown = items.slice(0, 250);
      this.listEl.replaceChildren(...(shown.length ? shown.map((x) => {
        const label = (CATS.find((c) => c[0] === x.cat) || [])[1];
        const ex = x.text.length > 90 ? x.text.slice(0, 87) + '…' : x.text;
        return h('div.sc-item',
          h('div.sc-item-head', h('span.sc-dot.sc-' + x.cat), h('b', label)),
          h('div.sc-quote', '«' + ex + '»'), h('div.muted.small', x.msg),
          h('div.sc-actions',
            h('button.btn.small', { type: 'button', onclick: () => goTo(x.id, x.from, x.to) }, 'Ir'),
            x.fix ? h('button.btn.small.primary', { type: 'button', onclick: () => this.fix(x) }, x.fix.remove ? 'Quitar' : 'Cambiar por «' + (x.fix.text.trim() || x.fix.text) + '»') : null,
            h('button.btn.small', { type: 'button', title: 'No volver a señalar este texto en esta sesión', onclick: () => { this.ignored.add(x.cat + '|' + x.text); this.refresh(); } }, 'Ignorar')));
      }) : [h('p.muted.cm-empty', this.result.stats.sentences ? '¡Nada que señalar en las categorías activas!' : 'Escribe algo para analizarlo.')]),
      ...(items.length > shown.length ? [h('p.muted.small', 'Y ' + (items.length - shown.length) + ' más…')] : []));
    },
    update() { const before = this.result; this.run(); if (this.result !== before) this.render(C().els.side); else this.paint(); },
  });

  // =================================================================== accesibilidad
  const VAGUE = new Set(['aqui', 'clic aqui', 'haz clic aqui', 'pulsa aqui', 'click aqui', 'clica aqui', 'enlace', 'este enlace', 'link', 'este link', 'mas', 'ver mas', 'leer mas', 'mas informacion', 'pincha aqui', 'here', 'click here', 'more', 'read more']);
  const lum = (hex) => {
    const c = PT.parseColor ? PT.parseColor(hex) : null;
    const rgb = c || (/^#?([0-9a-f]{6})$/i.exec(String(hex || '')) ? [0, 2, 4].map((i) => parseInt(String(hex).replace('#', '').substr(i, 2), 16)) : null);
    if (!rgb) return null;
    const [r, g, b] = (Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b]).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); if (la == null || lb == null) return 21; return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

  function a11yCheck(doc) {
    const out = [];
    const add = (sev, msg, detail, go, fix) => out.push({ sev, msg, detail, go, fix });
    // título y estructura
    if (!doc.meta.title || doc.meta.title === 'Documento sin título') add('error', 'El documento no tiene título', 'Los lectores de pantalla anuncian el título del documento.', null, { label: 'Poner título', run: async () => { const t = await ui.prompt('Título del documento', '', { title: 'Accesibilidad' }); if (t && t.trim()) { const d = A().doc; d.tx('Título', () => d.set(['meta', 'title'], t.trim())); A().refresh({ noScroll: true }); } } });
    const words = PT.countWords(doc.plainText('body'));
    let prevLvl = 0, headings = 0, emptyRun = [];
    const flushEmpty = () => {
      if (emptyRun.length >= 3) {
        const run = emptyRun.slice();
        add('tip', run.length + ' párrafos vacíos seguidos', 'Usa «Espaciado» en el párrafo en lugar de líneas en blanco: los lectores de pantalla las anuncian como «en blanco».', () => goTo(run[0], 0), { label: 'Dejar solo uno', run: () => bodyEdit('Accesibilidad', () => O.deleteRange(A().doc, { id: run[0], off: 0 }, { id: run[run.length - 1], off: 0 })) });
      }
      emptyRun = [];
    };
    for (const b of doc.body) {
      if (b.t !== 'p') { flushEmpty(); continue; }
      const text = R.text(b.runs);
      if (!text.trim() && !b.runs.some((r) => r.o)) emptyRun.push(b.id); else flushEmpty();
      const st = doc.style(b.st || 'normal'), lvl = st.lvl || 0;
      if (lvl > 0 && /^h[1-6]$/.test(b.st || '')) {
        headings++;
        if (!text.trim()) add('warn', 'Título vacío', 'Un título sin texto confunde la navegación por títulos.', () => goTo(b.id, 0), { label: 'Convertir en texto normal', run: () => bodyEdit('Accesibilidad', () => { O.setPara(A().doc, [b.id], { st: 'normal' }); return { id: b.id, off: 0 }; }) });
        else if (prevLvl && lvl > prevLvl + 1) { const want = prevLvl + 1; add('warn', 'Salto de nivel en los títulos', '«' + text.slice(0, 50) + '» es Título ' + lvl + ' después de un Título ' + prevLvl + '.', () => goTo(b.id, 0), { label: 'Cambiar a Título ' + want, run: () => bodyEdit('Accesibilidad', () => { O.setPara(A().doc, [b.id], { st: 'h' + want }); return { id: b.id, off: 0 }; }) }); }
        prevLvl = lvl;
      }
      // texto en mayúsculas largo
      const letters = text.replace(/[^\p{L}]/gu, '');
      if (letters.length >= 25 && nWords(text) >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) add('tip', 'Texto largo en mayúsculas', '«' + text.slice(0, 50) + '…» es más difícil de leer; usa negrita o un título para destacar.', () => goTo(b.id, 0));
    }
    flushEmpty();
    if (!headings && words > 400) add('tip', 'El documento no usa títulos', 'Con estilos de título (Título 1, Título 2…) se puede navegar y crear un índice.', null);
    // vínculos, contraste, tamaño e imágenes en todos los párrafos (también tablas, encabezados y notas)
    const pageBg = doc.page.color || '#ffffff';
    const seenImg = new Set();
    for (const story of ['body', 'hdr', 'ftr', 'hdr1', 'ftr1'].concat(Object.keys(doc.notes).map((id) => 'fn:' + id))) {
      for (const id of doc.parasOf(story)) {
        const p = doc.block(id);
        if (!p) continue;
        let off = 0, lowC = null, small = null;
        const links = new Map();
        for (const r of p.runs) {
          const len = r.o ? 1 : r.x.length;
          if (r.o && r.o.k === 'img' && !(r.o.alt && r.o.alt.trim())) {
            const at = { id, off };
            if (!seenImg.has(id + ':' + off)) {
              seenImg.add(id + ':' + off);
              const src = r.o.src;
              add('error', 'Imagen sin texto alternativo', story === 'body' ? 'Describe la imagen para quien no puede verla.' : 'Está en un encabezado, pie o nota.', story === 'body' ? () => goTo(id, at.off, at.off + 1) : null, { label: 'Añadir descripción', run: () => altDialog(story, at, src) });
            }
          }
          if (!r.o && r.x.trim() && !r.m.del) {
            const e = doc.runProps(p, r.m);
            if (e.fc) {
              const bg = e.hl || pageBg, ratio = contrast(e.fc, bg), big = (e.fs || 11) >= 18 || ((e.fs || 11) >= 14 && e.b);
              if (ratio < (big ? 3 : 4.5) && !lowC) lowC = { off, len, ratio, fc: e.fc };
            }
            if ((e.fs || 11) < 9 && !small) small = { off, len, fs: e.fs };
            if (r.m.ln) { const l = links.get(r.m.ln) || { off, text: '' }; l.text += r.x; links.set(r.m.ln, l); }
          }
          off += len;
        }
        if (story !== 'body') continue;
        if (lowC) add('warn', 'Poco contraste', 'Color ' + lowC.fc + ' sobre el fondo: contraste ' + PT.fmtNum(lowC.ratio, 1) + ':1 (mínimo 4,5:1).', () => goTo(id, lowC.off, lowC.off + lowC.len), { label: 'Usar color automático', run: () => bodyEdit('Accesibilidad', () => { O.setMarks(A().doc, { id, off: 0 }, { id, off: PT.para.len(A().doc.block(id)) }, (m) => (m.fc && contrast(m.fc, m.hl || pageBg) < 4.5 ? M.without(m, ['fc']) : m)); return { id, off: 0 }; }) });
        if (small) add('tip', 'Texto muy pequeño', 'Tamaño ' + PT.fmtNum(small.fs, 1) + ' pt: por debajo de 9 pt cuesta leerlo.', () => goTo(id, small.off, small.off + small.len));
        for (const [url, l] of links) {
          const t = fold(l.text.trim()).replace(/[.:;,!¡¿?]+$/, '');
          if (VAGUE.has(t) || /^https?:\/\//.test(l.text.trim())) add('warn', 'Vínculo poco descriptivo', '«' + l.text.trim().slice(0, 50) + '»: el texto del vínculo debería decir adónde lleva.', () => goTo(id, l.off, l.off + l.text.length));
          void url;
        }
      }
    }
    // tablas
    const walk = (blocks) => { for (const b of blocks) if (b.t === 'table') {
      const firstPara = (() => { for (const row of b.rows) for (const c of row.cells) for (const x of c.blocks || []) if (x.t === 'p') return x.id; return null; })();
      if (b.rows.length > 1 && !b.rows[0].hd) add('warn', 'Tabla sin fila de encabezado', 'Marca la primera fila como encabezado para que se lea como tal (y se repita en cada página).', firstPara ? () => goTo(firstPara, 0) : null, { label: 'Usar la primera fila', run: () => bodyEdit('Accesibilidad', () => { O.tableOp(A().doc, b.id, 'header', { r1: 0, c1: 0, r2: 0, c2: 0, count: 1 }); return firstPara ? { id: firstPara, off: 0 } : null; }) });
      if (b.rows.some((row) => row.cells.some((c) => c.mh || c.mv))) add('tip', 'Tabla con celdas combinadas', 'Las celdas combinadas complican la lectura con lector de pantalla; si puedes, usa una tabla sencilla.', firstPara ? () => goTo(firstPara, 0) : null);
      for (const row of b.rows) for (const c of row.cells) walk(c.blocks || []);
    } };
    walk(doc.body);
    const justified = doc.body.filter((b) => b.t === 'p' && doc.paraProps(b).al === 'justify' && R.text(b.runs).length > 200).length;
    if (justified >= 3) add('tip', 'Texto justificado', justified + ' párrafos justificados: los espacios irregulares dificultan la lectura a personas con dislexia.', null);
    const order = { error: 0, warn: 1, tip: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev]);
  }

  // descripción de una imagen (con ayuda de la IA si está configurada)
  function altDialog(story, at, src) {
    const ta = h('textarea.inp', { rows: 3, placeholder: 'Qué muestra la imagen y por qué es importante', 'aria-label': 'Texto alternativo' });
    const status = h('span.muted.small');
    const gen = h('button.btn.small', { type: 'button', onclick: async () => {
      if (!PT.ai || !PT.ai.ready()) { PT.ai ? PT.ai.configure() : null; return; }
      gen.disabled = true; status.textContent = 'Describiendo la imagen…';
      try { ta.value = await PT.ai.describeImage(src); status.textContent = 'Revisa la descripción antes de guardarla.'; }
      catch (e) { status.textContent = e.message; }
      gen.disabled = false;
    } }, PT.ai && PT.ai.ready() ? 'Describir con IA' : 'Configurar IA para describirla');
    ui.dialog({
      title: 'Texto alternativo', width: 460,
      body: h('div', h('img', { src, alt: '', style: { maxWidth: '100%', maxHeight: '180px', display: 'block', margin: '0 auto 10px', border: '1px solid var(--border-soft)' } }), ta, h('div.row', gen, status)),
      buttons: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, action: () => {
        const alt = ta.value.trim();
        if (!alt) return false;
        const a = A();
        const ed = story === 'body' ? a.bodyEditor : null;
        if (ed) bodyEdit('Texto alternativo', () => { O.updateAtom(a.doc, at, { alt }); return ed.sel; });
        else { a.doc.tx('Texto alternativo', () => O.updateAtom(a.doc, at, { alt })); a.refresh({ noScroll: true }); }
        setTimeout(() => PT.a11y.refresh(), 50);
      } }],
    });
  }

  PT.a11y = {
    check: a11yCheck,
    open() { C().showPanel('a11y'); },
    refresh() { if (C()._panel === 'a11y') this.render(C().els.side); },
    render(side) {
      const list = a11yCheck(A().doc);
      const n = (s) => list.filter((x) => x.sev === s).length;
      const sevName = { error: 'Error', warn: 'Advertencia', tip: 'Consejo' };
      const head = h('div.a11y-summary', list.length ? h('span', h('b', String(n('error'))), ' errores · ', h('b', String(n('warn'))), ' advertencias · ', h('b', String(n('tip'))), ' consejos') : h('span', '✓ No se encontraron problemas de accesibilidad.'));
      const items = list.map((x) => h('div.a11y-item.a11y-' + x.sev,
        h('div.sc-item-head', h('span.a11y-badge', sevName[x.sev]), h('b', x.msg)),
        x.detail ? h('div.muted.small', x.detail) : null,
        h('div.sc-actions',
          x.go ? h('button.btn.small', { type: 'button', onclick: x.go }, 'Ir') : null,
          x.fix ? h('button.btn.small.primary', { type: 'button', onclick: async () => { await x.fix.run(); setTimeout(() => this.refresh(), 60); } }, x.fix.label) : null)));
      side.replaceChildren(panelHead('Accesibilidad', [C().tbButton('restart', 'Volver a comprobar', () => this.refresh())]),
        h('div.side-scroll', head, h('p.muted.small', 'Revisa que el documento se pueda leer con lector de pantalla, ampliado o por personas con baja visión o dislexia.'), ...items));
    },
    update() { /* se comprueba al abrir o con «Volver a comprobar» para no recolocar la lista mientras se trabaja */ },
  };

  // =================================================================== comparar documentos
  PT.compareUI = {
    async open() {
      const a = A();
      const versions = PT.files.currentId ? await PT.files.listVersions() : [];
      let file = null;
      const vsel = ui.select(versions.length ? versions.map((v) => [v.id, (v.name || 'Versión') + ' · ' + PT.agoText(v.date)]) : [['', 'No hay versiones guardadas']], versions[0] ? versions[0].id : '');
      const fname = h('span.muted', 'Ningún archivo elegido');
      const pick = h('button.btn.small', { type: 'button', onclick: async () => { const f = await ui.pickFile('.docx,.docm,.md,.markdown,.txt,.html,.htm,.rtf,.json'); if (f) { file = f; fname.textContent = f.name; src.querySelector('input[value="file"]').checked = true; } } }, 'Elegir archivo…');
      const src = ui.radios('cmp-src', [['version', 'Una versión guardada de este documento'], ['file', 'Otro archivo del equipo']], versions.length ? 'version' : 'file');
      const newer = ui.radios('cmp-dir', [['current', 'El documento actual es el más reciente'], ['other', 'La versión o el archivo es el más reciente']], 'current');
      ui.dialog({
        title: 'Comparar documentos', width: 500,
        body: h('div.cmp-dlg',
          h('p.dlg-msg', 'Se abrirá un documento nuevo con todas las diferencias marcadas como cambios: lo añadido subrayado y lo eliminado tachado. Podrás aceptarlas o rechazarlas.'),
          src, h('div.cmp-row', ui.field('Versión', vsel)), h('div.cmp-row.row', pick, fname), ui.field('¿Cuál es la versión nueva?', newer)),
        buttons: [{ label: 'Cancelar' }, { label: 'Comparar', primary: true, action: () => {
          const kind = src.value();
          if (kind === 'version' && !vsel.value) { ui.toast('No hay versiones guardadas: guarda una o elige un archivo.'); return false; }
          if (kind === 'file' && !file) { ui.toast('Elige primero el archivo.'); return false; }
          this.run(kind, kind === 'version' ? vsel.value : file, newer.value() === 'current', kind === 'version' ? (versions.find((v) => v.id === vsel.value) || {}).name : file.name).catch((e) => ui.alert('No se pudo comparar: ' + e.message, 'Comparar documentos'));
        } }],
      });
      void a;
    },
    async run(kind, what, currentIsNew, label) {
      const a = A();
      const other = kind === 'version' ? await PT.files.loadVersion(what) : (await PT.files.parseFile(what)).doc;
      if (!other) throw new Error('No se encontró la versión.');
      const cur = a.doc;
      const [oldDoc, newDoc] = currentIsNew ? [other, cur] : [cur, other];
      const { doc, stats } = PT.compare.docs(oldDoc, newDoc, { author: currentIsNew ? 'Cambios desde «' + (label || 'versión') + '»' : 'Cambios en «' + (label || 'versión') + '»', title: 'Comparación · ' + (cur.meta.title || 'documento') });
      if (!stats.ins && !stats.del && !stats.changed) { ui.alert('Los dos documentos tienen el mismo texto.', 'Comparar documentos'); return; }
      await PT.files.adopt(doc, ['Comparación: ' + stats.ins + ' palabras añadidas y ' + stats.del + ' eliminadas.', 6000]);
      if (!a.settings.showChanges) a.run('showChanges');
      setTimeout(() => { if (C()._panel !== 'changes' || C().els.side.hidden) C().showPanel('changes'); }, 100);
    },
  };

  // =================================================================== autoría
  const AU = (PT.authorship = {
    // marca la procedencia de un fragmento (para pegar): no cambia lo que ya tenía marca
    mark(slice, src) {
      const runs = (list) => list.map((r) => (r.m && r.m.src ? r : r.o ? { o: r.o, m: M.with(r.m, { src }) } : { x: r.x, m: M.with(r.m, { src }) }));
      const blk = (b) => { if (b.t === 'p') return Object.assign({}, b, { runs: R.normalize(runs(b.runs)) }); if (b.t === 'table') return Object.assign({}, b, { rows: b.rows.map((row) => Object.assign({}, row, { cells: row.cells.map((c) => Object.assign({}, c, { blocks: (c.blocks || []).map(blk) })) })) }); return b; };
      return slice.inline ? Object.assign({}, slice, { runs: runs(slice.runs) }) : Object.assign({}, slice, { blocks: slice.blocks.map(blk) });
    },
    stats(doc) {
      const s = { own: 0, paste: 0, ai: 0 };
      const count = (blocks) => { for (const b of blocks || []) {
        if (b.t === 'p') for (const r of b.runs) { if (r.o || r.m.del) continue; const n = nWords(r.x); s[r.m.src === 'ai' ? 'ai' : r.m.src === 'paste' ? 'paste' : 'own'] += n; }
        else if (b.t === 'table') for (const row of b.rows) for (const c of row.cells) count(c.blocks);
      } };
      count(doc.body);
      s.total = s.own + s.paste + s.ai;
      return s;
    },
    toggle(on) {
      const a = A();
      a.settings.showSrc = on === undefined ? !a.settings.showSrc : !!on;
      if (a.saveSettings) a.saveSettings();
      this.apply();
      ui.toast(a.settings.showSrc ? 'Autoría visible: pegado en naranja y escrito por la IA en violeta.' : 'Autoría oculta.');
    },
    apply() { const c = C().els.canvas; if (c) c.classList.toggle('show-src', !!A().settings.showSrc); },
    setSelection(src) {
      const a = A(), r = a.range();
      if (!r || O.same(r[0], r[1])) { ui.toast('Selecciona antes el texto.'); return; }
      a.edit('Autoría', () => { O.setMarks(a.doc, r[0], r[1], (m) => M.with(m, { src: src || null })); return a.editor.sel; });
    },
    dialog() {
      const a = A(), s = this.stats(a.doc);
      const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
      const bar = h('div.au-bar', [['own', s.own], ['paste', s.paste], ['ai', s.ai]].map(([k, n]) => h('span.au-' + k, { style: { width: pct(n) + '%' }, title: n + ' palabras' })));
      const row = (k, l, n) => h('div.au-row', h('span.au-sw.au-' + k), h('span.grow', l), h('b', pct(n) + ' %'), h('span.muted', ' · ' + n.toLocaleString('es-ES') + ' palabras'));
      ui.dialog({
        title: 'Autoría del texto', width: 470,
        body: h('div.au-dlg',
          h('p.dlg-msg', 'Qué parte del documento has escrito tú, cuál viene de pegar texto de fuera y cuál ha propuesto el asistente de IA. Lo que escribes dentro de un texto pegado o de la IA cuenta como tuyo.'),
          bar, row('own', 'Escrito por ti', s.own), row('paste', 'Pegado de otras fuentes', s.paste), row('ai', 'Generado con IA', s.ai),
          ui.check('Mostrar la autoría en el texto', !!a.settings.showSrc, (v) => this.toggle(v)),
          h('div.row', h('span.muted.small', 'Selección:'), h('button.btn.small', { type: 'button', onclick: () => this.setSelection(null) }, 'Es mío'), h('button.btn.small', { type: 'button', onclick: () => this.setSelection('paste') }, 'Es pegado'), h('button.btn.small', { type: 'button', onclick: () => this.setSelection('ai') }, 'Es de IA'))),
        buttons: [{ label: 'Cerrar', primary: true }],
      });
    },
  });

  (PT.panels = PT.panels || {}).style = { render: (side) => SC.render(side), update: () => SC.update(), onClose: () => SC.clear() };
  PT.panels.a11y = { render: (side) => PT.a11y.render(side), update: () => PT.a11y.update(), onClose: () => {} };
  void AU;
})();
