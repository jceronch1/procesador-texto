/* Comparar documentos: alinea los bloques de dos versiones (LCS por el texto de cada párrafo), empareja
   los párrafos modificados por parecido y, dentro de cada uno, compara palabra a palabra. El resultado es
   un documento nuevo con las diferencias como cambios controlados (insertado / eliminado), conservando el
   formato de cada versión. No depende del DOM: también se usa en las pruebas de Node. */
(function (root) {
  'use strict';
  const PT = root.PT, R = PT.runs, M = PT.marks, P = PT.para;
  const LIMIT = 4e6; // celdas máximas de la tabla de LCS (por encima se usa una alineación aproximada)

  // diferencias entre dos secuencias: [['=', i, j] | ['-', i, -1] | ['+', -1, j]], borrados antes que inserciones.
  // weight(x) da más valor a emparejar unos elementos que otros (un párrafo con texto antes que uno vacío)
  function diffSeq(a, b, eq, weight) {
    eq = eq || ((x, y) => x === y);
    weight = weight || (() => 1);
    const ops = [];
    let s = 0;
    while (s < a.length && s < b.length && eq(a[s], b[s])) { ops.push(['=', s, s]); s++; }
    let ea = a.length, eb = b.length;
    const tail = [];
    while (ea > s && eb > s && eq(a[ea - 1], b[eb - 1])) { ea--; eb--; tail.push(['=', ea, eb]); }
    const n = ea - s, m = eb - s;
    if (n && m && (n + 1) * (m + 1) <= LIMIT) {
      const W = m + 1, L = new Uint32Array((n + 1) * W);
      const wa = new Uint32Array(n);
      for (let i = 0; i < n; i++) wa[i] = Math.max(1, weight(a[s + i]) | 0);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
        const skip = Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
        L[i * W + j] = eq(a[s + i], b[s + j]) ? Math.max(skip, L[(i + 1) * W + j + 1] + wa[i]) : skip;
      }
      let i = 0, j = 0;
      const dels = [], inss = [];
      const flush = () => { ops.push(...dels.splice(0), ...inss.splice(0)); };
      while (i < n && j < m) {
        if (eq(a[s + i], b[s + j]) && L[i * W + j] === L[(i + 1) * W + j + 1] + wa[i]) { flush(); ops.push(['=', s + i, s + j]); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { dels.push(['-', s + i, -1]); i++; }
        else { inss.push(['+', -1, s + j]); j++; }
      }
      while (i < n) dels.push(['-', s + i++, -1]);
      while (j < m) inss.push(['+', -1, s + j++]);
      flush();
    } else if (n || m) {
      // aproximación para documentos enormes: empareja iguales en orden, sin retroceder
      let j = s;
      const dels = [], inss = [];
      for (let i = s; i < ea; i++) {
        let k = -1;
        for (let t = j; t < Math.min(eb, j + 200); t++) if (eq(a[i], b[t])) { k = t; break; }
        if (k < 0) { dels.push(['-', i, -1]); continue; }
        while (j < k) inss.push(['+', -1, j++]);
        ops.push(...dels.splice(0), ...inss.splice(0), ['=', i, k]);
        j = k + 1;
      }
      while (j < eb) inss.push(['+', -1, j++]);
      ops.push(...dels, ...inss);
    }
    for (let k = tail.length - 1; k >= 0; k--) ops.push(tail[k]);
    return ops;
  }

  // palabras, espacios y signos sueltos (los objetos en línea cuentan como un signo)
  const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu;
  const tokens = (text) => { const out = []; let m; TOKEN.lastIndex = 0; while ((m = TOKEN.exec(text))) out.push({ s: m[0], at: m.index }); return out; };
  const words = (text) => (text.match(/[\p{L}\p{N}_]+/gu) || []).map((w) => w.toLowerCase());

  // parecido entre dos textos (0…1) por palabras compartidas
  function similarity(ta, tb) {
    if (ta === tb) return 1;
    const wa = words(ta), wb = words(tb);
    if (!wa.length || !wb.length) return ta.trim() === tb.trim() ? 1 : 0;
    const cnt = new Map();
    for (const w of wa) cnt.set(w, (cnt.get(w) || 0) + 1);
    let common = 0;
    for (const w of wb) { const c = cnt.get(w); if (c) { common++; cnt.set(w, c - 1); } }
    return (2 * common) / (wa.length + wb.length);
  }

  const blockText = (b) => {
    if (b.t === 'p') return R.text(b.runs);
    if (b.t === 'table') return b.rows.map((r) => r.cells.map((c) => (c.blocks || []).map(blockText).join('\n')).join('\t')).join('\n');
    return '[' + b.t + ']';
  };
  const keyOf = (b) => b.t + ':' + blockText(b);

  function compareDocs(oldDoc, newDoc, opts) {
    opts = opts || {};
    const stamp = String(opts.author || 'Comparación').replace(/\|/g, '/') + '|' + (opts.date || new Date().toISOString());
    const stats = { ins: 0, del: 0, changed: 0 };
    const extraLists = {}, extraNotes = {};
    const countWords = (runs) => words(R.text(runs.filter((r) => !r.o))).length;
    // tramos de la versión anterior: se marcan como eliminados (sin comentarios ni cambios previos)
    const asDeleted = (runs) => {
      for (const r of runs) if (r.o && r.o.k === 'fn' && oldDoc.notes[r.o.id] && !newDoc.notes[r.o.id]) extraNotes[r.o.id] = oldDoc.notes[r.o.id];
      return runs.map((r) => ({ ...(r.o ? { o: r.o } : { x: r.x }), m: M.with(M.without(r.m, ['cm', 'ins']), { del: stamp }) }));
    };
    const asInserted = (runs) => runs.map((r) => ({ ...(r.o ? { o: r.o } : { x: r.x }), m: M.with(M.without(r.m, ['del']), { ins: stamp }) }));
    const keepList = (p) => { if (p.ls && !newDoc.lists[p.ls.id] && oldDoc.lists[p.ls.id]) extraLists[p.ls.id] = oldDoc.lists[p.ls.id]; };

    const delBlock = (b) => {
      if (b.t === 'p') { keepList(b); stats.del += countWords(b.runs); return P.with(b, { runs: R.normalize(asDeleted(b.runs)) }); }
      if (b.t === 'table') return mapTable(b, delBlock);
      return null; // índice o línea eliminados: no se pueden marcar, se omiten
    };
    const insBlock = (b) => {
      if (b.t === 'p') { stats.ins += countWords(b.runs); return P.with(b, { runs: R.normalize(asInserted(b.runs)) }); }
      if (b.t === 'table') return mapTable(b, insBlock);
      return b;
    };
    const mapTable = (t, fn) => Object.assign({}, t, { rows: t.rows.map((row) => Object.assign({}, row, { cells: row.cells.map((c) => Object.assign({}, c, { blocks: (c.blocks || []).map(fn).filter(Boolean) })) })) });

    // un párrafo modificado: diferencias palabra a palabra
    const diffPara = (p0, p1) => {
      const ta = R.text(p0.runs), tb = R.text(p1.runs);
      const A = tokens(ta), B = tokens(tb);
      // las palabras pesan más que los espacios y los signos al alinear
      const ops = diffSeq(A.map((t) => t.s), B.map((t) => t.s), null, (t) => (/^\s+$/.test(t) ? 1 : /^[\p{L}\p{N}_]+$/u.test(t) ? 4 : 2));
      const out = [];
      const endA = (i) => (i + 1 < A.length ? A[i + 1].at : ta.length), endB = (j) => (j + 1 < B.length ? B[j + 1].at : tb.length);
      let k = 0;
      while (k < ops.length) {
        const t = ops[k][0];
        let e = k;
        while (e + 1 < ops.length && ops[e + 1][0] === t) e++;
        if (t === '=') out.push(...R.slice(p1.runs, B[ops[k][2]].at, endB(ops[e][2])));
        else if (t === '-') { const runs = R.slice(p0.runs, A[ops[k][1]].at, endA(ops[e][1])); stats.del += countWords(runs); out.push(...asDeleted(runs)); }
        else { const runs = R.slice(p1.runs, B[ops[k][2]].at, endB(ops[e][2])); stats.ins += countWords(runs); out.push(...asInserted(runs)); }
        k = e + 1;
      }
      keepList(p0);
      stats.changed++;
      return P.with(p1, { runs: R.normalize(out) });
    };

    const diffBlocks = (oldList, newList) => {
      // emparejar un párrafo vacío vale poco; una tabla o un párrafo con texto, mucho
      const ops = diffSeq(oldList.map(keyOf), newList.map(keyOf), null, (k) => (k === 'p:' ? 1 : 8));
      const out = [];
      let k = 0;
      while (k < ops.length) {
        if (ops[k][0] === '=') { out.push(newList[ops[k][2]]); k++; continue; }
        // hueco con bloques eliminados e insertados: se emparejan los parecidos
        const O = [], N = [];
        while (k < ops.length && ops[k][0] !== '=') { if (ops[k][0] === '-') O.push(oldList[ops[k][1]]); else N.push(newList[ops[k][2]]); k++; }
        const same = (x, y) => (x.t === 'p' && y.t === 'p' ? similarity(R.text(x.runs), R.text(y.runs)) >= 0.35 : x.t === 'table' && y.t === 'table' && x.rows.length === y.rows.length && x.rows[0].cells.length === y.rows[0].cells.length);
        for (const op of diffSeq(O, N, same)) {
          if (op[0] === '=') {
            const x = O[op[1]], y = N[op[2]];
            if (x.t === 'p') out.push(diffPara(x, y));
            else out.push(Object.assign({}, y, { rows: y.rows.map((row, r) => Object.assign({}, row, { cells: row.cells.map((c, ci) => Object.assign({}, c, { blocks: diffBlocks(x.rows[r].cells[ci].blocks || [], c.blocks || []) })) })) }));
          } else if (op[0] === '-') { const b = delBlock(O[op[1]]); if (b) out.push(b); }
          else out.push(insBlock(N[op[2]]));
        }
      }
      return out;
    };

    const body = diffBlocks(oldDoc.body, newDoc.body);
    const json = newDoc.toJSON();
    json.body = JSON.parse(JSON.stringify(body));
    json.lists = Object.assign({}, PT.clone(extraLists), json.lists);
    for (const id in extraNotes) if (!json.notes[id]) json.notes[id] = { blocks: JSON.parse(JSON.stringify(extraNotes[id].blocks)) };
    for (const k in oldDoc.styles) if (!json.styles[k]) json.styles[k] = PT.clone(oldDoc.styles[k]);
    json.track = false;
    const doc = PT.Doc.fromJSON(json);
    doc.meta.title = opts.title || ('Comparación · ' + (newDoc.meta.title || 'documento'));
    return { doc, stats };
  }

  PT.compare = { diffSeq, tokens, similarity, docs: compareDocs };
})(typeof window !== 'undefined' ? window : globalThis);
