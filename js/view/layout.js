/* Paginación: el cuerpo es un único flujo editable; se insertan espaciadores no editables donde termina
   cada página (entre bloques, dentro de un párrafo al inicio de la línea que no cabe o entre filas de una
   tabla) y se dibujan las hojas detrás con encabezado, pie, notas al pie, marca de agua y números.
   Aplica saltos de página, conservar con el siguiente, conservar líneas juntas y control de viudas y huérfanas. */
(function () {
  'use strict';
  const PT = window.PT, V = PT.view, O = PT.ops;
  const px = PT.pt2px;
  const make = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

  class Layout {
    constructor(app, els) {
      this.app = app;
      this.canvas = els.canvas; this.pagesEl = els.pagesEl; this.flow = els.flow; this.sizer = els.sizer;
      this.gap = 24;
      this.count = 1;
      this.blockPage = new Map(); // id de bloque de primer nivel -> página de su inicio
      this.pageFirst = []; // por página: índice del primer bloque de primer nivel
      this.sheets = [];
      this.notesOnPage = [];
      this.pageless = false;
    }
    get doc() { return this.app.doc; }
    dims() {
      const d = PT.pageDims(this.doc.page);
      return { W: px(d.W), H: px(d.H), mt: px(d.mt), mb: px(d.mb), ml: px(d.ml), mr: px(d.mr), hd: px(d.hd), fd: px(d.fd), cw: px(d.cw), ch: px(d.ch) };
    }
    get stride() { return this.dims().H + this.gap; }

    // geometría del lienzo y del flujo según la página y el modo
    applyGeometry() {
      const d = this.dims(), flow = this.flow;
      this.canvas.classList.toggle('pageless', this.pageless);
      if (this.pageless) {
        const pad = 48;
        this.canvas.style.width = (d.cw + pad * 2) + 'px';
        flow.style.left = pad + 'px'; flow.style.top = pad + 'px';
        flow.style.width = d.cw + 'px'; flow.style.minHeight = d.ch + 'px';
      } else {
        this.canvas.style.width = d.W + 'px';
        flow.style.left = d.ml + 'px'; flow.style.top = d.mt + 'px';
        flow.style.width = d.cw + 'px';
      }
      const color = this.doc.page.color;
      this.canvas.style.setProperty('--page-color', color || '#ffffff');
    }

    // ------------------------------------------------------------ paginación
    paginate() {
      const app = this.app, doc = this.doc, flow = this.flow, d = this.dims();
      this.applyGeometry();
      for (const g of flow.querySelectorAll('.pt-gap')) { const parent = g.parentNode; g.remove(); if (parent && parent.normalize && parent.nodeType === 1 && parent.classList.contains('pt-p')) parent.normalize(); }
      if (this.pageless) {
        this.count = 1; this.blockPage.clear(); this.heights = null;
        const h = flow.offsetHeight + 96;
        this.canvas.style.height = h + 'px';
        this.pagesEl.replaceChildren();
        this.sheets = [];
        this.sizeSizer(h);
        this.fillPageFields();
        return;
      }
      const stride = d.H + this.gap, ch = d.ch;
      const z = app.zoom || 1;
      const fr = flow.getBoundingClientRect();
      const Y = (v) => (v - fr.top) / z;
      const blocks = Array.from(flow.children).filter((el) => el.dataset && el.dataset.id);
      const rects = blocks.map((el) => el.getBoundingClientRect());
      // notas al pie: posición de cada llamada y altura de su texto
      const notes = this.measureNotes(d);
      // altura de cada nota (con su margen) y del separador
      const refs = Array.from(flow.querySelectorAll('.pt-fnref')).map((el) => ({ id: el.dataset.note, y: Y(el.getBoundingClientRect().bottom), h: notes.get(el.dataset.note) ? notes.get(el.dataset.note) + 2.7 : 0 })).filter((r) => r.h);
      const SEP = refs.length ? 6 : 0;
      const plans = []; // inserciones planificadas
      const pageFirst = [0];
      const blockPage = new Map();
      let page = 0, shift = 0;
      // altura reservada para notas cuyas llamadas quedan en [top, bottom) (coordenadas efectivas)
      const notesH = (pg, upto) => {
        let s = 0;
        const top = pg * stride;
        for (const r of refs) { const y = r.y + r.sh; if (y > top && y <= upto + 0.5) s += r.h; }
        return s ? s + SEP : 0;
      };
      for (const r of refs) r.sh = 0;
      const applyShiftFrom = (yOrig, h) => { for (const r of refs) if (r.y >= yOrig - 0.01) r.sh += h; };
      const limitFor = (pg, upto) => {
        let lim = pg * stride + ch;
        for (let k = 0; k < 3; k++) lim = pg * stride + ch - notesH(pg, Math.min(upto, lim));
        return lim;
      };
      const pushBefore = (el, i, yOrigTop, top) => {
        const h = (page + 1) * stride - top;
        plans.push({ kind: 'before', el, h, page: page + 1 });
        shift += h; applyShiftFrom(yOrigTop, h);
        page++; pageFirst[page] = i;
        return h;
      };
      for (let i = 0; i < blocks.length; i++) {
        const el = blocks[i], r = rects[i];
        let top = Y(r.top) + shift, bottom = Y(r.bottom) + shift;
        const oTop = Y(r.top);
        let pageTop = page * stride;
        // salto de página antes del bloque
        if (el.dataset.pb && top > pageTop + 1 && i > 0) { pushBefore(el, i, oTop, top); top = page * stride; bottom = top + (r.height / z); pageTop = top; }
        // el bloque empieza en el hueco entre páginas (el anterior se desbordó)
        if (top > pageTop + ch + 0.5 && top < (page + 1) * stride) { pushBefore(el, i, oTop, top); top = page * stride; bottom = top + r.height / z; pageTop = top; }
        else while (top >= (page + 1) * stride - 0.5) { page++; pageFirst[page] = i; pageTop = page * stride; }
        blockPage.set(el.dataset.id, page);
        let limit = limitFor(page, bottom);
        if (bottom <= limit + 0.5) continue;
        // no cabe: dividir (párrafo por líneas o tabla por filas) o pasar entero a la página siguiente
        const atTop = top <= pageTop + 1;
        let done = false;
        if (el.classList.contains('pt-p') && !el.dataset.kl) done = this.splitPara(el, i, { Y, z, stride, ch, top, oTop, plans, pageFirst, refs, limitFor, applyShiftFrom, atTop, state: () => ({ page, shift }), set: (p, s) => { page = p; shift = s; } });
        else if (el.tagName === 'TABLE') done = this.splitTable(el, i, { Y, z, stride, ch, top, oTop, plans, pageFirst, limitFor, applyShiftFrom, atTop, state: () => ({ page, shift }), set: (p, s) => { page = p; shift = s; } });
        if (done) continue;
        if (atTop) {
          // más alto que una página: se deja desbordar y el siguiente bloque empieza en la página siguiente
          while (bottom > (page + 1) * stride) { page++; pageFirst[page] = pageFirst[page] == null ? i : pageFirst[page]; }
          continue;
        }
        // conservar con el siguiente: los bloques anteriores que lo piden pasan de página con este
        let j = i;
        while (j - 1 > pageFirst[page] && blocks[j - 1].dataset.kn) j--;
        const tTop = Y(rects[j].top) + shift;
        pushBefore(blocks[j], j, Y(rects[j].top), tTop);
        // se vuelven a evaluar desde el bloque movido con el nuevo desplazamiento
        i = j - 1;
        if (plans.length > 4000) break;
      }
      this.count = page + 1;
      this.lastPlans = plans.map((p) => ({ kind: p.kind, page: p.page, h: p.h, id: p.el && p.el.dataset.id, off: p.off }));
      // alturas medidas y bloques partidos: permiten saltarse la paginación si un cambio no altera el diseño
      this.heights = new Map(blocks.map((el, i) => [el.dataset.id, rects[i].height / z]));
      this.splitIds = new Set(plans.filter((p) => p.kind !== 'before').map((p) => p.el.dataset.id));
      this.pageFirst = pageFirst;
      this.blockPage = blockPage;
      // aplicar las inserciones en orden inverso
      for (let k = plans.length - 1; k >= 0; k--) this.applyPlan(plans[k], d);
      this.correct(plans, stride);
      // reparto final de notas por página
      this.notesOnPage = Array.from({ length: this.count }, () => []);
      const fr2 = flow.getBoundingClientRect();
      for (const el of flow.querySelectorAll('.pt-fnref')) {
        const id = el.dataset.note;
        if (!notes.get(id)) continue;
        const y = (el.getBoundingClientRect().bottom - fr2.top) / z;
        const pg = PT.clamp(Math.floor(y / stride), 0, this.count - 1);
        if (!this.notesOnPage[pg].includes(id)) this.notesOnPage[pg].push(id);
      }
      const total = this.count * stride - this.gap;
      this.canvas.style.height = total + 'px';
      flow.style.minHeight = Math.max(ch, total - d.mt - d.mb) + 'px';
      this.sizeSizer(total);
      this.renderPages(d);
      this.fillPageFields();
    }
    sizeSizer(h) {
      const z = this.app.zoom || 1;
      const w = parseFloat(this.canvas.style.width) || this.dims().W;
      this.sizer.style.width = Math.ceil(w * z) + 'px';
      this.sizer.style.height = Math.ceil(h * z + 40) + 'px';
    }

    // divide un párrafo al principio de la primera línea que no cabe (puede necesitar varias divisiones)
    splitPara(el, i, c) {
      const lines = this.lines(el, c.Y);
      if (lines.length < 2) return false;
      let { page, shift } = c.state();
      let first = 0; // primera línea todavía sin colocar
      let any = false;
      for (let guard = 0; guard < 400; guard++) {
        const pageTop = page * c.stride;
        let limit = c.limitFor(page, lines[lines.length - 1].bottom + shift);
        let b = -1;
        for (let k = first; k < lines.length; k++) if (lines[k].bottom + shift > limit + 0.5) { b = k; break; }
        if (b < 0) break; // el resto cabe
        // reservar notas de las líneas que se quedan
        limit = c.limitFor(page, lines[Math.max(first, b - 1)].bottom + shift);
        b = -1;
        for (let k = first; k < lines.length; k++) if (lines[k].bottom + shift > limit + 0.5) { b = k; break; }
        if (b < 0) break;
        const atTopOfPage = lines[first].top + shift <= pageTop + 1;
        // viuda: no pasa una sola línea a la página siguiente
        if (lines.length - b === 1 && b - first >= 3) b -= 1;
        // huérfana: no queda una sola línea al pie; el párrafo pasa entero
        if (b - first === 1 && first === 0 && !atTopOfPage) b = first;
        if (b === first) {
          if (!atTopOfPage) return any;
          b = first + 1; // al principio de la página se coloca al menos una línea
          if (b >= lines.length) break;
        }
        const yTop = lines[b].top + shift;
        const h = (page + 1) * c.stride - yTop;
        if (h <= 0) break;
        c.plans.push({ kind: 'inline', el, off: lines[b].off, h, page: page + 1 });
        c.applyShiftFrom(lines[b].top - 0.01, h);
        shift += h; page++;
        c.pageFirst[page] = i;
        first = b;
        any = true;
      }
      c.set(page, shift);
      return any;
    }
    // líneas de un párrafo: [{top, bottom, off}] en coordenadas del flujo (sin espaciadores)
    lines(el, Y) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0.5).map((r) => ({ top: Y(r.top), bottom: Y(r.bottom) })).sort((a, b) => a.top - b.top);
      const lines = [];
      for (const r of rects) {
        const last = lines[lines.length - 1];
        if (last && r.top < last.bottom - 1) { last.top = Math.min(last.top, r.top); last.bottom = Math.max(last.bottom, r.bottom); }
        else lines.push({ top: r.top, bottom: r.bottom });
      }
      if (lines.length < 2) return lines;
      // primer carácter de cada línea (búsqueda binaria por la línea a la que pertenece cada carácter)
      const len = V.nodeLen(el);
      const lineOf = (off) => {
        const rr = V.rectAt(el, off, 1);
        const cy = Y((rr.top + rr.bottom) / 2);
        let k = 0;
        while (k < lines.length - 1 && cy > lines[k].bottom) k++;
        return k;
      };
      lines[0].off = 0;
      let lo = 0;
      for (let k = 1; k < lines.length; k++) {
        let a = lo, b = len;
        while (a < b) { const m = (a + b) >> 1; if (lineOf(m) >= k) b = m; else a = m + 1; }
        lines[k].off = a;
        lo = a;
      }
      return lines.filter((l, k) => k === 0 || (l.off > lines[k - 1].off && l.off < len));
    }
    // divide una tabla entre filas (sin cortar combinaciones verticales); repite las filas de encabezado
    splitTable(el, i, c) {
      const rows = Array.from(el.tBodies[0] ? el.tBodies[0].rows : []);
      if (rows.length < 2) return false;
      const tb = this.doc.block(el.dataset.id);
      const rr = rows.map((tr) => { const b = tr.getBoundingClientRect(); return { top: c.Y(b.top), bottom: c.Y(b.bottom) }; });
      const canBreak = (k) => k > 0 && tb && tb.rows[k] && !tb.rows[k].cells.some((x) => x.mv);
      const hdRows = tb ? tb.rows.findIndex((row) => !row.hd) : 0;
      const hdH = hdRows > 0 ? rr[hdRows - 1].bottom - rr[0].top : 0;
      let { page, shift } = c.state();
      let first = 0, any = false;
      for (let guard = 0; guard < 400; guard++) {
        const limit = c.limitFor(page, rr[rr.length - 1].bottom + shift);
        let b = -1;
        for (let k = first; k < rows.length; k++) if (rr[k].bottom + shift > limit + 0.5) { b = k; break; }
        if (b < 0) break;
        while (b > first && !canBreak(b)) b--;
        if (b <= first || (first === 0 && b <= hdRows && hdRows > 0)) {
          if (first === 0 && !c.atTop) return any;
          b = first + 1;
          while (b < rows.length && !canBreak(b)) b++;
          if (b >= rows.length) break;
        }
        const yTop = rr[b].top + shift;
        const h = (page + 1) * c.stride - yTop;
        if (h <= 0) break;
        const repeat = hdRows > 0 && b >= hdRows && hdH < c.ch / 2;
        c.plans.push({ kind: 'row', el, row: rows[b], h, page: page + 1, repeat: repeat ? rows.slice(0, hdRows) : null, cols: tb ? tb.cols.length : 1 });
        c.applyShiftFrom(rr[b].top - 0.01, h + (repeat ? hdH : 0));
        shift += h + (repeat ? hdH : 0); page++;
        c.pageFirst[page] = i;
        first = b;
        any = true;
      }
      c.set(page, shift);
      return any;
    }
    applyPlan(p) {
      const gap = (tag) => { const g = make(tag, 'pt-gap'); g.contentEditable = 'false'; g.setAttribute('aria-hidden', 'true'); g.dataset.page = p.page; return g; };
      if (p.kind === 'before') {
        const g = gap('div');
        g.style.height = p.h + 'px';
        p.el.parentNode.insertBefore(g, p.el);
        p.gapEl = g;
      } else if (p.kind === 'inline') {
        const g = gap('span');
        g.classList.add('pt-gap-in');
        g.style.height = p.h + 'px';
        insertAtParaLevel(p.el, V.posToDom(p.el, p.off), g);
        p.gapEl = g;
      } else if (p.kind === 'row') {
        const tr = gap('tr');
        const td = make('td');
        td.colSpan = p.cols;
        td.style.height = p.h + 'px';
        tr.appendChild(td);
        p.row.parentNode.insertBefore(tr, p.row);
        if (p.repeat) {
          for (const src of p.repeat) {
            const cl = src.cloneNode(true);
            cl.classList.add('pt-gap', 'pt-hclone');
            cl.contentEditable = 'false';
            for (const x of cl.querySelectorAll('[data-id],[data-cell]')) { x.removeAttribute('data-id'); x.removeAttribute('data-cell'); }
            p.row.parentNode.insertBefore(cl, p.row);
          }
        }
        p.gapEl = td;
      }
    }
    // ajusta los espaciadores para que el contenido empiece exactamente en el borde de la página
    correct(plans, stride) {
      const live = plans.filter((p) => p.gapEl && p.gapEl.isConnected);
      if (!live.length) return;
      live.sort((a, b) => (a.gapEl.compareDocumentPosition(b.gapEl) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const z = this.app.zoom || 1, fr = this.flow.getBoundingClientRect();
      const bottoms = live.map((p) => (p.gapEl.getBoundingClientRect().bottom - fr.top) / z);
      let acc = 0;
      live.forEach((p, k) => {
        const actual = bottoms[k] + acc, want = p.page * stride, delta = actual - want;
        if (Math.abs(delta) > 0.4) {
          const h = Math.max(0, p.h - delta);
          p.gapEl.style.height = h + 'px';
          acc -= delta;
        }
      });
    }

    // ------------------------------------------------------------ notas al pie
    measureNotes(d) {
      const doc = this.doc, nums = O.noteNumbers(doc), out = new Map();
      if (!nums.size) { this._noteBox && this._noteBox.replaceChildren(); return out; }
      let box = this._noteBox;
      if (!box) { box = this._noteBox = make('div', 'pt-notes-measure'); this.pagesEl.parentNode.appendChild(box); }
      box.style.width = d.cw + 'px';
      box.replaceChildren();
      const els = [];
      for (const [id, n] of nums) { const el = this.renderNote(id, n); box.appendChild(el); els.push([id, el]); }
      for (const [id, el] of els) out.set(id, el.offsetHeight);
      return out;
    }
    renderNote(id, n, active) {
      const doc = this.doc;
      const el = make('div', 'pt-note');
      el.dataset.note = id;
      el.appendChild(Object.assign(make('sup', 'pt-note-n'), { textContent: n }));
      const body = active || make('div', 'pt-note-body');
      if (!active) {
        const rv = { doc, map: new Map(), markers: O.listMarkers(doc, 'fn:' + id), notes: new Map() };
        for (const b of doc.storyList('fn:' + id) || []) body.appendChild(V.renderBlock(b, rv));
      }
      body.dataset.story = 'fn:' + id;
      el.appendChild(body);
      return el;
    }

    // ------------------------------------------------------------ hojas, encabezados y pies
    renderPages(d) {
      const doc = this.doc, app = this.app, pg = doc.page, n = this.count, stride = d.H + this.gap;
      const host = this.pagesEl;
      while (this.sheets.length > n) this.sheets.pop().el.remove();
      const nums = O.noteNumbers(doc);
      const active = app.activeHost; // historia que se está editando (encabezado, pie o nota)
      for (let k = 0; k < n; k++) {
        let sh = this.sheets[k];
        if (!sh) {
          sh = { el: make('div', 'pt-sheet'), hdr: make('div', 'pt-hdr'), ftr: make('div', 'pt-ftr'), notes: make('div', 'pt-fnotes'), wm: make('div', 'pt-wm'), sig: {} };
          sh.el.append(sh.wm, sh.hdr, sh.ftr, sh.notes);
          host.appendChild(sh.el);
          this.sheets[k] = sh;
        }
        if (sh.el.parentNode !== host) host.appendChild(sh.el);
        const st = sh.el.style;
        st.top = k * stride + 'px'; st.width = d.W + 'px'; st.height = d.H + 'px';
        sh.el.dataset.page = k;
        Object.assign(sh.hdr.style, { top: d.hd + 'px', left: d.ml + 'px', width: d.cw + 'px', maxHeight: Math.max(20, d.mt - d.hd + d.ch * 0.4) + 'px' });
        Object.assign(sh.ftr.style, { bottom: d.fd + 'px', left: d.ml + 'px', width: d.cw + 'px' });
        Object.assign(sh.notes.style, { bottom: d.mb + 'px', left: d.ml + 'px', width: d.cw + 'px' });
        const first = k === 0 && pg.first;
        const pageNo = k + (pg.start || 1), pageCount = n + (pg.start || 1) - 1;
        for (const [part, key] of [['hdr', first ? 'hdr1' : 'hdr'], ['ftr', first ? 'ftr1' : 'ftr']]) {
          const box = sh[part];
          box.dataset.story = key;
          if (active && box.contains(active.el)) { active.view.pageNo = pageNo; active.view.pageCount = pageCount; continue; }
          const list = doc.storyList(key) || [];
          const sig = key + '|' + pageNo + '/' + pageCount + '|' + this.app.styleGen;
          if (sh.sig[part] === sig && sameRefs(sh.sig[part + 'Refs'], list)) continue;
          sh.sig[part] = sig; sh.sig[part + 'Refs'] = list.slice();
          const rv = { doc, map: new Map(), markers: O.listMarkers(doc, key), notes: new Map(), pageNo, pageCount };
          box.replaceChildren(...list.map((b) => V.renderBlock(b, rv)));
          box.classList.toggle('empty', !list.some((b) => b.t !== 'p' || b.runs.length));
        }
        // notas al pie de la página
        const ids = (this.notesOnPage[k] || []).filter((id) => nums.has(id));
        const activeNote = active && active.story && active.story.startsWith('fn:') ? active : null;
        if (activeNote && sh.notes.contains(activeNote.el)) activeNote.el.remove();
        sh.notes.replaceChildren();
        if (ids.length) {
          sh.notes.appendChild(make('div', 'pt-fnsep'));
          for (const id of ids) sh.notes.appendChild(this.renderNote(id, nums.get(id), activeNote && activeNote.story === 'fn:' + id ? activeNote.el : null));
        }
        // marca de agua
        const wm = pg.wm;
        sh.wm.hidden = !wm || !wm.text;
        if (wm && wm.text) {
          sh.wm.textContent = wm.text;
          sh.wm.style.color = wm.color || '#c8c8c8';
          sh.wm.style.fontSize = (wm.size || Math.round(Math.min(d.W, d.H) / Math.max(4, wm.text.length) * 1.3)) + 'px';
          sh.wm.style.transform = 'translate(-50%, -50%) rotate(' + (wm.diag === false ? 0 : -45) + 'deg)';
        }
      }
    }
    // números de página y total en el cuerpo, e índices
    fillPageFields() {
      const z = this.app.zoom || 1, flow = this.flow, stride = this.stride, start = this.doc.page.start || 1;
      const fr = flow.getBoundingClientRect();
      for (const el of flow.querySelectorAll('.pt-fld')) {
        const f = el.dataset.f;
        if (f !== 'page' && f !== 'pages') continue;
        const y = (el.getBoundingClientRect().top - fr.top) / z;
        const t = f === 'pages' ? String(this.count + start - 1) : String((this.pageless ? 0 : Math.floor(y / stride)) + start);
        if (el.textContent !== t) el.textContent = t;
      }
      const view = this.app.bodyView;
      if (view) {
        view.pageOf = (id) => this.pageOfId(id);
        for (const el of flow.querySelectorAll('.pt-toc')) for (const row of el.querySelectorAll('.pt-toc-e')) {
          const n = row.querySelector('.n'), t = String(this.pageOfId(row.dataset.target) || '');
          if (n && n.textContent !== t) n.textContent = t;
        }
      }
    }
    pageOfId(id) {
      if (this.pageless) return '';
      const start = this.doc.page.start || 1;
      if (this.blockPage.has(id)) return this.blockPage.get(id) + start;
      const el = this.app.bodyView && this.app.bodyView.paraEl(id);
      if (!el) return '';
      return this.pageAtClientY(el.getBoundingClientRect().top + 1) + start;
    }
    // página (base 0) en la coordenada de pantalla y
    pageAtClientY(cy) {
      if (this.pageless) return 0;
      const z = this.app.zoom || 1, cr = this.canvas.getBoundingClientRect();
      return PT.clamp(Math.floor((cy - cr.top) / z / this.stride), 0, this.count - 1);
    }
    // zona de la hoja bajo el punto: 'hdr' | 'ftr' | 'body' | null
    zoneAt(cx, cy) {
      if (this.pageless) return null;
      const z = this.app.zoom || 1, cr = this.canvas.getBoundingClientRect(), d = this.dims();
      const x = (cx - cr.left) / z, y = (cy - cr.top) / z;
      const k = Math.floor(y / this.stride), yy = y - k * this.stride;
      if (k < 0 || k >= this.count || x < 0 || x > d.W || yy > d.H) return null;
      if (yy < d.mt) return { zone: 'hdr', page: k };
      if (yy > d.H - d.mb) return { zone: 'ftr', page: k };
      return { zone: 'body', page: k };
    }
    sheetTop(k) { return k * this.stride; }
  }
  const sameRefs = (a, b) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

  // inserta el espaciador en el punto dado, partiendo los elementos en línea hasta llegar al párrafo
  function insertAtParaLevel(pEl, pt, spacer) {
    let node = pt.node, off = pt.offset, parent, ref;
    if (node.nodeType === 3) {
      if (off <= 0) { parent = node.parentNode; ref = node; }
      else if (off >= node.data.length) { parent = node.parentNode; ref = node.nextSibling; }
      else { ref = node.splitText(off); parent = node.parentNode; }
    } else { parent = node; ref = node.childNodes[off] || null; }
    while (parent && parent !== pEl) {
      const up = parent.parentNode;
      if (ref === parent.firstChild) ref = parent;
      else if (!ref) ref = parent.nextSibling;
      else {
        const clone = parent.cloneNode(false);
        while (ref) { const nx = ref.nextSibling; clone.appendChild(ref); ref = nx; }
        up.insertBefore(clone, parent.nextSibling);
        ref = clone;
      }
      parent = up;
    }
    (parent || pEl).insertBefore(spacer, ref);
  }
  PT.Layout = Layout;
})();
