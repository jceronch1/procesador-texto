/* Vista: convierte el modelo en elementos del DOM (párrafos, tramos, objetos, tablas, índice),
   genera la hoja de estilos de los estilos con nombre y traduce posiciones entre el DOM y el modelo. */
(function () {
  'use strict';
  const PT = window.PT, R = PT.runs, M = PT.marks, OBJ = PT.OBJ;
  const V = (PT.view = {});
  const LF = PT.LINE_FACTOR;

  // ---------------------------------------------------------------- CSS de propiedades
  const n2 = (v) => +Number(v).toFixed(2);
  function decoration(r) {
    const lines = [];
    if (r.u) lines.push('underline');
    if (r.s) lines.push('line-through');
    return lines;
  }
  // marcas de carácter -> declaraciones CSS
  V.runCss = function (r, base) {
    const o = {};
    if (r.ff) o['font-family'] = PT.fontCss(r.ff);
    if (r.fs) o['font-size'] = n2(r.fs) + 'pt';
    if (r.b != null) o['font-weight'] = r.b ? '700' : '400';
    if (r.i != null) o['font-style'] = r.i ? 'italic' : 'normal';
    if (r.fc) o.color = r.fc;
    if (r.hl) o['background-color'] = r.hl;
    const deco = decoration(r);
    if (deco.length) {
      o['text-decoration-line'] = deco.join(' ');
      if (typeof r.u === 'string') o['text-decoration-style'] = r.u === 'wavy' ? 'wavy' : r.u === 'double' ? 'double' : r.u === 'dotted' ? 'dotted' : r.u === 'dashed' ? 'dashed' : 'solid';
    } else if ((r.u === false || r.s === false) && base && (base.u || base.s)) o['text-decoration-line'] = 'none';
    if (r.caps != null) o['text-transform'] = r.caps ? 'uppercase' : 'none';
    if (r.sc != null) o['font-variant'] = r.sc ? 'small-caps' : 'normal';
    if (r.sp) o['letter-spacing'] = n2(r.sp) + 'pt';
    if (r.sup || r.sub) {
      o['vertical-align'] = r.sup ? 'super' : 'sub';
      o['font-size'] = r.fs ? n2(r.fs * 0.65) + 'pt' : '65%';
      o['line-height'] = '0';
    }
    return o;
  };
  // propiedades de párrafo -> declaraciones CSS (all: incluir valores por omisión)
  V.paraCss = function (p, all) {
    const o = {};
    if (p.al) o['text-align'] = p.al;
    if (all || p.inL != null) o['padding-left'] = n2(p.inL || 0) + 'pt';
    if (all || p.inR != null) o['padding-right'] = n2(p.inR || 0) + 'pt';
    if (all || p.inF != null) o['text-indent'] = n2(p.inF || 0) + 'pt';
    if (all || p.spB != null) o['padding-top'] = n2(p.spB || 0) + 'pt';
    if (all || p.spA != null) o['padding-bottom'] = n2(p.spA || 0) + 'pt';
    if (p.lhx) o['line-height'] = n2(p.lhx) + 'pt';
    else if (all || p.lh != null) o['line-height'] = n2((p.lh || 1) * LF);
    if (p.bg) { o['background-color'] = p.bg; o['background-clip'] = 'content-box'; }
    else if (p.bg === null && !all) o['background-color'] = 'transparent';
    return o;
  };
  const cssText = (o) => Object.keys(o).map((k) => k + ':' + o[k]).join(';');
  V.cssText = cssText;
  // hoja de estilos del documento (clases .pt-s-<id>)
  V.styleSheet = function (doc) {
    let css = '';
    for (const id in doc.styles) {
      if (!/^[\w-]+$/.test(id)) continue;
      const s = doc.style(id);
      css += '.pt-s-' + id + '{' + cssText(Object.assign(V.paraCss(s.p, true), V.runCss(s.r))) + '}\n';
    }
    return css;
  };
  // borde CSS a partir de 'ancho estilo color'
  V.borderCss = function (spec) {
    if (!spec || spec === 'none') return 'none';
    const [w, st, c] = String(spec).split(' ');
    const style = { single: 'solid', solid: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double' }[st] || 'solid';
    return n2(Math.max(0.25, +w || 0.5) * (style === 'double' ? 3 : 1)) + 'pt ' + style + ' ' + (c || '#000000');
  };
  // color estable por autor (control de cambios y comentarios)
  V.authorColor = function (name) {
    let hsh = 0;
    for (const ch of String(name || '')) hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
    const hues = [212, 0, 140, 28, 280, 180, 330, 95];
    return 'hsl(' + hues[hsh % hues.length] + ' 70% 38%)';
  };

  // ---------------------------------------------------------------- bloques
  const make = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };
  const isDeco = (n) => n.nodeType === 1 && (n.classList.contains('pt-gap') || n.classList.contains('pt-br') || n.classList.contains('pt-deco'));
  const isAtom = (n) => n.nodeType === 1 && n.classList.contains('pt-obj');
  V.isDeco = isDeco;
  V.isAtom = isAtom;

  // rv: contexto de la vista {doc, story, map, markers, notes, showMarks, showChanges, layout}
  V.renderBlock = function (b, rv) {
    let el;
    if (b.t === 'p') el = V.renderPara(b, rv);
    else if (b.t === 'table') el = V.renderTable(b, rv);
    else if (b.t === 'hr') { el = make('div', 'pt-hr pt-atomblock'); el.appendChild(make('hr')); }
    else if (b.t === 'toc') { el = make('div', 'pt-toc pt-atomblock'); V.fillToc(el, b, rv); }
    else el = make('div', 'pt-atomblock');
    el.dataset.id = b.id;
    if (b.t !== 'p') el.contentEditable = b.t === 'table' ? 'inherit' : 'false';
    if (b.t === 'table' && b.pb) el.dataset.pb = '1';
    rv.map.set(b.id, { b, el });
    return el;
  };

  V.renderPara = function (p, rv) {
    const doc = rv.doc, st = doc.style(p.st || 'normal');
    const lvl = st.lvl >= 1 && st.lvl <= 6 ? st.lvl : 0;
    const el = make(lvl ? 'h' + lvl : 'p', 'pt-p pt-s-' + (doc.styles[p.st] ? p.st : 'normal'));
    el.dataset.id = p.id;
    const css = V.paraCss(p, false);
    if (p.ls && doc.lists[p.ls.id]) {
      const kind = doc.lists[p.ls.id].k, lv = PT.clamp(p.ls.l | 0, 0, 8);
      el.classList.add('pt-li');
      if (kind === 'check') { el.classList.add('pt-check'); if (p.ck) el.classList.add('pt-checked'); }
      if (p.inL == null) css['padding-left'] = n2(PT.LIST_INDENT * (lv + 1) + (st.p.inL || 0)) + 'pt';
      if (p.inF == null) css['text-indent'] = -PT.LIST_HANG + 'pt';
      el.style.setProperty('--hang', n2(p.inF != null ? Math.max(0, -p.inF) : PT.LIST_HANG) + 'pt');
      const marker = rv.markers ? rv.markers.get(p.id) : '';
      if (marker != null) el.dataset.marker = marker;
      // la viñeta usa el formato del primer carácter
      const m0 = p.runs.length ? p.runs[0].m : M.intern(p.pm || null);
      const mc = V.runCss(M.without(m0, ['hl', 'u', 's', 'sup', 'sub', 'ln', 'cm', 'ins', 'del']));
      if (mc['font-size']) el.style.setProperty('--mk-size', mc['font-size']);
      if (mc.color) el.style.setProperty('--mk-color', mc.color);
      if (mc['font-weight']) el.style.setProperty('--mk-weight', mc['font-weight']);
    }
    if (p.bdr) {
      for (const [k, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) if (p.bdr[k]) css['border-' + side] = V.borderCss(p.bdr[k]);
      css['padding-top'] = '1pt'; css['padding-bottom'] = '1pt';
      const pp = doc.paraProps(p);
      css['margin-top'] = n2(pp.spB || 0) + 'pt'; css['margin-bottom'] = n2(pp.spA || 0) + 'pt';
      if (p.bdr.l || p.bdr.r) { css['padding-left'] = n2((pp.inL || 0) + 4) + 'pt'; css['padding-right'] = n2((pp.inR || 0) + 4) + 'pt'; }
    }
    if (p.dc) el.classList.add('pt-dc');
    if (p.rtl) el.dir = 'rtl';
    if (p.pb) el.dataset.pb = '1';
    const pp = p.kn || p.kl ? p : doc.paraProps(p);
    if (pp.kn) el.dataset.kn = '1';
    if (pp.kl) el.dataset.kl = '1';
    const text = cssText(css);
    if (text) el.style.cssText += ';' + text;
    V.fillInline(el, p, rv);
    return el;
  };

  V.fillInline = function (el, p, rv) {
    const base = rv.doc.style(p.st || 'normal').r;
    for (const r of p.runs) el.appendChild(V.renderRun(r, rv, base));
    const last = p.runs[p.runs.length - 1];
    if (rv.showMarks) el.appendChild(Object.assign(make('span', 'pt-deco pt-pilcrow'), { contentEditable: 'false', textContent: p.pb ? '¶' : '¶' }));
    if (!last || last.o || /\n$/.test(last.x)) el.appendChild(make('br', 'pt-br'));
  };

  V.renderRun = function (r, rv, base) {
    const m = r.m;
    let node = r.o ? V.renderAtom(r.o, rv, m) : document.createTextNode(r.x);
    if (m === M.EMPTY) return node;
    const css = V.runCss(m, base);
    let cls = '';
    if (m.cm) cls += ' pt-cm';
    if (m.ins) cls += ' pt-ins';
    if (m.del) cls += ' pt-del';
    if (m.src) cls += ' pt-src-' + (m.src === 'ai' ? 'ai' : 'paste');
    if (!r.o && (Object.keys(css).length || cls)) {
      const span = make('span', cls.trim() || null);
      if (Object.keys(css).length) span.style.cssText = cssText(css);
      if (m.cm) span.dataset.cm = m.cm;
      const tc = m.ins || m.del;
      if (tc) { const info = PT.ops.stampInfo(tc); span.style.setProperty('--tc', V.authorColor(info.by)); span.title = (m.ins ? 'Insertado por ' : 'Eliminado por ') + info.by + (info.at ? ' · ' + PT.agoText(info.at) : ''); }
      span.appendChild(node);
      node = span;
    } else if (r.o && (m.cm || m.ins || m.del)) {
      node.classList.add(...cls.trim().split(' '));
      if (m.cm) node.dataset.cm = m.cm;
    }
    if (m.ln) {
      const a = make('a', 'pt-link');
      a.href = m.ln;
      a.title = (m.ln[0] === '#' ? 'Ir a: ' : '') + m.ln + ' — Ctrl+clic para seguir el vínculo';
      a.appendChild(node);
      node = a;
    }
    return node;
  };

  // ---------------------------------------------------------------- objetos en línea
  V.renderAtom = function (o, rv, m) {
    const doc = rv.doc;
    let el;
    switch (o.k) {
      case 'img': {
        el = make('span', 'pt-obj pt-img' + (o.wrap && o.wrap !== 'inline' ? ' pt-wrap-' + o.wrap : ''));
        const img = make('img');
        img.src = o.src; img.alt = o.alt || ''; img.draggable = false;
        img.style.width = n2(o.w) + 'pt'; img.style.height = n2(o.h) + 'pt';
        if (o.bd) img.style.border = V.borderCss(o.bd);
        el.appendChild(img);
        break;
      }
      case 'fn': {
        el = make('sup', 'pt-obj pt-fnref');
        el.dataset.note = o.id;
        const n = rv.notes ? rv.notes.get(o.id) : null;
        el.textContent = n || '*';
        el.title = 'Nota al pie ' + (n || '');
        break;
      }
      case 'fld': {
        el = make('span', 'pt-obj pt-fld');
        el.dataset.f = o.f;
        if (o.name) { el.dataset.name = o.name; el.title = 'Variable «' + o.name + '» · doble clic para cambiar su valor'; }
        el.textContent = V.fieldText(doc, o, rv);
        break;
      }
      case 'chip': {
        el = make('span', 'pt-obj pt-chip pt-chip-' + o.c);
        if (o.c === 'date') { const d = PT.parseIso(o.v); el.textContent = d ? PT.dateText(d, o.fmt || 'chip') : 'Fecha'; }
        else if (o.c === 'cb') { el.textContent = o.v ? '☑' : '☐'; el.classList.toggle('on', !!o.v); }
        else if (o.c === 'dd') {
          const opt = (o.opts || []).find((x) => x.t === o.v) || null;
          el.textContent = o.v || 'Elegir';
          if (opt && opt.c) { el.style.setProperty('--chip', opt.c); el.classList.add('colored'); }
        } else el.textContent = o.v || '';
        el.title = o.c === 'date' ? 'Fecha · clic para cambiar' : o.c === 'dd' ? 'Desplegable · clic para elegir' : 'Casilla · clic para marcar';
        break;
      }
      case 'eq': {
        el = make('span', 'pt-obj pt-eq');
        el.innerHTML = PT.math ? PT.math.toMathML(o.tex || '') : PT.esc(o.tex || '');
        el.title = 'Ecuación · doble clic para editar';
        break;
      }
      default:
        el = make('span', 'pt-obj');
        el.textContent = OBJ;
    }
    el.contentEditable = 'false';
    el.dataset.k = o.k;
    if (m && m !== M.EMPTY && o.k !== 'img') {
      const css = V.runCss(M.without(m, ['ln', 'cm', 'ins', 'del']));
      if (Object.keys(css).length) el.style.cssText += ';' + cssText(css);
    }
    return el;
  };
  V.fieldText = function (doc, o, rv) {
    switch (o.f) {
      case 'page': return rv && rv.pageNo ? String(rv.pageNo) : '#';
      case 'pages': return rv && rv.pageCount ? String(rv.pageCount) : '#';
      case 'date': return PT.dateText(new Date(), o.fmt || 'long');
      case 'time': return PT.timeText(new Date());
      case 'title': return doc.meta.title || '';
      case 'author': return doc.meta.author || PT.locale.author || '';
      case 'words': return String(PT.countWords(doc.plainText('body')));
      case 'var': { const v = (doc.meta.vars || {})[o.name]; return v == null || v === '' ? '«' + (o.name || 'variable') + '»' : String(v); }
      default: return '';
    }
  };

  // ---------------------------------------------------------------- tablas
  V.renderTable = function (t, rv) {
    const doc = rv.doc;
    const el = make('table', 'pt-table' + (t.bd ? '' : ' pt-noborder'));
    const width = t.cols.reduce((s, x) => s + x, 0);
    el.style.width = n2(width) + 'pt';
    if (t.al === 'center') { el.style.marginLeft = 'auto'; el.style.marginRight = 'auto'; }
    else if (t.al === 'right') el.style.marginLeft = 'auto';
    else if (t.ind) el.style.marginLeft = n2(t.ind) + 'pt';
    const cg = make('colgroup');
    for (const w of t.cols) { const c = make('col'); c.style.width = n2(w) + 'pt'; cg.appendChild(c); }
    el.appendChild(cg);
    const tb = make('tbody');
    t.rows.forEach((row, r) => {
      const tr = make('tr');
      tr.dataset.r = r;
      if (row.hd) tr.classList.add('pt-hrow');
      if (row.h) tr.style.height = n2(row.h) + 'pt';
      row.cells.forEach((cell, c) => {
        if (cell.mh || cell.mv) return;
        const span = PT.ops.spanOf(t, r, c);
        const td = make('td');
        td.dataset.cell = cell.id;
        td.dataset.c = c;
        if (span.cs > 1) td.colSpan = span.cs;
        if (span.rs > 1) td.rowSpan = span.rs;
        const bd = V.borderCss(t.bd);
        td.style.border = bd;
        if (cell.bd) for (const [k, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) if (cell.bd[k] != null) td.style['border' + side[0].toUpperCase() + side.slice(1)] = V.borderCss(cell.bd[k]);
        if (cell.bg) td.style.backgroundColor = cell.bg;
        if (cell.va) td.style.verticalAlign = cell.va;
        for (const b of cell.blocks) td.appendChild(V.renderBlock(b, rv));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    el.appendChild(tb);
    void doc;
    return el;
  };

  // ---------------------------------------------------------------- índice (tabla de contenido)
  V.tocEntries = function (doc, lv) {
    const out = [];
    for (const id of doc.parasOf('body')) {
      const p = doc.block(id), l = doc.headingLevel(p);
      if (l && l <= lv) {
        const text = R.text(p.runs.filter((r) => !r.m.del && !r.o)).replace(/\s+/g, ' ').trim();
        if (text) out.push({ id, lvl: l, text });
      }
    }
    return out;
  };
  V.fillToc = function (el, b, rv) {
    el.replaceChildren();
    if (b.title) el.appendChild(Object.assign(make('div', 'pt-toc-title'), { textContent: b.title }));
    const entries = V.tocEntries(rv.doc, b.lv || 3);
    if (!entries.length) el.appendChild(Object.assign(make('div', 'pt-toc-empty'), { textContent: 'No hay títulos. Aplica los estilos Título 1, Título 2… y el índice se actualizará solo.' }));
    for (const e of entries) {
      const row = make('div', 'pt-toc-e pt-toc-l' + e.lvl);
      row.dataset.target = e.id;
      row.append(Object.assign(make('span', 't'), { textContent: e.text }), make('span', 'd'), Object.assign(make('span', 'n'), { textContent: (rv.pageOf && rv.pageOf(e.id)) || '' }));
      el.appendChild(row);
    }
  };

  // ---------------------------------------------------------------- posiciones DOM <-> modelo
  const nodeLen = (n) => {
    if (n.nodeType === 3) return n.data.length;
    if (n.nodeType !== 1 || isDeco(n)) return 0;
    if (isAtom(n)) return 1;
    let s = 0;
    for (let c = n.firstChild; c; c = c.nextSibling) s += nodeLen(c);
    return s;
  };
  V.nodeLen = nodeLen;
  V.isParaEl = (el) => el && el.nodeType === 1 && el.classList.contains('pt-p') && !!el.dataset.id;
  // offset del modelo dentro del párrafo pEl para el punto (node, offset)
  V.offsetIn = function (pEl, node, offset) {
    if (node === pEl) { let s = 0, i = 0; for (let c = pEl.firstChild; c && i < offset; c = c.nextSibling, i++) s += nodeLen(c); return s; }
    let count = 0, done = false;
    const walk = (n) => {
      if (done) return;
      if (n === node) {
        if (n.nodeType === 3) count += Math.min(offset, n.data.length);
        else if (isAtom(n)) count += offset > 0 ? 1 : 0;
        else if (!isDeco(n)) { let i = 0; for (let c = n.firstChild; c && i < offset; c = c.nextSibling, i++) count += nodeLen(c); }
        done = true;
        return;
      }
      if (n.nodeType === 3) { count += n.data.length; return; }
      if (n.nodeType !== 1) return;
      if (isDeco(n)) { if (n.contains(node)) done = true; return; }
      if (isAtom(n)) { if (n.contains(node)) done = true; else count += 1; return; }
      for (let c = n.firstChild; c && !done; c = c.nextSibling) walk(c);
    };
    for (let c = pEl.firstChild; c && !done; c = c.nextSibling) walk(c);
    return count;
  };
  const firstParaIn = (el) => (V.isParaEl(el) ? el : el.querySelector ? el.querySelector('.pt-p[data-id]') : null);
  const lastParaIn = (el) => { if (V.isParaEl(el)) return el; if (!el.querySelectorAll) return null; const all = el.querySelectorAll('.pt-p[data-id]'); return all.length ? all[all.length - 1] : null; };
  // punto del DOM -> posición del modelo ({id, off}); root limita la búsqueda
  V.domToPos = function (root, node, offset) {
    if (!node || !root.contains(node)) return null;
    let el = node.nodeType === 1 ? node : node.parentElement;
    const pEl = el && el.closest('.pt-p[data-id]');
    if (pEl && root.contains(pEl)) {
      const pos = { id: pEl.dataset.id, off: V.offsetIn(pEl, node, offset) };
      return pos;
    }
    // punto entre bloques: se busca el párrafo más cercano
    if (node.nodeType === 1 && node.childNodes.length) {
      const prev = node.childNodes[offset - 1], next = node.childNodes[offset];
      for (let p = prev; p; p = p.previousSibling) { const q = p.nodeType === 1 ? lastParaIn(p) : null; if (q) return { id: q.dataset.id, off: nodeLen(q) }; }
      for (let n = next; n; n = n.nextSibling) { const q = n.nodeType === 1 ? firstParaIn(n) : null; if (q) return { id: q.dataset.id, off: 0 }; }
    }
    // dentro de un bloque no editable (índice, línea): el párrafo siguiente o el anterior
    for (el = node.nodeType === 1 ? node : node.parentElement; el && el !== root; el = el.parentElement) {
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) { const q = firstParaIn(n); if (q) return { id: q.dataset.id, off: 0 }; }
      for (let p = el.previousElementSibling; p; p = p.previousElementSibling) { const q = lastParaIn(p); if (q) return { id: q.dataset.id, off: nodeLen(q) }; }
    }
    const q = firstParaIn(root);
    return q ? { id: q.dataset.id, off: 0 } : null;
  };
  // posición del modelo -> punto del DOM dentro del elemento del párrafo
  V.posToDom = function (pEl, off) {
    let rem = off, res = null;
    const walk = (n) => {
      if (res) return;
      if (n.nodeType === 3) { const l = n.data.length; if (rem <= l) res = { node: n, offset: rem }; else rem -= l; return; }
      if (n.nodeType !== 1 || isDeco(n)) return;
      if (isAtom(n)) { if (rem === 0) res = { node: n.parentNode, offset: Array.prototype.indexOf.call(n.parentNode.childNodes, n) }; else rem -= 1; return; }
      for (let c = n.firstChild; c && !res; c = c.nextSibling) walk(c);
    };
    for (let c = pEl.firstChild; c && !res; c = c.nextSibling) walk(c);
    if (res) return res;
    // final del párrafo: detrás del último nodo del modelo
    let last = pEl.lastChild;
    while (last && (last.nodeType !== 1 && last.nodeType !== 3 || isDeco(last))) last = last.previousSibling;
    if (!last) return { node: pEl, offset: 0 };
    let n = last;
    while (n.nodeType === 1 && !isAtom(n) && n.lastChild) {
      let c = n.lastChild;
      while (c && c.nodeType === 1 && isDeco(c)) c = c.previousSibling;
      if (!c) break;
      n = c;
    }
    if (n.nodeType === 3) return { node: n, offset: n.data.length };
    return { node: n.parentNode, offset: Array.prototype.indexOf.call(n.parentNode.childNodes, n) + 1 };
  };
  // rectángulo de pantalla de un carácter (o del cursor en off)
  V.rectAt = function (pEl, off, len) {
    const range = document.createRange();
    const a = V.posToDom(pEl, off);
    range.setStart(a.node, a.offset);
    if (len) { const b = V.posToDom(pEl, off + len); range.setEnd(b.node, b.offset); } else range.collapse(true);
    let r = range.getClientRects();
    if (r.length) return r[len ? 0 : r.length - 1];
    const br = range.getBoundingClientRect();
    if (br.height) return br;
    return pEl.getBoundingClientRect();
  };

  // ---------------------------------------------------------------- vista de una historia (reconciliación por id)
  class StoryView {
    constructor(doc, story, el, opts) {
      this.doc = doc; this.story = story; this.el = el; this.map = new Map();
      Object.assign(this, opts || {});
    }
    ctx() { return this; }
    paraEl(id) { const r = this.map.get(id); return r && r.el.isConnected ? r.el : this.el.querySelector('[data-id="' + id + '"]'); }
    // dirty: Set de listas modificadas (ids de celdas) para repasar tablas
    render(dirty) {
      const doc = this.doc;
      this.markers = PT.ops.listMarkers(doc, this.story);
      this.notes = PT.ops.noteNumbers(doc);
      const patch = new Set();
      if (dirty) for (const o of dirty) for (let ci = doc.cellInfo(o); ci; ci = doc.cellInfo(ci.owner)) patch.add(ci.tbl.id);
      this.patch = patch;
      this.changed = new Set();
      this.reconcile(this.el, doc.storyList(this.story) || []);
      this.derived();
    }
    rebuild() { this.map.clear(); this.el.replaceChildren(); this.render(); }
    // coloca los elementos de los bloques en orden tocando solo lo que cambió
    reconcile(parent, blocks) {
      const els = blocks.map((b) => {
        const rec = this.map.get(b.id);
        if (rec && rec.b === b) {
          if (b.t === 'table' && this.patch.has(b.id)) this.patchTable(b, rec.el);
          return rec.el;
        }
        this.changed.add(b.id);
        return V.renderBlock(b, this);
      });
      const wanted = new Set(els);
      const isGap = (n) => n.nodeType === 1 && n.classList.contains('pt-gap');
      let cur = parent.firstChild;
      for (const el of els) {
        // los nodos que ya no corresponden (bloques borrados o sustituidos) se quitan en su sitio;
        // los espaciadores de página se conservan (los recoloca la paginación)
        while (cur && cur !== el && !wanted.has(cur)) { const nx = cur.nextSibling; if (!isGap(cur)) cur.remove(); cur = nx; }
        if (cur === el) cur = cur.nextSibling;
        else parent.insertBefore(el, cur);
      }
      while (cur) { const nx = cur.nextSibling; if (!isGap(cur)) cur.remove(); cur = nx; }
    }
    patchTable(t, el) {
      for (const td of el.querySelectorAll(':scope > tbody > tr > td[data-cell]')) {
        const info = this.doc.cellInfo(td.dataset.cell);
        if (info) this.reconcile(td, info.cell.blocks);
      }
    }
    // valores derivados: números de lista, de notas y campos
    derived() {
      for (const el of this.el.querySelectorAll('.pt-li')) {
        const m = this.markers.get(el.dataset.id);
        if (m != null && el.dataset.marker !== m) el.dataset.marker = m;
      }
      for (const el of this.el.querySelectorAll('.pt-fnref')) {
        const n = this.notes.get(el.dataset.note);
        const t = n ? String(n) : '*';
        if (el.textContent !== t) el.textContent = t;
      }
      for (const el of this.el.querySelectorAll('.pt-toc')) { const r = this.map.get(el.dataset.id); if (r) V.fillToc(el, r.b, this); }
      for (const el of this.el.querySelectorAll('.pt-fld')) {
        const f = el.dataset.f;
        if (f === 'page' || f === 'pages') continue;
        const t = V.fieldText(this.doc, { f, name: el.dataset.name }, this);
        if (el.textContent !== t) el.textContent = t;
      }
    }
  }
  V.StoryView = StoryView;
})();
