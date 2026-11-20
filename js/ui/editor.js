/* Editor de una historia (cuerpo, encabezado, pie o nota): intercepta la entrada del navegador (beforeinput)
   y la convierte en operaciones del modelo; reconcilia la composición (IME y teclas muertas para tildes),
   sincroniza la selección, gestiona el portapapeles, arrastrar y soltar, el formato automático
   (Markdown y autocorrección), las imágenes (selección y cambio de tamaño) y las columnas de las tablas. */
(function () {
  'use strict';
  const PT = window.PT, O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para, V = PT.view, ui = PT.ui, h = ui.h;
  const MIME = 'application/x-procesador-texto+json';
  const sameSel = (a, b) => !!a && !!b && O.same(a.a, b.a) && O.same(a.h, b.h);

  class Editor {
    constructor(app, view, host, story) {
      this.app = app; this.view = view; this.host = host; this.story = story;
      this.sel = null; this.stored = null; this.composing = false; this._listeners = [];
      this.attach();
    }
    get doc() { return this.app.doc; }
    on(el, ev, fn, opt) { const f = fn.bind(this); el.addEventListener(ev, f, opt); this._listeners.push([el, ev, f, opt]); }
    attach() {
      const host = this.host;
      host.contentEditable = 'true';
      host.spellcheck = this.app.settings.spell !== false;
      host.setAttribute('role', 'textbox');
      host.setAttribute('aria-multiline', 'true');
      host.lang = this.doc.meta.lang || 'es-ES';
      host.translate = false;
      this.on(host, 'beforeinput', this.onBeforeInput);
      this.on(host, 'keydown', this.onKeyDown);
      this.on(host, 'compositionstart', this.onCompStart);
      this.on(host, 'compositionend', this.onCompEnd);
      this.on(host, 'copy', this.onCopy);
      this.on(host, 'cut', this.onCut);
      this.on(host, 'paste', this.onPaste);
      this.on(host, 'dragstart', this.onDragStart);
      this.on(host, 'dragover', this.onDragOver);
      this.on(host, 'drop', this.onDrop);
      this.on(host, 'dragend', () => { this._drag = null; });
      this.on(host, 'pointerdown', this.onPointerDown);
      this.on(host, 'pointermove', this.onPointerMove);
      this.on(host, 'click', this.onClick);
      this.on(host, 'dblclick', this.onDblClick);
      this.on(host, 'focus', () => { this.app.setActiveEditor(this); });
      this.observer = new MutationObserver((recs) => this.onMutations(recs));
      this.observer.observe(host, { childList: true, subtree: true, characterData: true });
    }
    detach() {
      for (const [el, ev, f, opt] of this._listeners) el.removeEventListener(ev, f, opt);
      this._listeners = [];
      this.observer.disconnect();
      this.host.contentEditable = 'false';
      this.host.removeAttribute('role');
    }
    flushMutations() { this.observer.takeRecords(); }

    // ------------------------------------------------------------ selección
    readSel() {
      const s = window.getSelection();
      if (!s || !s.rangeCount || !this.host.contains(s.anchorNode)) return this.sel;
      const a = V.domToPos(this.host, s.anchorNode, s.anchorOffset), f = V.domToPos(this.host, s.focusNode, s.focusOffset);
      if (!a || !f) return this.sel;
      const doc = this.doc;
      if (!doc.block(a.id) || !doc.block(f.id)) return this.sel;
      const sel = { a: O.clampPos(doc, a, this.story), h: O.clampPos(doc, f, this.story) };
      if (!sameSel(sel, this.sel)) { this.sel = sel; this.stored = null; }
      return this.sel;
    }
    writeSel(sel) {
      if (sel) this.sel = { a: O.clampPos(this.doc, sel.a, this.story), h: O.clampPos(this.doc, sel.h, this.story) };
      if (!this.sel) return;
      const pa = this.view.paraEl(this.sel.a.id), ph = this.view.paraEl(this.sel.h.id);
      if (!pa || !ph) return;
      const a = V.posToDom(pa, this.sel.a.off), f = V.posToDom(ph, this.sel.h.off);
      const s = window.getSelection();
      try {
        if (s.anchorNode === a.node && s.anchorOffset === a.offset && s.focusNode === f.node && s.focusOffset === f.offset) return;
        s.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
      } catch (e) { /* el nodo pudo desaparecer */ }
    }
    setSel(sel, opts) { this.writeSel(sel); this.app.onSelection(this, opts); }
    // rango estático de beforeinput -> selección del modelo
    targetSel(e) {
      const rs = e.getTargetRanges ? e.getTargetRanges() : [];
      if (!rs.length) return null;
      const r = rs[0];
      const a = V.domToPos(this.host, r.startContainer, r.startOffset), b = V.domToPos(this.host, r.endContainer, r.endOffset);
      return a && b ? { a, h: b } : null;
    }
    caretRect() {
      if (!this.sel) return null;
      const el = this.view.paraEl(this.sel.h.id);
      return el ? V.rectAt(el, this.sel.h.off) : null;
    }

    // ------------------------------------------------------------ ejecutar cambios
    exec(label, fn, opts) {
      const doc = this.doc;
      if (this.app.readOnly) { ui.toast('El documento está en modo de solo lectura.'); return null; }
      doc.selGetter = () => this.sel && { story: this.story, a: this.sel.a, h: this.sel.h };
      let res;
      try { res = doc.tx(label, fn, opts); } catch (err) { console.error(err); ui.toast('No se pudo completar la acción: ' + err.message); this.app.refresh(); return null; }
      if (res && res.id) this.sel = O.caret(res);
      else if (res && res.a) this.sel = res;
      if (doc.undoStack.length) { const last = doc.undoStack[doc.undoStack.length - 1]; if (last.label === label) last.selAfter = this.sel && { story: this.story, a: this.sel.a, h: this.sel.h }; }
      this.app.refresh({ editor: this });
      return res;
    }

    // ------------------------------------------------------------ entrada
    onBeforeInput(e) {
      const t = e.inputType;
      if (/Composition/.test(t)) return;
      if (this.composing) return;
      if (this.app.readOnly) { e.preventDefault(); return; }
      this.readSel();
      if (!this.sel) { e.preventDefault(); return; }
      switch (t) {
        case 'insertText': e.preventDefault(); if (e.data) this.typeText(e.data); break;
        case 'insertReplacementText': {
          e.preventDefault();
          const text = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || e.data || '';
          const r = this.targetSel(e) || this.sel;
          this.exec('Corregir ortografía', () => O.insertText(this.doc, r, text));
          break;
        }
        case 'insertParagraph': e.preventDefault(); this.enter(); break;
        case 'insertLineBreak': e.preventDefault(); this.typeText('\n'); break;
        case 'deleteContentBackward': e.preventDefault(); this.deleteDir(-1, e); break;
        case 'deleteContentForward': e.preventDefault(); this.deleteDir(1, e); break;
        case 'deleteWordBackward': case 'deleteWordForward': case 'deleteSoftLineBackward': case 'deleteSoftLineForward':
        case 'deleteHardLineBackward': case 'deleteHardLineForward': case 'deleteEntireSoftLine': case 'deleteContent': {
          e.preventDefault();
          if (!O.isCollapsed(this.sel)) { this.deleteSelection(); break; }
          const r = this.targetSel(e);
          if (r && !O.isCollapsed(r) && r.a.id === r.h.id) { this.exec('Borrar', () => O.deleteRange(this.doc, ...O.ordered(this.doc, r))); break; }
          this.deleteWord(/Backward/.test(t) ? -1 : 1);
          break;
        }
        case 'historyUndo': e.preventDefault(); this.app.run('undo'); break;
        case 'historyRedo': e.preventDefault(); this.app.run('redo'); break;
        case 'formatBold': e.preventDefault(); this.app.run('bold'); break;
        case 'formatItalic': e.preventDefault(); this.app.run('italic'); break;
        case 'formatUnderline': e.preventDefault(); this.app.run('underline'); break;
        default: e.preventDefault();
      }
    }
    typeText(text) {
      const doc = this.doc;
      const marks = this.stored || undefined;
      const sel = this.sel;
      const prev = O.isCollapsed(sel) ? doc.paraText(sel.h.id).slice(Math.max(0, sel.h.off - 1), sel.h.off) : '';
      this.exec('Escribir', () => O.insertText(doc, sel, text, marks), { merge: 'type' });
      if (/[\s.,;:!?)\]}]/.test(text) && !/\s/.test(prev)) doc.seal();
      if (this.app.settings.autoformat !== false && text.length < 200) this.autoFormat(text[text.length - 1]);
    }
    deleteSelection() {
      const [a, b] = O.ordered(this.doc, this.sel);
      this.exec('Borrar', () => { const r = O.deleteRange(this.doc, a, b); return this.doc.track ? a : r; });
    }
    deleteDir(d, e) {
      const doc = this.doc, sel = this.sel;
      if (!O.isCollapsed(sel)) { this.deleteSelection(); return; }
      const pos = sel.h, p = doc.block(pos.id), len = P.len(p);
      if (d < 0 && pos.off === 0) { this.exec('Borrar', () => O.backspaceAtStart(doc, pos)); doc.seal(); return; }
      if (d > 0 && pos.off >= len) { this.exec('Borrar', () => O.deleteAtEnd(doc, pos)); doc.seal(); return; }
      const text = R.text(p.runs);
      let other = d < 0 ? O.prevGrapheme(text, pos.off) : O.nextGrapheme(text, pos.off);
      const tr = e && this.targetSel(e);
      if (tr && tr.a.id === pos.id && tr.h.id === pos.id && !O.isCollapsed(tr)) { const [x, y] = O.ordered(doc, tr); other = d < 0 ? x.off : y.off; }
      const from = { id: pos.id, off: Math.min(pos.off, other) }, to = { id: pos.id, off: Math.max(pos.off, other) };
      this.exec('Borrar', () => { const r = O.deleteRange(doc, from, to); return doc.track ? (d < 0 ? from : to) : r; }, { merge: 'delete' });
    }
    deleteWord(d) {
      const doc = this.doc, pos = this.sel.h, text = doc.paraText(pos.id);
      if ((d < 0 && pos.off === 0) || (d > 0 && pos.off >= text.length)) { this.deleteDir(d); return; }
      const other = d < 0 ? O.prevWord(text, pos.off) : O.nextWord(text, pos.off);
      const from = { id: pos.id, off: Math.min(other, pos.off) }, to = { id: pos.id, off: Math.max(other, pos.off) };
      this.exec('Borrar', () => O.deleteRange(doc, from, to));
    }
    enter() {
      const doc = this.doc, sel = this.sel;
      const [from] = O.ordered(doc, sel);
      const p = doc.block(from.id), text = P.text(p);
      if (O.isCollapsed(sel) && p.ls && !text.length) { this.exec('Quitar viñeta', () => { O.setPara(doc, [p.id], { ls: null, ck: null }); return from; }); return; }
      if (O.isCollapsed(sel) && this.app.settings.autoformat !== false && from.off === text.length && /^(-{3,}|\*{3,}|_{3,})$/.test(text) && !p.ls) {
        this.exec('Línea horizontal', () => { const l = doc.loc(p.id); doc.replace(l.owner, l.i, 1, [PT.blocks.hr(), P.with(p, { runs: [] })]); return { id: p.id, off: 0 }; });
        return;
      }
      if (O.isCollapsed(sel) && this.app.settings.autoformat !== false && /^```\w*$/.test(text) && from.off === text.length) {
        this.exec('Código', () => { doc.put(P.with(p, { runs: [], st: 'code' })); return { id: p.id, off: 0 }; });
        return;
      }
      this.exec('Nuevo párrafo', () => { const [a, b] = O.ordered(doc, this.sel); const pos = O.same(a, b) ? a : O.deleteRange(doc, a, b); return O.split(doc, pos); });
      doc.seal();
    }
    tab(shift) {
      const doc = this.doc, sel = this.sel;
      if (!sel) return;
      const ta = O.tableAt(doc, sel.h);
      if (ta && !this.app.settings.tabInCell) {
        const next = O.nextCell(doc, sel.h, shift ? -1 : 1);
        if (!next && !shift) {
          // Tab en la última celda añade una fila
          const last = ta.tbl.rows.length - 1;
          this.exec('Insertar fila', () => O.tableOp(doc, ta.tbl.id, 'rowBelow', { r1: last, r2: last, c1: 0, c2: 0 }));
          return;
        }
        if (next) this.setSel(next);
        return;
      }
      const p = doc.block(sel.h.id);
      const multi = sel.a.id !== sel.h.id;
      if (p.ls && (multi || sel.h.off === 0 || O.ordered(doc, sel)[0].off === 0)) { this.exec('Nivel de lista', () => { O.indent(doc, O.paraIds(doc, sel), shift ? -1 : 1); return sel; }); return; }
      if (multi) { this.exec('Sangría', () => { O.indent(doc, O.paraIds(doc, sel), shift ? -PT.LIST_INDENT : PT.LIST_INDENT); return sel; }); return; }
      if (shift) return;
      this.typeText('\t');
    }

    // ------------------------------------------------------------ formato automático y autocorrección
    autoFormat(ch) {
      const doc = this.doc, s = this.app.settings, sel = this.sel;
      if (!sel || !O.isCollapsed(sel)) return;
      const pos = sel.h, p = doc.block(pos.id), text = P.text(p), before = text.slice(0, pos.off);
      // reemplaza [from, to) y deja el cursor donde estaba (detrás del carácter que disparó la corrección)
      const replace = (from, to, str, label, marks) => this.exec(label || 'Autocorrección', () => {
        O.insertText(doc, { a: { id: p.id, off: from }, h: { id: p.id, off: to } }, str, marks);
        return { id: p.id, off: pos.off + str.length - (to - from) };
      });
      // comillas tipográficas
      if ((ch === '"' || ch === "'") && s.quotes !== 'none') {
        const prevCh = before.slice(-2, -1);
        const open = !prevCh || /[\s([{¿¡—–-]/.test(prevCh);
        let q;
        if (ch === '"') q = s.quotes === 'angular' ? (open ? '«' : '»') : open ? '“' : '”';
        else q = open ? '‘' : '’';
        replace(pos.off - 1, pos.off, q);
        return;
      }
      if (ch === '.' && /\.\.\.$/.test(before)) { replace(pos.off - 3, pos.off, '…'); return; }
      if (ch === '@' && /(^|\s)@$/.test(before)) { this.app.mentions.open(this, { id: p.id, off: pos.off - 1 }); return; }
      if (ch === ':' && s.emoji !== false && /(^|\s):$/.test(before)) { this.app.mentions.open(this, { id: p.id, off: pos.off - 1 }, 'emoji'); return; }
      if (ch !== ' ') return;
      // atajos de Markdown al principio del párrafo
      if (s.markdown !== false) {
        const m = /^(#{1,6}|[-*+]|\d{1,3}[.)]|\[[ xX]?\]|>) $/.exec(before);
        if (m && ((!p.ls && (p.st || 'normal') === 'normal') || /^(#|>)/.test(m[1]))) {
          const mk = m[1];
          this.exec('Formato automático', () => {
            doc.put(P.with(doc.block(p.id), { runs: R.slice(doc.block(p.id).runs, before.length) }));
            if (mk[0] === '#') O.applyStyle(doc, [p.id], 'h' + mk.length);
            else if (mk === '>') O.applyStyle(doc, [p.id], 'quote');
            else if (mk[0] === '[') { O.toggleList(doc, [p.id], 'check'); if (/x/i.test(mk)) O.setPara(doc, [p.id], { ck: true }); }
            else if (/\d/.test(mk)) {
              O.toggleList(doc, [p.id], mk.endsWith(')') ? 'paren' : 'decimal');
              const n = parseInt(mk, 10), q = doc.block(p.id);
              if (n > 1 && q.ls) doc.set(['lists', q.ls.id, 'start'], n);
            } else O.toggleList(doc, [p.id], mk === '-' ? 'dash' : 'bullet');
            return { id: p.id, off: 0 };
          });
          return;
        }
      }
      // formato en línea de Markdown: **negrita**, *cursiva*, _cursiva_, ~~tachado~~, `código`
      if (s.markdown !== false) {
        const im = /(\*\*|__|~~|\*|_|`)([^\s*_~`](?:[^*_~`]*[^\s*_~`])?)\1 $/.exec(before);
        if (im && (im.index === 0 || /[\s([{"'“«¿¡]/.test(before[im.index - 1]))) {
          const start = im.index, mk = im[1], inner = im[2];
          const patch = mk === '**' || mk === '__' ? { b: true } : mk === '~~' ? { s: true } : mk === '`' ? { ff: 'Consolas', hl: '#eef0f3' } : { i: true };
          this.exec('Formato automático', () => {
            const m0 = R.marksAt(doc.block(p.id).runs, start + mk.length) || M.EMPTY;
            O.insertText(doc, { a: { id: p.id, off: start }, h: { id: p.id, off: pos.off - 1 } }, inner, M.with(m0, patch));
            return { id: p.id, off: start + inner.length + 1 };
          });
          return;
        }
      }
      // sustituciones de autocorrección
      const wm = /(\S+) $/.exec(before);
      if (!wm) return;
      const word = wm[1], ws = pos.off - 1 - word.length;
      const AC = Object.assign({ '(c)': '©', '(r)': '®', '(tm)': '™', '->': '→', '<-': '←', '=>': '⇒', '<=': '⇐', '--': '—', '1/2': '½', '1/4': '¼', '3/4': '¾', '+-': '±', '!=': '≠', '...': '…' }, s.autocorrect || {});
      const rep = AC[word] || AC[word.toLowerCase()];
      if (s.replace !== false && rep) { replace(ws, ws + word.length, rep); return; }
      // mayúscula al empezar una oración
      if (s.capitalize !== false && /^\p{Ll}\p{L}*$/u.test(word) && !/\p{Lu}/u.test(word.slice(1))) {
        const pre = before.slice(0, ws);
        if (/^\s*$/.test(pre) || /[.!?…]["»”’)]?\s+$/.test(pre)) {
          const prevWord = (/(\S+)[.!?…]["»”’)]?\s+$/.exec(pre) || [])[1] || '';
          if (!/^(etc|pág|págs|núm|sr|sra|srta|dr|dra|ud|uds|vd|vol|cap|art|av|tel|ej|p\.ej|aprox|lic|ing|prof|fig|ed)$/i.test(prevWord) && !/\d$/.test(prevWord)) {
            replace(ws, ws + 1, word[0].toLocaleUpperCase('es'), 'Mayúscula automática', R.marksAt(p.runs, ws) || undefined);
          }
        }
      }
    }

    // ------------------------------------------------------------ teclado
    onKeyDown(e) {
      if (this.composing || e.isComposing || e.keyCode === 229) return;
      const app = this.app, ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey, k = e.key, code = e.code;
      if (app.mentions && app.mentions.onKey(e)) return;
      if (k === 'Tab' && !ctrl && !alt) { e.preventDefault(); this.readSel(); this.tab(shift); return; }
      if (k === 'Escape') {
        if (app.imageSel) { app.selectImage(null); e.preventDefault(); return; }
        if (this.story !== 'body') { e.preventDefault(); app.editStory(null); return; }
      }
      if ((k === 'Backspace' || k === 'Delete') && app.imageSel) { e.preventDefault(); app.run('deleteImage'); return; }
      if (k === 'Enter' && ctrl && !alt) { e.preventDefault(); app.run('pageBreak'); return; }
      if (ctrl && shift && k.toLowerCase() === 'v') { this._plainPaste = true; setTimeout(() => { this._plainPaste = false; }, 400); return; }
      let cmd = null, arg;
      if (ctrl && alt && !shift) {
        if (/^Digit[0-6]$/.test(code)) { cmd = 'style'; arg = code === 'Digit0' ? 'normal' : 'h' + code.slice(5); }
        else if (code === 'KeyM') cmd = 'comment';
        else if (code === 'KeyF') cmd = 'footnote';
        else if (code === 'KeyT') cmd = 'insertToc';
      } else if (ctrl && shift && !alt) {
        if (code === 'Digit7') cmd = 'listNumber';
        else if (code === 'Digit8') cmd = 'listBullet';
        else if (code === 'Digit9') cmd = 'listCheck';
        else if (code === 'KeyX') cmd = 'strike';
        else if (code === 'KeyC') cmd = 'wordCount';
        else if (code === 'KeyL') { cmd = 'align'; arg = 'left'; }
        else if (code === 'KeyE') { cmd = 'align'; arg = 'center'; }
        else if (code === 'KeyR') { cmd = 'align'; arg = 'right'; }
        else if (code === 'KeyJ') { cmd = 'align'; arg = 'justify'; }
        else if (k === '>' || code === 'Period') { cmd = 'fontStep'; arg = 1; }
        else if (k === '<' || code === 'Comma') { cmd = 'fontStep'; arg = -1; }
        else if (code === 'KeyZ') cmd = 'redo';
        else if (code === 'KeyH') cmd = 'replace';
      } else if (ctrl && !alt) {
        switch (code) {
          case 'KeyB': cmd = 'bold'; break;
          case 'KeyI': cmd = 'italic'; break;
          case 'KeyU': cmd = 'underline'; break;
          case 'KeyK': cmd = 'link'; break;
          case 'KeyZ': cmd = 'undo'; break;
          case 'KeyY': cmd = 'redo'; break;
          case 'KeyE': cmd = 'align'; arg = 'center'; break;
          case 'KeyL': cmd = 'align'; arg = 'left'; break;
          case 'KeyR': cmd = 'align'; arg = 'right'; break;
          case 'KeyJ': cmd = 'align'; arg = 'justify'; break;
          case 'Backslash': cmd = 'clearFormat'; break;
          case 'Space': cmd = 'clearFormat'; break;
          case 'Period': cmd = 'sup'; break;
          case 'Comma': cmd = 'sub'; break;
          case 'BracketRight': cmd = 'fontStep'; arg = 1; break;
          case 'BracketLeft': cmd = 'fontStep'; arg = -1; break;
          case 'KeyM': cmd = 'indentMore'; break;
          case 'KeyA': e.preventDefault(); app.run('selectAll'); return;
          default: break;
        }
      } else if (alt && shift && !ctrl && code === 'Digit5') cmd = 'strike';
      if (cmd) { e.preventDefault(); e.stopPropagation(); this.readSel(); app.run(cmd, arg); }
    }

    // ------------------------------------------------------------ composición (IME y teclas muertas)
    onCompStart() {
      this.readSel();
      this.composing = true;
      const sel = this.sel;
      if (sel && !O.isCollapsed(sel)) {
        const [a, b] = O.ordered(this.doc, sel);
        const p = this.doc.block(a.id);
        const atoms = a.id === b.id && R.slice(p.runs, a.off, b.off).some((r) => r.o);
        if (a.id !== b.id || atoms) {
          // la selección abarca varios párrafos u objetos: se borra en el modelo antes de componer
          this.composing = false;
          this.exec('Borrar', () => O.deleteRange(this.doc, a, b));
          this.composing = true;
        }
      }
    }
    onCompEnd() {
      this.composing = false;
      this.reconcile(this.caretParaEls());
    }
    caretParaEls() {
      const s = window.getSelection(), out = new Set();
      if (s && s.rangeCount) for (const n of [s.anchorNode, s.focusNode]) { const el = n && (n.nodeType === 1 ? n : n.parentElement); const p = el && el.closest('.pt-p[data-id]'); if (p && this.host.contains(p)) out.add(p); }
      return out;
    }
    // texto que hay en el DOM de un párrafo (los objetos cuentan como un carácter)
    domText(pEl) {
      let s = '';
      const walk = (n) => {
        if (n.nodeType === 3) { s += n.data; return; }
        if (n.nodeType !== 1 || V.isDeco(n)) return;
        if (V.isAtom(n)) { s += PT.OBJ; return; }
        if (n.tagName === 'BR' && !n.classList.contains('pt-br')) { s += '\n'; return; }
        for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
      };
      for (let c = pEl.firstChild; c; c = c.nextSibling) walk(c);
      return s;
    }
    // aplica al modelo lo que el navegador cambió directamente en el DOM
    reconcile(els) {
      const doc = this.doc;
      const edits = [];
      for (const el of els) {
        const id = el.dataset.id, p = doc.block(id);
        if (!p || p.t !== 'p') continue;
        const mt = P.text(p), dt = this.domText(el).replace(/ /g, ' ');
        if (mt === dt) continue;
        let a = 0;
        while (a < mt.length && a < dt.length && mt[a] === dt[a]) a++;
        let b = 0;
        while (b < mt.length - a && b < dt.length - a && mt[mt.length - 1 - b] === dt[dt.length - 1 - b]) b++;
        edits.push({ id, from: a, to: mt.length - b, text: dt.slice(a, dt.length - b).replace(new RegExp(PT.OBJ, 'g'), '') });
      }
      if (!edits.length) {
        // el texto coincide, pero el navegador pudo dejar elementos propios: se redibujan esos párrafos
        for (const el of els) { const rec = this.view.map.get(el.dataset.id); if (rec) rec.b = null; }
        this.app.refresh({ editor: this, noModel: true });
        return;
      }
      // posición del cursor según el DOM actual (coincide con el texto nuevo)
      const s = window.getSelection();
      let caret = null;
      if (s && s.rangeCount) caret = V.domToPos(this.host, s.focusNode, s.focusOffset);
      this.exec('Escribir', () => {
        for (const ed of edits) {
          const pos = { id: ed.id, off: ed.from };
          const marks = this.stored || O.typingMarks(doc, pos);
          O.insertText(doc, { a: pos, h: { id: ed.id, off: ed.to } }, ed.text, marks);
        }
        return caret ? O.caret(caret) : null;
      }, { merge: 'type' });
    }
    onMutations(recs) {
      if (this.composing || this.app.rendering) return;
      const els = new Set();
      let structural = false;
      for (const r of recs) {
        const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!n) continue;
        if (n.closest('.pt-gap') || (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((x) => x.nodeType === 1 && (x.classList.contains('pt-gap') || x.classList.contains('pt-hclone'))))) continue;
        const p = n.closest('.pt-p[data-id]');
        if (p && this.host.contains(p)) els.add(p);
        else if (r.type === 'childList') structural = true;
      }
      if (structural) { this.view.rebuild(); this.app.refresh({ editor: this, noModel: true }); return; }
      if (els.size) this.reconcile(els);
    }

    // ------------------------------------------------------------ portapapeles
    selectionSlice() {
      const sel = this.readSel();
      if (!sel || O.isCollapsed(sel)) return null;
      const [a, b] = O.ordered(this.doc, sel);
      return O.slice(this.doc, a, b);
    }
    putClipboard(dt, slice) {
      const doc = this.doc;
      dt.setData('text/plain', PT.convert.sliceToText(doc, slice));
      dt.setData('text/html', PT.convert.sliceToHTML(doc, slice));
      try { dt.setData(MIME, JSON.stringify({ slice: sliceJSON(slice), styles: doc.styles, lists: doc.lists })); } catch (e) { /* tipo propio no admitido */ }
    }
    onCopy(e) {
      const slice = this.selectionSlice();
      if (!slice) return;
      e.preventDefault();
      this.putClipboard(e.clipboardData, slice);
      this.app.clip = { slice, doc: this.doc };
    }
    onCut(e) {
      const slice = this.selectionSlice();
      if (!slice) return;
      e.preventDefault();
      this.putClipboard(e.clipboardData, slice);
      this.app.clip = { slice, doc: this.doc };
      this.deleteSelection();
    }
    onPaste(e) {
      e.preventDefault();
      if (this.app.readOnly) return;
      this.readSel();
      if (!this.sel) return;
      const cd = e.clipboardData;
      const plain = this._plainPaste || this.app._plainPasteOnce;
      this._plainPaste = false; this.app._plainPasteOnce = false;
      const files = Array.from(cd.files || []).filter((f) => /^image\//.test(f.type));
      if (files.length && !cd.getData('text/html')) { this.app.insertImageFiles(files); return; }
      this.pasteData({ own: cd.getData(MIME), html: cd.getData('text/html'), text: cd.getData('text/plain') }, plain);
    }
    pasteData(d, plain, at) {
      const doc = this.doc;
      const sel = at || this.sel;
      if (!sel) return;
      // pegar para vincular: una dirección web pegada sobre un texto seleccionado lo convierte en vínculo
      const url = String(d.text || '').trim();
      if (!d.own && this.app.settings.pasteLink !== false && !O.same(sel.a, sel.h) && url.length < 2048 && /^(https?:\/\/|mailto:|www\.)[^\s<>"]+$/i.test(url)) {
        const [from, to] = O.ordered(doc, sel);
        const href = /^www\./i.test(url) ? 'https://' + url : url;
        this.exec('Vínculo', () => { O.setMarks(doc, from, to, (m) => M.with(m, { ln: href })); return sel; });
        ui.toast('Vínculo añadido al texto seleccionado (Ctrl+Z para pegar la dirección como texto).');
        return;
      }
      // lo que llega de fuera queda marcado como pegado en la autoría del texto
      const pastedMarks = () => M.with(this.stored || O.typingMarks(doc, O.ordered(doc, sel)[0]), { src: 'paste' });
      if (plain || (!d.own && !d.html)) {
        if (d.text == null || d.text === '') return;
        this.exec('Pegar', () => O.insertPlain(doc, sel, d.text.replace(/\r\n?/g, '\n'), pastedMarks()));
        return;
      }
      let slice = null;
      if (d.own) {
        try { const o = JSON.parse(d.own); slice = sliceFromJSON(o.slice); this.mergeStyles(o); } catch (err) { slice = null; }
      }
      if (!slice && d.html) {
        try { slice = PT.convert.htmlToSlice(d.html, doc); } catch (err) { console.warn(err); slice = null; }
      }
      if (!slice) { if (d.text) this.exec('Pegar', () => O.insertPlain(doc, sel, d.text, pastedMarks())); return; }
      if (!d.own && PT.authorship) slice = PT.authorship.mark(slice, 'paste');
      this.exec('Pegar', () => O.insertSlice(doc, sel, slice));
    }
    // estilos y listas que trae un fragmento de otro documento
    mergeStyles(o) {
      const doc = this.doc;
      if (!o.styles && !o.lists) return;
      doc.tx('Estilos', () => {
        for (const k in o.styles || {}) if (!doc.styles[k]) doc.set(['styles', k], o.styles[k]);
        for (const k in o.lists || {}) if (!doc.lists[k]) doc.set(['lists', k], o.lists[k]);
      });
    }

    // ------------------------------------------------------------ arrastrar y soltar
    onDragStart(e) {
      if (e.target.closest && e.target.closest('.pt-img')) { e.preventDefault(); return; }
      const slice = this.selectionSlice();
      if (!slice) return;
      this.putClipboard(e.dataTransfer, slice);
      e.dataTransfer.effectAllowed = 'copyMove';
      const [a, b] = O.ordered(this.doc, this.sel);
      this._drag = { a, b };
    }
    onDragOver(e) {
      if (this.app.readOnly) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = this._drag && !(e.ctrlKey || e.altKey) ? 'move' : 'copy';
    }
    posFromPoint(x, y) {
      let node = null, off = 0;
      if (document.caretPositionFromPoint) { const cp = document.caretPositionFromPoint(x, y); if (cp) { node = cp.offsetNode; off = cp.offset; } }
      else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
      if (!node || !this.host.contains(node)) return null;
      return V.domToPos(this.host, node, off);
    }
    onDrop(e) {
      e.preventDefault();
      if (this.app.readOnly) return;
      const doc = this.doc, dt = e.dataTransfer;
      const pos = this.posFromPoint(e.clientX, e.clientY);
      if (!pos) return;
      const files = Array.from(dt.files || []);
      if (files.length) {
        const imgs = files.filter((f) => /^image\//.test(f.type));
        if (imgs.length) { this.setSel(O.caret(pos)); this.app.insertImageFiles(imgs); return; }
        this.app.run('openFile', files[0]);
        return;
      }
      const drag = this._drag;
      this._drag = null;
      const data = { own: dt.getData(MIME), html: dt.getData('text/html'), text: dt.getData('text/plain') };
      if (drag && !(e.ctrlKey || e.altKey)) {
        if (doc.cmp(pos, drag.a) >= 0 && doc.cmp(pos, drag.b) <= 0) return;
        const slice = O.slice(doc, drag.a, drag.b);
        this.exec('Mover', () => {
          if (doc.cmp(pos, drag.b) > 0) { const end = O.insertSlice(doc, O.caret(pos), slice); O.deleteRange(doc, drag.a, drag.b); return end; }
          O.deleteRange(doc, drag.a, drag.b);
          return O.insertSlice(doc, O.caret(pos), slice);
        });
        return;
      }
      this.pasteData(data, false, O.caret(pos));
    }

    // ------------------------------------------------------------ ratón: objetos, casillas, vínculos, columnas
    onPointerDown(e) {
      const app = this.app, t = e.target;
      if (e.button !== 0) return;
      const colEdge = this.colEdgeAt(e);
      if (colEdge) { e.preventDefault(); this.startColResize(e, colEdge); return; }
      const img = t.closest && t.closest('.pt-img');
      if (img && this.host.contains(img)) {
        e.preventDefault();
        const pEl = img.closest('.pt-p[data-id]');
        if (!pEl) return;
        const off = V.offsetIn(pEl, img, 0);
        const sel = { a: { id: pEl.dataset.id, off }, h: { id: pEl.dataset.id, off: off + 1 } };
        this.host.focus({ preventScroll: true });
        this.setSel(sel);
        app.selectImage({ editor: this, id: pEl.dataset.id, off, el: img });
        return;
      }
      if (app.imageSel) app.selectImage(null);
      // casilla de una lista de verificación (zona de la viñeta)
      const pEl = t.closest && t.closest('.pt-check');
      if (pEl && t === pEl) {
        const r = pEl.getBoundingClientRect(), z = app.zoom || 1;
        const pad = parseFloat(getComputedStyle(pEl).paddingLeft) * z;
        const hang = parseFloat(pEl.style.getPropertyValue('--hang')) * (96 / 72) * z || 24 * z;
        if (e.clientX >= r.left + pad - hang - 4 && e.clientX <= r.left + pad + 2) {
          e.preventDefault();
          const id = pEl.dataset.id, p = this.doc.block(id);
          this.exec('Casilla', () => { O.setPara(this.doc, [id], { ck: !p.ck }); return this.sel; });
        }
      }
    }
    onClick(e) {
      const app = this.app, t = e.target;
      const chip = t.closest && t.closest('.pt-chip');
      if (chip && this.host.contains(chip)) { app.chipClick(this, chip); return; }
      const fn = t.closest && t.closest('.pt-fnref');
      if (fn && this.story === 'body') { app.editNote(fn.dataset.note); return; }
      const toc = t.closest && t.closest('.pt-toc-e');
      if (toc) { app.goToPara(toc.dataset.target); return; }
      const a = t.closest && t.closest('a.pt-link');
      if (a && (e.ctrlKey || e.metaKey || app.readOnly)) { e.preventDefault(); app.openLink(a.getAttribute('href')); return; }
      if (a) app.linkBubble(a);
    }
    onDblClick(e) {
      const t = e.target;
      const img = t.closest && t.closest('.pt-img');
      if (img) { this.app.run('imageProps'); return; }
      const eq = t.closest && t.closest('.pt-eq');
      if (eq) { const pEl = eq.closest('.pt-p[data-id]'); const off = V.offsetIn(pEl, eq, 0); this.setSel({ a: { id: pEl.dataset.id, off }, h: { id: pEl.dataset.id, off: off + 1 } }); this.app.run('equation'); }
    }
    onPointerMove(e) {
      if (e.buttons) return;
      const edge = this.colEdgeAt(e);
      this.host.classList.toggle('col-resize', !!edge);
    }
    // borde derecho de una celda bajo el puntero
    colEdgeAt(e) {
      const td = e.target.closest && e.target.closest('td[data-cell]');
      if (!td || !this.host.contains(td)) return null;
      const r = td.getBoundingClientRect();
      const near = e.clientX >= r.right - 4 && e.clientX <= r.right + 3;
      const nearL = e.clientX >= r.left - 3 && e.clientX <= r.left + 4;
      if (!near && !nearL) return null;
      const tbl = td.closest('table.pt-table');
      const c = +td.dataset.c + (near ? td.colSpan - 1 : -1);
      if (c < 0) return null;
      return { tbl, id: tbl.dataset.id, c };
    }
    startColResize(e, edge) {
      const doc = this.doc, t = doc.block(edge.id);
      if (!t || edge.c >= t.cols.length - 1 && false) return;
      const z = this.app.zoom || 1, x0 = e.clientX, cols0 = t.cols.slice();
      const colEls = edge.tbl.querySelectorAll(':scope > colgroup > col');
      let cols = cols0;
      const move = (ev) => {
        const d = PT.px2pt((ev.clientX - x0) / z);
        cols = cols0.slice();
        const c = edge.c;
        if (c + 1 < cols.length) { const sum = cols[c] + cols[c + 1]; cols[c] = PT.clamp(cols0[c] + d, 14, sum - 14); cols[c + 1] = sum - cols[c]; }
        else cols[c] = Math.max(14, cols0[c] + d);
        cols.forEach((w, i) => { if (colEls[i]) colEls[i].style.width = w + 'pt'; });
        edge.tbl.style.width = cols.reduce((s, x) => s + x, 0) + 'pt';
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (cols !== cols0) this.exec('Ancho de columna', () => { O.tableOp(doc, edge.id, 'widths', { cols }); return this.sel; });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }
  }
  // fragmentos <-> JSON (para el portapapeles)
  function sliceJSON(slice) { return slice.inline ? { inline: true, runs: slice.runs.map((r) => (r.o ? { o: r.o, m: r.m } : { x: r.x, m: r.m })) } : { blocks: slice.blocks.map(PT.blockJSON) }; }
  function sliceFromJSON(o) {
    if (!o) return null;
    if (o.inline) return { inline: true, runs: R.normalize((o.runs || []).map((r) => (r.o ? { o: Object.freeze(r.o), m: M.intern(r.m) } : { x: String(r.x || ''), m: M.intern(r.m) }))) };
    return { blocks: PT.cleanBlocks(o.blocks, new Set(), false).map((b) => PT.cloneBlock(b)) };
  }
  PT.Editor = Editor;
  PT.sliceJSON = sliceJSON;
  PT.sliceFromJSON = sliceFromJSON;
})();
