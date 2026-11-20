/* Controlador de la aplicación: documento activo, vistas, editores, refresco tras cada cambio, zoom,
   edición de encabezados, pies y notas, imágenes, fichas (@), comandos y ajustes. */
(function () {
  'use strict';
  const PT = window.PT, O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para, V = PT.view, ui = PT.ui, h = ui.h;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } } };
  PT.LS = LS;
  const DEFAULTS = { dark: false, units: 'cm', author: '', spell: true, lang: 'es-ES', autoformat: true, markdown: true, quotes: 'smart', capitalize: true, replace: true, emoji: true, ruler: true, outline: true, zoom: 1, pageless: false, showMarks: false, showChanges: true, paper: 'A4', showSrc: false, typewriter: false, dimOthers: false, pasteLink: true };

  const app = (PT.app = {
    doc: null, zoom: 1, editor: null, bodyEditor: null, bodyView: null, layout: null, activeHost: null,
    settings: Object.assign({}, DEFAULTS), readOnly: false, imageSel: null, clip: null, styleGen: 0,
    _dirty: new Set(),

    // ------------------------------------------------------------ arranque
    async init() {
      try { Object.assign(this.settings, JSON.parse(LS.get('pt.settings') || '{}')); } catch (e) { /* ajustes por omisión */ }
      if (!this.settings.author) this.settings.author = '';
      PT.locale.dec = PT.detectDec();
      this.applySettings(false);
      document.head.appendChild(h('style#pt-doc-base', PT.DOC_CSS));
      PT.chrome.build();
      const els = PT.chrome.els;
      this.styleEl = document.head.appendChild(h('style#pt-doc-styles'));
      this.layout = new PT.Layout(this, { canvas: els.canvas, pagesEl: els.pages, flow: els.flow, sizer: els.sizer });
      let doc = null;
      try { doc = await PT.files.loadLast(); } catch (e) { console.warn('No se pudo recuperar el documento guardado', e); }
      this.setDoc(doc || PT.files.welcomeDoc(), { keepClean: !!doc });
      if (PT.ribbon) PT.ribbon.show('Inicio');
      this.setZoom(this.settings.zoom || 1, true);
      // en pantallas estrechas la página se ajusta al ancho disponible
      const wsW = PT.chrome.els.workspace.clientWidth;
      if (wsW > 160 && wsW < this.layout.dims().W * this.zoom + 24) { this.settings.zoomFit = true; this.zoomFit(); }
      window.addEventListener('beforeunload', () => this.saveNow());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(); });
      document.addEventListener('selectionchange', () => this.onSelectionChange());
      document.addEventListener('keydown', (e) => this.onGlobalKey(e));
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => this.relayout());
      window.addEventListener('resize', PT.debounce(() => { if (this.settings.zoomFit) this.zoomFit(); PT.chrome.updateRuler(); }, 150));
      if (PT.extras && PT.extras.init) PT.extras.init();
      if (PT.extras) PT.extras.afterRefresh();
      this.focusEditor(true);
    },
    applySettings(save) {
      const s = this.settings;
      document.documentElement.dataset.theme = s.dark ? 'dark' : 'light';
      PT.locale.units = s.units === 'in' ? 'in' : 'cm';
      PT.locale.author = s.author || 'Autor';
      if (save) LS.set('pt.settings', JSON.stringify(s));
    },
    saveSettings() { LS.set('pt.settings', JSON.stringify(this.settings)); },

    // ------------------------------------------------------------ documento
    setDoc(doc, opts) {
      opts = opts || {};
      this.editStory(null, true);
      this.selectImage(null);
      if (this.doc) this.doc.off('change', this._onChange);
      this.doc = doc;
      this._onChange = (tx) => this.onDocChange(tx);
      doc.on('change', this._onChange);
      if (!opts.keepClean) doc.modified = false;
      const els = PT.chrome.els;
      if (this.bodyEditor) this.bodyEditor.detach();
      this.bodyView = new V.StoryView(doc, 'body', els.flow, { showMarks: this.settings.showMarks });
      this.bodyView.map.clear();
      els.flow.replaceChildren();
      this.layout.pageless = !!this.settings.pageless;
      this.bodyEditor = new PT.Editor(this, this.bodyView, els.flow, 'body');
      this.editor = this.bodyEditor;
      this.applyStyleSheet();
      this.bodyView.render();
      this.relayout();
      const start = doc.startPos('body');
      this.bodyEditor.sel = O.caret(start);
      this.bodyEditor.writeSel();
      PT.chrome.updateAll();
      PT.chrome.updateOutline(true);
      if (!PT.chrome.els.side.hidden) PT.chrome.renderPanel();
      els.workspace.scrollTop = 0;
      document.title = (doc.meta.title || 'Documento') + ' · Procesador de texto';
    },
    applyStyleSheet() {
      this.styleEl.textContent = V.styleSheet(this.doc) + (this.settings.showChanges ? '' : '.pt-flow .pt-del{display:none}.pt-flow .pt-ins{color:inherit;text-decoration:none}');
      this.styleGen++;
    },
    onDocChange(tx) {
      if (tx.undo || tx.redo || tx.aborted) this._needFull = true;
      for (const s of tx.steps) {
        if (s.k === 'rep') {
          this._dirty.add(s.o);
          // cambios de estructura o de notas al pie obligan a repaginar
          if (s.del.length !== s.ins.length || s.del.some((b, i) => b.id !== s.ins[i].id || b.t !== s.ins[i].t) || s.del.concat(s.ins).some((b) => b.t === 'p' && b.runs.some((r) => r.o && r.o.k === 'fn'))) this._needFull = true;
          continue;
        }
        const k = s.p[0];
        if (k !== 'comments' && k !== 'meta') this._needFull = true;
        if (k === 'styles') this._stylesDirty = true;
        else if (k === 'lists') { this._listsDirty = this._listsDirty || new Set(); this._listsDirty.add(s.p[1]); }
        else if (k === 'page') this._pageDirty = true;
        else if (k === 'meta') this._metaDirty = true;
      }
      if (tx.undo || tx.redo) {
        const sel = tx.undo ? tx.selBefore : tx.selAfter;
        this._restoreSel = sel;
      }
    },
    // vuelve a dibujar lo que cambió, pagina y coloca la selección
    refresh(opts) {
      opts = opts || {};
      const doc = this.doc, view = this.bodyView;
      this.rendering = true;
      try {
        if (this._stylesDirty) { this._stylesDirty = false; this.applyStyleSheet(); }
        if (this._listsDirty) {
          const ids = this._listsDirty; this._listsDirty = null;
          for (const v of [view, this.activeHost && this.activeHost.view]) if (v) for (const [id, rec] of v.map) if (rec.b && rec.b.t === 'p' && rec.b.ls && ids.has(rec.b.ls.id)) rec.b = null;
        }
        if (this._metaDirty) { this._metaDirty = false; document.title = (doc.meta.title || 'Documento') + ' · Procesador de texto'; }
        const dirty = this._dirty;
        this._dirty = new Set();
        view.render(dirty);
        if (this.activeHost) this.activeHost.view.render(dirty);
        if (this.needsPagination(view)) this.layout.paginate();
        else {
          this.layout.fillPageFields();
          if (this.activeHost) this.layout.renderPages(this.layout.dims());
        }
        if (this._restoreSel) {
          const s = this._restoreSel; this._restoreSel = null;
          if (s.story && s.story !== (this.editor && this.editor.story)) this.editStory(s.story === 'body' ? null : s.story, true);
          if (this.editor && doc.block(s.a.id) && doc.block(s.h.id)) this.editor.sel = { a: s.a, h: s.h };
        }
        const ed = opts.editor || this.editor;
        if (ed && ed.sel) {
          if (!doc.block(ed.sel.a.id) || !doc.block(ed.sel.h.id)) ed.sel = O.caret(doc.startPos(ed.story) || doc.startPos('body'));
          if (opts.focus || document.activeElement === ed.host || ed.host.contains(document.activeElement)) ed.writeSel();
        }
        if (this.imageSel) this.positionImageSel();
      } finally { this.rendering = false; }
      for (const e of [this.bodyEditor, this.activeHost && this.activeHost.editor]) if (e) e.flushMutations();
      if (doc.undoStack.length || doc.modified) this.scheduleSave();
      PT.chrome.updateAll();
      if (!opts.noScroll) this.scrollCaretIntoView();
      if (PT.extras && PT.extras.afterRefresh && this.layout) PT.extras.afterRefresh();
    },
    // ¿hay que repaginar? No, si los bloques cambiados conservan su altura y no están partidos entre páginas
    needsPagination(view) {
      const L = this.layout, doc = this.doc;
      const full = this._needFull || !L.heights || L.pageless || (this.activeHost && this.activeHost.story.startsWith('fn:'));
      this._needFull = false;
      if (full) return true;
      const tops = new Set();
      for (const id of view.changed) {
        let l = doc.loc(id);
        if (!l) return true;
        for (let ci = l.cell ? doc.cellInfo(l.owner) : null; ci; ci = doc.cellInfo(ci.owner)) l = { id: ci.tbl.id, owner: ci.owner };
        tops.add(l.id || id);
      }
      const hasToc = doc.body.some((b) => b.t === 'toc');
      const z = this.zoom || 1;
      for (const id of tops) {
        const rec = view.map.get(id), old = L.heights.get(id);
        if (!rec || old == null || !rec.el.isConnected) return true;
        const b = rec.b;
        if (b.pb || (hasToc && b.t === 'p' && doc.headingLevel(b))) return true;
        let hNow = rec.el.getBoundingClientRect().height;
        if (L.splitIds.has(id)) {
          // un párrafo partido entre páginas siempre se repagina; una tabla, solo si cambia su alto
          // (los cortes van entre filas), sin contar las filas espaciadoras ni las de encabezado repetidas
          if (b.t !== 'table') return true;
          for (const g of rec.el.querySelectorAll(':scope > tbody > tr.pt-gap')) hNow -= g.getBoundingClientRect().height;
          if (Math.abs(hNow / z - old) > 1) return true;
          continue;
        }
        if (Math.abs(hNow / z - old) > 0.5) return true;
      }
      return false;
    },
    relayout() {
      if (!this.layout || !this.doc) return;
      this.rendering = true;
      try { this.layout.paginate(); } finally { this.rendering = false; }
      if (this.bodyEditor) this.bodyEditor.flushMutations();
      if (this.editor && this.editor.sel && document.activeElement === this.editor.host) this.editor.writeSel();
      PT.chrome.updateRuler();
    },
    rebuildViews() {
      this.bodyView.showMarks = this.settings.showMarks;
      this.bodyView.rebuild();
      if (this.activeHost) this.activeHost.view.rebuild();
      this.refresh({ noScroll: true });
    },
    scheduleSave() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this.saveNow(), 900);
      PT.chrome.setSaveState('Guardando…');
    },
    async saveNow() {
      clearTimeout(this._saveT);
      if (!this.doc) return;
      try {
        const ok = await PT.files.autosave(this.doc);
        const saved = window.AndroidText ? 'Guardado en este dispositivo' : 'Guardado en este navegador';
        PT.chrome.setSaveState(ok ? saved : 'Sin guardado automático: descarga una copia desde Archivo');
        return ok;
      } catch (e) { PT.chrome.setSaveState('No se pudo guardar automáticamente'); return false; }
    },

    // ------------------------------------------------------------ editores y selección
    setActiveEditor(ed) { if (this.editor !== ed) { this.editor = ed; PT.chrome.updateAll(); } },
    focusEditor(force) {
      if (ui.dialogOpen() && !force) return;
      const ed = this.editor;
      if (!ed) return;
      ed.host.focus({ preventScroll: true });
      if (ed.sel) ed.writeSel();
    },
    onSelectionChange() {
      const ed = this.editor;
      if (!ed || this.rendering) return;
      const s = window.getSelection();
      if (!s || !s.rangeCount || !ed.host.contains(s.anchorNode)) return;
      const before = ed.sel;
      ed.readSel();
      if (before && ed.sel && !(O.same(before.a, ed.sel.a) && O.same(before.h, ed.sel.h))) this.doc.seal();
      cancelAnimationFrame(this._selRaf);
      this._selRaf = requestAnimationFrame(() => { PT.chrome.updateSelection(); if (this.mentions.isOpen()) this.mentions.update(); });
    },
    onSelection() { PT.chrome.updateSelection(); },
    sel() { const ed = this.editor; return ed && (ed.readSel() || ed.sel); },
    range() { const s = this.sel(); return s ? O.ordered(this.doc, s) : null; },
    scrollCaretIntoView() {
      const ed = this.editor;
      if (!ed || !ed.sel || document.activeElement !== ed.host) return;
      const r = ed.caretRect();
      if (!r) return;
      const ws = PT.chrome.els.workspace, wr = ws.getBoundingClientRect();
      const top = wr.top + 40, bottom = wr.bottom - 30;
      if (r.bottom > bottom) ws.scrollTop += r.bottom - bottom + 20;
      else if (r.top < top) ws.scrollTop -= top - r.top + 20;
    },
    // ejecuta una operación en el editor activo
    edit(label, fn, opts) { const ed = this.editor; if (!ed) return null; ed.readSel(); return ed.exec(label, fn, opts); },

    // ------------------------------------------------------------ encabezados, pies y notas
    // story: 'hdr' | 'ftr' | 'hdr1' | 'ftr1' | 'fn:<id>' | null (volver al cuerpo)
    editStory(story, silent, page) {
      const cur = this.activeHost;
      if (cur) {
        cur.editor.detach();
        cur.el.classList.remove('pt-editing');
        this.activeHost = null;
        PT.chrome.els.canvas.classList.remove('editing-hf');
        this.editor = this.bodyEditor;
      }
      if (!story) {
        if (cur && !silent) { this.layout.renderPages(this.layout.dims()); this.focusEditor(); PT.chrome.updateAll(); }
        return;
      }
      const doc = this.doc;
      if (!doc.storyList(story)) return;
      if (!doc.parasOf(story).length) doc.tx('Encabezado', () => doc.replace(story, 0, 0, [P.make({ st: story.startsWith('fn:') ? 'fnote' : 'hf' })]));
      this.relayout();
      let el = null;
      const sheets = this.layout.sheets;
      if (story.startsWith('fn:')) el = PT.chrome.els.pages.querySelector('.pt-note[data-note="' + story.slice(3) + '"] .pt-note-body');
      else {
        const part = story.startsWith('hdr') ? 'hdr' : 'ftr';
        const k = page != null ? page : story.endsWith('1') ? 0 : sheets.findIndex((s, i) => !(i === 0 && doc.page.first)) ;
        const sh = sheets[Math.max(0, k)];
        el = sh && sh[part];
      }
      if (!el) return;
      const view = new V.StoryView(doc, story, el, { pageNo: 1, pageCount: this.layout.count });
      el.replaceChildren();
      view.render();
      el.classList.add('pt-editing');
      const editor = new PT.Editor(this, view, el, story);
      this.activeHost = { story, el, view, editor };
      this.editor = editor;
      PT.chrome.els.canvas.classList.add('editing-hf');
      editor.sel = O.caret(doc.endPos(story));
      this.relayout();
      el.focus({ preventScroll: true });
      editor.writeSel();
      PT.chrome.updateAll();
      if (!silent) ui.toast(story.startsWith('fn:') ? 'Editando la nota al pie. Pulsa Esc para volver al texto.' : 'Editando ' + (story.startsWith('hdr') ? 'el encabezado' : 'el pie de página') + '. Pulsa Esc o haz doble clic en el texto para volver.', 3500);
    },
    editNote(id) {
      if (!this.doc.notes[id]) return;
      if (this.layout.pageless) { ui.toast('Las notas al pie se ven en el diseño de impresión.'); return; }
      this.editStory('fn:' + id);
      const el = this.activeHost && this.activeHost.el;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    goToPara(id, off) {
      const doc = this.doc;
      if (!doc.block(id)) return;
      const story = doc.storyOf(id);
      if (story !== 'body') this.editStory(story); else if (this.activeHost) this.editStory(null);
      const ed = this.editor;
      ed.sel = O.caret({ id, off: off || 0 });
      this.focusEditor();
      const el = ed.view.paraEl(id);
      if (el) {
        const ws = PT.chrome.els.workspace, r = el.getBoundingClientRect(), wr = ws.getBoundingClientRect();
        ws.scrollTop += r.top - wr.top - 80;
      }
      PT.chrome.updateSelection();
    },
    goToPage(n) {
      const k = PT.clamp(n - (this.doc.page.start || 1), 0, this.layout.count - 1);
      const ws = PT.chrome.els.workspace;
      ws.scrollTop = this.layout.sheetTop(k) * this.zoom;
    },
    openLink(href) {
      if (!href) return;
      if (href[0] === '#') { const id = href.slice(1); if (this.doc.block(id)) this.goToPara(id); else ui.toast('El destino del vínculo ya no existe.'); return; }
      if (!/^(https?|mailto|tel):/i.test(href)) return;
      if (window.AndroidText) { window.AndroidText.openLink(href); return; }
      window.open(href, '_blank', 'noopener');
    },
    linkBubble(a) {
      const href = a.getAttribute('href');
      const el = h('div.link-bubble',
        h('a', { href: href, target: '_blank', rel: 'noopener', onclick: (e) => { e.preventDefault(); ui.closePopups(); this.openLink(href); } }, href[0] === '#' ? 'Ir al título' : href.length > 48 ? href.slice(0, 46) + '…' : href),
        PT.chrome.tbButton('copy', 'Copiar vínculo', async () => {
          ui.closePopups();
          try {
            if (window.AndroidText) window.AndroidText.copyText(href);
            else await navigator.clipboard.writeText(href);
            ui.toast('Vínculo copiado.');
          } catch (e) { ui.toast('No se pudo copiar el vínculo.'); }
        }),
        PT.chrome.tbButton('track', 'Editar vínculo', () => { ui.closePopups(); this.run('link'); }),
        PT.chrome.tbButton('unlink', 'Quitar vínculo', () => { ui.closePopups(); this.run('unlink'); }));
      ui.popup(el, a, { keepOnBlur: false });
    },

    // ------------------------------------------------------------ zoom
    setZoom(z, silent) {
      z = PT.clamp(Math.round(z * 100) / 100, 0.25, 3);
      const ws = PT.chrome.els.workspace, old = this.zoom || 1;
      const mid = (ws.scrollTop + ws.clientHeight / 2) / old;
      this.zoom = z;
      PT.chrome.els.canvas.style.transform = 'scale(' + z + ')';
      this.layout.sizeSizer(parseFloat(PT.chrome.els.canvas.style.height) || 1000);
      if (!silent) ws.scrollTop = mid * z - ws.clientHeight / 2;
      this.settings.zoom = z;
      this.saveSettings();
      if (this.imageSel) this.positionImageSel();
      PT.chrome.updateZoom();
      PT.chrome.updateRuler();
    },
    zoomFit(mode) {
      const ws = PT.chrome.els.workspace, d = this.layout.dims();
      if (ws.clientWidth < 160 || ws.clientHeight < 120) return; // área de trabajo oculta o sin tamaño todavía
      const w = this.layout.pageless ? d.cw + 96 : d.W;
      if (mode === 'page') this.setZoom(Math.min((ws.clientWidth - 48) / w, (ws.clientHeight - 40) / d.H));
      else this.setZoom((ws.clientWidth - 48) / w);
    },

    // ------------------------------------------------------------ imágenes
    async insertImageFiles(files) {
      for (const f of files) {
        if (f.size > 12 * 1024 * 1024) { ui.toast('La imagen «' + f.name + '» es demasiado grande (máximo 12 MB).'); continue; }
        const src = await ui.readDataURL(f);
        await this.insertImage(src, f.name.replace(/\.[^.]+$/, ''));
      }
    },
    async insertImage(src, alt) {
      const size = await ui.imageSize(src);
      if (!size) { ui.toast('No se pudo leer la imagen.'); return; }
      const d = PT.pageDims(this.doc.page);
      let w = PT.px2pt(size.w), hh = PT.px2pt(size.h);
      const maxW = this.editor.story === 'body' ? d.cw : d.cw * 0.5, maxH = d.ch * 0.8;
      const k = Math.min(1, maxW / w, maxH / hh);
      w = PT.round(w * k, 1); hh = PT.round(hh * k, 1);
      this.edit('Insertar imagen', () => O.insertAtom(this.doc, this.editor.sel, { k: 'img', src, w, h: hh, alt: alt || '' }));
    },
    imageAtSel() {
      const sel = this.sel();
      if (!sel) return null;
      const [a, b] = O.ordered(this.doc, sel);
      const p = this.doc.block(a.id);
      const pick = (off) => { const at = R.at(p.runs, off); return at && at.run.o && at.run.o.k === 'img' ? { id: a.id, off, o: at.run.o } : null; };
      if (a.id === b.id && b.off === a.off + 1) return pick(a.off);
      if (this.imageSel) return pick(this.imageSel.off);
      return null;
    },
    selectImage(info) {
      const els = PT.chrome.els;
      if (this._imgBox) { this._imgBox.remove(); this._imgBox = null; }
      this.imageSel = info;
      if (!info) { PT.chrome.updateSelection(); return; }
      const box = h('div.pt-imgsel');
      for (const hd of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const k = h('span.pt-imgh', { 'data-h': hd });
        k.addEventListener('pointerdown', (e) => this.startImageResize(e, hd));
        box.appendChild(k);
      }
      const bar = h('div.pt-imgbar',
        PT.chrome.tbButton('alignL', 'En línea con el texto', () => this.run('imageWrap', 'inline')),
        PT.chrome.tbButton('indentMore', 'Ajustar a la izquierda (el texto la rodea)', () => this.run('imageWrap', 'left')),
        PT.chrome.tbButton('indentLess', 'Ajustar a la derecha (el texto la rodea)', () => this.run('imageWrap', 'right')),
        PT.chrome.tbButton('gear', 'Propiedades de la imagen…', () => this.run('imageProps')),
        PT.chrome.tbButton('trash', 'Eliminar imagen', () => this.run('deleteImage')));
      box.appendChild(bar);
      els.canvas.appendChild(box);
      this._imgBox = box;
      this.positionImageSel();
      PT.chrome.updateSelection();
    },
    imageEl(info) {
      const ed = info.editor || this.editor, pEl = ed.view.paraEl(info.id);
      if (!pEl) return null;
      const pt = V.posToDom(pEl, info.off);
      const n = pt.node.childNodes ? pt.node.childNodes[pt.offset] : null;
      return n && n.classList && n.classList.contains('pt-img') ? n : null;
    },
    positionImageSel() {
      const info = this.imageSel, box = this._imgBox;
      if (!info || !box) return;
      const el = this.imageEl(info);
      if (!el) { this.selectImage(null); return; }
      const img = el.querySelector('img'), cr = PT.chrome.els.canvas.getBoundingClientRect(), r = img.getBoundingClientRect(), z = this.zoom;
      Object.assign(box.style, { left: (r.left - cr.left) / z + 'px', top: (r.top - cr.top) / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px' });
      box.querySelector('.pt-imgbar').style.transform = 'scale(' + 1 / z + ')';
    },
    startImageResize(e, hd) {
      e.preventDefault(); e.stopPropagation();
      const info = this.imageSel;
      const el = this.imageEl(info);
      if (!el) return;
      const img = el.querySelector('img'), o = this.doc.block(info.id).runs && R.at(this.doc.block(info.id).runs, info.off).run.o;
      const w0 = o.w, h0 = o.h, x0 = e.clientX, y0 = e.clientY, z = this.zoom, ratio = w0 / h0;
      const d = PT.pageDims(this.doc.page);
      let w = w0, hh = h0;
      const move = (ev) => {
        const dx = PT.px2pt((ev.clientX - x0) / z), dy = PT.px2pt((ev.clientY - y0) / z);
        let nw = w0 + (hd.includes('e') ? dx : hd.includes('w') ? -dx : 0), nh = h0 + (hd.includes('s') ? dy : hd.includes('n') ? -dy : 0);
        if (hd.length === 2 && !ev.shiftKey) { if (Math.abs(nw / w0) > Math.abs(nh / h0)) nh = nw / ratio; else nw = nh * ratio; }
        w = PT.clamp(nw, 8, d.cw * 1.5); hh = PT.clamp(nh, 8, d.ch * 1.5);
        img.style.width = w + 'pt'; img.style.height = hh + 'pt';
        this.positionImageSel();
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (w !== w0 || hh !== h0) this.edit('Tamaño de imagen', () => { O.updateAtom(this.doc, { id: info.id, off: info.off }, { w: PT.round(w, 1), h: PT.round(hh, 1) }); return this.editor.sel; });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    },

    // ------------------------------------------------------------ fichas (fecha, casilla, desplegable)
    chipClick(editor, chip) {
      const pEl = chip.closest('.pt-p[data-id]');
      if (!pEl) return;
      const id = pEl.dataset.id, off = V.offsetIn(pEl, chip, 0), doc = this.doc;
      const at = R.at(doc.block(id).runs, off);
      if (!at || !at.run.o) return;
      const o = at.run.o, pos = { id, off };
      const upd = (patch) => editor.exec('Ficha', () => { O.updateAtom(doc, pos, patch); return editor.sel; });
      if (o.c === 'cb') { upd({ v: !o.v }); return; }
      if (o.c === 'date') {
        const inp = h('input.inp', { type: 'date', value: o.v || PT.isoDate() });
        const fmt = ui.select([['chip', '19 nov 2026'], ['long', '19 de noviembre de 2026'], ['short', '19/11/2026'], ['full', 'jueves, 19 de noviembre de 2026']], o.fmt || 'chip');
        const box = h('div.chip-pop', h('div.field-label', 'Fecha'), inp, h('div.field-label', 'Formato'), fmt,
          h('div.row', h('button.btn.small', { type: 'button', onclick: () => { ui.closePopups(); upd({ v: PT.isoDate() }); } }, 'Hoy'), h('button.btn.small.primary', { type: 'button', onclick: () => { ui.closePopups(); upd({ v: inp.value || PT.isoDate(), fmt: fmt.value }); } }, 'Aplicar')));
        ui.popup(box, chip, { keepOnBlur: true });
        inp.focus();
        return;
      }
      if (o.c === 'dd') {
        ui.menu((o.opts || []).map((x) => ({ label: x.t, swatch: x.c || 'transparent', checked: x.t === o.v, action: () => upd({ v: x.t }) })).concat(['-', { label: 'Editar opciones…', icon: 'gear', action: () => PT.dlg.dropdownOptions(o, (opts) => upd({ opts, v: opts.some((x) => x.t === o.v) ? o.v : (opts[0] || {}).t || '' })) }]), chip);
      }
    },

    // ------------------------------------------------------------ teclado global
    onGlobalKey(e) {
      if (ui.dialogOpen() || ui.popupOpen()) return;
      const ctrl = e.ctrlKey || e.metaKey, code = e.code;
      if (!ctrl || e.altKey) {
        if (e.key === 'F7') { e.preventDefault(); this.run('spellLang'); }
        else if (e.altKey && !ctrl && e.key === '/') { e.preventDefault(); this.run('palette'); }
        return;
      }
      const map = { KeyS: 'saveDocx', KeyO: 'open', KeyP: e.shiftKey ? 'palette' : 'print', KeyF: 'find', KeyH: 'replace', KeyG: e.shiftKey ? null : 'goTo' };
      const cmd = map[code];
      if (cmd && !(code === 'KeyH' && e.shiftKey)) { e.preventDefault(); this.run(cmd); }
    },

    // ------------------------------------------------------------ comandos
    run(name, arg) {
      const fn = this.cmd[name];
      if (!fn) { console.warn('Comando desconocido: ' + name); return; }
      try { const r = fn.call(this, arg); if (r && r.catch) r.catch((err) => { console.error(err); ui.toast('No se pudo completar la acción: ' + err.message); }); }
      catch (err) { console.error(err); ui.toast('No se pudo completar la acción: ' + err.message); }
    },
    // marcas: con selección vacía se guardan para lo próximo que se escriba
    markCmd(key, value) {
      const ed = this.editor, sel = this.sel();
      if (!sel) return;
      const doc = this.doc;
      if (O.isCollapsed(sel)) {
        const p = doc.block(sel.h.id);
        // palabra bajo el cursor (como en otros procesadores)
        const t = P.text(p), w = O.wordAt(t, sel.h.off);
        if (w.from < sel.h.off && w.to > sel.h.off) {
          const from = { id: p.id, off: w.from }, to = { id: p.id, off: w.to };
          ed.exec('Formato', () => { this.applyMark(from, to, key, value); return sel; });
          return;
        }
        const base = ed.stored || O.typingMarks(doc, sel.h);
        const eff = doc.runProps(p, base);
        let v = value;
        if (v === undefined) v = eff[key] ? (doc.styleOfPara(p).r[key] && M.BOOL_KEYS.has(key) ? false : null) : true;
        const patch = { [key]: v };
        if (key === 'sup' && v) patch.sub = null;
        if (key === 'sub' && v) patch.sup = null;
        ed.stored = M.with(base, patch);
        PT.chrome.updateSelection();
        return;
      }
      const [from, to] = O.ordered(doc, sel);
      ed.exec('Formato', () => { this.applyMark(from, to, key, value); return sel; });
    },
    applyMark(from, to, key, value) {
      const doc = this.doc;
      if (value === undefined) { O.toggleMark(doc, from, to, key); return; }
      O.setMarks(doc, from, to, (m) => { const patch = { [key]: value }; if (key === 'sup' && value) patch.sub = null; if (key === 'sub' && value) patch.sup = null; return M.with(m, patch); });
    },
    paraCmd(label, patch) {
      const sel = this.sel();
      if (!sel) return;
      this.edit(label, () => { O.setPara(this.doc, O.paraIds(this.doc, sel), patch); return sel; });
    },
    selectionOrWord() {
      const sel = this.sel();
      if (!sel) return null;
      if (!O.isCollapsed(sel)) return O.ordered(this.doc, sel);
      const t = this.doc.paraText(sel.h.id), w = O.wordAt(t, sel.h.off);
      if (w.from === w.to) return null;
      return [{ id: sel.h.id, off: w.from }, { id: sel.h.id, off: w.to }];
    },
    insertAtom(label, obj) { return this.edit(label, () => O.insertAtom(this.doc, this.editor.sel, obj)); },
    insertBlock(label, block) {
      const ed = this.editor;
      if (!ed || !ed.sel) return;
      this.edit(label, () => { const [a, b] = O.ordered(this.doc, ed.sel); const pos = O.same(a, b) ? a : O.deleteRange(this.doc, a, b); return O.insertBlocks(this.doc, pos, [block]); });
    },
    tableCtx() {
      const sel = this.sel();
      if (!sel) return null;
      const doc = this.doc, a = O.tableAt(doc, sel.a), b = O.tableAt(doc, sel.h);
      if (!a && !b) return null;
      const t = a || b;
      let r1 = t.r, c1 = t.c, r2 = t.r, c2 = t.c;
      if (a && b && a.tbl.id === b.tbl.id) { r1 = Math.min(a.r, b.r); r2 = Math.max(a.r, b.r); c1 = Math.min(a.c, b.c); c2 = Math.max(a.c, b.c); const s2 = O.spanOf(t.tbl, r2, c2); r2 += s2.rs - 1; c2 += s2.cs - 1; }
      else { const s = O.spanOf(t.tbl, t.r, t.c); r2 += s.rs - 1; c2 += s.cs - 1; }
      return { tbl: t.tbl, id: t.tbl.id, r1, c1, r2, c2 };
    },
    tableCmd(op, extra) {
      const t = this.tableCtx();
      if (!t) { ui.toast('Coloca el cursor dentro de una tabla.'); return; }
      const label = { rowAbove: 'Insertar fila', rowBelow: 'Insertar fila', colLeft: 'Insertar columna', colRight: 'Insertar columna', delRow: 'Eliminar fila', delCol: 'Eliminar columna', delTable: 'Eliminar tabla', merge: 'Combinar celdas', split: 'Dividir celdas', header: 'Fila de encabezado', distribute: 'Distribuir columnas', sort: 'Ordenar tabla', cellProps: 'Celdas', props: 'Tabla' }[op] || 'Tabla';
      let err = null;
      this.edit(label, () => {
        const r = O.tableOp(this.doc, t.id, op, Object.assign({ r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2, count: op.startsWith('row') ? t.r2 - t.r1 + 1 : op.startsWith('col') ? t.c2 - t.c1 + 1 : 1 }, extra || {}));
        if (r && r.error) { err = r.error; return this.editor.sel; }
        return r && r.id ? r : this.editor.sel;
      });
      if (err) ui.toast(err);
    },
    cmd: {},
  });

  // ---------------------------------------------------------------- comandos
  const C = app.cmd;
  Object.assign(C, {
    undo() { const tx = this.doc.undo(); if (tx) this.refresh({ focus: true }); else ui.toast('No hay nada que deshacer.'); },
    redo() { const tx = this.doc.redo(); if (tx) this.refresh({ focus: true }); },
    async copy() {
      this.focusEditor();
      if (window.AndroidText) { PT.android.copySelection(false); return; }
      if (!document.execCommand('copy')) ui.toast('Usa Ctrl+C para copiar.');
    },
    async cut() {
      this.focusEditor();
      if (window.AndroidText) { PT.android.copySelection(true); return; }
      if (!document.execCommand('cut')) ui.toast('Usa Ctrl+X para cortar.');
    },
    async paste(plain) {
      const ed = this.editor;
      if (!ed) return;
      if (window.AndroidText) { PT.android.pasteSelection(plain); return; }
      try {
        if (navigator.clipboard && navigator.clipboard.read && !plain) {
          const items = await navigator.clipboard.read();
          for (const it of items) {
            const img = it.types.find((t) => /^image\//.test(t));
            if (img && !it.types.includes('text/html')) { const blob = await it.getType(img); this.insertImageFiles([new File([blob], 'imagen', { type: img })]); return; }
            const html = it.types.includes('text/html') ? await (await it.getType('text/html')).text() : '';
            const text = it.types.includes('text/plain') ? await (await it.getType('text/plain')).text() : '';
            ed.readSel();
            ed.pasteData({ html, text }, false);
            return;
          }
        }
        const text = await navigator.clipboard.readText();
        ed.readSel();
        ed.pasteData({ text }, true);
      } catch (e) {
        if (this.clip && !plain) { ed.exec('Pegar', () => O.insertSlice(this.doc, ed.sel, this.clip.slice)); return; }
        ui.toast('El navegador no permite leer el portapapeles desde el menú. Usa Ctrl+V' + (plain ? ' o Ctrl+Mayús+V.' : '.'));
      }
    },
    pastePlain() { return C.paste.call(this, true); },
    async pasteMarkdown() {
      let text = '';
      try { text = window.AndroidText ? window.AndroidText.pasteText() : await navigator.clipboard.readText(); } catch (e) { text = await ui.prompt('Pega aquí el texto en Markdown', '', { title: 'Pegar desde Markdown' }); }
      if (!text) return;
      const d = PT.convert.fromMarkdown(text);
      this.editor.mergeStyles({ lists: d.lists });
      this.edit('Pegar Markdown', () => O.insertSlice(this.doc, this.editor.sel, { blocks: d.body }));
    },
    async copyMarkdown() {
      const r = this.range();
      const md = r && !O.same(r[0], r[1]) ? PT.convert.toMarkdown(this.doc, O.slice(this.doc, r[0], r[1])) : PT.convert.toMarkdown(this.doc);
      try {
        if (window.AndroidText) window.AndroidText.copyText(md);
        else await navigator.clipboard.writeText(md);
        ui.toast('Copiado como Markdown.');
      } catch (e) { ui.toast('No se pudo acceder al portapapeles.'); }
    },
    selectAll() {
      const ed = this.editor, doc = this.doc;
      if (!ed) return;
      ed.setSel({ a: doc.startPos(ed.story), h: doc.endPos(ed.story) });
      this.focusEditor();
    },
    find() { PT.dlg.find(false); },
    replace() { PT.dlg.find(true); },
    goTo() { PT.dlg.goTo(); },
    bold() { this.markCmd('b'); }, italic() { this.markCmd('i'); }, underline() { this.markCmd('u'); }, strike() { this.markCmd('s'); },
    sup() { this.markCmd('sup'); }, sub() { this.markCmd('sub'); }, smallCaps() { this.markCmd('sc'); }, allCaps() { this.markCmd('caps'); },
    underlineStyle(v) { this.markCmd('u', v || null); },
    font(v) { this.markCmd('ff', v || null); },
    fontSize(v) { const n = PT.num(v); if (n == null || n < 1 || n > 1638) { ui.toast('Escribe un tamaño entre 1 y 1638.'); return; } this.markCmd('fs', PT.round(n, 1)); },
    fontStep(d) {
      const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
      const info = PT.chrome.state || {};
      const cur = info.fs || 11;
      let next = d > 0 ? SIZES.find((s) => s > cur) || cur + 10 : [...SIZES].reverse().find((s) => s < cur) || Math.max(1, cur - 1);
      C.fontSize.call(this, next);
    },
    fontColor(c) { this.lastFontColor = c; this.markCmd('fc', c || null); },
    highlight(c) { this.lastHighlight = c; this.markCmd('hl', c || null); },
    clearFormat() {
      const sel = this.sel();
      if (!sel) return;
      const doc = this.doc;
      this.edit('Borrar formato', () => {
        const [a, b] = O.ordered(doc, sel);
        if (!O.same(a, b)) O.clearMarks(doc, a, b);
        O.setPara(doc, O.paraIds(doc, sel), (p) => ({ al: null, inL: null, inR: null, inF: null, spB: null, spA: null, lh: null, lhx: null, bg: null, bdr: null, dc: null, pm: null }));
        return sel;
      });
      if (this.editor) this.editor.stored = null;
    },
    style(id) {
      const sel = this.sel();
      if (!sel || !this.doc.styles[id]) return;
      this.edit('Estilo ' + this.doc.styles[id].name, () => { O.applyStyle(this.doc, O.paraIds(this.doc, sel), id); return sel; });
    },
    align(v) {
      const sel = this.sel(), doc = this.doc;
      if (!sel) return;
      const p = doc.block(sel.h.id), cur = doc.paraProps(p).al || 'left';
      this.paraCmd('Alineación', { al: cur === v && v !== 'left' ? null : v === 'left' ? null : v });
    },
    lineSpacing(v) { this.paraCmd('Interlineado', { lh: +v === 1.15 && !this.doc.styles.normal.p.lh ? null : +v, lhx: null }); },
    spaceBefore(on) { this.paraCmd('Espaciado', { spB: on ? 12 : 0 }); },
    spaceAfter(on) { this.paraCmd('Espaciado', { spA: on ? 8 : 0 }); },
    indentMore() { const sel = this.sel(); if (sel) this.edit('Aumentar sangría', () => { O.indent(this.doc, O.paraIds(this.doc, sel), PT.LIST_INDENT); return sel; }); },
    indentLess() { const sel = this.sel(); if (sel) this.edit('Disminuir sangría', () => { O.indent(this.doc, O.paraIds(this.doc, sel), -PT.LIST_INDENT); return sel; }); },
    list(kind) { const sel = this.sel(); if (sel) this.edit('Lista', () => { O.toggleList(this.doc, O.paraIds(this.doc, sel), kind); return sel; }); },
    listBullet(k) { C.list.call(this, k || this.lastBullet || 'bullet'); }, listNumber(k) { C.list.call(this, k || this.lastNumber || 'decimal'); }, listCheck() { C.list.call(this, 'check'); },
    listRestart() { const sel = this.sel(); if (sel) this.edit('Reiniciar numeración', () => { O.restartList(this.doc, sel.h.id); return sel; }); },
    listContinue() { const sel = this.sel(); if (sel) { let ok = false; this.edit('Continuar numeración', () => { ok = O.continueList(this.doc, sel.h.id); return sel; }); if (!ok) ui.toast('No hay una lista anterior del mismo tipo.'); } },
    listStart() { const sel = this.sel(); const p = sel && this.doc.block(sel.h.id); if (!p || !p.ls) { ui.toast('Coloca el cursor en una lista numerada.'); return; } PT.dlg.listStart(p); },
    case(mode) {
      const r = this.selectionOrWord();
      if (!r) return;
      const sel = this.sel();
      this.edit('Mayúsculas y minúsculas', () => { O.changeCase(this.doc, r[0], r[1], mode); return sel; });
    },
    dropCap() { const sel = this.sel(); if (!sel) return; const p = this.doc.block(sel.h.id); this.paraCmd('Letra capital', { dc: !p.dc }); },
    link() { PT.dlg.link(); },
    unlink() {
      const sel = this.sel();
      if (!sel) return;
      const doc = this.doc;
      let [a, b] = O.ordered(doc, sel);
      if (O.same(a, b)) {
        const p = doc.block(a.id), m = O.typingMarks(doc, a), at = R.marksAt(p.runs, Math.max(0, a.off - 1));
        const ln = (at && at.ln) || (m && m.ln);
        if (!ln) return;
        let s = a.off, e = a.off;
        while (s > 0 && (R.marksAt(p.runs, s - 1) || {}).ln === ln) s--;
        while (e < P.len(p) && (R.marksAt(p.runs, e) || {}).ln === ln) e++;
        a = { id: p.id, off: s }; b = { id: p.id, off: e };
      }
      this.edit('Quitar vínculo', () => { O.setMarks(doc, a, b, (m) => M.with(m, { ln: null })); return sel; });
    },
    comment() {
      const r = this.selectionOrWord();
      if (!r) { ui.toast('Selecciona el texto que quieres comentar.'); return; }
      PT.chrome.showPanel('comments');
      PT.chrome.newComment(r);
    },
    footnote() {
      if (this.editor.story !== 'body') { ui.toast('Las notas al pie se insertan en el texto principal.'); return; }
      let res = null;
      this.edit('Nota al pie', () => { res = O.insertNote(this.doc, this.editor.sel); return res.pos; });
      if (res && !this.layout.pageless) setTimeout(() => this.editNote(res.id), 0);
    },
    pageBreak() {
      if (this.editor.story !== 'body') return;
      this.edit('Salto de página', () => { const [a, b] = O.ordered(this.doc, this.editor.sel); const pos = O.same(a, b) ? a : O.deleteRange(this.doc, a, b); const r = O.split(this.doc, pos); O.setPara(this.doc, [r.id], { pb: true }); return r; });
      this.doc.seal();
    },
    hr() { this.insertBlock('Línea horizontal', PT.blocks.hr()); },
    insertToc() {
      if (this.editor.story !== 'body') return;
      const n = this.doc.body.filter((b) => b.t === 'toc').length;
      if (n) { ui.toast('El documento ya tiene un índice; se actualiza solo.'); return; }
      this.insertBlock('Índice', PT.blocks.toc(3));
    },
    insertTable(arg) {
      const rows = (arg && arg.rows) || 3, cols = (arg && arg.cols) || 3;
      const ed = this.editor, doc = this.doc;
      let width = PT.pageDims(doc.page).cw;
      const ta = ed && ed.sel && O.tableAt(doc, ed.sel.h);
      if (ta) width = Math.max(72, ta.tbl.cols[ta.c] - 11);
      const t = PT.blocks.table(rows, cols, Math.floor(width), { header: arg && arg.header, bd: arg && arg.noBorder ? null : undefined });
      this.insertBlock('Insertar tabla', t);
      const first = t.rows[0].cells[0].blocks[0];
      if (doc.block(first.id)) { ed.sel = O.caret({ id: first.id, off: 0 }); this.focusEditor(); }
    },
    async image() {
      const files = await ui.pickFile('image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp', true);
      if (files && files.length) await this.insertImageFiles(files);
      this.focusEditor();
    },
    async imageUrl() {
      const url = await ui.prompt('Dirección de la imagen (https://…)', '', { title: 'Insertar imagen desde una dirección' });
      if (!url) return;
      if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) { ui.toast('Escribe una dirección que empiece por https://'); return; }
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        if (!/^image\//.test(blob.type)) throw new Error('no es una imagen');
        await this.insertImage(await ui.readDataURL(blob), '');
      } catch (e) { ui.toast('No se pudo descargar la imagen (el sitio puede impedirlo). Descárgala y usa Insertar › Imagen.'); }
    },
    imageProps() { const im = this.imageAtSel(); if (!im) { ui.toast('Selecciona una imagen.'); return; } PT.dlg.imageProps(im); },
    imageWrap(v) { const im = this.imageAtSel(); if (!im) return; this.edit('Ajuste de imagen', () => { O.updateAtom(this.doc, im, { wrap: v === 'inline' ? null : v }); return this.editor.sel; }); },
    deleteImage() {
      const im = this.imageAtSel();
      if (!im) return;
      this.selectImage(null);
      this.edit('Eliminar imagen', () => O.deleteRange(this.doc, { id: im.id, off: im.off }, { id: im.id, off: im.off + 1 }));
    },
    field(f) { this.insertAtom('Campo', { k: 'fld', f }); },
    dateChip() { this.insertAtom('Fecha', { k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'chip' }); },
    checkboxChip() { this.insertAtom('Casilla', { k: 'chip', c: 'cb', v: false }); },
    dropdownChip(kind) {
      const SETS = {
        status: [{ t: 'Pendiente', c: '#e8eaed' }, { t: 'En curso', c: '#c6dbfc' }, { t: 'En revisión', c: '#fde7b0' }, { t: 'Terminado', c: '#c9e9d2' }],
        priority: [{ t: 'Alta', c: '#f6c9c4' }, { t: 'Media', c: '#fde7b0' }, { t: 'Baja', c: '#c9e9d2' }],
        yesno: [{ t: 'Sí', c: '#c9e9d2' }, { t: 'No', c: '#f6c9c4' }, { t: 'Tal vez', c: '#e8eaed' }],
      };
      if (kind === 'custom') { PT.dlg.dropdownOptions({ opts: [{ t: 'Opción 1', c: '#e8eaed' }, { t: 'Opción 2', c: '#c6dbfc' }] }, (opts) => this.insertAtom('Desplegable', { k: 'chip', c: 'dd', v: (opts[0] || {}).t || '', opts })); return; }
      const opts = SETS[kind] || SETS.status;
      this.insertAtom('Desplegable', { k: 'chip', c: 'dd', v: opts[0].t, opts });
    },
    symbol() { PT.dlg.symbols(); },
    emoji() { PT.dlg.symbols('emoji'); },
    equation() { PT.dlg.equation(); },
    headerFooter(part) { if (this.layout.pageless) { this.settings.pageless = false; C.pageless.call(this, false); } this.editStory(part || 'hdr'); },
    pageNumbers() { PT.dlg.pageNumbers(); },
    pageSetup() { PT.dlg.pageSetup(); },
    watermark() { PT.dlg.watermark(); },
    pageColor(c) { this.doc.tx('Color de página', () => this.doc.set(['page', 'color'], c || null)); this.refresh({ noScroll: true }); },
    paragraph() { PT.dlg.paragraph(); },
    fontDialog() { PT.dlg.font(); },
    borders() { PT.dlg.borders(); },
    styles() { PT.dlg.styles(); },
    updateStyle() {
      const sel = this.sel();
      if (!sel) return;
      const doc = this.doc, p = doc.block(sel.h.id), id = p.st || 'normal';
      const info = O.marksInfo(doc, O.caret({ id: p.id, off: Math.min(1, P.len(p)) }));
      const st = doc.styles[id], r = Object.assign({}, st.r || {}), pp = Object.assign({}, st.p || {});
      for (const k of ['ff', 'fs', 'fc', 'b', 'i', 'u', 'caps', 'sc', 'sp']) { const v = info._m ? info._m[k] : undefined; if (v != null) r[k] = v; }
      for (const k of ['al', 'inL', 'inR', 'inF', 'spB', 'spA', 'lh', 'lhx', 'bg']) if (p[k] != null) pp[k] = p[k];
      this.edit('Actualizar estilo', () => {
        doc.set(['styles', id], Object.assign({}, st, { r, p: pp }));
        O.applyStyle(doc, [p.id], id);
        return sel;
      });
      ui.toast('Estilo «' + st.name + '» actualizado: todos sus párrafos cambian.');
    },
    formatPainter() {
      const sel = this.sel();
      if (!sel) return;
      const doc = this.doc, p = doc.block(sel.h.id);
      const [a] = O.ordered(doc, sel);
      const m = O.isCollapsed(sel) ? O.typingMarks(doc, a) : R.marksAt(p.runs, a.off) || O.typingMarks(doc, a);
      this.painter = { m: M.without(m, ['ln', 'cm', 'ins', 'del']), p: P.props(p) };
      PT.chrome.els.flow.classList.add('painting');
      PT.chrome.updateSelection();
      ui.toast('Selecciona el texto al que quieres aplicar el formato.', 2500);
      const apply = () => {
        document.removeEventListener('pointerup', apply, true);
        setTimeout(() => {
          const pt = this.painter;
          this.painter = null;
          PT.chrome.els.flow.classList.remove('painting');
          const s = this.sel();
          if (!pt || !s) return;
          const [x, y] = O.ordered(doc, s);
          this.edit('Copiar formato', () => {
            if (!O.same(x, y)) O.setMarks(doc, x, y, (mm) => M.intern(Object.assign({}, pt.m, { ln: mm.ln, cm: mm.cm, ins: mm.ins, del: mm.del })));
            O.setPara(doc, O.paraIds(doc, s), { st: pt.p.st || null, al: pt.p.al || null, inL: pt.p.inL, inR: pt.p.inR, inF: pt.p.inF, spB: pt.p.spB, spA: pt.p.spA, lh: pt.p.lh, lhx: pt.p.lhx });
            return s;
          });
          PT.chrome.updateSelection();
        }, 30);
      };
      setTimeout(() => document.addEventListener('pointerup', apply, true), 0);
    },
    wordCount() { PT.dlg.wordCount(); },
    track() {
      const doc = this.doc;
      doc.tx('Control de cambios', () => doc.set(['track'], !doc.track));
      this.refresh({ noScroll: true });
      ui.toast(doc.track ? 'Control de cambios activado: tus cambios quedan marcados como sugerencias.' : 'Control de cambios desactivado.');
    },
    acceptAll() { this.edit('Aceptar todos los cambios', () => { O.resolveChanges(this.doc, true); return this.editor.sel; }); },
    rejectAll() { this.edit('Rechazar todos los cambios', () => { O.resolveChanges(this.doc, false); return this.editor.sel; }); },
    acceptSel() { const r = this.range(); if (r) this.edit('Aceptar cambio', () => { O.resolveChanges(this.doc, true, r[0], O.same(r[0], r[1]) ? { id: r[1].id, off: r[1].off + 1 } : r[1]); return this.editor.sel; }); },
    rejectSel() { const r = this.range(); if (r) this.edit('Rechazar cambio', () => { O.resolveChanges(this.doc, false, r[0], O.same(r[0], r[1]) ? { id: r[1].id, off: r[1].off + 1 } : r[1]); return this.editor.sel; }); },
    changesPanel() { PT.chrome.showPanel('changes'); },
    commentsPanel() { PT.chrome.showPanel('comments'); },
    outline() { this.settings.outline = !this.settings.outline; this.saveSettings(); PT.chrome.updateLayout(); },
    ruler() { this.settings.ruler = !this.settings.ruler; this.saveSettings(); PT.chrome.updateLayout(); },
    showMarks() { this.settings.showMarks = !this.settings.showMarks; this.saveSettings(); this.rebuildViews(); },
    showChanges() { this.settings.showChanges = !this.settings.showChanges; this.saveSettings(); this.applyStyleSheet(); this.refresh({ noScroll: true }); },
    pageless(on) {
      this.settings.pageless = on == null ? !this.settings.pageless : !!on;
      this.saveSettings();
      if (this.activeHost) this.editStory(null, true);
      this.layout.pageless = this.settings.pageless;
      this.relayout();
      PT.chrome.updateAll();
    },
    focusMode() { document.body.classList.toggle('focus-mode'); PT.chrome.updateRuler(); if (document.body.classList.contains('focus-mode')) ui.toast('Modo enfoque: pulsa Esc o el botón de la esquina para salir.'); },
    fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => ui.toast('El navegador no permite la pantalla completa.')); },
    readMode() { this.readOnly = !this.readOnly; document.body.classList.toggle('read-mode', this.readOnly); PT.chrome.els.flow.contentEditable = this.readOnly ? 'false' : 'true'; PT.chrome.updateAll(); ui.toast(this.readOnly ? 'Modo lectura: el documento no se puede modificar.' : 'Modo edición.'); },
    zoom(z) { this.settings.zoomFit = false; this.setZoom(z); },
    zoomFit() { this.settings.zoomFit = true; this.zoomFit(); },
    zoomPage() { this.zoomFit('page'); },
    darkMode() { this.settings.dark = !this.settings.dark; this.applySettings(true); },
    settings() { PT.dlg.settings(); },
    shortcuts() { PT.dlg.shortcuts(); },
    guide() { PT.dlg.guide(); },
    about() { PT.dlg.about(); },
    spellLang() { PT.dlg.language(); },
    readAloud() { PT.tools.readAloud(); },
    dictate() { PT.tools.dictate(); },
    docProps() { PT.dlg.docProps(); },
    versions() { PT.dlg.versions(); },
    async saveVersion() { const name = await ui.prompt('Nombre de la versión', 'Versión del ' + PT.dateText(new Date(), 'short') + ' ' + PT.timeText(), { title: 'Guardar una versión' }); if (name == null) return; await PT.files.saveVersion(this.doc, name); ui.toast('Versión guardada. Puedes recuperarla desde Archivo › Historial de versiones.'); },
    newDoc() { PT.files.newDoc(); }, template() { PT.dlg.templates(); }, open() { PT.files.open(); }, openFile(f) { PT.files.openFile(f); },
    library() { PT.dlg.library(); },
    saveDocx() { PT.files.save('docx'); }, saveAs(fmt) { PT.files.save(fmt); }, print() { PT.files.print(); }, pdf() { PT.files.print({ pdf: true }); },
    example() { PT.files.example(); },
    // tablas
    tableRowAbove() { this.tableCmd('rowAbove'); }, tableRowBelow() { this.tableCmd('rowBelow'); },
    tableColLeft() { this.tableCmd('colLeft'); }, tableColRight() { this.tableCmd('colRight'); },
    tableDelRow() { this.tableCmd('delRow'); }, tableDelCol() { this.tableCmd('delCol'); }, tableDelete() { this.tableCmd('delTable'); },
    tableMerge() { this.tableCmd('merge'); }, tableSplit() { this.tableCmd('split'); }, tableHeader() { this.tableCmd('header'); },
    tableDistribute() { this.tableCmd('distribute'); },
    tableSort(desc) { const t = this.tableCtx(); if (t) this.tableCmd('sort', { col: t.c1, desc: !!desc }); },
    tableProps() { const t = this.tableCtx(); if (!t) { ui.toast('Coloca el cursor dentro de una tabla.'); return; } PT.dlg.tableProps(t); },
    cellColor(c) { this.tableCmd('cellProps', { patch: { bg: c || null } }); },
    cellAlign(v) { this.tableCmd('cellProps', { patch: { va: v === 'top' ? null : v } }); },
    tableBorders(on) { this.tableCmd('props', { bd: on ? '0.5 solid #000000' : null }); },
  });
  for (const k of ['bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'font', 'fontSize', 'fontColor', 'highlight', 'smallCaps', 'allCaps']) {
    const f = C[k];
    C[k] = function (a) { if (this.painter) { this.painter = null; PT.chrome.els.flow.classList.remove('painting'); } return f.call(this, a); };
  }

  // ---------------------------------------------------------------- menú de inserción rápida (@ y :)
  app.mentions = {
    el: null, items: [], active: 0, editor: null, start: null, mode: null,
    isOpen() { return !!this.el; },
    open(editor, start, mode) {
      this.close();
      this.editor = editor; this.start = start; this.mode = mode || 'at';
      this.el = h('div.mention-pop', { role: 'listbox' });
      ui.popup(this.el, this.anchor(), { onClose: () => { this.el = null; } });
      this.update();
    },
    anchor() { const r = this.editor.caretRect(); return r ? { x: r.left, y: r.bottom + 4 } : { x: 100, y: 100 }; },
    query() {
      const ed = this.editor, doc = app.doc, sel = ed.sel;
      if (!sel || !O.isCollapsed(sel) || sel.h.id !== this.start.id || sel.h.off <= this.start.off) return null;
      const t = doc.paraText(sel.h.id);
      const trigger = this.mode === 'emoji' ? ':' : '@';
      if (t[this.start.off] !== trigger) return null;
      const q = t.slice(this.start.off + 1, sel.h.off);
      if (/\s/.test(q) && this.mode === 'emoji') return null;
      if (q.length > 30 || /\s{2}/.test(q)) return null;
      return q;
    },
    entries() {
      if (this.mode === 'emoji') return PT.EMOJI.map(([e, names]) => ({ label: e + '  ' + names.split(' ')[0], key: names, run: () => this.replace([{ x: e }]) }));
      const T = (label, icon, run, key) => ({ label, icon, run, key: key || '' });
      return [
        T('Fecha de hoy', 'calendar', () => this.replaceAtom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'chip' }), 'fecha hoy dia'),
        T('Fecha…', 'calendar', () => { this.replaceAtom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'chip' }); }, 'fecha calendario'),
        T('Casilla de verificación', 'checkbox', () => this.replaceAtom({ k: 'chip', c: 'cb', v: false }), 'casilla check'),
        T('Desplegable de estado', 'dropdown', () => this.cmd('dropdownChip', 'status'), 'desplegable estado'),
        T('Desplegable de prioridad', 'dropdown', () => this.cmd('dropdownChip', 'priority'), 'desplegable prioridad'),
        T('Desplegable Sí / No', 'dropdown', () => this.cmd('dropdownChip', 'yesno'), 'desplegable si no'),
        T('Desplegable personalizado…', 'dropdown', () => this.cmd('dropdownChip', 'custom'), 'desplegable opciones'),
        T('Número de página', 'pageNum', () => this.replaceAtom({ k: 'fld', f: 'page' }), 'pagina numero campo'),
        T('Total de páginas', 'pageNum', () => this.replaceAtom({ k: 'fld', f: 'pages' }), 'paginas total campo'),
        T('Tabla 3 × 3', 'table', () => this.cmd('insertTable', { rows: 3, cols: 3 }), 'tabla'),
        T('Imagen…', 'image', () => this.cmd('image'), 'imagen foto'),
        T('Lista de verificación', 'listCheck', () => this.cmd('listCheck'), 'lista tareas'),
        T('Línea horizontal', 'hr', () => this.cmd('hr'), 'linea separador'),
        T('Índice', 'toc', () => this.cmd('insertToc'), 'indice tabla contenido'),
        T('Nota al pie', 'footnote', () => this.cmd('footnote'), 'nota pie'),
        T('Salto de página', 'pageBreak', () => this.cmd('pageBreak'), 'salto pagina'),
        T('Ecuación…', 'equation', () => this.cmd('equation'), 'ecuacion formula matematica'),
        T('Símbolo…', 'symbol', () => this.cmd('symbol'), 'simbolo caracter'),
        T('Emoji…', 'emoji', () => this.cmd('emoji'), 'emoji'),
        T('Título 1', 'header', () => this.cmd('style', 'h1'), 'titulo encabezado'),
        T('Título 2', 'header', () => this.cmd('style', 'h2'), 'titulo subtitulo'),
        ...(PT.extras ? PT.extras.BLOCKS.map((b) => T(b.name, b.icon, () => this.cmd('insertBlock', b.id), 'bloque plantilla ' + b.desc)) : []),
        ...(PT.extras ? PT.extras.myBlocks().map((b) => T(b.name, 'star', () => { this.cmd('noop'); PT.extras.insertMine(b.name); }, 'mi bloque guardado')) : []),
        ...(PT.extras ? PT.extras.varNames(app.doc).map((n) => T('Variable «' + n + '»', 'variable', () => this.replaceAtom({ k: 'fld', f: 'var', name: n }), 'variable campo ' + n)) : []),
        T('Nueva variable…', 'variable', () => this.cmd('variable'), 'variable campo plantilla'),
        T('Pedir a la IA…', 'sparkle', () => this.cmd('ai'), 'ia asistente inteligencia artificial escribir'),
        T('Continuar escribiendo con IA', 'sparkle', () => this.cmd('ai', 'continue'), 'ia continuar escribir'),
        T('Firma…', 'sign', () => this.cmd('signature'), 'firma firmar'),
        T('Dibujo…', 'pen', () => this.cmd('drawing'), 'dibujo boceto lapiz'),
      ];
    },
    update() {
      if (!this.el) return;
      const q = this.query();
      if (q == null) { this.close(); return; }
      const f = PT.fold(q.toLowerCase());
      this.items = this.entries().filter((it) => !f || PT.fold((it.label + ' ' + it.key).toLowerCase()).includes(f)).slice(0, this.mode === 'emoji' ? 40 : 30);
      if (!this.items.length) { this.close(); return; }
      this.active = Math.min(this.active, this.items.length - 1);
      this.el.replaceChildren(...this.items.map((it, i) => {
        const row = h('div.menu-item' + (i === this.active ? '.active' : ''), { role: 'option' }, h('span.menu-ico', it.icon ? ui.icon(it.icon, 15) : null), h('span.menu-label', it.label));
        row.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pick(i); });
        return row;
      }));
      const a = this.anchor();
      this.el.style.left = Math.max(4, Math.min(a.x, window.innerWidth - this.el.offsetWidth - 4)) + 'px';
      this.el.style.top = (a.y + this.el.offsetHeight > window.innerHeight ? a.y - this.el.offsetHeight - 26 : a.y) + 'px';
    },
    onKey(e) {
      if (!this.el) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.items.length) % this.items.length; this.update(); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // se vuelve a filtrar por si el texto cambió desde el último dibujo del menú
        this.editor.readSel();
        this.update();
        if (!this.el) return false;
        e.preventDefault();
        this.pick(this.active);
        return true;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return true; }
      return false;
    },
    pick(i) { const it = this.items[i]; if (it) it.run(); },
    close() { if (this.el) { const el = this.el; this.el = null; el.remove(); ui.closePopups(); } },
    removeQuery() {
      const ed = this.editor, sel = ed.sel;
      const end = sel && sel.h.id === this.start.id ? sel.h.off : this.start.off + 1;
      return [{ id: this.start.id, off: this.start.off }, { id: this.start.id, off: end }];
    },
    replace(runs) { const [a, b] = this.removeQuery(); this.close(); this.editor.exec('Insertar', () => O.insertText(app.doc, { a, h: b }, runs[0].x)); },
    replaceAtom(obj) { const [a, b] = this.removeQuery(); this.close(); this.editor.exec('Insertar', () => O.insertAtom(app.doc, { a, h: b }, obj)); },
    cmd(name, arg) { const [a, b] = this.removeQuery(); this.close(); this.editor.exec('Insertar', () => O.deleteRange(app.doc, a, b)); app.run(name, arg); },
  };

  window.addEventListener('DOMContentLoaded', () => app.init());
})();
