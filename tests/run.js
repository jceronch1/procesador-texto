/* Pruebas del modelo, las operaciones de edición y los formatos de archivo. Ejecutar con: node tests/run.js */
const PT = require('./load.js');
const O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para;
let pass = 0, fail = 0;
const fails = [];
function check(name, got, want) {
  const g = typeof got === 'string' ? got : JSON.stringify(got), w = typeof want === 'string' ? want : JSON.stringify(want);
  if (g === w) pass++; else { fail++; fails.push('  ✗ ' + name + '\n      obtenido: ' + g + '\n      esperado: ' + w); }
}
function ok(name, cond) { check(name, !!cond, true); }

// documento a partir de líneas: '# ' título 1, '- ' viñeta
function mk(lines) {
  const d = PT.Doc.blank();
  d.body = lines.map((t) => PT.blocks.p(t));
  d._idx = null;
  return d;
}
const texts = (d, story) => d.parasOf(story || 'body').map((id) => d.paraText(id));
const pid = (d, i) => d.parasOf('body')[i];
const pos = (d, i, off) => ({ id: pid(d, i), off });

// ------------------------------------------------------------------ tramos y marcas
{
  const b = M.intern({ b: true }), i = M.intern({ i: true });
  ok('intern idéntico', M.intern({ b: true }) === b);
  ok('intern vacío', M.intern({ b: null, fs: '' }) === M.EMPTY);
  ok('false explícito se conserva', M.intern({ b: false }).b === false);
  ok('false en clave no booleana se quita', M.intern({ ff: false }) === M.EMPTY);
  const runs = [{ x: 'Hola ', m: M.EMPTY }, { x: 'mundo', m: b }, { o: { k: 'img' }, m: M.EMPTY }, { x: '!', m: i }];
  check('len', R.len(runs), 12);
  check('text', R.text(runs), 'Hola mundo' + PT.OBJ + '!');
  check('slice', R.text(R.slice(runs, 3, 8)), 'a mun');
  check('splice', R.text(R.splice(runs, 5, 10, [{ x: 'gente', m: M.EMPTY }])), 'Hola gente' + PT.OBJ + '!');
  check('normalize funde', R.normalize([{ x: 'a', m: b }, { x: 'b', m: b }]).length, 1);
  const mm = R.mapMarks(runs, 0, 4, (m) => M.with(m, { b: true }));
  check('mapMarks', mm.map((r) => (r.o ? '#' : r.x) + (r.m.b ? '*' : '')), ['Hola*', ' ', 'mundo*', '#', '!']);
}

// ------------------------------------------------------------------ escribir, deshacer y rehacer
{
  const d = mk(['Hola']);
  let p = d.tx('Escribir', () => O.insertText(d, O.caret(pos(d, 0, 4)), ' mundo'));
  check('insertText', texts(d), ['Hola mundo']);
  check('caret tras escribir', p.off, 10);
  d.undo();
  check('undo', texts(d), ['Hola']);
  d.redo();
  check('redo', texts(d), ['Hola mundo']);
  // agrupación de escritura continua
  d.undoStack.length = 0;
  let c = pos(d, 0, 10);
  for (const ch of '!!!') c = d.tx('Escribir', () => O.insertText(d, O.caret(c), ch), { merge: 'type' });
  check('agrupa escritura', d.undoStack.length, 1);
  d.undo();
  check('undo agrupado', texts(d), ['Hola mundo']);
}

// ------------------------------------------------------------------ dividir y unir párrafos
{
  const d = mk(['abcdef']);
  const p = d.tx('Intro', () => O.split(d, pos(d, 0, 3)));
  check('split', texts(d), ['abc', 'def']);
  check('caret tras split', p.off, 0);
  const q = d.tx('Retroceso', () => O.backspaceAtStart(d, pos(d, 1, 0)));
  check('join', texts(d), ['abcdef']);
  check('caret tras join', q.off, 3);
  d.undo(); d.undo();
  check('undo split+join', texts(d), ['abcdef']);
  // título seguido de párrafo normal al pulsar Intro al final
  const h = mk(['Capítulo']);
  h.tx('Estilo', () => O.applyStyle(h, [pid(h, 0)], 'h1'));
  h.tx('Intro', () => O.split(h, { id: pid(h, 0), off: 8 }));
  check('estilo siguiente', [h.block(pid(h, 0)).st, h.block(pid(h, 1)).st || 'normal'], ['h1', 'normal']);
}

// ------------------------------------------------------------------ borrar rangos
{
  const d = mk(['uno', 'dos', 'tres', 'cuatro']);
  d.tx('Borrar', () => O.deleteRange(d, pos(d, 0, 2), pos(d, 2, 2)));
  check('borrar entre párrafos', texts(d), ['unes', 'cuatro']);
  d.undo();
  check('undo borrar', texts(d), ['uno', 'dos', 'tres', 'cuatro']);
  // con una tabla en medio
  const t = mk(['antes', 'después']);
  const tbl = PT.blocks.table(2, 2, 400);
  t.tx('Tabla', () => t.replace('body', 1, 0, [tbl]));
  const cellP = (r, c) => t.block(tbl.id).rows[r].cells[c].blocks[0];
  t.tx('x', () => { O.insertText(t, O.caret({ id: cellP(0, 0).id, off: 0 }), 'A1'); O.insertText(t, O.caret({ id: cellP(1, 1).id, off: 0 }), 'B2'); });
  check('párrafos con tabla', texts(t), ['antes', 'A1', '', '', 'B2', 'después']);
  t.tx('Borrar', () => O.deleteRange(t, { id: pid(t, 0), off: 2 }, { id: pid(t, 5), off: 3 }));
  check('borrar tabla completa', texts(t), ['anpués']);
  t.undo();
  check('undo tabla', texts(t), ['antes', 'A1', '', '', 'B2', 'después']);
  // desde fuera hasta dentro de la tabla: la tabla se conserva
  t.tx('Borrar', () => O.deleteRange(t, { id: pid(t, 0), off: 2 }, { id: cellP(1, 1).id, off: 1 }));
  check('borrar hasta dentro de tabla', texts(t), ['an', '', '', '', '2', 'después']);
  t.undo();
  // entre dos celdas
  t.tx('Borrar', () => O.deleteRange(t, { id: cellP(0, 0).id, off: 1 }, { id: cellP(1, 1).id, off: 1 }));
  check('borrar entre celdas', texts(t), ['antes', 'A', '', '', '2', 'después']);
}

// ------------------------------------------------------------------ marcas
{
  const d = mk(['negrita parcial']);
  d.tx('N', () => O.toggleMark(d, pos(d, 0, 0), pos(d, 0, 7), 'b'));
  const r0 = d.block(pid(d, 0)).runs;
  check('toggle on', r0.map((r) => [r.x, !!r.m.b]), [['negrita', true], [' parcial', false]]);
  d.tx('N', () => O.toggleMark(d, pos(d, 0, 0), pos(d, 0, 15), 'b'));
  ok('toggle mixto pone todo', d.block(pid(d, 0)).runs.every((r) => r.m.b));
  d.tx('N', () => O.toggleMark(d, pos(d, 0, 0), pos(d, 0, 15), 'b'));
  ok('toggle quita', d.block(pid(d, 0)).runs.every((r) => !r.m.b));
  // estilo con cursiva: quitarla deja false explícito
  const q = mk(['cita']);
  q.tx('E', () => O.applyStyle(q, [pid(q, 0)], 'quote'));
  q.tx('K', () => O.toggleMark(q, pos(q, 0, 0), pos(q, 0, 4), 'i'));
  check('anula estilo', q.block(pid(q, 0)).runs[0].m.i, false);
  // escribir dentro y al final de un vínculo
  const l = mk(['ir aquí ya']);
  l.tx('V', () => O.setMarks(l, pos(l, 0, 3), pos(l, 0, 7), (m) => M.with(m, { ln: 'https://ejemplo.com' })));
  check('dentro del vínculo', O.typingMarks(l, pos(l, 0, 5)).ln, 'https://ejemplo.com');
  check('al final del vínculo', O.typingMarks(l, pos(l, 0, 7)).ln, undefined);
  const info = O.marksInfo(l, { a: pos(l, 0, 0), h: pos(l, 0, 10) });
  check('marksInfo mezclado', info.ln, null);
}

// ------------------------------------------------------------------ listas
{
  const d = mk(['a', 'b', 'c', 'd']);
  d.tx('L', () => O.toggleList(d, [pid(d, 0), pid(d, 1)], 'decimal'));
  d.tx('L', () => O.toggleList(d, [pid(d, 3)], 'decimal'));
  let mk1 = O.listMarkers(d, 'body');
  check('numeración', [mk1.get(pid(d, 0)), mk1.get(pid(d, 1)), mk1.get(pid(d, 3))], ['1.', '2.', '1.']);
  d.tx('L', () => O.continueList(d, pid(d, 3)));
  mk1 = O.listMarkers(d, 'body');
  check('continuar numeración', mk1.get(pid(d, 3)), '3.');
  d.tx('I', () => O.indent(d, [pid(d, 1)], 36));
  mk1 = O.listMarkers(d, 'body');
  check('subnivel', [mk1.get(pid(d, 1)), mk1.get(pid(d, 3))], ['a.', '2.']);
  d.tx('L', () => O.toggleList(d, [pid(d, 0), pid(d, 1)], 'decimal'));
  ok('quitar lista', !d.block(pid(d, 0)).ls && !d.block(pid(d, 1)).ls);
  check('romanos', PT.numFmt(1994, 'uroman'), 'MCMXCIV');
  check('letras', PT.numFmt(28, 'lalpha'), 'ab');
  const e = mk(['x', 'y', 'z']);
  e.tx('L', () => O.toggleList(e, [pid(e, 0), pid(e, 1), pid(e, 2)], 'outline'));
  e.tx('I', () => O.indent(e, [pid(e, 1), pid(e, 2)], 36));
  e.tx('I', () => O.indent(e, [pid(e, 2)], 36));
  const om = O.listMarkers(e, 'body');
  check('esquema', [om.get(pid(e, 0)), om.get(pid(e, 1)), om.get(pid(e, 2))], ['1.', '1.1.', '1.1.1.']);
}

// ------------------------------------------------------------------ tablas
{
  const d = mk(['x']);
  const t = PT.blocks.table(2, 3, 450);
  d.tx('T', () => O.insertBlocks(d, pos(d, 0, 1), [t]));
  check('insertar tabla', d.body.map((b) => b.t), ['p', 'table', 'p']);
  d.tx('F', () => O.tableOp(d, t.id, 'rowBelow', { r1: 0, r2: 0, c1: 0, c2: 0 }));
  check('fila nueva', d.block(t.id).rows.length, 3);
  d.tx('C', () => O.tableOp(d, t.id, 'colRight', { r1: 0, r2: 0, c1: 2, c2: 2 }));
  check('columna nueva', d.block(t.id).cols.length, 4);
  check('ancho total conservado', Math.round(d.block(t.id).cols.reduce((s, x) => s + x, 0)), 450);
  d.tx('M', () => O.tableOp(d, t.id, 'merge', { r1: 0, c1: 0, r2: 1, c2: 1 }));
  const tm = d.block(t.id);
  check('combinar', [O.spanOf(tm, 0, 0), !!tm.rows[0].cells[1].mh, !!tm.rows[1].cells[0].mv], [{ cs: 2, rs: 2 }, true, true]);
  check('maestra de celda cubierta', O.masterOf(tm, 1, 1), { r: 0, c: 0 });
  check('rectángulo ampliado', O.cellRect(tm, 1, 1, 2, 2), { r1: 0, c1: 0, r2: 2, c2: 2 });
  d.tx('D', () => O.tableOp(d, t.id, 'delRow', { r1: 0, r2: 0 }));
  const td = d.block(t.id);
  check('borrar fila maestra', [td.rows.length, !!td.rows[0].cells[0].mv, O.spanOf(td, 0, 0).cs], [2, false, 2]);
  d.undo(); d.undo();
  check('undo combinar', O.spanOf(d.block(t.id), 0, 0), { cs: 1, rs: 1 });
  // ordenar
  const s = mk(['']);
  const ts = PT.blocks.table(4, 1, 200);
  s.tx('T', () => s.replace('body', 0, 0, [ts]));
  const vals = ['Nombre', 'Pera', 'Abeto', 'manzana'];
  s.tx('x', () => vals.forEach((v, r) => O.insertText(s, O.caret({ id: s.block(ts.id).rows[r].cells[0].blocks[0].id, off: 0 }), v)));
  s.tx('H', () => O.tableOp(s, ts.id, 'header'));
  s.tx('S', () => O.tableOp(s, ts.id, 'sort', { col: 0 }));
  check('ordenar tabla', s.block(ts.id).rows.map((r) => R.text(r.cells[0].blocks[0].runs)), ['Nombre', 'Abeto', 'manzana', 'Pera']);
  // Tab: celda siguiente
  const sel = O.nextCell(s, { id: s.block(ts.id).rows[0].cells[0].blocks[0].id, off: 0 }, 1);
  check('celda siguiente', s.paraText(sel.a.id), 'Abeto');
}

// ------------------------------------------------------------------ copiar y pegar
{
  const d = mk(['primero', 'segundo', 'tercero']);
  const sl = O.slice(d, pos(d, 0, 3), pos(d, 2, 3));
  check('slice bloques', sl.blocks.map((b) => R.text(b.runs)), ['mero', 'segundo', 'ter']);
  const e = mk(['[]']);
  const c = e.tx('Pegar', () => O.insertSlice(e, O.caret(pos(e, 0, 1)), sl));
  check('pegar bloques', texts(e), ['[mero', 'segundo', 'ter]']);
  check('cursor tras pegar', [e.paraText(c.id), c.off], ['ter]', 3]);
  const f = mk(['ab']);
  f.tx('Pegar', () => O.insertSlice(f, O.caret(pos(f, 0, 1)), O.slice(d, pos(d, 1, 0), pos(d, 1, 3))));
  check('pegar en línea', texts(f), ['asegb']);
  const g = mk(['texto']);
  g.tx('Pegar', () => O.insertPlain(g, O.caret(pos(g, 0, 5)), ' uno\ndos\ntres'));
  check('pegar texto plano', texts(g), ['texto uno', 'dos', 'tres']);
}

// ------------------------------------------------------------------ control de cambios y comentarios
{
  const d = mk(['texto original']);
  PT.locale.author = 'Ana';
  d.track = true;
  d.tx('Escribir', () => O.insertText(d, O.caret(pos(d, 0, 6)), ' nuevo'));
  d.tx('Borrar', () => O.deleteRange(d, pos(d, 0, 12), pos(d, 0, 20)));
  const ch = O.changes(d);
  check('cambios', ch.map((c) => [c.kind, c.text, c.by]), [['ins', ' nuevo', 'Ana'], ['del', 'original', 'Ana']]);
  d.tx('Borrar', () => O.deleteRange(d, pos(d, 0, 6), pos(d, 0, 9)));
  check('borrar lo propio lo quita', O.changes(d)[0].text, 'evo');
  d.tx('Aceptar', () => O.resolveChanges(d, true));
  d.track = false;
  check('aceptar todo', texts(d), ['texto evo']);
  const e = mk(['comentar esto']);
  const id = e.tx('C', () => O.addComment(e, pos(e, 0, 9), pos(e, 0, 13), 'Revisar'));
  check('comentario', O.commentRanges(e).get(id).text, 'esto');
  e.tx('C', () => O.removeComment(e, id));
  ok('comentario eliminado', !e.comments[id] && e.block(pid(e, 0)).runs.every((r) => !r.m.cm));
}

// ------------------------------------------------------------------ buscar, reemplazar y mayúsculas
{
  const d = mk(['La canción y la Cancion', 'otra canción']);
  check('buscar sin tildes', O.find(d, 'body', 'cancion').length, 3);
  check('buscar con tildes', O.find(d, 'body', 'canción', { accents: true }).length, 2);
  check('palabra completa', O.find(d, 'body', 'la', { whole: true }).length, 2);
  check('regex', O.find(d, 'body', 'c\\w+', { regex: true, matchCase: true }).length, 3);
  const n = d.tx('R', () => O.replaceAll(d, 'body', 'canción', 'tonada', { accents: true }));
  check('reemplazar todo', [n, texts(d)], [2, ['La tonada y la Cancion', 'otra tonada']]);
  const c = mk(['hola MUNDO. adiós']);
  c.tx('M', () => O.changeCase(c, pos(c, 0, 0), pos(c, 0, 17), 'sentence'));
  check('tipo oración', texts(c), ['Hola mundo. Adiós']);
  c.tx('M', () => O.changeCase(c, pos(c, 0, 0), pos(c, 0, 17), 'title'));
  check('tipo título', texts(c), ['Hola Mundo. Adiós']);
}

// ------------------------------------------------------------------ notas, estadísticas y JSON
{
  const d = mk(['Texto con nota']);
  const r = d.tx('N', () => O.insertNote(d, O.caret(pos(d, 0, 5))));
  d.tx('x', () => O.insertText(d, O.caret({ id: r.para, off: 0 }), 'La nota.'));
  check('nota creada', [O.noteNumbers(d).get(r.id), d.paraText(r.para)], [1, 'La nota.']);
  d.undo();
  d.undo();
  ok('undo nota', !d.notes[r.id] && R.atoms(d.block(pid(d, 0)).runs).length === 0);
  const st = O.stats(mk(['Uno dos tres.', 'Cuatro cinco.']), 'body');
  check('estadísticas', [st.words, st.paras, st.sentences], [5, 2, 2]);
  const j = mk(['a', 'b']);
  j.tx('B', () => O.toggleMark(j, pos(j, 0, 0), pos(j, 1, 1), 'b'));
  const back = PT.Doc.fromJSON(JSON.parse(JSON.stringify(j.toJSON())));
  ok('JSON conserva marcas internadas', back.block(back.parasOf('body')[0]).runs[0].m === M.intern({ b: true }));
  check('JSON texto', texts(back), ['a', 'b']);
  let bad = null;
  try { PT.Doc.fromJSON({ nada: 1 }); } catch (e) { bad = e.message; }
  ok('JSON inválido', bad);
}

// ------------------------------------------------------------------ formatos de archivo
(async () => {
  if (PT.docx) {
    const d = mk(['Título del informe', 'Primer párrafo con negrita.', 'Elemento uno', 'Elemento dos']);
    d.tx('E', () => O.applyStyle(d, [pid(d, 0)], 'h1'));
    d.tx('N', () => O.toggleMark(d, pos(d, 1, 19), pos(d, 1, 26), 'b'));
    d.tx('L', () => O.toggleList(d, [pid(d, 2), pid(d, 3)], 'decimal'));
    const t = PT.blocks.table(2, 2, 300);
    d.tx('T', () => O.insertBlocks(d, pos(d, 3, 12), [t]));
    d.tx('x', () => O.insertText(d, O.caret({ id: d.block(t.id).rows[1].cells[1].blocks[0].id, off: 0 }), 'celda'));
    const r = d.tx('N', () => O.insertNote(d, O.caret(pos(d, 1, 5))));
    d.tx('x', () => O.insertText(d, O.caret({ id: r.para, off: 0 }), 'Nota de prueba'));
    d.tx('H', () => d.replace('hdr', 0, 0, [PT.blocks.p('Encabezado')]));
    d.page.orient = 'landscape';
    const blob = await PT.docx.write(d);
    ok('docx genera un zip', blob.size > 1000);
    const back = await PT.docx.read(await blob.arrayBuffer());
    const bt = back.parasOf('body').map((id) => back.paraText(id));
    check('docx: texto', bt.filter(Boolean).slice(0, 4), ['Título del informe', 'Prime' + PT.OBJ + 'r párrafo con negrita.', 'Elemento uno', 'Elemento dos']);
    check('docx: estilo', back.block(back.parasOf('body')[0]).st, 'h1');
    ok('docx: negrita', back.block(back.parasOf('body')[1]).runs.some((x) => x.m.b && x.x === 'negrita'));
    check('docx: lista', O.listMarkers(back, 'body').get(back.parasOf('body')[3]), '2.');
    ok('docx: tabla', back.body.some((b) => b.t === 'table' && b.rows.length === 2));
    check('docx: nota', Object.values(back.notes).map((n) => R.text(n.blocks[0].runs)), ['Nota de prueba']);
    check('docx: encabezado', back.hdr.map((p) => R.text(p.runs)), ['Encabezado']);
    check('docx: orientación', back.page.orient, 'landscape');
  }
  if (PT.convert) {
    const md = '# Título\n\nTexto con **negrita**, *cursiva* y [enlace](https://ejemplo.com).\n\n- uno\n- dos\n  - sub\n\n1. a\n2. b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> cita\n\n---\n\n- [x] hecho\n- [ ] pendiente\n';
    const d = PT.convert.fromMarkdown(md);
    const t = d.parasOf('body').map((id) => d.paraText(id));
    check('md: títulos y texto', t.slice(0, 2), ['Título', 'Texto con negrita, cursiva y enlace.']);
    check('md: estilo', d.block(d.parasOf('body')[0]).st, 'h1');
    ok('md: negrita', d.block(d.parasOf('body')[1]).runs.some((r) => r.m.b && r.x === 'negrita'));
    ok('md: enlace', d.block(d.parasOf('body')[1]).runs.some((r) => r.m.ln === 'https://ejemplo.com'));
    ok('md: tabla', d.body.some((b) => b.t === 'table'));
    ok('md: regla', d.body.some((b) => b.t === 'hr'));
    const out = PT.convert.toMarkdown(d);
    ok('md: ida y vuelta', /^# Título/.test(out) && out.includes('**negrita**') && out.includes('- [x] hecho') && out.includes('| A | B |'));
    check('txt', PT.convert.toText(mk(['a', 'b'])), 'a\nb\n');
    const r = mk(['Hola ñandú', 'Segundo párrafo con € y “comillas”']);
    r.tx('N', () => O.toggleMark(r, pos(r, 0, 0), pos(r, 0, 4), 'b'));
    const rd = PT.convert.fromRTF(PT.convert.toRTF(r));
    check('rtf: ida y vuelta', rd.parasOf('body').map((id) => rd.paraText(id)), ['Hola ñandú', 'Segundo párrafo con € y “comillas”']);
    ok('rtf: negrita', rd.block(rd.parasOf('body')[0]).runs[0].m.b);
  }
  // ---------------------------------------------------------------- autoría, variables, números de línea y comparación
  {
    const d = mk(['Hola mundo']);
    d.tx('Pegar', () => O.setMarks(d, pos(d, 0, 5), pos(d, 0, 10), (m) => M.with(m, { src: 'paste' })));
    check('autoría: marca de pegado', d.block(pid(d, 0)).runs.map((r) => r.m.src || ''), ['', 'paste']);
    check('autoría: lo escrito dentro de lo pegado es propio', O.typingMarks(d, pos(d, 0, 7)).src, undefined);
    const v = mk(['Estimado cliente']);
    v.meta.vars = { Cliente: 'ACME, S. A.' };
    v.tx('Variable', () => O.insertAtom(v, { a: pos(v, 0, 16), h: pos(v, 0, 16) }, { k: 'fld', f: 'var', name: 'Cliente' }));
    v.page.lnNum = { on: true, by: 5, restart: 'page' };
    const back = await PT.docx.read(await (await PT.docx.write(v)).arrayBuffer());
    check('docx: variables del documento', back.meta.vars, { Cliente: 'ACME, S. A.' });
    const atom = back.block(back.parasOf('body')[0]).runs.find((r) => r.o);
    check('docx: campo de variable', atom && { f: atom.o.f, name: atom.o.name }, { f: 'var', name: 'Cliente' });
    check('docx: números de línea', back.page.lnNum, { on: true, by: 5, restart: 'page' });
  }
  if (PT.compare) {
    check('diff de secuencias', PT.compare.diffSeq('abcd'.split(''), 'abxd'.split('')).map((o) => o[0]).join(''), '==-+=');
    const a = mk(['Hola mundo', 'Párrafo igual', 'Este párrafo se borra entero', 'Final']);
    const b = mk(['Hola mundo cruel', 'Párrafo igual', 'Un párrafo nuevo del todo', 'Final']);
    const { doc: c, stats } = PT.compare.docs(a, b, { author: 'Prueba' });
    const ps = c.parasOf('body').map((id) => c.block(id));
    check('comparar: textos', ps.map((p) => R.text(p.runs)), ['Hola mundo cruel', 'Párrafo igual', 'Este párrafo se borra entero', 'Un párrafo nuevo del todo', 'Final']);
    check('comparar: inserción dentro del párrafo', ps[0].runs.map((r) => [r.x, r.m.ins ? 'ins' : '']), [['Hola mundo', ''], [' cruel', 'ins']]);
    ok('comparar: párrafo eliminado', ps[2].runs.every((r) => r.m.del && r.m.del.startsWith('Prueba|')));
    ok('comparar: párrafo insertado', ps[3].runs.every((r) => r.m.ins));
    ok('comparar: sin cambios en lo igual', ps[1].runs.every((r) => !r.m.ins && !r.m.del) && ps[4].runs.every((r) => !r.m.ins && !r.m.del));
    check('comparar: recuento', [stats.ins, stats.del], [1 + 5, 5]);
    check('comparar: cambios reconocidos', O.changes(c).length > 0, true);
    // una tabla igual no se marca aunque se borre un párrafo junto a un párrafo vacío
    const t1 = mk(['Título', 'MAYÚSCULAS', '']), t2 = mk(['Título', '', '']);
    const tbl = PT.blocks.table(2, 2, 200);
    t1.body.splice(2, 0, PT.cloneBlock(tbl)); t2.body.splice(2, 0, PT.cloneBlock(tbl)); t1._idx = null; t2._idx = null;
    t2.body[3] = PT.blocks.p('Conclusión'); t2._idx = null;
    const r2 = PT.compare.docs(t1, t2).doc;
    ok('comparar: la tabla igual queda sin cambios', r2.body.filter((b) => b.t === 'table').length === 1);
  }
  console.log(`${pass} pruebas correctas, ${fail} fallos`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exitCode = 1; });
