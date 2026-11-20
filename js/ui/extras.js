/* Funciones de productividad: paleta de comandos, escritura enfocada (máquina de escribir y atenuar el
   resto), objetivo de palabras con fecha límite, numeración de líneas, bloques prediseñados y «Mis bloques»,
   variables del documento con combinación de correspondencia, modo presentación y dibujo o firma a mano. */
(function () {
  'use strict';
  const PT = window.PT, ui = PT.ui, h = ui.h, O = PT.ops, M = PT.marks, R = PT.runs, P = PT.para;
  const A = () => PT.app, C = () => PT.chrome;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { ui.toast('No se pudo guardar en este navegador.'); } },
  };
  const fold = (s) => PT.fold(String(s || '').toLowerCase());
  const X = (PT.extras = {});

  // =================================================================== paleta de comandos
  X.palette = function () {
    if (document.querySelector('.pal-back')) return;
    const a = A();
    if (a.editor) a.editor.readSel();
    C().computeState();
    const items = [];
    const walk = (list, path) => {
      for (const it of list || []) {
        if (!it || it === '-' || it.title || it.disabled) continue;
        const p = path.concat(it.label);
        if (it.sub) { try { walk(typeof it.sub === 'function' ? it.sub() : it.sub, p); } catch (e) { /* submenú no disponible */ } }
        else if (it.action) items.push({ label: it.label, path: path.join(' › '), key: it.key || '', icon: it.icon, run: it.action, on: !!it.checked });
      }
    };
    for (const [name, list] of C().menus()) walk(list, [name]);
    const recent = store.get('pt.recentCmds', []);
    const idOf = (it) => it.path + ' › ' + it.label;
    const input = h('input.pal-input', { type: 'text', placeholder: 'Escribe lo que quieres hacer: «negrita», «tabla», «resumir», «pdf»…', 'aria-label': 'Buscar un comando', spellcheck: false });
    const list = h('div.pal-list', { role: 'listbox' });
    const box = h('div.pal', { role: 'dialog', 'aria-label': 'Paleta de comandos' }, h('div.pal-head', ui.icon('search', 16), input, h('kbd', 'Esc')), list);
    const back = h('div.pal-back', box);
    let shown = [], cur = 0;
    const close = (run) => { back.remove(); document.removeEventListener('keydown', onKey, true); a.focusEditor(); if (run) setTimeout(() => { try { run(); } catch (e) { console.error(e); } }, 30); };
    const score = (it, words) => {
      const lab = fold(it.label), all = lab + ' ' + fold(it.path) + ' ' + fold(it.key);
      let s = 0;
      for (const w of words) { if (!all.includes(w)) return -1; s += lab.startsWith(w) ? 6 : lab.includes(' ' + w) ? 4 : lab.includes(w) ? 3 : 1; }
      return s - it.path.split('›').length * 0.1;
    };
    const paint = () => {
      const q = fold(input.value.trim());
      const words = q.split(/\s+/).filter(Boolean);
      if (!words.length) {
        const rec = recent.map((r) => items.find((it) => idOf(it) === r)).filter(Boolean);
        shown = rec.concat(items.filter((it) => !rec.includes(it))).slice(0, 60);
      } else shown = items.map((it) => ({ it, s: score(it, words) })).filter((x) => x.s >= 0).sort((x, y) => y.s - x.s).slice(0, 60).map((x) => x.it);
      cur = Math.min(cur, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length ? shown.map((it, i) => {
        const row = h('div.pal-item' + (i === cur ? '.on' : ''), { role: 'option', 'aria-selected': i === cur ? 'true' : 'false' },
          h('span.pal-ico', it.icon ? ui.icon(it.icon, 15) : it.on ? ui.icon('check', 14) : null),
          h('span.pal-label', it.label, h('span.pal-path', it.path)), it.key ? h('kbd', it.key) : null);
        row.addEventListener('pointerdown', (e) => e.preventDefault());
        row.addEventListener('click', () => pick(i));
        row.addEventListener('pointermove', () => { if (cur !== i) { cur = i; for (const [k, r] of Array.from(list.children).entries()) r.classList.toggle('on', k === i); } });
        return row;
      }) : [h('div.pal-empty.muted', 'No hay comandos con ese nombre.')]));
      const on = list.children[cur];
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };
    const pick = (i) => {
      const it = shown[i];
      if (!it) return;
      store.set('pt.recentCmds', [idOf(it)].concat(recent.filter((r) => r !== idOf(it))).slice(0, 8));
      close(it.run);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(shown.length - 1, cur + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
    }
    input.addEventListener('input', () => { cur = 0; paint(); });
    back.addEventListener('pointerdown', (e) => { if (e.target === back) { e.preventDefault(); close(); } });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    paint();
    input.focus();
  };

  // =================================================================== escritura enfocada
  let curEl = null;
  X.onSelection = function () {
    const a = A(), s = a.settings, ed = a.editor;
    if (!ed || !a.layout) return;
    const flow = a.layout.flow;
    flow.classList.toggle('dim-others', !!s.dimOthers && ed.story === 'body');
    if (s.dimOthers && ed.sel && ed.story === 'body') {
      const pEl = a.bodyView.paraEl(ed.sel.h.id);
      const top = pEl ? pEl.closest('.pt-flow > *') : null;
      if (top !== curEl) { if (curEl) curEl.classList.remove('pt-cur'); curEl = top; if (curEl) curEl.classList.add('pt-cur'); }
    } else if (curEl) { curEl.classList.remove('pt-cur'); curEl = null; }
    if (s.typewriter && document.activeElement === ed.host && ed.sel && O.same(ed.sel.a, ed.sel.h)) {
      const r = ed.caretRect && ed.caretRect();
      const ws = C().els.workspace;
      if (r && ws) {
        const wr = ws.getBoundingClientRect(), delta = r.top - (wr.top + wr.height * 0.42);
        if (Math.abs(delta) > 6) ws.scrollTop += delta;
      }
    }
  };
  X.toggleSetting = function (key, msgOn, msgOff) {
    const a = A();
    a.settings[key] = !a.settings[key];
    if (a.saveSettings) a.saveSettings();
    C().els.workspace.classList.toggle('typewriter', !!a.settings.typewriter);
    X.onSelection();
    C().updateAll();
    ui.toast(a.settings[key] ? msgOn : msgOff);
  };

  // =================================================================== objetivo de palabras
  const session = { id: null, start: 0, reached: false };
  X.goalWidget = function () {
    const E = C().els;
    if (!E.goal) {
      E.goal = h('button.st-btn.st-goal', { type: 'button', title: 'Objetivo de palabras', onclick: () => X.goalDialog() });
      E.words.after(E.goal);
    }
    const a = A(), doc = a.doc, g = doc.meta.goal;
    const words = PT.countWords(doc.plainText('body'));
    const key = PT.files.currentId || 'nuevo';
    if (session.id !== key) { session.id = key; session.start = words; session.reached = !!(g && g.words && words >= g.words); }
    if (!g || !g.words) { E.goal.hidden = true; return; }
    E.goal.hidden = false;
    const pct = Math.min(100, Math.round((words / g.words) * 100));
    let due = '';
    if (g.due) {
      // días de calendario que faltan
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.round((new Date(g.due + 'T00:00:00') - today) / 864e5);
      due = days < 0 ? ' · plazo vencido' : days === 0 ? ' · hoy' : days === 1 ? ' · mañana' : ' · ' + days + ' días';
    }
    const ring = h('span.goal-ring' + (pct >= 100 ? '.done' : ''));
    ring.style.setProperty('--p', pct);
    E.goal.replaceChildren(ring, h('span', words.toLocaleString('es-ES') + ' / ' + g.words.toLocaleString('es-ES') + due));
    const today = words - session.start;
    E.goal.title = 'Objetivo: ' + g.words.toLocaleString('es-ES') + ' palabras (' + pct + ' %)' + (g.due ? ' para el ' + PT.dateText(new Date(g.due + 'T12:00:00'), 'long') : '') + '\nEn esta sesión: ' + (today >= 0 ? '+' : '') + today + ' palabras';
    if (!session.reached && words >= g.words) { session.reached = true; ui.toast('🎉 ¡Objetivo cumplido: ' + g.words.toLocaleString('es-ES') + ' palabras!', 5000); }
  };
  X.goalDialog = function () {
    const a = A(), doc = a.doc, g = doc.meta.goal || {};
    const words = PT.countWords(doc.plainText('body'));
    const n = ui.numInput(g.words || Math.max(500, Math.ceil((words + 1) / 500) * 500), { width: 110, unit: 'palabras' });
    const due = h('input.inp', { type: 'date', value: g.due || '' });
    const today = words - session.start;
    ui.dialog({
      title: 'Objetivo de palabras', width: 420,
      body: h('div', h('p.dlg-msg', 'Marca cuántas palabras quieres escribir y, si quieres, para cuándo. El progreso aparece en la barra de estado.'),
        ui.field('Palabras', n), ui.field('Fecha límite (opcional)', due),
        h('p.muted.small', 'Ahora: ' + words.toLocaleString('es-ES') + ' palabras · en esta sesión: ' + (today >= 0 ? '+' : '') + today.toLocaleString('es-ES') + '.')),
      buttons: [
        { left: true, el: h('button.btn.small.danger-text', { type: 'button', onclick: () => { doc.tx('Objetivo', () => doc.set(['meta', 'goal'], null)); a.refresh({ noScroll: true }); ui.closePopups(); document.querySelector('.dlg-back .dlg-x') && document.querySelector('.dlg-back .dlg-x').click(); } }, 'Quitar el objetivo') },
        { label: 'Cancelar' },
        { label: 'Guardar', primary: true, action: () => { const v = Math.round(ui.numOf(n)); if (!(v > 0)) { ui.toast('Escribe un número de palabras.'); return false; } doc.tx('Objetivo', () => doc.set(['meta', 'goal'], { words: v, due: due.value || null })); session.reached = words >= v; a.refresh({ noScroll: true }); } },
      ],
    });
  };

  // =================================================================== numeración de líneas
  let lnTimer = 0, lnCache = null;
  X.lineNumbers = function (mode) {
    const a = A(), doc = a.doc, cur = doc.page.lnNum || {};
    let next;
    if (mode === 'none') next = null;
    else if (mode === 'step') next = Object.assign({ on: true, restart: 'cont' }, cur, { on: true, by: (cur.by || 1) === 5 ? 1 : 5 });
    else next = Object.assign({ by: 1 }, cur, { on: true, restart: mode === 'page' ? 'page' : 'cont' });
    doc.tx('Números de línea', () => doc.set(['page', 'lnNum'], next));
    a.refresh({ noScroll: true });
    X.scheduleLines(0);
  };
  X.scheduleLines = function (ms) { clearTimeout(lnTimer); lnTimer = setTimeout(() => X.computeLines(), ms == null ? 180 : ms); };
  X.computeLines = function () {
    const a = A(), L = a.layout, doc = a.doc;
    const cfg = doc.page.lnNum;
    for (const sh of L.sheets) { const old = sh.el.querySelector('.pt-lnums'); if (old) old.remove(); }
    if (!cfg || !cfg.on || L.pageless) { lnCache = null; return; }
    const d = L.dims(), stride = d.H + L.gap, z = a.zoom || 1;
    const flow = L.flow, fr = flow.getBoundingClientRect();
    const pages = new Map();
    for (const el of flow.children) {
      if (!el.classList || !el.classList.contains('pt-p') || !el.dataset.id) continue;
      for (const ln of lineBoxes(el)) {
        const top = (ln.top - fr.top) / z, bottom = (ln.bottom - fr.top) / z;
        const k = Math.floor(((top + bottom) / 2) / stride), y = top - k * stride;
        if (y < -2 || y > d.ch + 2) continue;
        if (!pages.has(k)) pages.set(k, []);
        pages.get(k).push({ y, hgt: bottom - top });
      }
    }
    lnCache = { pages, cfg, d };
    X.paintLines();
  };
  X.paintLines = function () {
    const a = A(), L = a.layout;
    if (!lnCache || !L) return;
    const { pages, cfg, d } = lnCache;
    let n = 0;
    const keys = Array.from(pages.keys()).sort((x, y) => x - y);
    for (const k of keys) {
      const sh = L.sheets[k];
      if (cfg.restart === 'page') n = 0;
      const lines = pages.get(k);
      if (!sh) { n += lines.length; continue; }
      let box = sh.el.querySelector('.pt-lnums');
      if (box) box.remove();
      box = h('div.pt-lnums', { 'aria-hidden': 'true' });
      for (const ln of lines) {
        n++;
        if (n % (cfg.by || 1)) continue;
        // a la altura de la base de la línea (en una línea con una imagen, abajo, como en Word)
        box.appendChild(h('span', { style: { top: (d.mt + ln.y + Math.max(0, ln.hgt - 16)) + 'px', width: Math.max(16, d.ml - 14) + 'px' } }, String(n)));
      }
      sh.el.appendChild(box);
    }
  };
  // líneas de un párrafo en pantalla: agrupa los rectángulos del texto por altura
  function lineBoxes(el) {
    const rects = [];
    const rg = document.createRange();
    const walk = (node) => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (!c.data.length) continue; rg.selectNodeContents(c); for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0) rects.push(r); }
        else if (c.nodeType === 1) {
          if (c.classList.contains('pt-gap') || c.classList.contains('pt-gap-in') || c.classList.contains('pt-deco')) continue;
          if (c.classList.contains('pt-obj')) { const r = c.getBoundingClientRect(); if (r.height > 0) rects.push(r); continue; }
          walk(c);
        }
      }
    };
    walk(el);
    if (!rects.length) {
      const r = el.getBoundingClientRect(), lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
      return r.height ? [{ top: r.top + pad, bottom: r.top + pad + Math.min(r.height, lh) }] : [];
    }
    rects.sort((x, y) => x.top - y.top);
    const lines = [];
    for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last && r.top < last.bottom - Math.min(4, (last.bottom - last.top) * 0.4)) { last.top = Math.min(last.top, r.top); last.bottom = Math.max(last.bottom, r.bottom); }
      else lines.push({ top: r.top, bottom: r.bottom });
    }
    return lines;
  }

  // =================================================================== bloques prediseñados y «Mis bloques»
  const STATUS = [{ t: 'Pendiente', c: '#e8eaed' }, { t: 'En curso', c: '#c6dbfc' }, { t: 'En revisión', c: '#fde7b0' }, { t: 'Terminado', c: '#c9e9d2' }];
  const PRIORITY = [{ t: 'Alta', c: '#f6c9c4' }, { t: 'Media', c: '#fde7b0' }, { t: 'Baja', c: '#c9e9d2' }];
  const day = (n) => PT.isoDate(new Date(Date.now() + n * 864e5));
  const chipDate = (n, fmt) => ({ k: 'chip', c: 'date', v: day(n || 0), fmt: fmt || 'chip' });
  const chipDD = (opts, v) => ({ k: 'chip', c: 'dd', v: v || opts[0].t, opts });
  const cellAtom = (t, r, c, o) => { t.rows[r].cells[c].blocks = [P.make(null, [{ o: Object.freeze(o), m: M.EMPTY }])]; };
  const callout = (emoji, title, text, color, bg) => P.make({ bdr: { l: '3 solid ' + color }, bg, spB: 6, spA: 6 }, PT.convert.inline('**' + emoji + ' ' + title + '** ' + text));
  const BLOCKS = [
    { id: 'meeting', name: 'Notas de reunión', icon: 'comment', desc: 'Fecha, asistentes, orden del día, acuerdos y tareas', build(B, L) {
      const t = B.table([['Tarea', 'Responsable', 'Fecha límite', 'Estado'], ['Primera tarea', '@nombre', '', ''], ['Segunda tarea', '@nombre', '', '']], { headBg: '#eef3fb' });
      for (let r = 1; r < 3; r++) { cellAtom(t, r, 2, chipDate(r * 7)); cellAtom(t, r, 3, chipDD(STATUS)); }
      return [P.make({ st: 'h2' }, [{ x: 'Notas de reunión · ', m: M.EMPTY }, { o: Object.freeze(chipDate(0, 'long')), m: M.EMPTY }]), B.p('**Asistentes:** '), B.h(3, 'Orden del día'), ...B.list(L, 'decimal', ['Primer punto', 'Segundo punto']), B.h(3, 'Notas'), ...B.list(L, 'bullet', ['']), B.h(3, 'Acuerdos'), ...B.list(L, 'bullet', ['']), B.h(3, 'Tareas'), t];
    } },
    { id: 'lesson', name: 'Plan de clase', icon: 'book', desc: 'Objetivos, materiales, secuencia didáctica y evaluación', build(B, L) {
      const info = B.table([['Asignatura y curso', ''], ['Duración', '50 minutos'], ['Objetivos de aprendizaje', ''], ['Competencias', ''], ['Materiales y recursos', '']], { header: false, cols: [150, 330], width: 480 });
      for (const row of info.rows) row.cells[0].bg = '#eef3fb';
      return [B.h(2, 'Plan de clase: tema'), info, B.h(3, 'Secuencia didáctica'),
        B.table([['Fase', 'Actividad', 'Tiempo'], ['Inicio', 'Activación de conocimientos previos y motivación.', '10 min'], ['Desarrollo', 'Explicación, práctica guiada y trabajo autónomo.', '30 min'], ['Cierre', 'Síntesis y comprobación de lo aprendido.', '10 min']], { headBg: '#eef3fb', cols: [90, 310, 80], width: 480 }),
        B.h(3, 'Evaluación'), ...B.list(L, 'bullet', ['Criterios de evaluación:', 'Instrumentos (rúbrica, observación, prueba…):']), B.h(3, 'Atención a la diversidad'), B.p('')];
    } },
    { id: 'rubric', name: 'Rúbrica de evaluación', icon: 'table', desc: 'Criterios con cuatro niveles de logro', build(B) {
      const rows = [['Criterio', 'Excelente (4)', 'Bueno (3)', 'Suficiente (2)', 'Insuficiente (1)']];
      for (const c of ['Contenido', 'Organización', 'Expresión escrita']) rows.push([c, '', '', '', '']);
      const t = B.table(rows, { headBg: '#eef3fb', cols: [90, 98, 98, 98, 98], width: 482 });
      for (let r = 1; r < rows.length; r++) t.rows[r].cells[0].blocks = [P.make(null, PT.convert.inline('**' + rows[r][0] + '**'))];
      return [B.h(2, 'Rúbrica de evaluación'), t, B.p('*Puntuación total: ___ / ' + (rows.length - 1) * 4 + '*')];
    } },
    { id: 'tasks', name: 'Lista de tareas', icon: 'listCheck', desc: 'Tabla con responsable, fecha, prioridad y estado', build(B) {
      const t = B.table([['Tarea', 'Responsable', 'Fecha', 'Prioridad', 'Estado'], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], { headBg: '#eef3fb', cols: [150, 90, 80, 75, 85], width: 480 });
      for (let r = 1; r < 4; r++) { cellAtom(t, r, 2, chipDate(r * 3)); cellAtom(t, r, 3, chipDD(PRIORITY, r === 1 ? 'Alta' : 'Media')); cellAtom(t, r, 4, chipDD(STATUS)); }
      return [t];
    } },
    { id: 'roadmap', name: 'Hoja de ruta', icon: 'calendar', desc: 'Hitos con fechas y estado', build(B) {
      const t = B.table([['Hito', 'Inicio', 'Fin', 'Estado'], ['Planificación', '', '', ''], ['Desarrollo', '', '', ''], ['Entrega', '', '', '']], { headBg: '#eef3fb', cols: [170, 95, 95, 120], width: 480 });
      for (let r = 1; r < 4; r++) { cellAtom(t, r, 1, chipDate((r - 1) * 14)); cellAtom(t, r, 2, chipDate(r * 14)); cellAtom(t, r, 3, chipDD(STATUS, r === 1 ? 'En curso' : 'Pendiente')); }
      return [B.h(2, 'Hoja de ruta'), t];
    } },
    { id: 'email', name: 'Borrador de correo', icon: 'note', desc: 'Para, asunto y cuerpo del mensaje', build(B) {
      return [B.p('**Para:** '), B.p('**CC:** '), B.p('**Asunto:** '), B.p('Hola, …'), B.p(''), B.p('Un saludo,'), B.p(PT.locale.author || 'Tu nombre')];
    } },
    { id: 'proscons', name: 'Pros y contras', icon: 'distribute', desc: 'Ventajas e inconvenientes lado a lado', build(B, L) {
      const t = B.table([['Ventajas', 'Inconvenientes'], ['', '']], { headBg: '#eef3fb' });
      t.rows[1].cells[0].blocks = B.list(L, 'bullet', ['', '']);
      t.rows[1].cells[1].blocks = B.list(L, 'bullet', ['', '']);
      return [t, B.p('**Conclusión:** ')];
    } },
    { id: 'decisions', name: 'Registro de decisiones', icon: 'accept', desc: 'Qué se decidió, por qué y quién', build(B) {
      const t = B.table([['Fecha', 'Decisión', 'Motivo', 'Responsable'], ['', '', '', '']], { headBg: '#eef3fb', cols: [80, 150, 160, 90], width: 480 });
      cellAtom(t, 1, 0, chipDate(0));
      return [t];
    } },
    { id: 'reading', name: 'Ficha de lectura', icon: 'book', desc: 'Datos de la obra, resumen, ideas y valoración', build(B, L) {
      return [B.h(2, 'Ficha de lectura'), B.p('**Título:** '), B.p('**Autor o autora:** '), B.p('**Año y editorial:** '), B.h(3, 'Resumen'), B.p(''), B.h(3, 'Ideas principales'), ...B.list(L, 'bullet', ['', '']), B.h(3, 'Cita destacada'), B.st('quote', '«…»'), B.h(3, 'Valoración personal'), B.p('')];
    } },
    { id: 'note', name: 'Cuadro de nota', icon: 'info', desc: 'Destaca una información útil', build() { return [callout('💡', 'Nota:', 'escribe aquí la información que quieras destacar.', '#4472c4', '#eef3fb')]; } },
    { id: 'warning', name: 'Cuadro de advertencia', icon: 'help', desc: 'Llama la atención sobre un riesgo', build() { return [callout('⚠️', 'Atención:', 'escribe aquí la advertencia.', '#c99700', '#fff6db')]; } },
    { id: 'important', name: 'Cuadro importante', icon: 'star', desc: 'Lo que no se debe pasar por alto', build() { return [callout('❗', 'Importante:', 'escribe aquí lo esencial.', '#c5221f', '#fdeceb')]; } },
  ];
  X.BLOCKS = BLOCKS;
  X.insertBlock = function (id) {
    const def = BLOCKS.find((b) => b.id === id);
    const a = A(), ed = a.editor;
    if (!def || !ed) return;
    const L = { lists: {} };
    const blocks = def.build(PT.tpl, L);
    if (Object.keys(L.lists).length) ed.mergeStyles({ lists: L.lists });
    a.edit('Insertar «' + def.name + '»', () => {
      const [x, y] = O.ordered(a.doc, ed.sel);
      const pos = O.same(x, y) ? x : O.deleteRange(a.doc, x, y);
      // en un párrafo vacío se sustituye; si no, el bloque va debajo
      const p = a.doc.block(pos.id);
      const at = P.len(p) === 0 ? pos : O.split(a.doc, { id: p.id, off: P.len(p) });
      return O.insertSlice(a.doc, O.caret(at), { blocks });
    });
  };
  const MINE = 'pt.blocks';
  X.myBlocks = () => store.get(MINE, []);
  X.saveBlock = async function () {
    const a = A(), r = a.range();
    if (!r || O.same(r[0], r[1])) { ui.toast('Selecciona antes lo que quieres guardar como bloque.'); return; }
    const name = await ui.prompt('Nombre del bloque', '', { title: 'Guardar como bloque', hint: 'Lo encontrarás en Insertar › Bloques y escribiendo @ en el texto.' });
    if (!name || !name.trim()) return;
    const slice = O.slice(a.doc, r[0], r[1]);
    const list = X.myBlocks().filter((b) => b.name !== name.trim());
    list.unshift({ name: name.trim(), saved: new Date().toISOString(), data: { slice: JSON.parse(JSON.stringify(slice)), styles: a.doc.styles, lists: a.doc.lists } });
    store.set(MINE, list.slice(0, 40));
    ui.toast('Bloque «' + name.trim() + '» guardado.');
  };
  X.insertMine = function (name) {
    const b = X.myBlocks().find((x) => x.name === name);
    const ed = A().editor;
    if (!b || !ed) return;
    ed.readSel();
    ed.pasteData({ own: JSON.stringify(b.data) }, false);
  };
  X.manageBlocks = function () {
    const render = () => {
      const list = X.myBlocks();
      return list.length ? list.map((b) => h('div.blk-row', h('span.grow', h('b', b.name), h('span.muted.small', ' · ' + PT.agoText(b.saved))),
        h('button.btn.small', { type: 'button', onclick: () => { ui.closePopups(); X.insertMine(b.name); document.querySelector('.dlg-back .dlg-x').click(); } }, 'Insertar'),
        h('button.btn.small.danger-text', { type: 'button', onclick: () => { store.set(MINE, X.myBlocks().filter((x) => x.name !== b.name)); body.replaceChildren(...render()); } }, 'Eliminar'))) : [h('p.muted', 'Aún no has guardado bloques. Selecciona un texto (con su formato, tablas, fichas…) y usa «Guardar la selección como bloque».')];
    };
    const body = h('div.blk-list', ...render());
    ui.dialog({ title: 'Mis bloques', width: 460, body, buttons: [{ label: 'Cerrar', primary: true }] });
  };
  X.blockMenu = function () {
    const mine = X.myBlocks();
    return BLOCKS.map((b) => ({ label: b.name, icon: b.icon, hint: b.desc, action: () => A().run('insertBlock', b.id) }))
      .concat(['-', { title: 'Mis bloques' }], mine.length ? mine.map((b) => ({ label: b.name, icon: 'star', action: () => X.insertMine(b.name) })) : [{ label: 'Todavía no hay bloques guardados', disabled: true }],
        ['-', { label: 'Guardar la selección como bloque…', icon: 'plus', action: () => X.saveBlock() }, { label: 'Administrar mis bloques…', icon: 'gear', action: () => X.manageBlocks() }]);
  };

  // =================================================================== variables y combinar correspondencia
  const varNames = (doc) => {
    const names = new Set(Object.keys(doc.meta.vars || {}));
    for (const story of ['body', 'hdr', 'ftr', 'hdr1', 'ftr1']) for (const id of doc.parasOf(story)) for (const r of doc.block(id).runs) if (r.o && r.o.k === 'fld' && r.o.f === 'var' && r.o.name) names.add(r.o.name);
    return Array.from(names);
  };
  X.varNames = varNames;
  const setVars = (vars, label) => {
    const a = A(), doc = a.doc;
    doc.tx(label || 'Variables', () => doc.set(['meta', 'vars'], vars));
    a.rebuildViews();
  };
  X.insertVar = async function (name) {
    const a = A(), doc = a.doc;
    if (!name) {
      name = await ui.prompt('Nombre de la variable (por ejemplo: Cliente, Fecha de entrega, Curso)', '', { title: 'Nueva variable' });
      if (!name || !name.trim()) return;
      name = name.trim().replace(/["\\]/g, '');
      const value = await ui.prompt('Valor de «' + name + '»', '', { title: 'Nueva variable', hint: 'Puedes cambiarlo cuando quieras en Herramientas › Variables: se actualiza en todo el documento.' });
      if (value == null) return;
      setVars(Object.assign({}, doc.meta.vars || {}, { [name]: value }), 'Nueva variable');
    }
    a.insertAtom('Insertar variable', { k: 'fld', f: 'var', name });
  };
  X.varMenu = function () {
    const doc = A().doc, names = varNames(doc), vars = doc.meta.vars || {};
    return names.map((n) => ({ label: n + (vars[n] ? ' = ' + String(vars[n]).slice(0, 30) : ''), icon: 'hash', action: () => X.insertVar(n) }))
      .concat(names.length ? ['-'] : [], [{ label: 'Nueva variable…', icon: 'plus', action: () => X.insertVar() }, { label: 'Editar variables…', icon: 'gear', action: () => C().showPanel('vars') }]);
  };
  const varsPanel = {
    render(side) {
      const a = A(), doc = a.doc;
      const vars = Object.assign({}, doc.meta.vars || {});
      for (const n of varNames(doc)) if (!(n in vars)) vars[n] = '';
      let timer = 0;
      const commit = () => { clearTimeout(timer); timer = setTimeout(() => setVars(Object.assign({}, vars)), 350); };
      const rows = Object.keys(vars).map((n) => {
        const inp = h('input.inp', { type: 'text', value: vars[n], 'aria-label': 'Valor de ' + n });
        inp.addEventListener('input', () => { vars[n] = inp.value; commit(); });
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        return h('div.var-row', h('div.var-name', h('b', n),
          h('span.grow'),
          h('button.btn.small', { type: 'button', title: 'Insertar en el cursor', onclick: () => X.insertVar(n) }, 'Insertar'),
          h('button.btn.small', { type: 'button', title: 'Cambiar el nombre', onclick: async () => {
            const nn = await ui.prompt('Nuevo nombre de «' + n + '»', n, { title: 'Variable' });
            if (!nn || !nn.trim() || nn.trim() === n) return;
            const name = nn.trim().replace(/["\\]/g, '');
            const nv = {}; for (const k in vars) nv[k === n ? name : k] = vars[k];
            a.edit('Renombrar variable', () => {
              doc.set(['meta', 'vars'], nv);
              for (const story of ['body', 'hdr', 'ftr', 'hdr1', 'ftr1']) for (const id of doc.parasOf(story)) {
                const p = doc.block(id);
                if (p.runs.some((r) => r.o && r.o.k === 'fld' && r.o.f === 'var' && r.o.name === n)) doc.put(P.with(p, { runs: p.runs.map((r) => (r.o && r.o.k === 'fld' && r.o.f === 'var' && r.o.name === n ? { o: Object.freeze(Object.assign({}, r.o, { name })), m: r.m } : r)) }));
              }
              return a.editor.sel;
            });
            a.rebuildViews();
            this.render(side);
          } }, 'Renombrar'),
          h('button.btn.small.danger-text', { type: 'button', title: 'Quitar la variable (los campos mostrarán su nombre)', onclick: () => { delete vars[n]; setVars(Object.assign({}, vars), 'Quitar variable'); this.render(side); } }, '×')), inp);
      });
      side.replaceChildren(h('div.side-head', h('span', 'Variables'), C().tbButton('close', 'Cerrar panel', () => C().closePanel())),
        h('div.side-scroll',
          h('p.muted.small', 'Escribe un valor una vez y aparece en todos los sitios donde insertaste la variable (también en encabezados y pies). Sirven para plantillas y para combinar correspondencia.'),
          ...(rows.length ? rows : [h('p.muted', 'Todavía no hay variables.')]),
          h('div.row', h('button.btn.small', { type: 'button', onclick: () => X.insertVar() }, '+ Nueva variable'), h('button.btn.small', { type: 'button', onclick: () => X.mailMerge() }, 'Combinar correspondencia…'))));
    },
    update() {},
    onClose() {},
  };

  // CSV o datos pegados de una hoja de cálculo
  function parseTable(text) {
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
    const first = text.split('\n')[0] || '';
    const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (!clean.length) return { head: [], rows: [] };
    return { head: clean[0].map((x) => x.trim()), rows: clean.slice(1) };
  }
  X.parseTable = parseTable;
  // copia del documento con las variables convertidas en texto
  function frozenJSON(doc, values, suffix) {
    const json = doc.toJSON();
    json.meta.vars = Object.assign({}, json.meta.vars || {}, values);
    const listMap = {}, noteMap = {};
    if (suffix) {
      for (const id in json.lists) { listMap[id] = id + suffix; }
      const nl = {}; for (const id in json.lists) nl[listMap[id]] = json.lists[id]; json.lists = nl;
      const nn = {}; for (const id in json.notes) { noteMap[id] = id + suffix; nn[noteMap[id]] = json.notes[id]; } json.notes = nn;
    }
    const fixRuns = (runs) => runs.map((r) => {
      if (r.o && r.o.k === 'fld' && r.o.f === 'var') { const v = values[r.o.name]; return { x: v == null ? '' : String(v), m: r.m }; }
      if (r.o && r.o.k === 'fn' && noteMap[r.o.id]) return { o: Object.assign({}, r.o, { id: noteMap[r.o.id] }), m: r.m };
      if (suffix && r.m && r.m.cm) { const m = Object.assign({}, r.m); delete m.cm; return Object.assign({}, r, { m }); }
      return r;
    }).filter((r) => r.o || r.x);
    const fixBlocks = (blocks) => (blocks || []).map((b) => {
      if (b.t === 'p') { const nb = Object.assign({}, b, { runs: fixRuns(b.runs || []) }); if (nb.ls && listMap[nb.ls.id]) nb.ls = Object.assign({}, nb.ls, { id: listMap[nb.ls.id] }); return nb; }
      if (b.t === 'table') return Object.assign({}, b, { rows: b.rows.map((row) => Object.assign({}, row, { cells: row.cells.map((c) => Object.assign({}, c, { blocks: fixBlocks(c.blocks) })) })) });
      return b;
    });
    for (const s of ['body', 'hdr', 'ftr', 'hdr1', 'ftr1']) json[s] = fixBlocks(json[s]);
    for (const id in json.notes) json.notes[id] = { blocks: fixBlocks(json.notes[id].blocks) };
    if (suffix) json.comments = {};
    return json;
  }
  X.frozenJSON = frozenJSON;
  X.mailMerge = function () {
    const a = A(), doc = a.doc;
    const names = varNames(doc);
    if (!names.length) { ui.alert('Primero inserta variables en el documento (Insertar › Variable) en los sitios que cambian de una copia a otra: nombre, dirección, curso…', 'Combinar correspondencia'); return; }
    const ta = h('textarea.inp.mm-data', { rows: 7, placeholder: names.join('\t') + '\n' + names.map(() => '…').join('\t'), spellcheck: false });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const info = h('div.mm-info.muted.small');
    const mode = ui.radios('mm-mode', [['doc', 'Un documento con todas las copias (una por página)'], ['zip', 'Un archivo de Word por registro (en un .zip)']], 'doc');
    let parsed = { head: [], rows: [] };
    const mapOf = () => { const m = {}; for (const n of names) { const i = parsed.head.findIndex((x) => fold(x) === fold(n)); if (i >= 0) m[n] = i; } return m; };
    const check = () => {
      parsed = parseTable(ta.value);
      const map = mapOf(), miss = names.filter((n) => !(n in map));
      info.replaceChildren(parsed.head.length ? h('span', parsed.rows.length + ' registro(s) · columnas: ' + parsed.head.join(', ') + (miss.length ? ' · sin columna para: ' + miss.join(', ') : ' · todas las variables tienen columna')) : h('span', 'La primera fila debe tener los nombres de las columnas, iguales a los de las variables: ' + names.join(', ') + '.'));
    };
    ta.addEventListener('input', check);
    const load = h('button.btn.small', { type: 'button', onclick: async () => { const f = await ui.pickFile('.csv,.tsv,.txt'); if (f) { ta.value = await f.text(); check(); } } }, 'Abrir CSV…');
    check();
    ui.dialog({
      title: 'Combinar correspondencia', width: 620,
      body: h('div.mm',
        h('p.dlg-msg', 'Crea una copia del documento por cada fila de datos, con las variables rellenas. Pega aquí los datos copiados de una hoja de cálculo o abre un CSV.'),
        h('div.row', h('span.muted.small', 'Variables del documento: ' + names.join(', ')), h('span.grow'), load), ta, info, mode),
      buttons: [{ label: 'Cancelar' }, { label: 'Combinar', primary: true, action: () => {
        check();
        if (!parsed.rows.length) { ui.toast('No hay datos que combinar.'); return false; }
        X.runMerge(parsed, mapOf(), mode.value()).catch((e) => ui.alert('No se pudo combinar: ' + e.message, 'Combinar correspondencia'));
      } }],
    });
  };
  X.runMerge = async function (parsed, map, mode) {
    const doc = A().doc;
    const recs = parsed.rows.map((row) => { const v = {}; for (const n in map) v[n] = (row[map[n]] || '').trim(); return v; });
    if (mode === 'zip') {
      const files = [];
      const used = new Set();
      for (let i = 0; i < recs.length; i++) {
        const d = PT.Doc.fromJSON(frozenJSON(doc, recs[i]));
        const blob = await PT.docx.write(d);
        let base = (Object.values(recs[i]).find((x) => x) || 'registro').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'registro';
        let name = base, k = 2;
        while (used.has(name.toLowerCase())) name = base + ' (' + k++ + ')';
        used.add(name.toLowerCase());
        files.push({ name: String(i + 1).padStart(3, '0') + ' ' + name + '.docx', data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const zip = await PT.zip.zip(files, 'application/zip');
      const archiveName = PT.safeName(doc.meta.title || 'documento') + ' (combinados).zip';
      if (window.AndroidText) {
        if (!await PT.android.save(zip, archiveName)) return;
      } else {
        ui.download(zip, archiveName);
      }
      ui.toast(recs.length + ' documentos de Word generados.');
      return;
    }
    const first = frozenJSON(doc, recs[0]);
    for (let i = 1; i < recs.length; i++) {
      const j = frozenJSON(doc, recs[i], '_' + i);
      const body = j.body;
      if (body.length) body[0] = Object.assign({}, body[0], { pb: true });
      first.body = first.body.concat(body);
      Object.assign(first.lists, j.lists);
      Object.assign(first.notes, j.notes);
    }
    first.meta.title = (doc.meta.title || 'Documento') + ' (combinado)';
    const out = PT.Doc.fromJSON(first);
    await PT.files.adopt(out, ['Documento combinado: ' + recs.length + ' copias.' + (['hdr', 'ftr'].some((s) => doc[s].some((b) => b.t === 'p' && b.runs.some((r) => r.o && r.o.f === 'var'))) ? ' Los encabezados y pies usan los datos del primer registro.' : ''), 6000]);
  };

  // =================================================================== modo presentación
  X.present = function () {
    const a = A(), doc = a.doc, flow = a.layout.flow;
    if (a.activeHost) a.editStory(null, true);
    const slides = [];
    let cur = [];
    const lvl = (b) => (b && b.t === 'p' ? doc.style(b.st || 'normal').lvl || 0 : 0);
    for (const el of flow.children) {
      if (!el.dataset || !el.dataset.id) continue;
      const b = doc.block(el.dataset.id);
      if (!b) continue;
      if (b.t === 'hr') { if (cur.length) slides.push(cur); cur = []; continue; }
      if (b.t === 'toc') continue; // el índice no se muestra en la presentación
      const starts = (b.t === 'p' && (lvl(b) === 1 || lvl(b) === 2 || b.st === 'title')) || b.pb;
      if (starts && cur.some((x) => x.b.t !== 'p' || R.text(x.b.runs).trim() || x.b.runs.some((r) => r.o))) { slides.push(cur); cur = []; }
      cur.push({ el, b });
    }
    if (cur.length) slides.push(cur);
    const real = slides.map((s) => s.filter((x) => x.b.t !== 'p' || R.text(x.b.runs).trim() || x.b.runs.some((r) => r.o))).filter((s) => s.length);
    if (!real.length) { ui.toast('El documento está vacío.'); return; }
    let k = 0;
    const stage = h('div.pres-stage');
    const counter = h('span.pres-count');
    const bar = h('div.pres-progress', h('span'));
    const prevB = h('button.pres-btn', { type: 'button', title: 'Anterior (←)', onclick: () => go(k - 1) }, ui.icon('left', 18));
    const nextB = h('button.pres-btn', { type: 'button', title: 'Siguiente (→, espacio)', onclick: () => go(k + 1) }, ui.icon('right', 18));
    const fsB = h('button.pres-btn', { type: 'button', title: 'Pantalla completa (F)', onclick: () => toggleFs() }, ui.icon('fullscreen', 16));
    const exitB = h('button.pres-btn.pres-exit', { type: 'button', title: 'Salir (Esc)', onclick: () => end() }, ui.icon('close', 16), h('span', 'Salir'));
    const controls = h('div.pres-controls', prevB, counter, nextB, h('span.grow'), fsB, exitB);
    const root = h('div.pres', { role: 'dialog', 'aria-label': 'Presentación', tabIndex: -1 }, stage, bar, controls);
    root.style.setProperty('--page-color', doc.page.color || '#ffffff');
    const clean = (el) => {
      const c = el.cloneNode(true);
      for (const x of c.querySelectorAll('.pt-gap, .pt-gap-in, .pt-deco, .pt-br')) x.remove();
      for (const x of c.querySelectorAll('[contenteditable]')) x.removeAttribute('contenteditable');
      c.removeAttribute('contenteditable');
      c.classList.remove('pt-cur');
      return c;
    };
    const build = (i) => {
      const s = real[i];
      const title = s[0].b.t === 'p' && (s[0].b.st === 'title' || (i === 0 && lvl(s[0].b) === 1 && s.length <= 3));
      const content = h('div.pt-flow.pres-flow');
      for (const x of s) content.appendChild(clean(x.el));
      const slide = h('div.pres-slide' + (title ? '.pres-title' : ''), h('div.pres-inner', content));
      return slide;
    };
    // prueba varios anchos de columna y se queda con el que deja la letra más grande sin desbordar
    const fit = (slide) => {
      const inner = slide.querySelector('.pres-inner'), content = slide.querySelector('.pres-flow');
      const W = slide.clientWidth, H = slide.clientHeight;
      content.style.transform = 'none';
      let best = null;
      for (const width of [520, 600, 680, 760, 880]) {
        content.style.width = width + 'px';
        const w = Math.max(width, content.scrollWidth), hgt = Math.max(1, content.scrollHeight);
        const s = Math.min((W * 0.88) / w, (H * 0.84) / hgt, 2.2);
        if (!best || s > best.s + 0.01) best = { width, w, hgt, s };
      }
      const s = Math.max(0.3, best.s);
      content.style.width = best.width + 'px';
      content.style.transform = 'scale(' + s + ')';
      inner.style.width = best.w * s + 'px';
      inner.style.height = best.hgt * s + 'px';
    };
    const go = (i) => {
      if (i < 0 || i >= real.length) return;
      k = i;
      const slide = build(k);
      stage.replaceChildren(slide);
      fit(slide);
      counter.textContent = (k + 1) + ' / ' + real.length;
      bar.firstChild.style.width = ((k + 1) / real.length) * 100 + '%';
      prevB.disabled = k === 0; nextB.disabled = k === real.length - 1;
    };
    const onKey = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(k + 1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(k - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(real.length - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); end(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
      e.stopPropagation();
    };
    const onResize = () => { const s = stage.firstChild; if (s) fit(s); };
    let hideT = 0;
    const wake = () => { root.classList.add('awake'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.remove('awake'), 2200); };
    const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (root.requestFullscreen) root.requestFullscreen().catch(() => {}); };
    function end() {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      root.remove();
      a.focusEditor();
    }
    stage.addEventListener('click', (e) => { if (!e.target.closest('a')) go(k + 1); });
    root.addEventListener('pointermove', wake);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.body.appendChild(root);
    root.focus();
    // empieza en la diapositiva del cursor
    const curId = a.editor && a.editor.sel && a.editor.sel.h.id;
    const topEl = curId && a.bodyView.paraEl(curId) ? a.bodyView.paraEl(curId).closest('.pt-flow > *') : null;
    const start = topEl ? Math.max(0, real.findIndex((s) => s.some((x) => x.el === topEl))) : 0;
    go(start);
    wake();
    ui.toast('Presentación: → y ← para avanzar, F para pantalla completa, Esc para salir.', 3500);
  };

  // =================================================================== dibujo y firma
  X.draw = function (kind) {
    const sign = kind === 'sign';
    const W = sign ? 520 : 680, H = sign ? 200 : 380;
    const cv = h('canvas.draw-cv', { width: W * 2, height: H * 2, style: { width: W + 'px', height: H + 'px' } });
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const strokes = [];
    let color = sign ? '#1f3a8a' : '#202124', size = sign ? 2.6 : 3, erase = false, cur = null;
    const redraw = () => {
      ctx.clearRect(0, 0, W, H);
      if (sign) { ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(24, H - 46); ctx.lineTo(W - 24, H - 46); ctx.stroke(); ctx.setLineDash([]); }
      for (const s of strokes) paintStroke(ctx, s);
    };
    // trazo suavizado con curvas; el grosor sigue la presión del lápiz
    const paintStroke = (c2, s) => {
      c2.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      c2.strokeStyle = s.color; c2.fillStyle = s.color; c2.lineCap = 'round'; c2.lineJoin = 'round';
      const p = s.pts;
      if (p.length === 1) { c2.beginPath(); c2.arc(p[0].x, p[0].y, s.size / 2, 0, Math.PI * 2); c2.fill(); }
      for (let i = 1; i < p.length; i++) {
        const a0 = p[i - 1], a1 = p[i];
        c2.lineWidth = s.size * (0.55 + 0.9 * (a1.p || 0.5));
        c2.beginPath();
        const m0 = i > 1 ? { x: (p[i - 2].x + a0.x) / 2, y: (p[i - 2].y + a0.y) / 2 } : a0, m1 = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
        c2.moveTo(m0.x, m0.y); c2.quadraticCurveTo(a0.x, a0.y, m1.x, m1.y); c2.stroke();
      }
      c2.globalCompositeOperation = 'source-over';
    };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p: e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5 }; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { color, size: erase ? size * 4 : size, erase, pts: [pt(e)] }; strokes.push(cur); redraw(); });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      // los puntos intermedios dan trazos suaves; algunos navegadores y eventos no los dan
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of list.length ? list : [e]) cur.pts.push(pt(ev));
      redraw();
    });
    const up = () => { cur = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const colors = ['#202124', '#1f3a8a', '#c5221f', '#188038', '#e37400', '#7b1fa2'];
    const sw = h('div.draw-colors', colors.map((c) => {
      const b = h('button.draw-sw' + (c === color ? '.on' : ''), { type: 'button', title: c, style: { background: c }, onclick: () => { color = c; erase = false; for (const x of sw.children) x.classList.toggle('on', x === b); er.classList.remove('on'); } });
      return b;
    }));
    const thick = h('input', { type: 'range', min: 1, max: 14, step: 0.5, value: size, title: 'Grosor', oninput: (e) => { size = +e.target.value; } });
    const er = h('button.btn.small', { type: 'button', onclick: () => { erase = !erase; er.classList.toggle('on', erase); } }, 'Borrador');
    const undo = h('button.btn.small', { type: 'button', onclick: () => { strokes.pop(); redraw(); } }, 'Deshacer');
    const clear = h('button.btn.small', { type: 'button', onclick: () => { strokes.length = 0; redraw(); } }, 'Borrar todo');
    const author = PT.locale.author || '';
    const withName = sign ? ui.check('Añadir debajo el nombre y la fecha', !!author) : null;
    const nameInp = sign ? h('input.inp', { type: 'text', value: author, placeholder: 'Nombre', style: { width: '200px' } }) : null;
    redraw();
    ui.dialog({
      title: sign ? 'Firma' : 'Dibujo', width: W + 48,
      body: h('div.draw', h('div.draw-tools', sw, thick, er, undo, clear), cv, sign ? h('div.row', withName, nameInp) : h('p.muted.small', 'Dibuja con el ratón, el dedo o un lápiz (se nota la presión). Se insertará como imagen.')),
      buttons: [{ label: 'Cancelar' }, { label: 'Insertar', primary: true, action: () => {
        const ink = strokes.filter((s) => !s.erase);
        if (!ink.length) { ui.toast(sign ? 'Firma en el recuadro.' : 'Dibuja algo antes.'); return false; }
        // recorta al contenido
        let x0 = W, y0 = H, x1 = 0, y1 = 0;
        for (const s of ink) for (const p of s.pts) { x0 = Math.min(x0, p.x - s.size); y0 = Math.min(y0, p.y - s.size); x1 = Math.max(x1, p.x + s.size); y1 = Math.max(y1, p.y + s.size); }
        const pad = 8;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
        const out = document.createElement('canvas');
        out.width = Math.round((x1 - x0) * 2); out.height = Math.round((y1 - y0) * 2);
        const oc = out.getContext('2d');
        oc.scale(2, 2); oc.translate(-x0, -y0);
        // se vuelve a pintar sin la línea guía de la firma
        for (const s of strokes) paintStroke(oc, s);
        const src = out.toDataURL('image/png');
        const name = sign && nameInp ? nameInp.value.trim() : '';
        X.insertDrawing(src, sign ? 'Firma' + (name ? ' de ' + name : '') : 'Dibujo', sign && withName && withName.input.checked ? name : null, sign, x1 - x0, y1 - y0);
      } }],
    });
  };
  // tamaño en puntos según lo dibujado (el lienzo va a doble resolución); una firma, como mucho 170 pt de ancho
  X.insertDrawing = async function (src, alt, name, sign, wPx, hPx) {
    const a = A();
    const d = PT.pageDims(a.doc.page);
    let w = PT.px2pt(wPx || 300), hh = PT.px2pt(hPx || 150);
    const k = Math.min(1, (sign ? 170 : d.cw) / w, (d.ch * 0.8) / hh);
    w = PT.round(w * k, 1); hh = PT.round(hh * k, 1);
    a.focusEditor();
    a.insertAtom(sign ? 'Insertar firma' : 'Insertar dibujo', { k: 'img', src, w, h: hh, alt });
    if (sign && name != null) {
      // justo después de la imagen recién insertada (la posición interna del editor, no la del navegador)
      const ed = a.editor;
      ed.exec('Firma', () => {
        const pos = O.ordered(a.doc, ed.sel)[1];
        const at = O.split(a.doc, pos);
        const runs = [{ x: name || '', m: M.EMPTY }, { x: name ? ' · ' : '', m: M.EMPTY }, { o: Object.freeze({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' }), m: M.EMPTY }].filter((r) => r.o || r.x);
        return O.insertRuns(a.doc, at, runs);
      });
    }
  };

  // =================================================================== enlaces con la aplicación
  let refreshT = 0;
  X.afterRefresh = function () {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => {
      try { X.goalWidget(); } catch (e) { console.warn(e); }
    }, 300);
    if (A().doc.page.lnNum && A().doc.page.lnNum.on) X.scheduleLines();
    else if (lnCache) X.computeLines();
  };
  X.init = function () {
    const a = A();
    C().els.workspace.classList.toggle('typewriter', !!a.settings.typewriter);
    if (PT.authorship) PT.authorship.apply();
    // las hojas se vuelven a dibujar al editar encabezados: se reponen los números de línea
    const L = a.layout, orig = L.renderPages.bind(L);
    L.renderPages = function (d) { orig(d); X.paintLines(); };
    // doble clic en una variable: abre el panel de variables
    C().els.canvas.addEventListener('dblclick', (e) => { const f = e.target.closest && e.target.closest('.pt-fld[data-f="var"]'); if (f) { e.preventDefault(); C().showPanel('vars'); } });
  };
  (PT.panels = PT.panels || {}).vars = varsPanel;
})();

// comandos nuevos (se llaman con PT.app.run(nombre, argumento) desde menús, cinta, paleta y menú @)
(function () {
  'use strict';
  const PT = window.PT, X = PT.extras, C = () => PT.chrome;
  Object.assign(PT.app.cmd, {
    noop() {},
    palette() { X.palette(); },
    ai(action) { PT.ai.open(action); },
    aiConfig() { PT.ai.configure(); },
    styleCheck() { C().showPanel('style'); },
    a11y() { C().showPanel('a11y'); },
    compare() { PT.compareUI.open(); },
    authorship() { PT.authorship.dialog(); },
    showAuthorship() { PT.authorship.toggle(); },
    typewriter() { X.toggleSetting('typewriter', 'Máquina de escribir: la línea en la que escribes se queda en el centro.', 'Máquina de escribir desactivada.'); },
    dimOthers() { X.toggleSetting('dimOthers', 'Se atenúa todo menos el párrafo en el que escribes.', 'Texto sin atenuar.'); },
    wordGoal() { X.goalDialog(); },
    lineNumbers(mode) { X.lineNumbers(mode || 'cont'); },
    insertBlock(id) { X.insertBlock(id); },
    saveBlock() { X.saveBlock(); },
    myBlocks() { X.manageBlocks(); },
    variable(name) { X.insertVar(name); },
    variables() { C().showPanel('vars'); },
    mailMerge() { X.mailMerge(); },
    present() { X.present(); },
    drawing() { X.draw('draw'); },
    signature() { X.draw('sign'); },
    // ordenar alfabéticamente los párrafos seleccionados (en una tabla, la tabla por la columna actual)
    sortParas(desc) {
      if (this.tableCtx()) { this.run('tableSort', desc); return; }
      const doc = this.doc, sel = this.sel();
      if (!sel) return;
      const ids = PT.ops.paraIds(doc, sel);
      if (ids.length < 2) { PT.ui.toast('Selecciona los párrafos que quieres ordenar.'); return; }
      const l0 = doc.loc(ids[0]);
      if (ids.some((id, k) => { const l = doc.loc(id); return l.owner !== l0.owner || l.i !== l0.i + k; })) { PT.ui.toast('Los párrafos que se ordenan tienen que ir seguidos y fuera de tablas.'); return; }
      const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
      const blocks = ids.map((id) => doc.block(id));
      const sorted = blocks.slice().sort((x, y) => coll.compare(PT.runs.text(x.runs).trim(), PT.runs.text(y.runs).trim()) * (desc ? -1 : 1));
      if (sorted.every((b, k) => b === blocks[k])) { PT.ui.toast('Los párrafos ya están en ese orden.'); return; }
      const last = sorted[sorted.length - 1];
      this.edit('Ordenar párrafos', () => { doc.replace(l0.owner, l0.i, ids.length, sorted); return { a: { id: sorted[0].id, off: 0 }, h: { id: last.id, off: PT.para.len(last) } }; });
    },
    // sombreado (color de fondo) de los párrafos seleccionados
    paraShade(c) {
      const sel = this.sel();
      if (!sel) return;
      this.edit('Sombreado', () => { PT.ops.setPara(this.doc, PT.ops.paraIds(this.doc, sel), { bg: c || null }); return sel; });
    },
  });
})();
