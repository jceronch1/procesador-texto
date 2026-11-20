/* Operaciones de edición sobre el modelo: escribir, borrar (también entre tablas), dividir y unir párrafos,
   marcas, estilos, listas, sangrías, tablas (filas, columnas, combinar), objetos en línea, notas al pie,
   comentarios, control de cambios, fragmentos para copiar y pegar, buscar y reemplazar, mayúsculas.
   Todas se ejecutan dentro de una transacción del documento (doc.tx) y devuelven la nueva posición. */
(function (root) {
  'use strict';
  const PT = root.PT, R = PT.runs, M = PT.marks, P = PT.para, OBJ = PT.OBJ;
  const EMPTY = M.EMPTY;
  const O = (PT.ops = {});
  O.author = () => PT.locale.author || 'Autor';
  O.stamp = () => O.author().replace(/\|/g, '/') + '|' + new Date().toISOString();
  O.stampInfo = (s) => { const i = String(s || '').lastIndexOf('|'); return i < 0 ? { by: s || '', at: '' } : { by: s.slice(0, i), at: s.slice(i + 1) }; };

  // ---------------------------------------------------------------- posiciones y selección
  O.same = (a, b) => !!a && !!b && a.id === b.id && a.off === b.off;
  O.caret = (pos) => ({ a: pos, h: pos });
  O.isCollapsed = (sel) => O.same(sel.a, sel.h);
  O.ordered = (doc, sel) => (doc.cmp(sel.a, sel.h) <= 0 ? [sel.a, sel.h] : [sel.h, sel.a]);
  O.clampPos = function (doc, pos, story) {
    const p = pos && doc.block(pos.id);
    if (!p || p.t !== 'p') return doc.startPos(story || 'body');
    return { id: p.id, off: PT.clamp(pos.off | 0, 0, P.len(p)) };
  };
  // párrafos tocados por el rango con sus límites
  O.parasIn = function (doc, from, to) {
    const story = doc.storyOf(from.id), ids = doc.parasOf(story);
    const i1 = doc.ord(from.id), i2 = doc.ord(to.id), out = [];
    for (let i = i1; i <= i2 && i >= 0; i++) {
      const p = doc.block(ids[i]);
      out.push({ p, from: i === i1 ? from.off : 0, to: i === i2 ? to.off : P.len(p) });
    }
    return out;
  };
  O.paraIds = (doc, sel) => { const [a, b] = O.ordered(doc, sel); return O.parasIn(doc, a, b).map((x) => x.p.id); };

  // ---------------------------------------------------------------- grafemas y palabras
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
  O.prevGrapheme = function (text, off) {
    if (off <= 0) return 0;
    if (seg) {
      const s0 = Math.max(0, off - 64);
      let last = s0;
      for (const g of seg.segment(text.slice(s0, off))) last = s0 + g.index;
      return last;
    }
    const c = text.charCodeAt(off - 1);
    return c >= 0xdc00 && c <= 0xdfff && off > 1 ? off - 2 : off - 1;
  };
  O.nextGrapheme = function (text, off) {
    if (off >= text.length) return text.length;
    if (seg) { for (const g of seg.segment(text.slice(off, off + 64))) return off + g.segment.length; }
    const c = text.charCodeAt(off);
    return c >= 0xd800 && c <= 0xdbff ? off + 2 : off + 1;
  };
  const WORDCH = /[\p{L}\p{N}_]/u;
  O.wordAt = function (text, off) {
    let a = off, b = off;
    while (a > 0 && WORDCH.test(text[a - 1])) a--;
    while (b < text.length && WORDCH.test(text[b])) b++;
    return { from: a, to: b };
  };
  O.prevWord = function (text, off) {
    let i = off;
    while (i > 0 && /\s/.test(text[i - 1])) i--;
    if (i > 0 && !WORDCH.test(text[i - 1])) return i - 1;
    while (i > 0 && WORDCH.test(text[i - 1])) i--;
    return i;
  };
  O.nextWord = function (text, off) {
    let i = off;
    if (i < text.length && !WORDCH.test(text[i]) && !/\s/.test(text[i])) return i + 1;
    while (i < text.length && WORDCH.test(text[i])) i++;
    while (i < text.length && /[ \t]/.test(text[i])) i++;
    return i;
  };

  // ---------------------------------------------------------------- marcas al escribir
  O.typingMarks = function (doc, pos) {
    const p = doc.block(pos.id), runs = p.runs, len = P.len(p);
    let before = null, after = null;
    for (let i = pos.off - 1; i >= 0; i--) { const x = R.marksAt(runs, i); if (x && !x.del) { before = x; break; } }
    for (let j = pos.off; j < len; j++) { const x = R.marksAt(runs, j); if (x && !x.del) { after = x; break; } }
    const m = before || after;
    if (!m) return M.intern(p.pm || null);
    // lo que se escribe es siempre de quien escribe, aunque sea dentro de un texto pegado o de la IA
    const drop = { ins: null, del: null, src: null };
    // vínculos y comentarios solo continúan si el cursor está dentro de ellos
    for (const k of ['ln', 'cm']) if (m[k] && !(before && after && before[k] === after[k])) drop[k] = null;
    return M.with(m, drop);
  };

  // ---------------------------------------------------------------- escribir
  // inserta tramos en una posición (sin borrar la selección)
  O.insertRuns = function (doc, pos, runs) {
    const p = doc.block(pos.id);
    if (doc.track) runs = runs.map((r) => (r.o ? { o: r.o, m: M.with(r.m, { ins: O.stamp(), del: null }) } : { x: r.x, m: M.with(r.m, { ins: O.stamp(), del: null }) }));
    doc.put(P.with(p, { runs: R.splice(p.runs, pos.off, pos.off, runs) }));
    return { id: p.id, off: pos.off + R.len(runs) };
  };
  O.insertText = function (doc, sel, text, marks) {
    const [from, to] = O.ordered(doc, sel);
    let pos = from;
    if (!O.same(from, to)) pos = O.deleteRange(doc, from, to);
    if (!text) return pos;
    text = String(text).replace(/\r\n?/g, '\n');
    return O.insertRuns(doc, pos, [{ x: text, m: marks || O.typingMarks(doc, pos) }]);
  };
  O.insertAtom = function (doc, sel, obj, marks) {
    const [from, to] = O.ordered(doc, sel);
    let pos = from;
    if (!O.same(from, to)) pos = O.deleteRange(doc, from, to);
    const m = marks || M.without(O.typingMarks(doc, pos), ['ln']);
    return O.insertRuns(doc, pos, [{ o: Object.freeze(Object.assign({}, obj)), m }]);
  };
  O.updateAtom = function (doc, pos, patch) {
    const p = doc.block(pos.id), at = R.at(p.runs, pos.off);
    if (!at || !at.run.o) return;
    const o = Object.freeze(Object.assign({}, at.run.o, patch));
    doc.put(P.with(p, { runs: R.splice(p.runs, pos.off, pos.off + 1, [{ o, m: at.run.m }]) }));
  };
  // texto con varios párrafos (pegar texto sin formato)
  O.insertPlain = function (doc, sel, text, marks) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    if (lines.length === 1) return O.insertText(doc, sel, text, marks);
    const [from, to] = O.ordered(doc, sel);
    let pos = O.same(from, to) ? from : O.deleteRange(doc, from, to);
    const m = marks || O.typingMarks(doc, pos);
    lines.forEach((line, i) => {
      if (i > 0) pos = O.split(doc, pos);
      if (line) pos = O.insertRuns(doc, pos, [{ x: line, m }]);
    });
    return pos;
  };

  // ---------------------------------------------------------------- dividir párrafos
  O.split = function (doc, pos) {
    const p = doc.block(pos.id), l = doc.loc(p.id), len = P.len(p);
    const left = P.with(p, { runs: R.slice(p.runs, 0, pos.off) });
    const props = P.props(p);
    delete props.pb; delete props.dc;
    if (props.ck) delete props.ck;
    if (pos.off >= len && len > 0) {
      const st = doc.style(p.st || 'normal');
      if (st.next && st.next !== (p.st || 'normal')) { props.st = st.next === 'normal' ? undefined : st.next; delete props.kn; }
    }
    const rightRuns = R.slice(p.runs, pos.off);
    const right = P.make(props, rightRuns);
    const pm = O.typingMarks(doc, pos);
    const keep = M.without(pm, ['ln', 'cm', 'ins', 'del']);
    if (!rightRuns.length && keep !== EMPTY) right.pm = Object.assign({}, keep); else delete right.pm;
    if (!R.len(left.runs) && keep !== EMPTY) left.pm = Object.assign({}, keep);
    doc.replace(l.owner, l.i, 1, [left, right]);
    return { id: right.id, off: 0 };
  };

  // ---------------------------------------------------------------- borrar
  // borra [from, to) y devuelve la posición donde queda el cursor
  O.deleteRange = function (doc, from, to) {
    if (doc.cmp(from, to) > 0) [from, to] = [to, from];
    if (O.same(from, to)) return from;
    if (doc.track) return trackDelete(doc, from, to);
    if (from.id === to.id) {
      const p = doc.block(from.id);
      doc.put(P.with(p, { runs: R.splice(p.runs, from.off, to.off, []) }));
      return { id: p.id, off: from.off };
    }
    const la = doc.loc(from.id), lb = doc.loc(to.id);
    if (la.owner === lb.owner) {
      const pa = doc.block(from.id), pb = doc.block(to.id);
      const keepB = from.off === 0 && R.len(pa.runs) === 0;
      const base = keepB ? pb : pa;
      const merged = P.with(base, { runs: R.normalize(R.slice(pa.runs, 0, from.off).concat(R.slice(pb.runs, to.off))) });
      if (keepB) merged.id = pb.id;
      doc.replace(la.owner, la.i, lb.i - la.i + 1, [merged]);
      return { id: merged.id, off: from.off };
    }
    crossDelete(doc, from, to);
    return { id: from.id, off: from.off };
  };
  // cadena de contenedores de un párrafo, de fuera hacia dentro: [{owner, i, cell}]
  function chain(doc, id) {
    const l = doc.loc(id), out = [{ owner: l.owner, i: l.i, cell: null }];
    for (let ci = doc.cellInfo(l.owner); ci; ci = doc.cellInfo(ci.owner)) out.unshift({ owner: ci.owner, i: ci.i, cell: ci.cell.id, r: ci.r, c: ci.c });
    return out;
  }
  // celdas maestras de una tabla en orden de lectura
  O.masterCells = (tbl) => { const out = []; tbl.rows.forEach((row, r) => row.cells.forEach((cell, c) => { if (!cell.mh && !cell.mv) out.push({ cell, r, c }); })); return out; };
  function clearCell(doc, cellId) {
    const L = doc.list(cellId);
    const first = L.find((b) => b.t === 'p');
    doc.replace(cellId, 0, L.length, [P.make(first ? P.props(first) : null)]);
  }
  // borra desde la posición (cadena a, nivel k) hasta el final de su contenedor en ese nivel
  function cutTail(doc, ch, k, off) {
    const lv = ch[k];
    if (k === ch.length - 1) {
      const p = doc.list(lv.owner)[lv.i];
      doc.put(P.with(p, { runs: R.slice(p.runs, 0, off) }));
    } else {
      const tbl = doc.list(lv.owner)[lv.i];
      const cells = O.masterCells(tbl), idx = cells.findIndex((x) => x.cell.id === ch[k + 1].owner);
      for (let j = cells.length - 1; j > idx; j--) clearCell(doc, cells[j].cell.id);
      cutTail(doc, ch, k + 1, off);
    }
    if (k > 0) { const L = doc.list(lv.owner); if (lv.i + 1 < L.length) doc.replace(lv.owner, lv.i + 1, L.length - lv.i - 1, []); }
  }
  function cutHead(doc, ch, k, off) {
    const lv = ch[k];
    if (k === ch.length - 1) {
      const p = doc.list(lv.owner)[lv.i];
      doc.put(P.with(p, { runs: R.slice(p.runs, off) }));
    } else {
      const tbl = doc.list(lv.owner)[lv.i];
      const cells = O.masterCells(tbl), idx = cells.findIndex((x) => x.cell.id === ch[k + 1].owner);
      cutHead(doc, ch, k + 1, off);
      for (let j = idx - 1; j >= 0; j--) clearCell(doc, cells[j].cell.id);
    }
    if (k > 0 && lv.i > 0) doc.replace(lv.owner, 0, lv.i, []);
  }
  function crossDelete(doc, from, to) {
    const A = chain(doc, from.id), B = chain(doc, to.id);
    let k = 0;
    while (k < A.length && k < B.length && A[k].owner === B[k].owner && A[k].i === B[k].i) k++;
    // k: primer nivel en el que divergen (misma lista, distinto índice)
    if (k < A.length && k < B.length && A[k].owner === B[k].owner) {
      cutHead(doc, B, k, to.off);
      const between = B[k].i - A[k].i - 1;
      if (between > 0) doc.replace(A[k].owner, A[k].i + 1, between, []);
      cutTail(doc, A, k, from.off);
    } else {
      // mismo bloque tabla y distintas celdas (k apunta a la celda)
      const lv = A[k - 1], tbl = doc.list(lv.owner)[lv.i];
      const cells = O.masterCells(tbl);
      const ia = cells.findIndex((x) => x.cell.id === A[k].owner), ib = cells.findIndex((x) => x.cell.id === B[k].owner);
      cutHead(doc, B, k, to.off);
      for (let j = ib - 1; j > ia; j--) clearCell(doc, cells[j].cell.id);
      cutTail(doc, A, k, from.off);
    }
  }
  // borrado con control de cambios: marca como eliminado; lo insertado por el mismo autor se quita
  function trackDelete(doc, from, to) {
    const me = O.author();
    let end = to;
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) {
      if (a >= b) continue;
      const out = [];
      let removed = 0, pos = 0;
      for (const r of p.runs) {
        const l = R.rlen(r), s = pos, e = pos + l;
        pos = e;
        if (e <= a || s >= b) { out.push(r); continue; }
        const x = Math.max(a, s), y = Math.min(b, e);
        const pre = r.o ? null : r.x.slice(0, x - s), mid = r.o ? null : r.x.slice(x - s, y - s), post = r.o ? null : r.x.slice(y - s);
        if (pre) out.push({ x: pre, m: r.m });
        const mine = r.m.ins && O.stampInfo(r.m.ins).by === me;
        if (mine) removed += y - x;
        else if (r.o) out.push({ o: r.o, m: M.with(r.m, { del: r.m.del || O.stamp() }) });
        else out.push({ x: mid, m: M.with(r.m, { del: r.m.del || O.stamp() }) });
        if (post) out.push({ x: post, m: r.m });
      }
      doc.put(P.with(p, { runs: R.normalize(out) }));
      if (p.id === to.id) end = { id: p.id, off: to.off - removed };
    }
    return end;
  }

  // Retroceso al principio de un párrafo
  O.backspaceAtStart = function (doc, pos) {
    const p = doc.block(pos.id);
    if (p.ls) { doc.put(P.with(p, { ls: null, ck: null })); return pos; }
    if (p.pb) { doc.put(P.with(p, { pb: null })); return pos; }
    const l = doc.loc(p.id), L = doc.list(l.owner);
    if (l.i === 0) return pos;
    const prev = L[l.i - 1];
    if (prev.t === 'p') {
      if (doc.track) return { id: prev.id, off: P.len(prev) };
      if (!R.len(prev.runs)) { doc.replace(l.owner, l.i - 1, 1, []); return pos; }
      const merged = P.with(prev, { runs: R.normalize(prev.runs.concat(p.runs)) });
      doc.replace(l.owner, l.i - 1, 2, [merged]);
      return { id: prev.id, off: P.len(prev) };
    }
    if (prev.t === 'table') {
      const cells = O.masterCells(prev), last = cells[cells.length - 1].cell;
      const lp = [...last.blocks].reverse().find((b) => b.t === 'p');
      if (!R.len(p.runs) && l.i < L.length - 1) doc.replace(l.owner, l.i, 1, []);
      return lp ? { id: lp.id, off: P.len(lp) } : pos;
    }
    doc.replace(l.owner, l.i - 1, 1, []);
    return pos;
  };
  // Supr al final de un párrafo
  O.deleteAtEnd = function (doc, pos) {
    const p = doc.block(pos.id), l = doc.loc(p.id), L = doc.list(l.owner);
    const next = L[l.i + 1];
    if (!next) return pos;
    if (next.t === 'p') {
      if (doc.track) return pos;
      if (!R.len(p.runs)) { doc.replace(l.owner, l.i, 1, []); return { id: next.id, off: 0 }; }
      doc.replace(l.owner, l.i, 2, [P.with(p, { runs: R.normalize(p.runs.concat(next.runs)) })]);
      return pos;
    }
    if (next.t === 'table') {
      const first = O.masterCells(next)[0].cell.blocks.find((b) => b.t === 'p');
      if (!R.len(p.runs) && l.i > 0) { doc.replace(l.owner, l.i, 1, []); }
      return first ? { id: first.id, off: 0 } : pos;
    }
    doc.replace(l.owner, l.i + 1, 1, []);
    return pos;
  };

  // ---------------------------------------------------------------- marcas
  O.setMarks = function (doc, from, to, fn) {
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) {
      if (a >= b) continue;
      const runs = R.mapMarks(p.runs, a, b, (m, r) => fn(m, r, p));
      doc.put(P.with(p, { runs }));
    }
  };
  // ¿todos los caracteres del rango cumplen pred(marcas efectivas)?
  O.rangeEvery = function (doc, from, to, pred) {
    let any = false, all = true;
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) {
      R.each(p.runs, a, b, (r) => { if (r.m.del) return; any = true; if (!pred(doc.runProps(p, r.m), r)) all = false; });
    }
    return any && all;
  };
  O.toggleMark = function (doc, from, to, key, value) {
    const v = value === undefined ? true : value;
    const on = !O.rangeEvery(doc, from, to, (e) => (value === undefined ? !!e[key] : e[key] === value));
    O.setMarks(doc, from, to, (m, r, p) => {
      const sv = doc.styleOfPara(p).r[key];
      const patch = {};
      if (on) patch[key] = sv === v ? null : v; else patch[key] = sv && M.BOOL_KEYS.has(key) ? false : null;
      if (on && key === 'sup') patch.sub = null;
      if (on && key === 'sub') patch.sup = null;
      return M.with(m, patch);
    });
    return on;
  };
  // propiedades efectivas en la selección; null = valores mezclados
  O.marksInfo = function (doc, sel, stored) {
    const [from, to] = O.ordered(doc, sel);
    const p0 = doc.block(from.id);
    if (O.same(from, to)) {
      const m = stored || O.typingMarks(doc, from);
      return Object.assign({}, doc.runProps(p0, m), { _m: m });
    }
    let acc = null;
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) {
      R.each(p.runs, a, b, (r) => {
        const e = doc.runProps(p, r.m);
        if (!acc) { acc = Object.assign({}, e); for (const k of M.KEYS) if (!(k in acc)) acc[k] = undefined; return; }
        for (const k of M.KEYS) if (acc[k] !== null && acc[k] !== e[k] && !(acc[k] == null && e[k] == null)) acc[k] = null;
      });
    }
    return acc || doc.runProps(p0, O.typingMarks(doc, from));
  };
  // quita el formato directo de carácter (conserva vínculos, comentarios y cambios)
  O.clearMarks = function (doc, from, to) {
    O.setMarks(doc, from, to, (m) => M.intern({ ln: m.ln, cm: m.cm, ins: m.ins, del: m.del }));
  };

  // ---------------------------------------------------------------- párrafos
  O.setPara = function (doc, ids, patch) {
    for (const id of ids) {
      const p = doc.block(id);
      if (!p || p.t !== 'p') continue;
      const ch = typeof patch === 'function' ? patch(p) : patch;
      if (ch) doc.put(P.with(p, ch));
    }
  };
  const STYLE_CLEARS_P = { spB: null, spA: null, lh: null, lhx: null, kn: null, kl: null, bg: null, bdr: null };
  O.applyStyle = function (doc, ids, st) {
    for (const id of ids) {
      const p = doc.block(id);
      if (!p || p.t !== 'p') continue;
      const runs = R.mapMarks(p.runs, 0, P.len(p), (m) => M.without(m, ['ff', 'fs', 'fc', 'b', 'i', 'u', 'caps', 'sc', 'sp']));
      const patch = Object.assign({}, STYLE_CLEARS_P, { st: st === 'normal' ? null : st, runs, pm: null });
      doc.put(P.with(p, patch));
    }
  };
  O.indent = function (doc, ids, delta) {
    for (const id of ids) {
      const p = doc.block(id);
      if (!p || p.t !== 'p') continue;
      if (p.ls) { doc.put(P.with(p, { ls: { id: p.ls.id, l: PT.clamp(p.ls.l + (delta > 0 ? 1 : -1), 0, 8) } })); continue; }
      const cur = doc.paraProps(p).inL || 0;
      doc.put(P.with(p, { inL: Math.max(0, PT.round(cur + delta, 1)) || null }));
    }
  };

  // ---------------------------------------------------------------- listas
  O.listKindOf = (doc, p) => (p && p.ls && doc.lists[p.ls.id] ? doc.lists[p.ls.id].k : null);
  O.toggleList = function (doc, ids, kind) {
    const paras = ids.map((id) => doc.block(id)).filter((p) => p && p.t === 'p');
    if (!paras.length) return;
    if (paras.every((p) => O.listKindOf(doc, p) === kind)) { O.setPara(doc, ids, { ls: null, ck: null }); return; }
    let listId = null;
    const inList = paras.find((p) => p.ls && doc.lists[p.ls.id]);
    if (inList) listId = inList.ls.id;
    if (!listId) {
      // continúa la lista del párrafo anterior o siguiente si es del mismo tipo
      const before = doc.nextPara(paras[0].id, -1), after = doc.nextPara(paras[paras.length - 1].id, 1);
      for (const q of [before, after]) if (q && O.listKindOf(doc, q) === kind && doc.loc(q.id).owner === doc.loc(paras[0].id).owner) { listId = q.ls.id; break; }
    }
    if (!listId) { listId = PT.uid('L'); doc.set(['lists', listId], { k: kind }); }
    else if (doc.lists[listId].k !== kind) doc.set(['lists', listId, 'k'], kind);
    for (const p of paras) doc.put(P.with(p, { ls: { id: listId, l: p.ls ? p.ls.l : 0 }, ck: kind === 'check' ? !!p.ck : null }));
  };
  // reinicia la numeración en este párrafo (lista nueva para él y los siguientes de la misma lista)
  O.restartList = function (doc, id) {
    const p = doc.block(id);
    if (!p || !p.ls) return;
    const old = p.ls.id, nid = PT.uid('L');
    doc.set(['lists', nid], Object.assign({}, doc.lists[old]));
    const ids = doc.parasOf(doc.storyOf(id));
    for (let i = doc.ord(id); i < ids.length; i++) { const q = doc.block(ids[i]); if (q.ls && q.ls.id === old) doc.put(P.with(q, { ls: { id: nid, l: q.ls.l } })); }
  };
  // continúa la numeración de la lista anterior del mismo tipo
  O.continueList = function (doc, id) {
    const p = doc.block(id);
    if (!p || !p.ls) return false;
    const kind = O.listKindOf(doc, p), ids = doc.parasOf(doc.storyOf(id));
    let prev = null;
    for (let i = doc.ord(id) - 1; i >= 0; i--) { const q = doc.block(ids[i]); if (q.ls && q.ls.id !== p.ls.id && O.listKindOf(doc, q) === kind) { prev = q.ls.id; break; } }
    if (!prev) return false;
    const old = p.ls.id;
    for (let i = doc.ord(id); i < ids.length; i++) { const q = doc.block(ids[i]); if (q.ls && q.ls.id === old) doc.put(P.with(q, { ls: { id: prev, l: q.ls.l } })); }
    return true;
  };
  // números de lista de una historia: Map(id párrafo -> texto del marcador)
  O.listMarkers = function (doc, story) {
    const out = new Map(), counters = {};
    for (const id of doc.parasOf(story)) {
      const p = doc.block(id);
      if (!p.ls || !doc.lists[p.ls.id]) continue;
      const def = doc.lists[p.ls.id], lv = PT.clamp(p.ls.l | 0, 0, 8);
      const c = counters[p.ls.id] || (counters[p.ls.id] = []);
      c[lv] = (c[lv] || ((def.start || 1) - 1)) + 1;
      c.length = lv + 1;
      for (let k = 0; k < lv; k++) if (!c[k]) c[k] = 1;
      const f = PT.listLevel(def.k, lv);
      let text;
      if (f.check) text = '';
      else if (f.bullet) text = f.bullet;
      else if (f.outline) text = c.slice(0, lv + 1).map((n) => PT.numFmt(n || 1, 'decimal')).join('.') + '.';
      else text = PT.numFmt(c[lv], f.fmt) + f.suffix;
      out.set(id, text);
    }
    return out;
  };

  // ---------------------------------------------------------------- bloques
  // inserta bloques en la posición (dividiendo el párrafo); devuelve la posición siguiente
  O.insertBlocks = function (doc, pos, blocks) {
    const p = doc.block(pos.id), l = doc.loc(p.id), len = P.len(p);
    if (!len) { doc.replace(l.owner, l.i, 0, blocks); return { id: p.id, off: 0 }; }
    if (pos.off === 0) { doc.replace(l.owner, l.i, 0, blocks); return { id: p.id, off: 0 }; }
    if (pos.off >= len) {
      const L = doc.list(l.owner), next = L[l.i + 1];
      if (next && next.t === 'p' && !R.len(next.runs)) { doc.replace(l.owner, l.i + 1, 0, blocks); return { id: next.id, off: 0 }; }
      const np = P.make();
      doc.replace(l.owner, l.i + 1, 0, blocks.concat([np]));
      return { id: np.id, off: 0 };
    }
    const right = O.split(doc, pos);
    const l2 = doc.loc(right.id);
    doc.replace(l2.owner, l2.i, 0, blocks);
    return right;
  };
  O.removeBlock = function (doc, id) {
    const l = doc.loc(id);
    if (!l) return null;
    const L = doc.list(l.owner);
    doc.replace(l.owner, l.i, 1, []);
    const after = doc.list(l.owner)[l.i];
    if (!doc.list(l.owner).some((b) => b.t === 'p')) { const np = P.make(); doc.replace(l.owner, 0, 0, [np]); return { id: np.id, off: 0 }; }
    if (after && after.t === 'p') return { id: after.id, off: 0 };
    const before = L[l.i - 1];
    if (before && before.t === 'p') return { id: before.id, off: P.len(before) };
    const np = P.make();
    doc.replace(l.owner, l.i, 0, [np]);
    return { id: np.id, off: 0 };
  };

  // ---------------------------------------------------------------- tablas
  // celda maestra que cubre (r, c)
  O.masterOf = function (tbl, r, c) {
    while (r > 0 && tbl.rows[r].cells[c].mv) r--;
    while (c > 0 && tbl.rows[r].cells[c].mh) c--;
    while (r > 0 && tbl.rows[r].cells[c].mv) r--;
    return { r, c };
  };
  O.spanOf = function (tbl, r, c) {
    let cs = 1, rs = 1;
    const row = tbl.rows[r].cells;
    while (c + cs < row.length && row[c + cs].mh) cs++;
    while (r + rs < tbl.rows.length && tbl.rows[r + rs].cells[c].mv) rs++;
    return { cs, rs };
  };
  // tabla, fila y columna de la posición (tabla más interna)
  O.tableAt = function (doc, pos) {
    const ci = doc.cellOf(pos.id);
    if (!ci) return null;
    return { tbl: ci.tbl, r: ci.r, c: ci.c, cell: ci.cell, owner: ci.owner, i: ci.i };
  };
  const newRowCells = (n, props) => Array.from({ length: n }, () => PT.blocks.cell([P.make(props)]));
  const copyTable = (t) => Object.assign({}, t, { cols: t.cols.slice(), rows: t.rows.map((row) => Object.assign({}, row, { cells: row.cells.slice() })) });
  const firstPara = (cell) => cell.blocks.find((b) => b.t === 'p');
  // rectángulo de celdas entre dos posiciones de la misma tabla, ampliado para incluir combinaciones
  O.cellRect = function (tbl, r1, c1, r2, c2) {
    let g = { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
    for (let again = true; again;) {
      again = false;
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
        const m = O.masterOf(tbl, r, c), s = O.spanOf(tbl, m.r, m.c);
        const e = { r1: Math.min(g.r1, m.r), c1: Math.min(g.c1, m.c), r2: Math.max(g.r2, m.r + s.rs - 1), c2: Math.max(g.c2, m.c + s.cs - 1) };
        if (e.r1 !== g.r1 || e.c1 !== g.c1 || e.r2 !== g.r2 || e.c2 !== g.c2) { g = e; again = true; }
      }
    }
    return g;
  };
  // op: rowAbove rowBelow colLeft colRight delRow delCol delTable merge split header props cellProps widths distribute sort
  O.tableOp = function (doc, tableId, op, arg) {
    const old = doc.block(tableId);
    if (!old || old.t !== 'table') return null;
    const t = copyTable(old), nR = t.rows.length, nC = t.cols.length;
    const at = arg || {};
    let caret = null;
    switch (op) {
      case 'rowAbove': case 'rowBelow': {
        const ref = op === 'rowAbove' ? at.r1 : at.r2, ins = op === 'rowAbove' ? at.r1 : at.r2 + 1, n = at.count || 1;
        const refRow = t.rows[ref], m0 = O.masterOf(t, ref, 0), props = P.props(firstPara(t.rows[m0.r].cells[m0.c]) || {});
        for (let k = 0; k < n; k++) {
          const cells = newRowCells(nC, props);
          for (let c = 0; c < nC; c++) {
            // dentro de una combinación vertical la fila nueva también queda combinada
            const below = t.rows[ins + k] ? t.rows[ins + k].cells[c] : null;
            if (refRow.cells[c].mh) cells[c].mh = true;
            if (below && below.mv && ins + k > 0) cells[c].mv = true;
            if (cells[c].mv || cells[c].mh) cells[c].blocks = [];
          }
          t.rows.splice(ins + k, 0, { id: PT.uid('w'), cells });
        }
        const mi = O.masterOf(t, ins, 0);
        caret = firstPara(t.rows[mi.r].cells[mi.c]);
        break;
      }
      case 'colLeft': case 'colRight': {
        const ins = op === 'colLeft' ? at.c1 : at.c2 + 1, n = at.count || 1;
        const w = t.cols[op === 'colLeft' ? at.c1 : at.c2];
        // las columnas nuevas reparten el ancho de la tabla
        const total = t.cols.reduce((s, x) => s + x, 0), nw = Math.max(18, w);
        for (let k = 0; k < n; k++) {
          t.cols.splice(ins + k, 0, nw);
          t.rows.forEach((row) => {
            // dentro de una combinación horizontal la columna nueva también queda combinada
            const right = row.cells[ins + k];
            const cell = PT.blocks.cell([P.make()]);
            if (right && right.mh && ins + k > 0) { cell.mh = true; cell.blocks = []; }
            row.cells.splice(ins + k, 0, cell);
          });
        }
        const scale = total / t.cols.reduce((s, x) => s + x, 0);
        t.cols = t.cols.map((x) => PT.round(x * scale, 1));
        caret = firstPara(t.rows[O.masterOf(t, at.r1 || 0, ins).r].cells[O.masterOf(t, at.r1 || 0, ins).c]);
        break;
      }
      case 'delRow': {
        if (at.r2 - at.r1 + 1 >= nR) return O.tableOp(doc, tableId, 'delTable');
        for (let r = at.r2; r >= at.r1; r--) {
          const row = t.rows[r];
          // si una celda maestra combinada hacia abajo desaparece, la de abajo hereda el contenido
          row.cells.forEach((cell, c) => {
            if (!cell.mv && !cell.mh && r + 1 < t.rows.length && t.rows[r + 1].cells[c].mv) {
              const nb = Object.assign({}, t.rows[r + 1].cells[c], { mv: undefined, blocks: cell.blocks });
              delete nb.mv;
              t.rows[r + 1] = Object.assign({}, t.rows[r + 1], { cells: t.rows[r + 1].cells.slice() });
              t.rows[r + 1].cells[c] = nb;
            }
          });
          t.rows.splice(r, 1);
        }
        const rr = Math.min(at.r1, t.rows.length - 1), m = O.masterOf(t, rr, 0);
        caret = firstPara(t.rows[m.r].cells[m.c]);
        break;
      }
      case 'delCol': {
        if (at.c2 - at.c1 + 1 >= nC) return O.tableOp(doc, tableId, 'delTable');
        for (let c = at.c2; c >= at.c1; c--) {
          t.rows.forEach((row) => {
            const cell = row.cells[c];
            // si desaparece la celda maestra de una combinación horizontal, la siguiente la sustituye
            if (!cell.mh && c + 1 < row.cells.length && row.cells[c + 1].mh) {
              const nb = Object.assign({}, row.cells[c + 1], { blocks: cell.blocks });
              delete nb.mh;
              if (cell.mv) nb.mv = true;
              row.cells[c + 1] = nb;
            }
            row.cells.splice(c, 1);
          });
          t.cols.splice(c, 1);
        }
        const cc = Math.min(at.c1, t.cols.length - 1), m = O.masterOf(t, at.r1 || 0, cc);
        caret = firstPara(t.rows[m.r].cells[m.c]);
        break;
      }
      case 'delTable': return O.removeBlock(doc, tableId);
      case 'merge': {
        const g = O.cellRect(t, at.r1, at.c1, at.r2, at.c2);
        if (g.r1 === g.r2 && g.c1 === g.c2) return null;
        const blocks = [];
        for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
          const cell = t.rows[r].cells[c];
          if (cell.mh || cell.mv) continue;
          const content = cell.blocks.filter((b) => b.t !== 'p' || R.len(b.runs));
          blocks.push(...content);
        }
        if (!blocks.length) blocks.push(P.make(P.props(firstPara(t.rows[g.r1].cells[g.c1]) || {})));
        for (let r = g.r1; r <= g.r2; r++) {
          t.rows[r] = Object.assign({}, t.rows[r], { cells: t.rows[r].cells.slice() });
          for (let c = g.c1; c <= g.c2; c++) {
            const cell = Object.assign({}, t.rows[r].cells[c]);
            delete cell.mh; delete cell.mv;
            if (r === g.r1 && c === g.c1) { cell.blocks = blocks; cell.id = PT.uid('d'); }
            else { cell.blocks = []; cell.id = PT.uid('d'); if (c > g.c1) cell.mh = true; if (r > g.r1 && c === g.c1) cell.mv = true; if (r > g.r1 && c > g.c1) cell.mh = true; }
            t.rows[r].cells[c] = cell;
          }
        }
        caret = firstPara(t.rows[g.r1].cells[g.c1]);
        break;
      }
      case 'split': {
        const m = O.masterOf(t, at.r1, at.c1), s = O.spanOf(t, m.r, m.c);
        if (s.cs === 1 && s.rs === 1) return null;
        for (let r = m.r; r < m.r + s.rs; r++) {
          t.rows[r] = Object.assign({}, t.rows[r], { cells: t.rows[r].cells.slice() });
          for (let c = m.c; c < m.c + s.cs; c++) {
            if (r === m.r && c === m.c) continue;
            t.rows[r].cells[c] = PT.blocks.cell([P.make()]);
          }
        }
        caret = firstPara(t.rows[m.r].cells[m.c]);
        break;
      }
      case 'header': t.rows[0] = Object.assign({}, t.rows[0], { hd: !t.rows[0].hd || undefined }); if (!t.rows[0].hd) delete t.rows[0].hd; break;
      case 'props': for (const k in at) { if (at[k] == null) delete t[k]; else t[k] = at[k]; } break;
      case 'rowProps': for (let r = at.r1; r <= at.r2; r++) { const row = Object.assign({}, t.rows[r]); for (const k in at.patch) { if (at.patch[k] == null) delete row[k]; else row[k] = at.patch[k]; } t.rows[r] = row; } break;
      case 'cellProps': {
        const g = O.cellRect(t, at.r1, at.c1, at.r2, at.c2);
        for (let r = g.r1; r <= g.r2; r++) {
          t.rows[r] = Object.assign({}, t.rows[r], { cells: t.rows[r].cells.slice() });
          for (let c = g.c1; c <= g.c2; c++) {
            const cell = Object.assign({}, t.rows[r].cells[c]);
            for (const k in at.patch) { if (at.patch[k] == null) delete cell[k]; else cell[k] = at.patch[k]; }
            t.rows[r].cells[c] = cell;
          }
        }
        break;
      }
      case 'widths': t.cols = at.cols.map((w) => Math.max(12, PT.round(w, 1))); break;
      case 'distribute': { const total = t.cols.reduce((s, x) => s + x, 0); t.cols = t.cols.map(() => PT.round(total / t.cols.length, 1)); break; }
      case 'sort': {
        const hd = t.rows[0].hd ? 1 : 0, col = at.col | 0;
        if (t.rows.some((row) => row.cells.some((c) => c.mv || c.mh))) return { error: 'No se puede ordenar una tabla con celdas combinadas.' };
        const key = (row) => row.cells[col].blocks.map((b) => (b.t === 'p' ? R.text(b.runs) : '')).join(' ').trim();
        const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
        const body = t.rows.slice(hd);
        body.sort((a, b) => {
          const x = key(a), y = key(b), nx = PT.num(x), ny = PT.num(y);
          if (x === '' || y === '') return x === '' ? 1 : y === '' ? -1 : 0;
          const r = nx != null && ny != null ? nx - ny : coll.compare(x, y);
          return at.desc ? -r : r;
        });
        t.rows = t.rows.slice(0, hd).concat(body);
        break;
      }
      default: return null;
    }
    doc.put(t);
    return caret ? { id: caret.id, off: 0 } : null;
  };
  // celda siguiente/anterior en orden de lectura (para Tab)
  O.nextCell = function (doc, pos, d) {
    const ta = O.tableAt(doc, pos);
    if (!ta) return null;
    const cells = O.masterCells(ta.tbl), i = cells.findIndex((x) => x.cell.id === ta.cell.id) + d;
    if (i < 0 || i >= cells.length) return null;
    const cell = cells[i].cell, ps = cell.blocks.filter((b) => b.t === 'p');
    if (!ps.length) return null;
    const first = ps[0], last = ps[ps.length - 1];
    return { a: { id: first.id, off: 0 }, h: { id: last.id, off: P.len(last) } };
  };

  // ---------------------------------------------------------------- notas al pie
  O.insertNote = function (doc, sel) {
    const id = PT.uid('n');
    doc.set(['notes', id], { blocks: [] });
    const np = P.make({ st: 'fnote' });
    doc.replace('fn:' + id, 0, 0, [np]);
    const pos = O.insertAtom(doc, sel, { k: 'fn', id }, M.intern({}));
    return { pos, id, para: np.id };
  };
  // orden de las notas referenciadas en el cuerpo: Map(id -> número)
  O.noteNumbers = function (doc) {
    const out = new Map();
    const walk = (list) => {
      for (const b of list || []) {
        if (b.t === 'p') { for (const r of b.runs) if (r.o && r.o.k === 'fn' && doc.notes[r.o.id] && !out.has(r.o.id)) out.set(r.o.id, out.size + 1); }
        else if (b.t === 'table') for (const row of b.rows) for (const c of row.cells) walk(c.blocks);
      }
    };
    walk(doc.body);
    return out;
  };

  // ---------------------------------------------------------------- comentarios
  O.addComment = function (doc, from, to, text) {
    const id = PT.uid('m');
    doc.set(['comments', id], { by: O.author(), at: new Date().toISOString(), text: String(text || ''), done: false, re: [] });
    O.setMarks(doc, from, to, (m) => M.with(m, { cm: M.addId(m.cm, id) }));
    return id;
  };
  // recorre todos los párrafos de todas las historias
  O.eachPara = function (doc, fn) {
    for (const s of doc.stories()) for (const id of doc.parasOf(s)) fn(doc.block(id), s);
  };
  O.removeComment = function (doc, id) {
    O.eachPara(doc, (p) => {
      if (!p.runs.some((r) => M.hasId(r.m.cm, id))) return;
      doc.put(P.with(p, { runs: R.mapMarks(p.runs, 0, P.len(p), (m) => (M.hasId(m.cm, id) ? M.with(m, { cm: M.removeId(m.cm, id) }) : m)) }));
    });
    doc.set(['comments', id], undefined);
  };
  // fragmento comentado: {id, from, to} en orden del documento
  O.commentRanges = function (doc) {
    const out = new Map();
    for (const s of doc.stories()) for (const id of doc.parasOf(s)) {
      const p = doc.block(id);
      let pos = 0;
      for (const r of p.runs) {
        const l = R.rlen(r);
        if (r.m.cm) for (const cid of r.m.cm.split(' ')) {
          const cur = out.get(cid);
          if (!cur) out.set(cid, { story: s, from: { id, off: pos }, to: { id, off: pos + l }, text: r.o ? '' : r.x });
          else { cur.to = { id, off: pos + l }; if (cur.text.length < 120) cur.text += r.o ? '' : r.x; }
        }
        pos += l;
      }
    }
    return out;
  };

  // ---------------------------------------------------------------- control de cambios
  // lista de cambios: [{kind:'ins'|'del', by, at, story, from, to, text}]
  O.changes = function (doc) {
    const out = [];
    for (const s of doc.stories()) for (const id of doc.parasOf(s)) {
      const p = doc.block(id);
      let pos = 0;
      for (const r of p.runs) {
        const l = R.rlen(r);
        for (const kind of ['ins', 'del']) if (r.m[kind]) {
          const info = O.stampInfo(r.m[kind]), last = out[out.length - 1];
          if (last && last.kind === kind && last.from.id === id && last.to.off === pos && last.stamp === r.m[kind]) { last.to = { id, off: pos + l }; last.text += r.o ? '▫' : r.x; }
          else out.push({ kind, stamp: r.m[kind], by: info.by, at: info.at, story: s, from: { id, off: pos }, to: { id, off: pos + l }, text: r.o ? '▫' : r.x });
        }
        pos += l;
      }
    }
    return out;
  };
  // acepta o rechaza los cambios del rango (o de todo el documento si no hay rango)
  O.resolveChanges = function (doc, accept, from, to) {
    const visit = (p, a, b) => {
      const out = [];
      let pos = 0, changed = false;
      for (const r of p.runs) {
        const l = R.rlen(r), s = pos, e = pos + l;
        pos = e;
        if (e <= a || s >= b || (!r.m.ins && !r.m.del)) { out.push(r); continue; }
        const x = Math.max(a, s), y = Math.min(b, e);
        if (!r.o && x > s) out.push({ x: r.x.slice(0, x - s), m: r.m });
        const remove = (r.m.ins && !accept) || (r.m.del && accept);
        if (!remove) {
          const m = M.with(r.m, { ins: null, del: null });
          out.push(r.o ? { o: r.o, m } : { x: r.x.slice(x - s, y - s), m });
        }
        if (!r.o && y < e) out.push({ x: r.x.slice(y - s), m: r.m });
        changed = true;
      }
      if (changed) doc.put(P.with(p, { runs: R.normalize(out) }));
    };
    const track = doc.track;
    doc.track = false;
    try {
      if (from && to) for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) visit(p, a, b);
      else O.eachPara(doc, (p) => visit(p, 0, P.len(p)));
    } finally { doc.track = track; }
  };

  // ---------------------------------------------------------------- copiar y pegar
  // fragmento del documento: {inline: true, runs} o {blocks}
  O.slice = function (doc, from, to) {
    if (doc.cmp(from, to) > 0) [from, to] = [to, from];
    if (from.id === to.id) {
      const p = doc.block(from.id), runs = R.slice(p.runs, from.off, to.off);
      if (from.off === 0 && to.off === P.len(p) && P.len(p) > 0 && (p.st || p.ls)) return { blocks: [PT.cloneBlock(P.with(p, { runs }))], whole: true };
      return { inline: true, runs };
    }
    const la = doc.loc(from.id), lb = doc.loc(to.id), blocks = [];
    if (la.owner === lb.owner) {
      const L = doc.list(la.owner);
      for (let i = la.i; i <= lb.i; i++) {
        const b = L[i];
        if (i === la.i) blocks.push(PT.cloneBlock(P.with(b, { runs: R.slice(b.runs, from.off) })));
        else if (i === lb.i) blocks.push(PT.cloneBlock(P.with(b, { runs: R.slice(b.runs, 0, to.off) })));
        else blocks.push(PT.cloneBlock(b));
      }
      return { blocks };
    }
    // a través de tablas: los párrafos de las tablas parciales se copian como párrafos
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) blocks.push(PT.cloneBlock(P.with(p, { runs: R.slice(p.runs, a, b) })));
    return { blocks };
  };
  const trackRuns = (doc, runs) => (doc.track ? runs.map((r) => (r.o ? { o: r.o, m: M.with(r.m, { ins: O.stamp() }) } : { x: r.x, m: M.with(r.m, { ins: O.stamp() }) })) : runs);
  O.insertSlice = function (doc, sel, slice) {
    const [from, to] = O.ordered(doc, sel);
    let pos = O.same(from, to) ? from : O.deleteRange(doc, from, to);
    if (slice.inline) return O.insertRuns(doc, pos, slice.runs.map((r) => (r.o ? r : { x: r.x, m: r.m })));
    const blocks = slice.blocks.map((b) => PT.cloneBlock(b));
    if (!blocks.length) return pos;
    const tracked = (b) => { if (b.t === 'p' && doc.track) b.runs = R.normalize(trackRuns(doc, b.runs)); return b; };
    blocks.forEach(tracked);
    const p = doc.block(pos.id), l = doc.loc(p.id), len = P.len(p);
    const leftRuns = R.slice(p.runs, 0, pos.off), rightRuns = R.slice(p.runs, pos.off);
    const first = blocks[0], last = blocks[blocks.length - 1];
    if (blocks.length === 1 && first.t === 'p') {
      const base = len === 0 ? P.with(first, { runs: [] }) : p;
      const np = P.with(base, { runs: R.normalize(leftRuns.concat(first.runs, rightRuns)) });
      np.id = p.id;
      doc.replace(l.owner, l.i, 1, [np]);
      return { id: p.id, off: pos.off + R.len(first.runs) };
    }
    const out = [];
    let mid = blocks.slice();
    if (first.t === 'p') {
      const base = pos.off === 0 ? first : p;
      const A = P.with(base, { runs: R.normalize(leftRuns.concat(first.runs)) });
      A.id = p.id;
      out.push(A);
      mid = mid.slice(1);
    } else if (pos.off > 0) out.push(P.with(p, { runs: leftRuns }));
    let B;
    if (last.t === 'p' && mid.length && mid[mid.length - 1] === last) {
      mid = mid.slice(0, -1);
      B = P.with(last, { runs: R.normalize(last.runs.concat(rightRuns)) });
    } else B = P.make(P.props(p), rightRuns);
    out.push(...mid, B);
    doc.replace(l.owner, l.i, 1, out);
    return { id: B.id, off: last.t === 'p' ? R.len(last.runs) : 0 };
  };

  // ---------------------------------------------------------------- buscar y reemplazar
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  O.searchRegex = function (query, opts) {
    opts = opts || {};
    if (!query) return null;
    let src = opts.regex ? query : escRe(opts.accents ? query : PT.fold(query));
    if (opts.whole) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
    try { return new RegExp(src, 'gu' + (opts.matchCase ? '' : 'i')); } catch (e) { return null; }
  };
  // coincidencias en una historia: [{id, from, to}]
  O.find = function (doc, story, query, opts) {
    opts = opts || {};
    const re = O.searchRegex(query, opts), out = [];
    if (!re) return out;
    for (const id of doc.parasOf(story)) {
      const p = doc.block(id);
      let text = R.text(p.runs);
      if (!opts.regex && !opts.accents) text = PT.fold(text);
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        out.push({ id, from: m.index, to: m.index + m[0].length, groups: m });
        if (out.length > 20000) return out;
      }
    }
    return out;
  };
  O.replaceMatch = function (doc, match, text, opts) {
    const p = doc.block(match.id);
    if (!p) return null;
    let repl = text;
    if (opts && opts.regex && match.groups) repl = text.replace(/\$(\d)/g, (_, n) => match.groups[+n] || '').replace(/\$&/g, match.groups[0]);
    const m = R.marksAt(p.runs, match.from) || EMPTY;
    return O.insertText(doc, { a: { id: match.id, off: match.from }, h: { id: match.id, off: match.to } }, repl, M.with(m, { ins: null, del: null }));
  };
  O.replaceAll = function (doc, story, query, text, opts) {
    const matches = O.find(doc, story, query, opts);
    for (let i = matches.length - 1; i >= 0; i--) O.replaceMatch(doc, matches[i], text, opts);
    return matches.length;
  };

  // ---------------------------------------------------------------- mayúsculas y minúsculas
  const sentence = (s, startCap) => { let cap = startCap; let out = ''; for (const ch of s.toLowerCase()) { if (cap && /\p{L}/u.test(ch)) { out += ch.toUpperCase(); cap = false; } else out += ch; if (/[.!?¡¿\n]/.test(ch)) cap = true; } return out; };
  const titleCase = (s) => s.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  O.changeCase = function (doc, from, to, mode) {
    for (const { p, from: a, to: b } of O.parasIn(doc, from, to)) {
      if (a >= b) continue;
      const text = R.text(p.runs), seg = text.slice(a, b);
      let t;
      if (mode === 'upper') t = seg.toUpperCase();
      else if (mode === 'lower') t = seg.toLowerCase();
      else if (mode === 'title') t = titleCase(seg);
      else if (mode === 'toggle') t = Array.from(seg).map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
      else t = sentence(seg, a === 0 || /[.!?]\s*$/.test(text.slice(0, a)));
      if (t === seg) continue;
      if (t.length !== seg.length) { const m = R.marksAt(p.runs, a) || EMPTY; doc.put(P.with(p, { runs: R.splice(p.runs, a, b, [{ x: t.replace(new RegExp(OBJ, 'g'), ''), m }]) })); continue; }
      // misma longitud: se conserva el formato de cada tramo
      let pos = 0;
      const runs = p.runs.map((r) => {
        const l = R.rlen(r), s = pos;
        pos += l;
        if (r.o || s + l <= a || s >= b) return r;
        const x = Math.max(a, s), y = Math.min(b, s + l);
        return { x: r.x.slice(0, x - s) + t.slice(x - a, y - a) + r.x.slice(y - s), m: r.m };
      });
      doc.put(P.with(p, { runs: R.normalize(runs) }));
    }
  };

  // ---------------------------------------------------------------- estadísticas
  O.stats = function (doc, story, sel) {
    let text = '';
    const paras = [];
    if (sel && !O.isCollapsed(sel)) {
      const [a, b] = O.ordered(doc, sel);
      for (const x of O.parasIn(doc, a, b)) paras.push(R.text(R.slice(x.p.runs, x.from, x.to).filter((r) => !r.m.del && !r.o)));
    } else for (const id of doc.parasOf(story || 'body')) paras.push(R.text(doc.block(id).runs.filter((r) => !r.m.del && !r.o)));
    text = paras.join('\n');
    const words = PT.countWords(text);
    const chars = text.replace(/\n/g, '').length, noSpace = text.replace(/\s/g, '').length;
    const nonEmpty = paras.filter((t) => t.trim()).length;
    const sentences = Math.max(words ? 1 : 0, (text.match(/[^.!?…]+[.!?…]+/g) || []).length);
    let syl = 0;
    const re = PT.wordRe();
    let m;
    while ((m = re.exec(text))) syl += PT.syllables(m[0]);
    // índice de Fernández Huerta (legibilidad en español)
    const fh = words ? 206.84 - 0.6 * ((syl / words) * 100) - 1.02 * ((sentences / words) * 100) : 0;
    return { words, chars, noSpace, paras: nonEmpty, sentences, syllables: syl, readMin: words / 200, speakMin: words / 130, fh };
  };
})(typeof window !== 'undefined' ? window : globalThis);
