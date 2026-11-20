/* Diálogos de formato y estructura: buscar y reemplazar, ir a, vínculo, párrafo, fuente, configurar página,
   números de página, marca de agua, bordes y sombreado, estilos, tablas e imágenes. */
(function () {
  'use strict';
  const PT = window.PT, O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para, V = PT.view, ui = PT.ui, h = ui.h;
  const A = () => PT.app;
  const unit = () => PT.unitLabel();
  const lenInput = (pt, w) => ui.numInput(pt == null ? '' : PT.toUnit(pt), { unit: unit(), width: w || 70 });
  const lenOf = (el) => { const v = (el.tagName === 'INPUT' ? el : el.querySelector('input')).value; if (String(v).trim() === '') return null; return PT.fromUnit(v); };
  const ptInput = (v, w) => ui.numInput(v == null ? '' : PT.fmtNum(v, 1), { unit: 'pt', width: w || 60 });
  const row = (...kids) => h('div.row', ...kids);

  const dlg = (PT.dlg = {
    // ------------------------------------------------------------ buscar y reemplazar (panel flotante)
    find(withReplace) {
      const a = A();
      let panel = document.getElementById('find-panel');
      const r = a.range();
      const selText = r && r[0].id === r[1].id && r[1].off - r[0].off < 80 ? R.text(R.slice(a.doc.block(r[0].id).runs, r[0].off, r[1].off)).replace(/￼/g, '') : '';
      if (panel) {
        panel.querySelector('.find-repl').hidden = !withReplace && panel.querySelector('.find-repl').hidden;
        if (withReplace) panel.querySelector('.find-repl').hidden = false;
        const q = panel.querySelector('.find-q');
        if (selText) { q.value = selText; panel._search(); }
        q.focus(); q.select();
        return;
      }
      const opts = { matchCase: false, whole: false, regex: false, accents: false };
      const q = h('input.inp.find-q', { type: 'search', placeholder: 'Buscar en el documento', 'aria-label': 'Buscar', value: selText });
      const rep = h('input.inp', { type: 'text', placeholder: 'Reemplazar con', 'aria-label': 'Reemplazar con' });
      const count = h('span.find-count.muted');
      let matches = [], cur = -1;
      const hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
      const paint = () => {
        if (!hl) return;
        const view = a.bodyView, all = [], one = [];
        matches.slice(0, 3000).forEach((m, i) => {
          const el = view.paraEl(m.id);
          if (!el) return;
          try {
            const s = V.posToDom(el, m.from), e = V.posToDom(el, m.to), rg = new Range();
            rg.setStart(s.node, s.offset); rg.setEnd(e.node, e.offset);
            (i === cur ? one : all).push(rg);
          } catch (err) { /* nodo fuera del documento */ }
        });
        CSS.highlights.set('pt-find', new Highlight(...all));
        CSS.highlights.set('pt-find-cur', new Highlight(...one));
      };
      const search = (keepIndex) => {
        matches = q.value ? O.find(a.doc, 'body', q.value, opts) : [];
        if (!keepIndex) {
          // la coincidencia más cercana al cursor
          const s = a.bodyEditor.sel, pos = s ? O.ordered(a.doc, s)[0] : null;
          cur = matches.length ? Math.max(0, matches.findIndex((m) => pos && a.doc.cmp({ id: m.id, off: m.from }, pos) >= 0)) : -1;
        } else cur = Math.min(cur, matches.length - 1);
        const bad = q.value && opts.regex && !O.searchRegex(q.value, opts);
        count.textContent = bad ? 'Expresión no válida' : !q.value ? '' : matches.length ? (cur + 1) + ' de ' + matches.length : 'Sin resultados';
        q.classList.toggle('bad', !!bad || (!!q.value && !matches.length));
        paint();
      };
      const show = (i, focusDoc) => {
        if (!matches.length) return;
        cur = (i + matches.length) % matches.length;
        const m = matches[cur];
        a.goToPara(m.id, m.from);
        a.bodyEditor.setSel({ a: { id: m.id, off: m.from }, h: { id: m.id, off: m.to } });
        const el = a.bodyView.paraEl(m.id);
        if (el) { const rr = V.rectAt(el, m.from, Math.max(1, m.to - m.from)), ws = PT.chrome.els.workspace, wr = ws.getBoundingClientRect(); if (rr.top < wr.top + 60 || rr.bottom > wr.bottom - 40) ws.scrollTop += rr.top - wr.top - wr.height / 3; }
        count.textContent = (cur + 1) + ' de ' + matches.length;
        paint();
        if (!focusDoc) q.focus();
      };
      const replaceOne = () => {
        if (cur < 0 || !matches[cur]) return;
        const m = matches[cur];
        a.editStory(null, true);
        a.bodyEditor.exec('Reemplazar', () => O.replaceMatch(a.doc, m, rep.value, opts));
        search(true);
        if (matches.length) show(cur);
      };
      const replaceAll = () => {
        if (!q.value) return;
        let n = 0;
        a.editStory(null, true);
        a.bodyEditor.exec('Reemplazar todo', () => { n = O.replaceAll(a.doc, 'body', q.value, rep.value, opts); return a.bodyEditor.sel; });
        ui.toast(n ? 'Se reemplazaron ' + n + ' coincidencias.' : 'No hay coincidencias.');
        search();
      };
      q.addEventListener('input', () => search());
      q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); show(e.shiftKey ? cur - 1 : cur + (count.dataset.shown ? 1 : 0)); count.dataset.shown = '1'; } else if (e.key === 'Escape') close(); });
      rep.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } else if (e.key === 'Escape') close(); });
      const opt = (label, key, title) => { const c = ui.check(label, opts[key], (v) => { opts[key] = v; search(); }); c.title = title; return c; };
      const close = () => {
        panel.remove();
        if (hl) { CSS.highlights.delete('pt-find'); CSS.highlights.delete('pt-find-cur'); }
        a.doc.off('change', onChange);
        a.focusEditor();
      };
      const onChange = PT.debounce(() => { if (panel.isConnected) search(true); }, 250);
      a.doc.on('change', onChange);
      const B = (icon, label, fn) => PT.chrome.tbButton(icon, label, fn);
      panel = h('div#find-panel', { role: 'search' },
        h('div.find-row', q, count, B('up', 'Anterior (Mayús+Intro)', () => show(cur - 1)), B('down', 'Siguiente (Intro)', () => show(cur + 1)), B('close', 'Cerrar (Esc)', close)),
        h('div.find-row.find-repl', { hidden: !withReplace }, rep, h('button.btn.small', { type: 'button', onclick: replaceOne }, 'Reemplazar'), h('button.btn.small', { type: 'button', onclick: replaceAll }, 'Todo')),
        h('div.find-row.opts', opt('Mayúsculas', 'matchCase', 'Distinguir mayúsculas de minúsculas'), opt('Palabra completa', 'whole', 'Solo palabras completas'), opt('Tildes', 'accents', 'Distinguir letras con y sin tilde'), opt('Expresión regular', 'regex', 'Usar expresiones regulares (por ejemplo \\d+ o (a|b)); en el reemplazo, $1 inserta el primer grupo'),
          withReplace ? null : h('button.linkish', { type: 'button', onclick: () => { panel.querySelector('.find-repl').hidden = false; rep.focus(); } }, 'Reemplazar…')));
      panel._search = search;
      document.getElementById('center').appendChild(panel);
      q.focus(); q.select();
      if (q.value) search();
    },

    // ------------------------------------------------------------ ir a
    goTo() {
      const a = A(), doc = a.doc;
      const page = ui.numInput('', { width: 80 });
      const heads = V.tocEntries(doc, 6);
      const list = h('div.list.goto-list');
      for (const e of heads) {
        const it = h('div.list-item', { style: { paddingLeft: 8 + (e.lvl - 1) * 14 + 'px' } }, e.text);
        it.addEventListener('click', () => { close(); a.goToPara(e.id); });
        list.appendChild(it);
      }
      if (!heads.length) list.appendChild(h('div.list-item.muted', 'El documento no tiene títulos.'));
      const close = ui.dialog({
        title: 'Ir a', width: 400,
        body: [ui.field('Número de página (1 a ' + (a.layout.count + (doc.page.start || 1) - 1) + ')', page), h('div.field-label', 'Títulos'), list],
        buttons: [{ label: 'Cancelar' }, { label: 'Ir', primary: true, action: () => { const n = ui.numOf(page); if (n == null) return false; a.goToPage(Math.round(n)); return undefined; } }],
      });
    },

    // ------------------------------------------------------------ vínculo
    link() {
      const a = A(), doc = a.doc, ed = a.editor;
      const sel = ed.readSel();
      if (!sel) return;
      let [from, to] = O.ordered(doc, sel);
      const p0 = doc.block(from.id);
      let cur = R.marksAt(p0.runs, from.off) || (from.off > 0 ? R.marksAt(p0.runs, from.off - 1) : null);
      let href = cur && cur.ln ? cur.ln : '';
      if (O.same(from, to) && href) {
        let s = from.off, e = from.off;
        while (s > 0 && (R.marksAt(p0.runs, s - 1) || {}).ln === href) s--;
        while (e < P.len(p0) && (R.marksAt(p0.runs, e) || {}).ln === href) e++;
        from = { id: p0.id, off: s }; to = { id: p0.id, off: e };
      }
      const single = from.id === to.id;
      const text = h('input.inp', { type: 'text', value: single ? R.text(R.slice(p0.runs, from.off, to.off)).replace(/￼/g, '') : '', disabled: !single, placeholder: 'Texto que se mostrará' });
      const url = h('input.inp', { type: 'text', value: href && href[0] !== '#' ? href : '', placeholder: 'https://ejemplo.com, correo@dominio.es o tel:+34…', autofocus: true });
      const heads = V.tocEntries(doc, 6);
      const target = ui.select([['', '(ninguno)']].concat(heads.map((e) => ['#' + e.id, ' '.repeat(e.lvl - 1) + e.text.slice(0, 60)])), href[0] === '#' ? href : '');
      const close = ui.dialog({
        title: href ? 'Editar vínculo' : 'Insertar vínculo', width: 460,
        body: [ui.field('Texto', text), ui.field('Dirección web', url, 'Se añadirá https:// si falta.'), ui.field('O un título de este documento', target)],
        buttons: [
          href ? { label: 'Quitar vínculo', action: () => { a.edit('Quitar vínculo', () => { O.setMarks(doc, from, to, (m) => M.with(m, { ln: null })); return sel; }); } } : null,
          { label: 'Cancelar' },
          { label: 'Aplicar', primary: true, action: () => {
            let link = target.value || url.value.trim();
            if (!link) { url.focus(); return false; }
            if (link[0] !== '#') {
              if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link)) link = 'mailto:' + link;
              else if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = 'https://' + link;
              if (!/^(https?|mailto|tel):/i.test(link)) { ui.toast('Solo se admiten direcciones http, https, mailto y tel.'); return false; }
            }
            const label = text.value;
            a.edit('Vínculo', () => {
              if (single && label && label !== R.text(R.slice(doc.block(from.id).runs, from.off, to.off)).replace(/￼/g, '')) {
                const m = O.same(from, to) ? O.typingMarks(doc, from) : R.marksAt(doc.block(from.id).runs, from.off) || M.EMPTY;
                const end = O.insertText(doc, { a: from, h: to }, label, M.with(m, { ln: link }));
                return O.caret(end);
              }
              if (O.same(from, to)) { const end = O.insertText(doc, { a: from, h: to }, link.replace(/^mailto:/, ''), M.with(O.typingMarks(doc, from), { ln: link })); return O.caret(end); }
              O.setMarks(doc, from, to, (m) => M.with(m, { ln: link }));
              return { a: from, h: to };
            });
            return undefined;
          } },
        ].filter(Boolean),
      });
      void close;
    },

    // ------------------------------------------------------------ párrafo
    paragraph(tab) {
      const a = A(), doc = a.doc, sel = a.sel();
      if (!sel) return;
      const ids = O.paraIds(doc, sel), p = doc.block(sel.h.id), pp = doc.paraProps(p);
      const al = ui.select([['left', 'Izquierda'], ['center', 'Centrada'], ['right', 'Derecha'], ['justify', 'Justificada']], pp.al || 'left');
      const inL = lenInput(pp.inL || 0), inR = lenInput(pp.inR || 0);
      const special = ui.select([['none', '(ninguna)'], ['first', 'Primera línea'], ['hang', 'Francesa']], pp.inF > 0 ? 'first' : pp.inF < 0 ? 'hang' : 'none');
      const by = lenInput(Math.abs(pp.inF || 0));
      const spB = ptInput(pp.spB || 0), spA = ptInput(pp.spA || 0);
      const lineKind = ui.select([['1', 'Sencillo'], ['1.15', '1,15'], ['1.5', '1,5 líneas'], ['2', 'Doble'], ['multiple', 'Múltiple'], ['exact', 'Exacto']], pp.lhx ? 'exact' : ['1', '1.15', '1.5', '2'].includes(String(pp.lh || 1)) ? String(pp.lh || 1) : 'multiple');
      const lineVal = ui.numInput(pp.lhx ? PT.fmtNum(pp.lhx, 1) : PT.fmtNum(pp.lh || 1, 2), { width: 60 });
      const lineUnit = h('span.muted', pp.lhx ? 'pt' : 'veces');
      lineKind.addEventListener('change', () => { lineUnit.textContent = lineKind.value === 'exact' ? 'pt' : 'veces'; if (lineKind.value === 'exact') lineVal.value = '14'; else if (lineKind.value !== 'multiple') lineVal.value = PT.fmtNum(+lineKind.value, 2); });
      const kn = ui.check('Conservar con el siguiente', !!pp.kn), kl = ui.check('Conservar líneas juntas', !!pp.kl), pb = ui.check('Salto de página anterior', !!p.pb);
      const rtl = ui.check('Texto de derecha a izquierda', !!p.rtl);
      const bg = ui.colorButton(p.bg || null, null, 'Sin sombreado');
      const body = ui.tabs([
        { label: 'Sangría y espacio', body: [
          row(ui.field('Alineación', al), h('span')),
          h('div.field-label', 'Sangría'), row(ui.field('Izquierda', inL), ui.field('Derecha', inR)),
          row(ui.field('Especial', special), ui.field('Valor', by)),
          h('div.field-label', 'Espaciado'), row(ui.field('Antes', spB), ui.field('Después', spA)),
          row(ui.field('Interlineado', lineKind), ui.field('En', h('span.unit-wrap', lineVal, lineUnit))),
        ] },
        { label: 'Líneas y saltos', body: [kn, kl, pb, h('hr.sep'), rtl, h('p.muted', 'Los títulos se mantienen con el párrafo siguiente para no quedar solos al pie de una página. El control de líneas viudas y huérfanas siempre está activo.')] },
        { label: 'Sombreado', body: [ui.field('Color de fondo del párrafo', bg)] },
      ], tab || 0);
      ui.dialog({
        title: 'Párrafo', width: 470, body,
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const patch = { al: al.value === 'left' ? null : al.value, inL: lenOf(inL) || null, inR: lenOf(inR) || null };
          const v = lenOf(by) || 0;
          patch.inF = special.value === 'first' ? v : special.value === 'hang' ? -v : p.ls ? null : null;
          const nb = ui.numOf(spB), na = ui.numOf(spA);
          if (nb != null) patch.spB = nb; if (na != null) patch.spA = na;
          const lv = ui.numOf(lineVal);
          if (lineKind.value === 'exact') { patch.lhx = lv > 0 ? lv : 14; patch.lh = null; }
          else { patch.lhx = null; patch.lh = lineKind.value === 'multiple' ? (lv > 0 ? lv : 1) : +lineKind.value; }
          patch.kn = kn.input.checked; patch.kl = kl.input.checked; patch.rtl = rtl.input.checked;
          patch.bg = bg.getColor();
          a.edit('Párrafo', () => { O.setPara(doc, ids, patch); O.setPara(doc, [ids[0]], { pb: pb.input.checked }); return sel; });
          return undefined;
        } }],
      });
    },

    // ------------------------------------------------------------ fuente
    font() {
      const a = A(), doc = a.doc, sel = a.sel();
      if (!sel) return;
      const st = PT.chrome.computeState();
      const fam = h('input.inp', { type: 'text', value: st.ff || '', list: 'pt-fonts', placeholder: 'Calibri' });
      const dl = h('datalist#pt-fonts', ...PT.FONTS.map((f) => h('option', { value: f })));
      const size = ui.numInput(st.fs ? PT.fmtNum(st.fs, 1) : '', { unit: 'pt', width: 60 });
      const style = ui.select([['n', 'Normal'], ['b', 'Negrita'], ['i', 'Cursiva'], ['bi', 'Negrita cursiva']], (st.b ? 'b' : '') + (st.i ? 'i' : '') || 'n');
      const color = ui.colorButton(st.fc || null, () => upd(), 'Automático');
      const und = ui.select([['', '(ninguno)'], ['single', 'Sencillo'], ['double', 'Doble'], ['dotted', 'Punteado'], ['dashed', 'Discontinuo'], ['wavy', 'Ondulado']], st.u === true ? 'single' : st.u || '');
      const fx = { s: ui.check('Tachado', !!st.s), sup: ui.check('Superíndice', !!st.sup), sub: ui.check('Subíndice', !!st.sub), sc: ui.check('Versalitas', !!st.sc), caps: ui.check('Todo en mayúsculas', !!st.caps) };
      const sp = ui.numInput(st.sp ? PT.fmtNum(st.sp, 1) : '0', { unit: 'pt', width: 60 });
      const hl = ui.colorButton(st.hl || null, () => upd(), 'Sin resaltado');
      const preview = h('div.preview-box.font-preview', 'El veloz murciélago hindú comía feliz cardillo y kiwi.');
      const read = () => {
        const s = style.value;
        return { ff: fam.value.trim() || null, fs: ui.numOf(size) || null, b: s.includes('b'), i: s.includes('i'), fc: color.getColor(), u: und.value === 'single' ? true : und.value || null, s: fx.s.input.checked, sup: fx.sup.input.checked, sub: fx.sub.input.checked && !fx.sup.input.checked, sc: fx.sc.input.checked, caps: fx.caps.input.checked, sp: ui.numOf(sp) || null, hl: hl.getColor() };
      };
      const upd = () => { const r = read(); preview.style.cssText = V.cssText(V.runCss(Object.assign({}, r, { fs: r.fs ? Math.min(r.fs, 28) : 14 }))); };
      for (const el of [fam, size, style, und, sp]) el.addEventListener('input', upd);
      for (const k in fx) fx[k].input.addEventListener('change', upd);
      upd();
      ui.dialog({
        title: 'Fuente', width: 480,
        body: [dl, row(ui.field('Fuente', fam), ui.field('Estilo', style), h('div.fixed', ui.field('Tamaño', size))),
          row(ui.field('Color', color), ui.field('Subrayado', und), ui.field('Resaltado', hl)),
          h('div.field-label', 'Efectos'), h('div.check-grid', fx.s, fx.sup, fx.sub, fx.sc, fx.caps),
          row(ui.field('Espaciado entre caracteres', sp), h('span')),
          h('div.field-label', 'Vista previa'), preview],
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const r = read();
          const [from, to] = O.ordered(doc, sel);
          if (O.same(from, to)) { a.editor.stored = M.with(a.editor.stored || O.typingMarks(doc, from), r); PT.chrome.updateSelection(); return undefined; }
          a.edit('Fuente', () => { O.setMarks(doc, from, to, (m, run, p) => { const base = doc.styleOfPara(p).r, o = Object.assign({}, m, r); for (const k of ['b', 'i', 's', 'sc', 'caps']) if (!r[k]) o[k] = base[k] ? false : null; return M.intern(o); }); return sel; });
          return undefined;
        } }],
      });
    },

    // ------------------------------------------------------------ configurar página
    pageSetup() {
      const a = A(), doc = a.doc, pg = Object.assign({}, doc.page);
      const papers = Object.keys(PT.PAPER).map((k) => [k, PT.PAPER[k].name]).concat([['custom', 'Personalizado']]);
      const size = ui.select(papers, PT.paperOf(pg.w, pg.h));
      const w = lenInput(Math.min(pg.w, pg.h)), hh = lenInput(Math.max(pg.w, pg.h));
      const orient = ui.radios('orient', [['portrait', 'Vertical'], ['landscape', 'Horizontal']], pg.orient);
      const mt = lenInput(pg.mt), mb = lenInput(pg.mb), ml = lenInput(pg.ml), mr = lenInput(pg.mr), hd = lenInput(pg.hd), fd = lenInput(pg.fd);
      const first = ui.check('Primera página diferente (encabezado y pie propios)', !!pg.first);
      const start = ui.numInput(pg.start || 1, { width: 70 });
      const color = ui.colorButton(pg.color || null, null, 'Blanco');
      const def = ui.check('Usar como predeterminado para documentos nuevos', false);
      const setSize = () => { const p = PT.PAPER[size.value]; const dis = !p; for (const x of [w, hh]) x.querySelector('input').disabled = !dis; if (p) { w.querySelector('input').value = PT.toUnit(p.w); hh.querySelector('input').value = PT.toUnit(p.h); } };
      size.addEventListener('change', setSize);
      setSize();
      const cm = (v) => PT.cm2pt(v);
      const presets = [['Normal', 2.5, 2.5, 3, 3], ['Estrecho', 1.27, 1.27, 1.27, 1.27], ['Moderado', 2.54, 2.54, 1.91, 1.91], ['Ancho', 2.54, 2.54, 5.08, 5.08], ['Estándar de 2,54 cm', 2.54, 2.54, 2.54, 2.54]];
      const presetBox = h('div.preset-row', ...presets.map(([n, t, b, l, r]) => h('button.btn.small', { type: 'button', onclick: () => { mt.querySelector('input').value = PT.toUnit(cm(t)); mb.querySelector('input').value = PT.toUnit(cm(b)); ml.querySelector('input').value = PT.toUnit(cm(l)); mr.querySelector('input').value = PT.toUnit(cm(r)); } }, n)));
      ui.dialog({
        title: 'Configurar página', width: 500,
        body: ui.tabs([
          { label: 'Papel', body: [ui.field('Tamaño del papel', size), row(ui.field('Ancho', w), ui.field('Alto', hh)), h('div.field-label', 'Orientación'), orient, h('hr.sep'), ui.field('Color de página', color)] },
          { label: 'Márgenes', body: [presetBox, row(ui.field('Superior', mt), ui.field('Inferior', mb)), row(ui.field('Izquierdo', ml), ui.field('Derecho', mr)), row(ui.field('Encabezado desde el borde', hd), ui.field('Pie desde el borde', fd))] },
          { label: 'Diseño', body: [first, row(ui.field('Empezar la numeración en', start), h('span')), h('hr.sep'), def] },
        ]),
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const np = Object.assign({}, pg);
          const W = lenOf(w), H = lenOf(hh);
          if (!(W > 72 && H > 72)) { ui.toast('El tamaño del papel no es válido.'); return false; }
          np.size = size.value; np.w = PT.round(Math.min(W, H), 1); np.h = PT.round(Math.max(W, H), 1);
          np.orient = orient.value() || 'portrait';
          for (const [k, el] of [['mt', mt], ['mb', mb], ['ml', ml], ['mr', mr], ['hd', hd], ['fd', fd]]) { const v = lenOf(el); if (v == null || v < 0) { ui.toast('Revisa los márgenes.'); return false; } np[k] = PT.round(v, 1); }
          const d = PT.pageDims(np);
          if (d.W - np.ml - np.mr < 72 || d.H - np.mt - np.mb < 72) { ui.toast('Los márgenes son demasiado grandes para este papel.'); return false; }
          np.first = first.input.checked;
          np.start = Math.max(0, Math.round(ui.numOf(start) || 1));
          np.color = color.getColor();
          doc.tx('Configurar página', () => doc.set(['page'], np));
          if (def.input.checked) { a.settings.page = np; a.saveSettings(); }
          a.refresh({ noScroll: true });
          PT.chrome.updateRuler();
          return undefined;
        } }],
      });
    },

    // ------------------------------------------------------------ números de página
    pageNumbers() {
      const a = A(), doc = a.doc;
      const where = ui.radios('pnw', [['ftr', 'Pie de página'], ['hdr', 'Encabezado']], 'ftr');
      const al = ui.radios('pna', [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], 'center');
      const fmt = ui.select([['n', '1'], ['pn', 'Página 1'], ['pnm', 'Página 1 de 5'], ['nm', '1 / 5'], ['dash', '– 1 –']], 'n');
      const first = ui.check('Mostrar en la primera página', !doc.page.first);
      const start = ui.numInput(doc.page.start || 1, { width: 70 });
      ui.dialog({
        title: 'Números de página', width: 420,
        body: [h('div.field-label', 'Posición'), where, h('div.field-label', 'Alineación'), al, ui.field('Formato', fmt), first, ui.field('Empezar en', start)],
        buttons: [
          { label: 'Quitar números', action: () => { this.removePageNumbers(); } },
          { label: 'Cancelar' },
          { label: 'Insertar', primary: true, action: () => {
            const story = where.value(), f = fmt.value, page = { k: 'fld', f: 'page' }, pages = { k: 'fld', f: 'pages' };
            const runs = f === 'n' ? [{ o: page }] : f === 'pn' ? [{ x: 'Página ' }, { o: page }] : f === 'pnm' ? [{ x: 'Página ' }, { o: page }, { x: ' de ' }, { o: pages }] : f === 'nm' ? [{ o: page }, { x: ' / ' }, { o: pages }] : [{ x: '– ' }, { o: page }, { x: ' –' }];
            const para = P.make({ st: 'hf', al: al.value() === 'left' ? null : al.value() }, R.normalize(runs.map((r) => (r.o ? { o: Object.freeze(r.o), m: M.EMPTY } : { x: r.x, m: M.EMPTY }))));
            doc.tx('Números de página', () => {
              const list = doc.storyList(story);
              // quita números anteriores de esa historia
              const keep = list.filter((b) => !(b.t === 'p' && b.runs.some((r) => r.o && r.o.k === 'fld' && (r.o.f === 'page' || r.o.f === 'pages'))));
              const clean = keep.filter((b) => b.t !== 'p' || b.runs.length);
              doc.replace(story, 0, list.length, clean.concat([para]));
              doc.set(['page', 'first'], !first.input.checked);
              if (!first.input.checked && !doc.storyList(story + '1').length) doc.replace(story + '1', 0, 0, [P.make({ st: 'hf' })]);
              doc.set(['page', 'start'], Math.max(0, Math.round(ui.numOf(start) || 1)));
            });
            if (a.settings.pageless) a.run('pageless', false);
            a.refresh({ noScroll: true });
            return undefined;
          } },
        ],
      });
    },
    removePageNumbers() {
      const a = A(), doc = a.doc;
      doc.tx('Quitar números de página', () => {
        for (const s of ['hdr', 'ftr', 'hdr1', 'ftr1']) {
          const list = doc.storyList(s);
          const keep = list.filter((b) => !(b.t === 'p' && b.runs.some((r) => r.o && r.o.k === 'fld' && (r.o.f === 'page' || r.o.f === 'pages'))));
          if (keep.length !== list.length) doc.replace(s, 0, list.length, keep);
        }
      });
      a.refresh({ noScroll: true });
    },

    // ------------------------------------------------------------ marca de agua
    watermark() {
      const a = A(), doc = a.doc, wm = doc.page.wm || {};
      const preset = ui.select([['', 'Personalizada'], ['BORRADOR', 'BORRADOR'], ['CONFIDENCIAL', 'CONFIDENCIAL'], ['URGENTE', 'URGENTE'], ['NO COPIAR', 'NO COPIAR'], ['MUESTRA', 'MUESTRA']], ['BORRADOR', 'CONFIDENCIAL', 'URGENTE', 'NO COPIAR', 'MUESTRA'].includes(wm.text) ? wm.text : '');
      const text = h('input.inp', { type: 'text', value: wm.text || 'BORRADOR' });
      preset.addEventListener('change', () => { if (preset.value) text.value = preset.value; });
      const color = ui.colorButton(wm.color || '#d0d0d0', null, 'Gris claro');
      const diag = ui.radios('wmd', [['diag', 'Diagonal'], ['hor', 'Horizontal']], wm.diag === false ? 'hor' : 'diag');
      ui.dialog({
        title: 'Marca de agua', width: 400,
        body: [ui.field('Texto predefinido', preset), ui.field('Texto', text), ui.field('Color', color), h('div.field-label', 'Disposición'), diag],
        buttons: [
          { label: 'Quitar', action: () => { doc.tx('Quitar marca de agua', () => doc.set(['page', 'wm'], null)); a.refresh({ noScroll: true }); } },
          { label: 'Cancelar' },
          { label: 'Aplicar', primary: true, action: () => { const t = text.value.trim(); doc.tx('Marca de agua', () => doc.set(['page', 'wm'], t ? { text: t, color: color.getColor() || '#d0d0d0', diag: diag.value() !== 'hor' } : null)); a.refresh({ noScroll: true }); return undefined; } },
        ],
      });
    },

    // ------------------------------------------------------------ bordes y sombreado del párrafo
    borders() {
      const a = A(), doc = a.doc, sel = a.sel();
      if (!sel) return;
      const ids = O.paraIds(doc, sel), p = doc.block(sel.h.id), b = p.bdr || {};
      const first = b.t || b.b || b.l || b.r || '1 solid #000000';
      const [w0, s0, c0] = first.split(' ');
      const width = ui.select([['0.5', '½ pt'], ['0.75', '¾ pt'], ['1', '1 pt'], ['1.5', '1½ pt'], ['2.25', '2¼ pt'], ['3', '3 pt'], ['4.5', '4½ pt']], w0 || '1');
      const style = ui.select([['solid', 'Continuo'], ['dashed', 'Discontinuo'], ['dotted', 'Punteado'], ['double', 'Doble']], s0 || 'solid');
      const color = ui.colorButton(c0 || '#000000', null, 'Automático');
      const sides = { t: ui.check('Superior', !!b.t), b: ui.check('Inferior', !!b.b), l: ui.check('Izquierdo', !!b.l), r: ui.check('Derecho', !!b.r) };
      const preset = (k) => { for (const s in sides) sides[s].input.checked = k === 'box' ? true : k === 'none' ? false : s === k; };
      const bg = ui.colorButton(p.bg || null, null, 'Sin sombreado');
      ui.dialog({
        title: 'Bordes y sombreado', width: 440,
        body: [h('div.preset-row', ...[['box', 'Cuadro'], ['b', 'Solo inferior'], ['t', 'Solo superior'], ['l', 'Solo izquierdo'], ['none', 'Ninguno']].map(([k, t]) => h('button.btn.small', { type: 'button', onclick: () => preset(k) }, t))),
          h('div.check-grid', sides.t, sides.b, sides.l, sides.r), row(ui.field('Ancho', width), ui.field('Estilo', style), ui.field('Color', color)), h('hr.sep'), ui.field('Sombreado', bg)],
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const spec = width.value + ' ' + style.value + ' ' + (color.getColor() || '#000000');
          const bdr = {};
          for (const s in sides) if (sides[s].input.checked) bdr[s] = spec;
          a.edit('Bordes y sombreado', () => { O.setPara(doc, ids, { bdr: Object.keys(bdr).length ? bdr : null, bg: bg.getColor() }); return sel; });
          return undefined;
        } }],
      });
    },

    // ------------------------------------------------------------ estilos
    styles() {
      const a = A(), doc = a.doc;
      const sel = a.sel();
      const curId = sel ? doc.block(sel.h.id).st || 'normal' : 'normal';
      let selected = curId;
      const list = h('div.list.style-list');
      const form = h('div.style-form');
      const draft = PT.clone(doc.styles);
      const refreshList = () => {
        list.replaceChildren(...Object.keys(draft).filter((id) => !draft[id].hidden).sort((x, y) => (PT.STYLE_ORDER.indexOf(x) + 1 || 99) - (PT.STYLE_ORDER.indexOf(y) + 1 || 99)).map((id) => {
          const it = h('div.list-item' + (id === selected ? '.on' : ''), draft[id].name + (draft[id].builtin ? '' : ' ·'));
          it.addEventListener('click', () => { selected = id; refreshList(); showForm(); });
          return it;
        }));
      };
      const showForm = () => {
        const s = draft[selected];
        s.p = s.p || {}; s.r = s.r || {};
        const name = h('input.inp', { type: 'text', value: s.name });
        name.addEventListener('input', () => { s.name = name.value || s.name; });
        const others = Object.keys(draft).filter((k) => k !== selected).map((k) => [k, draft[k].name]);
        const base = ui.select([['', '(ninguno)']].concat(others), s.base || '', (v) => { s.base = v || undefined; });
        const next = ui.select([['', '(el mismo)']].concat(others), s.next || '', (v) => { s.next = v || undefined; });
        const ff = h('input.inp', { type: 'text', value: s.r.ff || '', list: 'pt-fonts2', placeholder: '(heredada)' });
        ff.addEventListener('input', () => { s.r.ff = ff.value.trim() || undefined; });
        const fs = ui.numInput(s.r.fs ? PT.fmtNum(s.r.fs, 1) : '', { unit: 'pt', width: 60 });
        fs.querySelector('input').addEventListener('input', () => { s.r.fs = ui.numOf(fs) || undefined; });
        const fc = ui.colorButton(s.r.fc || null, (c) => { s.r.fc = c || undefined; }, 'Automático');
        const chk = (label, obj, key) => ui.check(label, !!obj[key], (v) => { obj[key] = v || undefined; });
        const al = ui.select([['', '(heredada)'], ['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justificada']], s.p.al || '', (v) => { s.p.al = v || undefined; });
        const spB = ptInput(s.p.spB), spA = ptInput(s.p.spA), lh = ui.numInput(s.p.lh != null ? PT.fmtNum(s.p.lh, 2) : '', { width: 60 });
        spB.querySelector('input').addEventListener('input', () => { s.p.spB = ui.numOf(spB) ?? undefined; });
        spA.querySelector('input').addEventListener('input', () => { s.p.spA = ui.numOf(spA) ?? undefined; });
        lh.addEventListener('input', () => { s.p.lh = ui.numOf(lh) || undefined; });
        const inL = lenInput(s.p.inL);
        inL.querySelector('input').addEventListener('input', () => { s.p.inL = lenOf(inL) || undefined; });
        const lvl = ui.select([['0', 'Texto normal'], ['1', 'Nivel 1'], ['2', 'Nivel 2'], ['3', 'Nivel 3'], ['4', 'Nivel 4'], ['5', 'Nivel 5'], ['6', 'Nivel 6']], String(s.lvl || 0), (v) => { s.lvl = +v || undefined; });
        form.replaceChildren(
          h('datalist#pt-fonts2', ...PT.FONTS.map((f) => h('option', { value: f }))),
          row(ui.field('Nombre', name), ui.field('Nivel de esquema', lvl)),
          row(ui.field('Basado en', base), ui.field('Estilo siguiente', next)),
          row(ui.field('Fuente', ff), h('div.fixed', ui.field('Tamaño', fs)), h('div.fixed', ui.field('Color', fc))),
          h('div.check-grid', chk('Negrita', s.r, 'b'), chk('Cursiva', s.r, 'i'), chk('Subrayado', s.r, 'u'), chk('Versalitas', s.r, 'sc'), chk('Mayúsculas', s.r, 'caps')),
          row(ui.field('Alineación', al), ui.field('Sangría izquierda', inL)),
          row(ui.field('Espacio antes', spB), ui.field('Espacio después', spA), ui.field('Interlineado', lh)),
          h('div.check-grid', chk('Conservar con el siguiente', s.p, 'kn'), chk('Conservar líneas juntas', s.p, 'kl')),
          s.builtin ? h('p.muted', 'Estilo integrado: puedes modificarlo pero no eliminarlo.') : h('button.btn.small.danger-text', { type: 'button', onclick: () => { delete draft[selected]; selected = 'normal'; refreshList(); showForm(); } }, 'Eliminar este estilo'));
      };
      const newStyle = async () => {
        const name = await ui.prompt('Nombre del estilo nuevo', 'Mi estilo', { title: 'Nuevo estilo' });
        if (!name) return;
        const id = 'u' + PT.uid('s').replace(/[^\w]/g, '');
        const base = sel ? doc.block(sel.h.id) : null;
        const m = base ? O.marksInfo(doc, O.caret({ id: base.id, off: Math.min(1, P.len(base)) }))._m || {} : {};
        draft[id] = { name: name.trim(), base: (base && base.st) || 'normal', next: undefined, p: base ? { al: base.al, spB: base.spB, spA: base.spA, lh: base.lh, inL: base.inL } : {}, r: { ff: m.ff, fs: m.fs, fc: m.fc, b: m.b, i: m.i } };
        selected = id; refreshList(); showForm();
      };
      refreshList(); showForm();
      ui.dialog({
        title: 'Estilos', width: 720,
        body: h('div.styles-dlg', h('div.styles-left', list, h('button.btn.small', { type: 'button', onclick: newStyle }, '+ Nuevo estilo')), form),
        buttons: [{ label: 'Cancelar' }, { label: 'Guardar y aplicar al párrafo', action: () => { save(); if (sel && draft[selected]) a.run('style', selected); } }, { label: 'Guardar', primary: true, action: () => { save(); } }],
      });
      const save = () => {
        for (const id in draft) { const s = draft[id]; for (const g of ['p', 'r']) if (s[g]) for (const k in s[g]) if (s[g][k] == null || s[g][k] === false && !M.BOOL_KEYS.has(k)) delete s[g][k]; }
        doc.tx('Modificar estilos', () => {
          for (const id of Object.keys(doc.styles)) if (!draft[id]) doc.set(['styles', id], undefined);
          for (const id in draft) doc.set(['styles', id], draft[id]);
          // los párrafos con estilos eliminados vuelven a Normal
          O.eachPara(doc, (p) => { if (p.st && !draft[p.st]) doc.put(P.with(p, { st: null })); });
        });
        a.refresh({ noScroll: true });
      };
    },

    // ------------------------------------------------------------ tablas
    insertTable() {
      const rows = ui.numInput(3, { width: 70 }), cols = ui.numInput(3, { width: 70 });
      const hd = ui.check('Primera fila como encabezado (se repite en cada página)', true);
      const bd = ui.check('Con bordes', true);
      ui.dialog({
        title: 'Insertar tabla', width: 380,
        body: [row(ui.field('Columnas', cols), ui.field('Filas', rows)), hd, bd],
        buttons: [{ label: 'Cancelar' }, { label: 'Insertar', primary: true, action: () => {
          const r = PT.clamp(Math.round(ui.numOf(rows) || 3), 1, 500), c = PT.clamp(Math.round(ui.numOf(cols) || 3), 1, 40);
          setTimeout(() => A().run('insertTable', { rows: r, cols: c, header: hd.input.checked, noBorder: !bd.input.checked }), 0);
          return undefined;
        } }],
      });
    },
    tableProps(t) {
      const a = A(), doc = a.doc, tb = t.tbl;
      const [w0, s0, c0] = (tb.bd || '0.5 solid #000000').split(' ');
      const al = ui.select([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], tb.al || 'left');
      const hasBd = ui.check('Mostrar bordes', !!tb.bd);
      const bw = ui.select([['0.25', '¼ pt'], ['0.5', '½ pt'], ['0.75', '¾ pt'], ['1', '1 pt'], ['1.5', '1½ pt'], ['2.25', '2¼ pt'], ['3', '3 pt']], w0);
      const bs = ui.select([['solid', 'Continuo'], ['dashed', 'Discontinuo'], ['dotted', 'Punteado'], ['double', 'Doble']], s0);
      const bc = ui.colorButton(c0, null, 'Negro');
      const cellBg = ui.colorButton(tb.rows[t.r1].cells[t.c1].bg || null, null, 'Sin color');
      const va = ui.select([['top', 'Arriba'], ['middle', 'En medio'], ['bottom', 'Abajo']], tb.rows[t.r1].cells[t.c1].va || 'top');
      const rh = ptInput(tb.rows[t.r1].h || '', 60);
      const hd = ui.check('Repetir la primera fila como encabezado en cada página', !!tb.rows[0].hd);
      const widths = tb.cols.map((w) => lenInput(w, 64));
      const total = h('span.muted');
      const updTotal = () => { total.textContent = 'Ancho total: ' + PT.toUnit(widths.reduce((s, x) => s + (lenOf(x) || 0), 0)) + ' ' + unit() + ' (área de texto: ' + PT.toUnit(PT.pageDims(doc.page).cw) + ' ' + unit() + ')'; };
      widths.forEach((x) => x.querySelector('input').addEventListener('input', updTotal));
      updTotal();
      const fit = () => { const cw = PT.pageDims(doc.page).cw, sum = tb.cols.reduce((s, x) => s + x, 0); widths.forEach((x, i) => { x.querySelector('input').value = PT.toUnit(tb.cols[i] * cw / sum); }); updTotal(); };
      ui.dialog({
        title: 'Propiedades de tabla', width: 520,
        body: ui.tabs([
          { label: 'Tabla', body: [ui.field('Alineación en la página', al), hasBd, row(ui.field('Ancho del borde', bw), ui.field('Estilo', bs), ui.field('Color', bc)), hd] },
          { label: 'Columnas', body: [h('div.col-widths', ...widths.map((x, i) => ui.field('Columna ' + (i + 1), x))), total, h('div.row', h('button.btn.small', { type: 'button', onclick: fit }, 'Ajustar al ancho de la página'))] },
          { label: 'Celdas y filas', body: [h('p.muted', 'Se aplica a las celdas seleccionadas.'), row(ui.field('Color de fondo', cellBg), ui.field('Alineación vertical', va)), row(ui.field('Alto mínimo de fila', rh), h('span'))] },
        ]),
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const cols = widths.map((x) => Math.max(12, lenOf(x) || 12));
          a.edit('Propiedades de tabla', () => {
            O.tableOp(doc, t.id, 'props', { al: al.value === 'left' ? null : al.value, bd: hasBd.input.checked ? bw.value + ' ' + bs.value + ' ' + (bc.getColor() || '#000000') : null });
            O.tableOp(doc, t.id, 'widths', { cols });
            O.tableOp(doc, t.id, 'cellProps', { r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2, patch: { bg: cellBg.getColor(), va: va.value === 'top' ? null : va.value } });
            const hv = ui.numOf(rh);
            O.tableOp(doc, t.id, 'rowProps', { r1: t.r1, r2: t.r2, patch: { h: hv > 0 ? hv : null } });
            if (!!doc.block(t.id).rows[0].hd !== hd.input.checked) O.tableOp(doc, t.id, 'header');
            return a.editor.sel;
          });
          return undefined;
        } }],
      });
    },

    // ------------------------------------------------------------ imágenes
    async imageProps(im) {
      const a = A(), doc = a.doc, o = im.o;
      const nat = await ui.imageSize(o.src);
      const w = lenInput(o.w), hh = lenInput(o.h);
      const keep = ui.check('Mantener la proporción', true);
      const ratio = o.w / o.h;
      w.querySelector('input').addEventListener('input', () => { if (keep.input.checked) { const v = lenOf(w); if (v) hh.querySelector('input').value = PT.toUnit(v / ratio); } });
      hh.querySelector('input').addEventListener('input', () => { if (keep.input.checked) { const v = lenOf(hh); if (v) w.querySelector('input').value = PT.toUnit(v * ratio); } });
      const alt = h('textarea.inp', { rows: 2, placeholder: 'Describe la imagen para quien no pueda verla' }, o.alt || '');
      const wrap = ui.radios('iw', [['inline', 'En línea con el texto'], ['left', 'Ajustar: imagen a la izquierda'], ['right', 'Ajustar: imagen a la derecha']], o.wrap || 'inline');
      const border = ui.check('Borde fino', !!o.bd);
      const reset = h('button.btn.small', { type: 'button', onclick: () => { if (!nat) return; const d = PT.pageDims(doc.page); const k = Math.min(1, d.cw / PT.px2pt(nat.w)); w.querySelector('input').value = PT.toUnit(PT.px2pt(nat.w) * k); hh.querySelector('input').value = PT.toUnit(PT.px2pt(nat.h) * k); } }, 'Tamaño original');
      const replace = h('button.btn.small', { type: 'button', onclick: async () => { const f = await ui.pickFile('image/*'); if (!f) return; const src = await ui.readDataURL(f); close(); a.edit('Cambiar imagen', () => { O.updateAtom(doc, im, { src }); return a.editor.sel; }); } }, 'Cambiar imagen…');
      const close = ui.dialog({
        title: 'Imagen', width: 440,
        body: [row(ui.field('Ancho', w), ui.field('Alto', hh)), keep, h('div.row', reset, replace), h('div.field-label', 'Ajuste del texto'), wrap, border, ui.field('Texto alternativo', alt), nat ? h('p.muted', 'Tamaño de la imagen: ' + nat.w + ' × ' + nat.h + ' píxeles.') : null],
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
          const W = lenOf(w), H = lenOf(hh);
          if (!(W > 2 && H > 2)) { ui.toast('Revisa el tamaño.'); return false; }
          a.edit('Imagen', () => { O.updateAtom(doc, im, { w: PT.round(W, 1), h: PT.round(H, 1), alt: alt.value.trim(), wrap: wrap.value() === 'inline' ? null : wrap.value(), bd: border.input.checked ? '0.75 solid #7f7f7f' : null }); return a.editor.sel; });
          return undefined;
        } }],
      });
    },
    listStart(p) {
      const a = A(), doc = a.doc, def = doc.lists[p.ls.id];
      const n = ui.numInput(def.start || 1, { width: 80 });
      ui.dialog({
        title: 'Empezar la numeración en', width: 320,
        body: [ui.field('Número inicial de la lista', n)],
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { const v = Math.round(ui.numOf(n) || 1); doc.tx('Numeración', () => doc.set(['lists', p.ls.id, 'start'], Math.max(0, v))); a.refresh({ noScroll: true }); return undefined; } }],
      });
    },
    dropdownOptions(o, done) {
      const opts = (o.opts || []).map((x) => Object.assign({}, x));
      const box = h('div.dd-opts');
      const render = () => {
        box.replaceChildren(...opts.map((x, i) => {
          const t = h('input.inp', { type: 'text', value: x.t });
          t.addEventListener('input', () => { x.t = t.value; });
          const c = ui.colorButton(x.c || null, (v) => { x.c = v; }, 'Sin color');
          return h('div.row.dd-row', t, h('div.fixed', c), h('div.fixed', PT.chrome.tbButton('trash', 'Quitar opción', () => { opts.splice(i, 1); render(); })));
        }), h('button.btn.small', { type: 'button', onclick: () => { opts.push({ t: 'Opción ' + (opts.length + 1), c: '#e8eaed' }); render(); } }, '+ Añadir opción'));
      };
      render();
      ui.dialog({
        title: 'Opciones del desplegable', width: 400, body: box,
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { const clean = opts.filter((x) => x.t && x.t.trim()).map((x) => ({ t: x.t.trim(), c: x.c || null })); if (!clean.length) { ui.toast('Añade al menos una opción.'); return false; } done(clean); return undefined; } }],
      });
    },
  });
})();
