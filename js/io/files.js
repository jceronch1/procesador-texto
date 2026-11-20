/* Archivos: guardado automático en el navegador (IndexedDB con respaldo en localStorage), biblioteca de
   documentos, versiones, abrir (docx, md, html, rtf, txt, json), descargar, imprimir o guardar como PDF
   con las mismas páginas de la pantalla, plantillas y documentos de bienvenida y de ejemplo. */
(function () {
  'use strict';
  const PT = window.PT, ui = PT.ui, h = ui.h, O = PT.ops, P = PT.para, R = PT.runs, M = PT.marks;
  const A = () => PT.app;
  const LS = () => PT.LS;

  // ---------------------------------------------------------------- almacenamiento
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        if (!window.indexedDB) { res(null); return; }
        const rq = indexedDB.open('procesador-texto', 1);
        rq.onupgradeneeded = () => { const d = rq.result; for (const s of ['meta', 'data', 'vmeta', 'vdata']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  const reqP = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const store = {
    async put(name, obj) {
      const d = await db();
      if (!d) return LS().set('pt.' + name + '.' + obj.id, JSON.stringify(obj));
      const tx = d.transaction(name, 'readwrite');
      tx.objectStore(name).put(obj);
      return new Promise((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
    },
    async get(name, id) {
      const d = await db();
      if (!d) { try { return JSON.parse(LS().get('pt.' + name + '.' + id) || 'null'); } catch (e) { return null; } }
      return reqP(d.transaction(name).objectStore(name).get(id));
    },
    async all(name) {
      const d = await db();
      if (!d) {
        const out = [];
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('pt.' + name + '.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* dañado */ } } } } catch (e) { /* sin almacenamiento */ }
        return out;
      }
      return reqP(d.transaction(name).objectStore(name).getAll());
    },
    async del(name, id) {
      const d = await db();
      if (!d) { LS().del('pt.' + name + '.' + id); return true; }
      const tx = d.transaction(name, 'readwrite');
      tx.objectStore(name).delete(id);
      return new Promise((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
    },
  };
  const safe = PT.safeName;
  const extOf = (name) => ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase();
  async function decodeText(file) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.indexOf('�') >= 0) text = new TextDecoder('windows-1252').decode(buf);
    return text.replace(/^﻿/, '');
  }
  const blankDoc = () => {
    const d = PT.Doc.blank();
    const s = A() ? A().settings : {};
    if (s.page) Object.assign(d.page, PT.clone(s.page));
    else if (s.paper && PT.PAPER[s.paper]) { d.page.size = s.paper; d.page.w = PT.PAPER[s.paper].w; d.page.h = PT.PAPER[s.paper].h; }
    d.meta.author = (A() && A().settings.author) || '';
    return d;
  };

  const files = (PT.files = {
    currentId: null, recentCache: [], _lastAutoVersion: 0,

    // ------------------------------------------------------------ guardado automático y biblioteca
    async loadLast() {
      const id = LS().get('pt.current');
      if (!id) return null;
      const data = await store.get('data', id);
      if (!data || !data.json) return null;
      this.currentId = id;
      this._lastAutoVersion = Date.now();
      return PT.Doc.fromJSON(data.json);
    },
    async autosave(doc) {
      if (!this.currentId) this.currentId = PT.uid('doc');
      const json = doc.toJSON();
      const meta = { id: this.currentId, title: doc.meta.title || 'Documento sin título', modified: new Date().toISOString(), words: PT.countWords(doc.plainText('body')) };
      doc.meta.modified = meta.modified;
      const ok1 = await store.put('data', { id: this.currentId, json });
      const ok2 = await store.put('meta', meta);
      LS().set('pt.current', this.currentId);
      // versión automática cada 15 minutos de trabajo
      if (Date.now() - this._lastAutoVersion > 15 * 60 * 1000 && doc.undoStack.length) {
        this._lastAutoVersion = Date.now();
        this.saveVersion(doc, 'Versión automática', true).catch(() => {});
      }
      this.refreshRecent();
      return ok1 !== false && ok2 !== false;
    },
    async refreshRecent() {
      try { this.recentCache = (await store.all('meta')).sort((a, b) => String(b.modified).localeCompare(String(a.modified))); } catch (e) { this.recentCache = []; }
      return this.recentCache;
    },
    async listDocs() { return this.refreshRecent(); },
    async openStored(id) {
      if (id === this.currentId) return;
      await A().saveNow();
      const data = await store.get('data', id);
      if (!data) { ui.toast('No se encontró el documento.'); return; }
      this.currentId = id;
      LS().set('pt.current', id);
      A().setDoc(PT.Doc.fromJSON(data.json), { keepClean: true });
      ui.toast('Se abrió «' + (data.json.meta && data.json.meta.title) + '».');
    },
    async duplicateStored(id) {
      const data = await store.get('data', id), meta = await store.get('meta', id);
      if (!data) return;
      const nid = PT.uid('doc'), json = PT.clone(data.json);
      json.meta.title = (json.meta.title || 'Documento') + ' (copia)';
      await store.put('data', { id: nid, json });
      await store.put('meta', Object.assign({}, meta, { id: nid, title: json.meta.title, modified: new Date().toISOString() }));
    },
    async deleteStored(id) {
      await store.del('data', id); await store.del('meta', id);
      for (const v of await store.all('vmeta')) if (v.docId === id) { await store.del('vmeta', v.id); await store.del('vdata', v.id); }
      this.refreshRecent();
    },
    async adopt(doc, msg) {
      await A().saveNow();
      this.currentId = PT.uid('doc');
      A().setDoc(doc);
      await this.autosave(doc);
      if (msg) ui.toast(msg[0], msg[1]);
    },
    async newDoc() { await this.adopt(blankDoc()); A().focusEditor(true); },

    // ------------------------------------------------------------ versiones
    async saveVersion(doc, name, auto) {
      if (!this.currentId) await this.autosave(doc);
      const id = PT.uid('v');
      await store.put('vdata', { id, json: doc.toJSON() });
      await store.put('vmeta', { id, docId: this.currentId, name: name || 'Versión', date: new Date().toISOString(), words: PT.countWords(doc.plainText('body')), auto: !!auto });
      if (auto) {
        const autos = (await this.listVersions()).filter((v) => v.auto);
        for (const v of autos.slice(10)) await this.deleteVersion(v.id);
      }
    },
    async listVersions() {
      const all = await store.all('vmeta');
      return all.filter((v) => v.docId === this.currentId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
    async loadVersion(id) { const d = await store.get('vdata', id); return d ? PT.Doc.fromJSON(d.json) : null; },
    async deleteVersion(id) { await store.del('vmeta', id); await store.del('vdata', id); },
    async restoreVersion(id) {
      const a = A();
      const d = await this.loadVersion(id);
      if (!d) return;
      await this.saveVersion(a.doc, 'Antes de restaurar', true);
      a.setDoc(d, { keepClean: true });
      await this.autosave(d);
      ui.toast('Versión restaurada.');
    },
    preview(doc, name) {
      const frame = h('iframe.ver-preview', { sandbox: '', style: { width: '100%', height: '60vh', border: '1px solid var(--border)', borderRadius: '4px', background: '#fff' } });
      ui.dialog({ title: 'Vista previa · ' + name, width: 820, body: frame, buttons: [{ label: 'Abrir como documento nuevo', action: () => { this.adopt(doc, ['Se abrió una copia de la versión.']); } }, { label: 'Cerrar', primary: true }] });
      frame.srcdoc = PT.convert.toHTML(doc);
    },

    // ------------------------------------------------------------ abrir
    async open() {
      const file = await ui.pickFile('.docx,.docm,.dotx,.md,.markdown,.txt,.text,.html,.htm,.rtf,.json');
      if (file) await this.openFile(file);
      else A().focusEditor();
    },
    async openFile(file) {
      const name = file.name || 'documento';
      try {
        const { doc, note } = await this.parseFile(file);
        await this.adopt(doc, ['Se abrió «' + name + '».' + note, note ? 8000 : 3500]);
      } catch (e) {
        console.error(e);
        ui.alert('No se pudo abrir «' + name + '».\n' + (e && e.message ? e.message : 'El archivo no tiene un formato reconocido.'), 'Abrir archivo');
      }
    },
    // lee un archivo y devuelve el documento sin abrirlo (también para comparar documentos)
    async parseFile(file) {
      const name = file.name || 'documento', ext = extOf(name);
      {
        let doc, note = '';
        if (/^(docx|docm|dotx|dotm)$/.test(ext)) {
          doc = await PT.docx.read(await file.arrayBuffer());
          const info = doc.importInfo || {};
          if (info.lostObjects) note += ' ' + info.lostObjects + ' objeto(s) (formas, cuadros de texto o gráficos) no se pudieron importar.';
          if (info.unknownImages) note += ' ' + info.unknownImages + ' imagen(es) en formato EMF/WMF no se pueden mostrar.';
        } else if (ext === 'doc') throw new Error('El formato .doc antiguo no es compatible. Ábrelo en Word o LibreOffice y guárdalo como .docx.');
        else if (ext === 'odt') throw new Error('Los documentos .odt todavía no se pueden abrir. Guárdalo como .docx desde LibreOffice y vuelve a abrirlo.');
        else if (ext === 'pdf') throw new Error('Los PDF no se pueden editar. Si tienes el documento original, ábrelo en su formato (.docx, .md, .txt…).');
        else if (ext === 'json') doc = PT.Doc.fromJSON(JSON.parse(await decodeText(file)));
        else if (ext === 'md' || ext === 'markdown') doc = PT.convert.fromMarkdown(await decodeText(file));
        else if (ext === 'html' || ext === 'htm') doc = PT.convert.fromHTML(await decodeText(file));
        else if (ext === 'rtf') doc = PT.convert.fromRTF(await decodeText(file));
        else doc = this.fromText(await decodeText(file));
        if (!doc.meta.title || doc.meta.title === 'Documento sin título') doc.meta.title = name.replace(/\.[^.]+$/, '');
        await this.fixImages(doc);
        doc.undoStack.length = 0; doc.redoStack.length = 0;
        return { doc, note };
      }
    },
    fromText(text) {
      const d = PT.Doc.blank();
      const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
      d.body = lines.map((l) => P.make(null, R.fromText(l.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''))));
      if (!d.body.length) d.body = [P.make()];
      d._idx = null;
      return d;
    },
    // tamaño real de las imágenes que llegan sin medidas (Markdown, HTML)
    async fixImages(doc) {
      const d = PT.pageDims(doc.page);
      const jobs = [];
      const visit = (list) => {
        for (const b of list || []) {
          if (b.t === 'p') b.runs.forEach((r, i) => { if (r.o && r.o.k === 'img' && r.o.auto) jobs.push({ b, i, o: r.o }); });
          else if (b.t === 'table') for (const row of b.rows) for (const c of row.cells) visit(c.blocks);
        }
      };
      visit(doc.body);
      for (const j of jobs.slice(0, 200)) {
        const sz = await ui.imageSize(j.o.src);
        if (!sz) continue;
        let w = PT.px2pt(sz.w), hh = PT.px2pt(sz.h);
        const k = Math.min(1, d.cw / w, (d.ch * 0.8) / hh);
        const o = Object.assign({}, j.o, { w: PT.round(w * k, 1), h: PT.round(hh * k, 1) });
        delete o.auto;
        j.b.runs = j.b.runs.slice();
        j.b.runs[j.i] = { o: Object.freeze(o), m: j.b.runs[j.i].m };
      }
    },

    // ------------------------------------------------------------ descargar
    async save(fmt) {
      const a = A(), doc = a.doc, base = safe(doc.meta.title || 'Documento');
      try {
        let blob, name;
        if (fmt === 'docx') { ui.toast('Preparando el archivo de Word…', 1500); blob = await PT.docx.write(doc); name = base + '.docx'; }
        else if (fmt === 'html') { blob = new Blob([PT.convert.toHTML(doc)], { type: 'text/html;charset=utf-8' }); name = base + '.html'; }
        else if (fmt === 'md') { blob = new Blob([PT.convert.toMarkdown(doc)], { type: 'text/markdown;charset=utf-8' }); name = base + '.md'; }
        else if (fmt === 'txt') { blob = new Blob([PT.convert.toText(doc)], { type: 'text/plain;charset=utf-8' }); name = base + '.txt'; }
        else if (fmt === 'rtf') { blob = new Blob([PT.convert.toRTF(doc)], { type: 'application/rtf' }); name = base + '.rtf'; }
        else if (fmt === 'json') { blob = new Blob([JSON.stringify(doc.toJSON())], { type: 'application/json' }); name = base + '.json'; }
        else return;
        if (window.AndroidText) {
          if (await PT.android.save(blob, name)) ui.toast('Se guardó «' + name + '».');
          return;
        }
        ui.download(blob, name);
        ui.toast('Se descargó «' + name + '».');
      } catch (e) {
        console.error(e);
        ui.alert('No se pudo preparar el archivo.\n' + (e && e.message ? e.message : ''), 'Descargar');
      }
    },

    // ------------------------------------------------------------ imprimir y PDF (mismas páginas que en pantalla)
    printHTML() {
      const a = A(), L = a.layout, doc = a.doc, d = L.dims(), stride = d.H + L.gap, z = a.zoom || 1;
      const pd = PT.pageDims(doc.page);
      const flow = L.flow, fr = flow.getBoundingClientRect();
      const blocks = Array.from(flow.children).filter((el) => el.dataset && el.dataset.id);
      const rects = blocks.map((el) => { const r = el.getBoundingClientRect(); return { top: (r.top - fr.top) / z, bottom: (r.bottom - fr.top) / z }; });
      let pages = '';
      for (let k = 0; k < L.count; k++) {
        const top = k * stride, bottom = top + d.ch;
        let first = -1, last = -1;
        for (let i = 0; i < blocks.length; i++) if (rects[i].bottom > top + 0.5 && rects[i].top < bottom - 0.5) { if (first < 0) first = i; last = i; }
        let content = '';
        if (first >= 0) {
          const off = rects[first].top - top;
          content = '<div class="pt-flow" style="position:absolute;left:0;top:' + off + 'px;width:' + d.cw + 'px">' + blocks.slice(first, last + 1).map((el) => el.outerHTML).join('') + '</div>';
        }
        const sheet = L.sheets[k] ? L.sheets[k].el.cloneNode(true) : null;
        let sheetHtml = '';
        if (sheet) {
          sheet.style.top = '0';
          for (const x of sheet.querySelectorAll('[contenteditable]')) x.removeAttribute('contenteditable');
          for (const x of sheet.querySelectorAll('.pt-editing')) x.classList.remove('pt-editing');
          sheetHtml = sheet.outerHTML;
        }
        pages += '<div class="print-page">' + sheetHtml + '<div class="print-body" style="left:' + d.ml + 'px;top:' + d.mt + 'px;width:' + d.cw + 'px;height:' + d.ch + 'px">' + content + '</div></div>';
      }
      const css = PT.DOC_CSS + PT.view.styleSheet(doc) +
        '@page{size:' + pd.W + 'pt ' + pd.H + 'pt;margin:0}html,body{margin:0;padding:0;background:#fff}' +
        '.print-page{position:relative;width:' + d.W + 'px;height:' + d.H + 'px;overflow:hidden;break-after:page;page-break-after:always;--page-color:' + (doc.page.color || '#ffffff') + '}.print-page:last-child{break-after:auto;page-break-after:auto}' +
        '.print-body{position:absolute;clip-path:inset(0 -2000px 0 -2000px)}.pt-sheet{box-shadow:none!important}.pt-hdr,.pt-ftr{opacity:1!important}' +
        '.pt-noborder>tbody>tr>td{outline:none!important}.pt-cm{background:none!important;border-bottom:0!important}.pt-fld{background:none!important}' +
        '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
      return '<!doctype html><html lang="' + PT.esc(doc.meta.lang || 'es') + '"><head><meta charset="utf-8"><title>' + PT.esc(doc.meta.title || 'Documento') + '</title><style>' + css + '</style></head><body>' + pages + '</body></html>';
    },
    print(opts) {
      const a = A(), L = a.layout;
      if (a.activeHost) a.editStory(null, true);
      a.selectImage(null);
      const wasPageless = L.pageless;
      if (wasPageless) { L.pageless = false; a.relayout(); }
      let html;
      try { html = this.printHTML(); } finally { if (wasPageless) { L.pageless = true; a.relayout(); } }
      if (window.AndroidText) {
        const size = PT.pageDims(a.doc.page);
        window.AndroidText.printDocument(a.doc.meta.title || 'Documento', html, size.W, size.H);
        return;
      }
      const frame = h('iframe', { title: 'Impresión', style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
      document.body.appendChild(frame);
      const fd = frame.contentDocument;
      fd.open(); fd.write(html); fd.close();
      const go = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 3000); } };
      const imgs = Array.from(fd.images || []);
      Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => setTimeout(go, 120));
      if (opts && opts.pdf) ui.toast('En el diálogo de impresión, elige «Guardar como PDF» como destino.', 7000);
    },

    // ------------------------------------------------------------ plantillas y documentos de ejemplo
    async fromTemplate(id) {
      const t = PT.TEMPLATES.find((x) => x.id === id);
      if (!t) return;
      const doc = t.build();
      await this.adopt(doc, t.id === 'blank' ? null : ['Plantilla «' + t.name + '» lista: cambia los textos de ejemplo.']);
      A().focusEditor(true);
    },
    welcomeDoc() { return buildWelcome(); },
    async example() { await this.adopt(buildExample(), ['Se abrió el documento de ejemplo.']); },
  });

  // ---------------------------------------------------------------- constructores de documentos
  const I = (t, base) => PT.convert.inline(t, base);
  const B = {
    p: (t, props) => P.make(props || null, I(t)),
    h: (n, t) => P.make({ st: 'h' + n }, I(t)),
    st: (st, t, props) => P.make(Object.assign({ st }, props || {}), I(t)),
    list(doc, kind, items, startLevel) {
      const id = PT.uid('L');
      doc.lists[id] = { k: kind };
      return items.map((it) => { const lvl = Array.isArray(it) ? it[1] : startLevel || 0; const text = Array.isArray(it) ? it[0] : it; const ck = kind === 'check' && /^\[x\] /.test(text); return P.make({ ls: { id, l: lvl }, ck: kind === 'check' ? ck : undefined }, I(text.replace(/^\[[x ]\] /, ''))); });
    },
    table(rows, opts) {
      opts = opts || {};
      const cols = rows[0].length, w = opts.width || 425;
      const t = PT.blocks.table(rows.length, cols, w, { header: opts.header !== false, bd: opts.bd });
      if (opts.cols) t.cols = opts.cols;
      rows.forEach((r, i) => r.forEach((txt, c) => {
        const cell = t.rows[i].cells[c];
        cell.blocks = [P.make(opts.cellProps || null, I(String(txt), i === 0 && opts.header !== false ? { b: true } : {}))];
        if (i === 0 && opts.header !== false && opts.headBg) cell.bg = opts.headBg;
        if (i > 0 && opts.zebra && i % 2 === 0) cell.bg = opts.zebra;
      }));
      return t;
    },
    atom: (o, m) => ({ o: Object.freeze(o), m: M.intern(m || null) }),
    text: (x, m) => ({ x, m: M.intern(m || null) }),
    finish(doc, blocks) { doc.body = blocks.concat(blocks.length && blocks[blocks.length - 1].t !== 'p' ? [P.make()] : []); doc._idx = null; return doc; },
  };
  PT.tpl = B; // también lo usan los bloques prediseñados
  const pageNumFooter = (doc, withTotal) => { doc.ftr = [P.make({ st: 'hf', al: 'center' }, withTotal ? [B.text('Página '), B.atom({ k: 'fld', f: 'page' }), B.text(' de '), B.atom({ k: 'fld', f: 'pages' })] : [B.atom({ k: 'fld', f: 'page' })])]; };
  const chart = () => {
    // gráfico de barras sencillo en SVG para el ejemplo
    const data = [['Ene', 42], ['Feb', 55], ['Mar', 61], ['Abr', 58], ['May', 72], ['Jun', 80]];
    let bars = '';
    data.forEach(([m, v], i) => { const x = 50 + i * 62, hh = v * 2.2; bars += '<rect x="' + x + '" y="' + (210 - hh) + '" width="38" height="' + hh + '" rx="3" fill="#4472c4"/><text x="' + (x + 19) + '" y="228" font-size="13" text-anchor="middle" fill="#444">' + m + '</text><text x="' + (x + 19) + '" y="' + (204 - hh) + '" font-size="12" text-anchor="middle" fill="#222">' + v + '</text>'; });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="250" viewBox="0 0 440 250"><rect width="440" height="250" fill="#fff"/><text x="220" y="24" font-size="15" font-weight="bold" text-anchor="middle" font-family="Segoe UI,Arial" fill="#222">Usuarios activos (miles)</text><line x1="40" y1="210" x2="430" y2="210" stroke="#999"/>' + bars + '</svg>';
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  };

  function buildWelcome() {
    const d = blankDoc();
    d.meta.title = 'Bienvenida';
    return B.finish(d, [
      B.st('title', 'Te damos la bienvenida'),
      B.st('subtitle', 'Un procesador de texto completo que funciona en tu navegador, sin conexión'),
      B.p('Escribe directamente sobre la página: este documento se guarda solo en este navegador. Cuando quieras, descárgalo como **Word (.docx)**, **PDF**, HTML, Markdown, RTF o texto desde **Archivo**.'),
      B.h(1, 'Lo esencial'),
      ...B.list(d, 'bullet', [
        'Usa los **estilos** (Normal, Título 1, Cita…) del cuadro de la izquierda de la barra de herramientas para dar estructura; el **esquema** de la izquierda se actualiza solo.',
        'Escribe **@** para insertar fichas inteligentes: fechas, casillas, desplegables, números de página o tablas.',
        'Escribe atajos de Markdown: «# » título, «- » viñeta, «1. » lista numerada, «[] » casilla, «> » cita y \\*\\*texto\\*\\* para la **negrita**.',
        'Haz doble clic en el margen superior o inferior de una página para editar el **encabezado** o el **pie**.',
        'Activa el modo **Sugerencias** (arriba a la derecha) para que tus cambios queden marcados y puedan revisarse.',
      ]),
      B.h(1, 'Prueba ahora'),
      ...B.list(d, 'check', ['[x] Abrir el procesador de texto', 'Cambiar el título de este documento (arriba a la izquierda)', 'Insertar una tabla desde la barra de herramientas', 'Abrir **Archivo › Abrir documento de ejemplo** para ver todo lo que se puede hacer']),
      B.p('Consulta **Ayuda › Guía rápida** y **Ayuda › Atajos de teclado** cuando lo necesites.', { spB: 12 }),
    ]);
  }

  function buildExample() {
    const d = blankDoc();
    d.meta.title = 'Informe de ejemplo';
    d.meta.author = 'Equipo de producto';
    pageNumFooter(d, true);
    d.hdr = [P.make({ st: 'hf', al: 'right' }, [B.text('Informe trimestral · ', { fc: '#7f7f7f' }), B.atom({ k: 'fld', f: 'title' }, { fc: '#7f7f7f' })])];
    d.page.first = true;
    d.hdr1 = []; d.ftr1 = [];
    const nid = 'n' + PT.uid('x');
    d.notes[nid] = { blocks: [P.make({ st: 'fnote' }, I('Datos internos provisionales; se actualizarán al cierre del trimestre.'))] };
    const cid = 'm' + PT.uid('x');
    d.comments[cid] = { by: 'Laura', at: new Date(Date.now() - 3600e3).toISOString(), text: '¿Podemos añadir la comparación con el año anterior?', done: false, re: [{ by: 'Andrés', at: new Date(Date.now() - 1800e3).toISOString(), text: 'Sí, la incluyo en la próxima versión.' }] };
    const stamp = 'Andrés|' + new Date(Date.now() - 5400e3).toISOString();
    const t = B.table([['Indicador', 'T1', 'T2', 'Variación'], ['Usuarios activos', '55 000', '80 000', '+45 %'], ['Ingresos (miles €)', '310', '402', '+30 %'], ['Satisfacción', '4,1', '4,4', '+0,3']], { headBg: '#d9e2f3', zebra: '#f2f2f2', width: 425 });
    t.rows[0].hd = true;
    for (const row of t.rows) for (let c = 1; c < 4; c++) row.cells[c].blocks = row.cells[c].blocks.map((p) => P.with(p, { al: 'right' }));
    const t2 = B.table([['Fase', 'Responsable', 'Estado'], ['Diseño', 'Laura', ''], ['Desarrollo', 'Andrés', ''], ['Pruebas', 'Marta', '']], { headBg: '#e2efd9', width: 425 });
    const states = [['Terminado', '#c9e9d2'], ['En curso', '#c6dbfc'], ['Pendiente', '#e8eaed']];
    const opts = [{ t: 'Pendiente', c: '#e8eaed' }, { t: 'En curso', c: '#c6dbfc' }, { t: 'En revisión', c: '#fde7b0' }, { t: 'Terminado', c: '#c9e9d2' }];
    states.forEach(([s], i) => { t2.rows[i + 1].cells[2].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'dd', v: s, opts })])]; });
    const merged = B.table([['Región', 'Ventas', ''], ['Norte', '120', 'Objetivo superado'], ['Sur', '95', '']], { headBg: '#fbe4d5', width: 425 });
    // combinación de celdas: «Ventas» abarca dos columnas y la nota, dos filas
    merged.rows[0].cells[2] = { id: PT.uid('d'), mh: true, blocks: [] };
    merged.rows[2].cells[2] = { id: PT.uid('d'), mv: true, blocks: [] };
    merged.rows[1].cells[2].va = 'middle';
    return B.finish(d, [
      B.st('title', 'Informe trimestral'),
      B.st('subtitle', 'Resultados del segundo trimestre y próximos pasos'),
      P.make(null, [B.text('Fecha: '), B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' }), B.text('   ·   Estado: '), B.atom({ k: 'chip', c: 'dd', v: 'En revisión', opts })]),
      PT.blocks.toc(2),
      P.make({ st: 'h1', pb: true }, I('Resumen')),
      P.make({ al: 'justify' }, [B.text('El segundo trimestre cerró con un crecimiento sostenido'), B.atom({ k: 'fn', id: nid }), B.text(' en todos los indicadores. Este documento muestra lo que puede hacer el procesador: '), B.text('estilos', { b: true }), B.text(', '), B.text('formato de carácter', { i: true, fc: '#c00000' }), B.text(', '), B.text('resaltado', { hl: '#ffff00' }), B.text(', '), B.text('comentarios', { cm: cid }), B.text(', '), B.text('control de cambios', { ins: stamp }), B.text(', '), B.text('texto eliminado', { del: stamp }), B.text(' y '), B.text('vínculos', { ln: 'https://es.wikipedia.org/wiki/Procesador_de_texto' }), B.text('.')]),
      B.h(2, 'Indicadores principales'),
      t,
      P.make({ st: 'caption' }, I('Tabla 1. Comparación de indicadores por trimestre.')),
      B.h(2, 'Evolución'),
      P.make({ al: 'center' }, [B.atom({ k: 'img', src: chart(), w: 330, h: 187.5, alt: 'Gráfico de barras de usuarios activos por mes' })]),
      P.make({ st: 'caption', al: 'center' }, I('Figura 1. Usuarios activos por mes.')),
      P.make({ st: 'h1' }, I('Plan de trabajo')),
      B.p('El plan combina listas numeradas con varios niveles, casillas y fichas de estado:'),
      ...B.list(d, 'outline', [['Consolidar el crecimiento', 0], ['Campaña de otoño', 1], ['Programa de referidos', 1], ['Mejorar la retención', 0], ['Nuevo proceso de bienvenida', 1]]),
      t2,
      B.h(2, 'Tareas pendientes'),
      ...B.list(d, 'check', ['[x] Revisar los datos del trimestre', '[x] Preparar los gráficos', 'Validar el presupuesto con Finanzas', 'Enviar el informe a la dirección']),
      B.h(2, 'Ventas por región'),
      merged,
      B.h(1, 'Notas técnicas'),
      B.st('quote', '«La simplicidad es la máxima sofisticación.»'),
      B.p('Las ecuaciones se escriben con notación LaTeX: '),
      P.make({ al: 'center' }, [B.atom({ k: 'eq', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' })]),
      B.p('Y el código se muestra con su propio estilo:'),
      B.st('code', 'function crecimiento(t1, t2) {'),
      B.st('code', '  return (t2 - t1) / t1;'),
      B.st('code', '}'),
      PT.blocks.hr(),
      B.p('Fin del ejemplo. Usa **Archivo › Descargar como › Word (.docx)** para comprobar que todo se conserva en Word.', { al: 'center' }),
    ]);
  }

  // ---------------------------------------------------------------- plantillas
  const thumb = (lines) => '<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="130" fill="#fff"/>' + lines.map(([x, y, w, hh, c]) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (hh || 2.5) + '" rx="1" fill="' + (c || '#c9ccd1') + '"/>').join('') + '</svg>';
  const para = (y0, n, w) => Array.from({ length: n }, (_, i) => [12, y0 + i * 5, i === n - 1 ? (w || 50) : 76]);
  PT.TEMPLATES = [
    { id: 'blank', name: 'Documento en blanco', desc: 'Empieza desde cero', thumb: thumb([]), build: () => { const d = blankDoc(); return d; } },
    {
      id: 'letter', name: 'Carta formal', desc: 'Remitente, fecha, asunto y firma', thumb: thumb([[58, 12, 30, 3, '#7f8a99'], [64, 18, 24], [64, 23, 24], [12, 34, 30], [12, 39, 26], [12, 50, 40, 3, '#3a4a66'], ...para(60, 5), ...para(90, 4), [12, 112, 24]]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Carta';
        const right = { al: 'right', spA: 0 };
        return B.finish(d, [
          B.p('**Tu nombre**', right), B.p('Calle Ejemplo 12, 2.º B', right), B.p('28001 Madrid', right), B.p('correo@ejemplo.com · 600 000 000', Object.assign({}, right, { spA: 18 })),
          P.make({ al: 'right', spA: 18 }, [B.text('Madrid, '), B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' })]),
          B.p('**Nombre del destinatario**', { spA: 0 }), B.p('Cargo · Empresa', { spA: 0 }), B.p('Dirección de la empresa', { spA: 18 }),
          B.p('**Asunto:** motivo de la carta', { spA: 14 }),
          B.p('Estimado señor o estimada señora:'),
          B.p('Escribe aquí el primer párrafo: presenta el motivo de la carta de forma clara y breve.', { al: 'justify' }),
          B.p('En el segundo párrafo desarrolla los detalles, los argumentos o la información que quieres transmitir.', { al: 'justify' }),
          B.p('Cierra con lo que esperas del destinatario y agradece su atención.', { al: 'justify', spA: 18 }),
          B.p('Atentamente,', { spA: 36 }),
          B.p('**Tu nombre**', { spA: 0 }), B.p('Tu cargo'),
        ]);
      },
    },
    {
      id: 'cv', name: 'Currículum', desc: 'Perfil, experiencia, formación y habilidades', thumb: thumb([[12, 10, 50, 6, '#2f5496'], [12, 19, 60, 2, '#7f8a99'], [12, 30, 30, 3, '#2f5496'], ...para(36, 3), [12, 56, 30, 3, '#2f5496'], ...para(62, 4), [12, 88, 30, 3, '#2f5496'], ...para(94, 3), [12, 113, 30, 3, '#2f5496']]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Currículum';
        Object.assign(d.page, { mt: 51, mb: 51, ml: 57, mr: 57 });
        return B.finish(d, [
          B.st('title', 'Nombre Apellido'),
          P.make({ st: 'subtitle' }, I('Puesto o perfil profesional · Ciudad · correo@ejemplo.com · +34 600 000 000')),
          B.h(1, 'Perfil'),
          B.p('Dos o tres líneas que resuman tu experiencia, tus puntos fuertes y lo que buscas.', { al: 'justify' }),
          B.h(1, 'Experiencia'),
          B.h(3, 'Puesto actual · Empresa'), B.p('*2022 – actualidad · Ciudad*', { spA: 2 }),
          ...B.list(d, 'bullet', ['Logro medible o responsabilidad principal.', 'Otro logro relevante con cifras si es posible.']),
          B.h(3, 'Puesto anterior · Empresa'), B.p('*2018 – 2022 · Ciudad*', { spA: 2 }),
          ...B.list(d, 'bullet', ['Responsabilidad o proyecto destacado.', 'Resultado conseguido.']),
          B.h(1, 'Formación'),
          B.p('**Título universitario** · Universidad · 2014 – 2018'),
          B.h(1, 'Habilidades e idiomas'),
          B.table([['Habilidades', 'Idiomas'], ['Gestión de proyectos, análisis de datos, comunicación', 'Español (nativo) · Inglés (C1) · Francés (B1)']], { bd: null, headBg: null, width: 481 }),
        ]);
      },
    },
    {
      id: 'report', name: 'Informe', desc: 'Portada, índice, secciones y tabla', thumb: thumb([[12, 14, 60, 7, '#3a4a66'], [12, 25, 45, 3, '#7f8a99'], [12, 40, 76, 2, '#9aa'], [12, 44, 70, 2, '#9aa'], [12, 48, 74, 2, '#9aa'], [12, 60, 35, 4, '#2f5496'], ...para(68, 4), [12, 92, 76, 16, '#dfe6f2'], ...para(112, 3)]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Informe';
        pageNumFooter(d, true);
        d.hdr = [P.make({ st: 'hf', al: 'right' }, [B.atom({ k: 'fld', f: 'title' }, { fc: '#7f7f7f' })])];
        d.page.first = true;
        return B.finish(d, [
          B.st('title', 'Título del informe'), B.st('subtitle', 'Subtítulo o descripción breve'),
          P.make(null, [B.text('Autor · '), B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' })]),
          PT.blocks.toc(3),
          P.make({ st: 'h1', pb: true }, I('Resumen ejecutivo')), B.p('Resume en pocas líneas el propósito, los hallazgos y las recomendaciones.', { al: 'justify' }),
          B.h(1, 'Introducción'), B.p('Contexto, objetivos y alcance del informe.', { al: 'justify' }),
          B.h(1, 'Análisis'), B.h(2, 'Datos'), B.p('Describe los datos utilizados y su origen.'),
          B.table([['Concepto', 'Valor', 'Comentario'], ['Indicador A', '100', '—'], ['Indicador B', '250', '—']], { headBg: '#d9e2f3', width: 425 }),
          P.make({ st: 'caption' }, I('Tabla 1. Descripción de la tabla.')),
          B.h(2, 'Resultados'), B.p('Presenta los resultados más importantes.'),
          B.h(1, 'Conclusiones'), ...B.list(d, 'decimal', ['Primera conclusión.', 'Segunda conclusión.', 'Recomendación principal.']),
        ]);
      },
    },
    {
      id: 'minutes', name: 'Acta de reunión', desc: 'Asistentes, orden del día y acuerdos', thumb: thumb([[12, 12, 55, 6, '#3a4a66'], [12, 24, 76, 20, '#e8edf5'], [12, 50, 35, 3, '#2f5496'], ...para(56, 3), [12, 76, 35, 3, '#2f5496'], [12, 82, 4, 4, '#7f8a99'], [19, 83, 60], [12, 89, 4, 4, '#7f8a99'], [19, 90, 55], [12, 104, 35, 3, '#2f5496'], ...para(110, 2)]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Acta de reunión';
        const info = B.table([['Fecha', 'Hora', 'Lugar'], ['', '10:00', 'Sala 2 / videollamada']], { headBg: '#e8edf5', width: 425 });
        info.rows[1].cells[0].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' })])];
        const opts = [{ t: 'Pendiente', c: '#e8eaed' }, { t: 'En curso', c: '#c6dbfc' }, { t: 'Terminado', c: '#c9e9d2' }];
        const acts = B.table([['Acuerdo', 'Responsable', 'Fecha límite', 'Estado'], ['Acuerdo 1', 'Nombre', '', ''], ['Acuerdo 2', 'Nombre', '', '']], { headBg: '#e8edf5', width: 425 });
        for (let r = 1; r < 3; r++) { acts.rows[r].cells[2].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(new Date(Date.now() + r * 7 * 864e5)), fmt: 'chip' })])]; acts.rows[r].cells[3].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'dd', v: 'Pendiente', opts })])]; }
        return B.finish(d, [
          B.st('title', 'Acta de reunión'), B.st('subtitle', 'Nombre del equipo o proyecto'),
          info,
          B.h(2, 'Asistentes'), ...B.list(d, 'bullet', ['Nombre (función)', 'Nombre (función)']),
          B.h(2, 'Orden del día'), ...B.list(d, 'decimal', ['Revisión del acta anterior', 'Tema principal', 'Ruegos y preguntas']),
          B.h(2, 'Notas'), B.p('Resume aquí lo tratado en cada punto.'),
          B.h(2, 'Acuerdos y tareas'), acts,
          B.h(2, 'Próxima reunión'), P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(new Date(Date.now() + 14 * 864e5)), fmt: 'long' })]),
        ]);
      },
    },
    {
      id: 'essay', name: 'Trabajo académico', desc: 'Portada, secciones, notas y bibliografía', thumb: thumb([[25, 40, 50, 6, '#3a4a66'], [32, 52, 36, 3, '#7f8a99'], [36, 80, 28], [36, 86, 28], [36, 92, 28]]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Trabajo académico';
        pageNumFooter(d, false);
        d.page.first = true;
        const nid = 'n' + PT.uid('x');
        d.notes[nid] = { blocks: [P.make({ st: 'fnote' }, I('Ejemplo de nota al pie: aclaraciones o referencias breves.'))] };
        const ref = (t) => P.make({ inL: 36, inF: -36, al: 'left' }, I(t));
        return B.finish(d, [
          P.make({ al: 'center', spB: 160 }, I('**UNIVERSIDAD**')), P.make({ al: 'center' }, I('Facultad · Asignatura')),
          P.make({ st: 'title', al: 'center', spB: 80 }, I('Título del trabajo')), P.make({ st: 'subtitle', al: 'center' }, I('Subtítulo')),
          P.make({ al: 'center', spB: 120 }, I('Nombre del estudiante')), P.make({ al: 'center' }, I('Profesor/a: Nombre')),
          P.make({ al: 'center' }, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'long' })]),
          P.make({ st: 'h1', pb: true }, I('Introducción')),
          P.make({ al: 'justify', inF: 35.4, lh: 1.5 }, [B.text('Plantea el tema, la pregunta de investigación y la estructura del trabajo'), B.atom({ k: 'fn', id: nid }), B.text('.')]),
          B.h(1, 'Desarrollo'), P.make({ al: 'justify', inF: 35.4, lh: 1.5 }, I('Expón los argumentos con apoyo de fuentes (Apellido, 2024).')),
          B.h(1, 'Conclusiones'), P.make({ al: 'justify', inF: 35.4, lh: 1.5 }, I('Responde a la pregunta inicial y señala líneas futuras.')),
          P.make({ st: 'h1', pb: true }, I('Bibliografía')),
          ref('Apellido, N. (2024). *Título del libro*. Editorial.'),
          ref('Apellido, N. y Apellido, M. (2023). Título del artículo. *Nombre de la revista*, 12(3), 45-67.'),
        ]);
      },
    },
    {
      id: 'project', name: 'Plan de proyecto', desc: 'Objetivos, calendario, riesgos y tareas', thumb: thumb([[12, 12, 58, 6, '#3a4a66'], [12, 26, 30, 3, '#2f5496'], ...para(32, 2), [12, 46, 76, 24, '#e2efd9'], [12, 76, 30, 3, '#2f5496'], [12, 82, 76, 18, '#fbe4d5'], [12, 106, 30, 3, '#2f5496'], ...para(112, 2)]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Plan de proyecto';
        pageNumFooter(d, true);
        const opts = [{ t: 'Pendiente', c: '#e8eaed' }, { t: 'En curso', c: '#c6dbfc' }, { t: 'En revisión', c: '#fde7b0' }, { t: 'Terminado', c: '#c9e9d2' }];
        const plan = B.table([['Fase', 'Inicio', 'Fin', 'Estado'], ['Análisis', '', '', ''], ['Diseño', '', '', ''], ['Desarrollo', '', '', ''], ['Entrega', '', '', '']], { headBg: '#e2efd9', width: 425 });
        for (let r = 1; r < 5; r++) {
          plan.rows[r].cells[1].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(new Date(Date.now() + (r - 1) * 14 * 864e5)), fmt: 'chip' })])];
          plan.rows[r].cells[2].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(new Date(Date.now() + r * 14 * 864e5)), fmt: 'chip' })])];
          plan.rows[r].cells[3].blocks = [P.make(null, [B.atom({ k: 'chip', c: 'dd', v: r === 1 ? 'En curso' : 'Pendiente', opts })])];
        }
        const risks = B.table([['Riesgo', 'Probabilidad', 'Impacto', 'Mitigación'], ['Retraso de proveedores', 'Media', 'Alto', 'Plan alternativo'], ['Cambio de alcance', 'Alta', 'Medio', 'Control de cambios']], { headBg: '#fbe4d5', width: 425 });
        return B.finish(d, [
          B.st('title', 'Plan de proyecto'), B.st('subtitle', 'Nombre del proyecto'),
          B.h(1, 'Objetivo'), B.p('Describe el objetivo principal del proyecto y cómo se medirá el éxito.'),
          B.h(1, 'Alcance'), ...B.list(d, 'bullet', ['Incluye: …', 'No incluye: …']),
          B.h(1, 'Calendario'), plan,
          B.h(1, 'Riesgos'), risks,
          B.h(1, 'Próximos pasos'), ...B.list(d, 'check', ['Confirmar el presupuesto', 'Asignar responsables', 'Reunión de arranque']),
        ]);
      },
    },
    {
      id: 'notes', name: 'Apuntes', desc: 'Notas de clase o de lectura', thumb: thumb([[12, 12, 50, 5, '#3a4a66'], [12, 24, 30, 3, '#2f5496'], ...para(30, 3), [12, 48, 4, 4, '#7f8a99'], [19, 49, 50], [12, 55, 4, 4, '#7f8a99'], [19, 56, 46], [12, 68, 30, 3, '#2f5496'], ...para(74, 4)]),
      build: () => {
        const d = blankDoc(); d.meta.title = 'Apuntes';
        return B.finish(d, [
          B.st('title', 'Tema de los apuntes'),
          P.make(null, [B.atom({ k: 'chip', c: 'date', v: PT.isoDate(), fmt: 'full' })]),
          B.h(1, 'Ideas principales'), ...B.list(d, 'bullet', ['Primera idea', ['Detalle o ejemplo', 1], 'Segunda idea']),
          B.h(1, 'Definiciones'), B.p('**Término:** definición breve.'),
          B.h(1, 'Dudas para repasar'), ...B.list(d, 'check', ['Primera duda', 'Segunda duda']),
          B.h(1, 'Resumen'), B.p('Tres o cuatro frases con lo más importante.'),
        ]);
      },
    },
  ];
})();
