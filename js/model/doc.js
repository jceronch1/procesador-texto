/* Modelo del documento: marcas de carácter, tramos de texto, párrafos, tablas, estilos, listas,
   historias (cuerpo, encabezados, pies, notas), índice de posiciones, pasos reversibles,
   transacciones y deshacer/rehacer. No depende del DOM: se carga también en Node para las pruebas. */
(function (root) {
  'use strict';
  const PT = root.PT;
  const OBJ = PT.OBJ;
  const nowIso = () => new Date().toISOString();

  // ---------------------------------------------------------------- marcas (objetos inmutables compartidos)
  // b negrita · i cursiva · u subrayado (true|'double'|'dotted'|'dashed'|'wavy') · s tachado · sup/sub
  // ff fuente · fs tamaño (pt) · fc color · hl resaltado · caps mayúsculas · sc versalitas · sp espaciado (pt)
  // ln vínculo · cm comentarios ("id1 id2") · ins/del control de cambios ("autor|fecha")
  // src autoría del texto: 'paste' (pegado de fuera) o 'ai' (escrito por el asistente); sin marca, escrito a mano
  const MARK_KEYS = ['b', 'i', 'u', 's', 'sup', 'sub', 'ff', 'fs', 'fc', 'hl', 'caps', 'sc', 'sp', 'ln', 'cm', 'ins', 'del', 'src'];
  // en estas claves false significa "desactivado explícitamente" (anula el estilo del párrafo)
  const BOOL_KEYS = new Set(['b', 'i', 'u', 's', 'caps', 'sc']);
  const EMPTY = Object.freeze({});
  const markCache = new Map([['{}', EMPTY]]);
  function intern(obj) {
    if (!obj || obj === EMPTY) return EMPTY;
    const clean = {};
    let n = 0;
    for (const k of MARK_KEYS) {
      const v = obj[k];
      if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) continue;
      if (v === false && !BOOL_KEYS.has(k)) continue;
      clean[k] = v; n++;
    }
    if (!n) return EMPTY;
    if (clean.sup && clean.sub) delete clean.sub;
    const key = JSON.stringify(clean);
    let m = markCache.get(key);
    if (!m) { m = Object.freeze(clean); markCache.set(key, m); }
    return m;
  }
  PT.marks = {
    EMPTY, KEYS: MARK_KEYS, BOOL_KEYS, intern,
    with: (m, patch) => intern(Object.assign({}, m, patch)),
    without: (m, keys) => { const o = Object.assign({}, m); for (const k of keys) delete o[k]; return intern(o); },
    // marcas que no se heredan al escribir junto a ellas
    TRANSIENT: ['ln', 'cm', 'ins', 'del', 'src'],
    hasId: (list, id) => !!list && (' ' + list + ' ').indexOf(' ' + id + ' ') >= 0,
    addId: (list, id) => (PT.marks.hasId(list, id) ? list : (list ? list + ' ' : '') + id),
    removeId: (list, id) => (list || '').split(' ').filter((x) => x && x !== id).join(' ') || null,
  };

  // ---------------------------------------------------------------- tramos: {x: texto, m} o {o: objeto, m}
  const rlen = (r) => (r.o ? 1 : r.x.length);
  const R = (PT.runs = {
    rlen,
    len(runs) { let n = 0; for (const r of runs) n += r.o ? 1 : r.x.length; return n; },
    text(runs) { let s = ''; for (const r of runs) s += r.o ? OBJ : r.x; return s; },
    normalize(runs) {
      const out = [];
      for (const r of runs) {
        if (!r.o && !r.x) continue;
        const last = out[out.length - 1];
        if (last && !last.o && !r.o && last.m === r.m) out[out.length - 1] = { x: last.x + r.x, m: r.m };
        else out.push(r);
      }
      return out;
    },
    slice(runs, from, to) {
      const out = [];
      let pos = 0;
      if (to == null) to = Infinity;
      for (const r of runs) {
        const l = rlen(r), s = pos, e = pos + l;
        pos = e;
        if (e <= from) continue;
        if (s >= to) break;
        if (r.o) { out.push(r); continue; }
        const a = Math.max(from, s) - s, b = Math.min(to, e) - s;
        out.push(a === 0 && b === l ? r : { x: r.x.slice(a, b), m: r.m });
      }
      return out;
    },
    splice(runs, from, to, ins) { return R.normalize(R.slice(runs, 0, from).concat(ins || [], R.slice(runs, to))); },
    mapMarks(runs, from, to, fn) {
      const mid = R.slice(runs, from, to).map((r) => {
        const m = intern(fn(r.m, r));
        return m === r.m ? r : r.o ? { o: r.o, m } : { x: r.x, m };
      });
      return R.normalize(R.slice(runs, 0, from).concat(mid, R.slice(runs, to)));
    },
    // tramo que contiene el carácter en la posición off
    at(runs, off) {
      let pos = 0;
      for (const r of runs) { const l = rlen(r); if (off < pos + l) return { run: r, start: pos }; pos += l; }
      return null;
    },
    marksAt(runs, off) { const a = R.at(runs, off); return a ? a.run.m : null; },
    each(runs, from, to, cb) {
      let pos = 0;
      for (const r of runs) {
        const l = rlen(r), s = pos, e = pos + l;
        pos = e;
        if (e <= from) continue;
        if (s >= to) break;
        cb(r, Math.max(s, from), Math.min(e, to), s);
      }
    },
    atoms(runs) { const out = []; let pos = 0; for (const r of runs) { if (r.o) out.push({ o: r.o, off: pos, m: r.m }); pos += rlen(r); } return out; },
    fromText(text, m) { return text ? [{ x: String(text), m: m || EMPTY }] : []; },
  });

  // ---------------------------------------------------------------- párrafos y bloques
  // Propiedades de párrafo: st estilo · al alineación (left|center|right|justify) · inL/inR/inF sangrías (pt; inF<0 = francesa)
  // spB/spA espacio antes/después · lh interlineado múltiple · lhx interlineado exacto (pt) · ls lista {id, l}
  // ck casilla marcada · pb salto de página antes · kn conservar con el siguiente · kl conservar líneas juntas
  // bg sombreado · bdr bordes {t,b,l,r: 'ancho estilo color'} · dc letra capital · rtl
  // pm formato de la marca de párrafo (marcas que se aplican al escribir en un párrafo vacío)
  PT.P_KEYS = ['st', 'al', 'inL', 'inR', 'inF', 'spB', 'spA', 'lh', 'lhx', 'ls', 'ck', 'pb', 'kn', 'kl', 'bg', 'bdr', 'dc', 'rtl', 'pm'];
  PT.para = {
    make(props, runs) {
      const p = { t: 'p', id: PT.uid('p') };
      if (props) for (const k of PT.P_KEYS) if (props[k] != null && props[k] !== false) p[k] = props[k];
      p.runs = runs || [];
      return p;
    },
    // copia con cambios (mismo id); null/false/undefined quitan la propiedad
    with(p, patch) {
      const q = { t: 'p', id: p.id };
      for (const k of PT.P_KEYS) {
        const v = patch && k in patch ? patch[k] : p[k];
        if (v != null && v !== false) q[k] = v;
      }
      q.runs = patch && patch.runs ? patch.runs : p.runs;
      return q;
    },
    props(p) { const o = {}; for (const k of PT.P_KEYS) if (p[k] != null) o[k] = p[k]; return o; },
    len: (p) => R.len(p.runs),
    text: (p) => R.text(p.runs),
  };
  PT.blocks = {
    p: (text, props, m) => PT.para.make(props, R.fromText(text, m)),
    hr: () => ({ t: 'hr', id: PT.uid('r') }),
    toc: (lv) => ({ t: 'toc', id: PT.uid('c'), lv: lv || 3, title: 'Índice' }),
    cell: (blocks) => ({ id: PT.uid('d'), blocks: blocks || [PT.para.make()] }),
    // tabla de rows x cols que ocupa width (pt)
    table(rows, cols, width, opts) {
      opts = opts || {};
      const w = Math.floor((width / cols) * 10) / 10;
      const t = { t: 'table', id: PT.uid('t'), cols: Array.from({ length: cols }, () => w), bd: opts.bd === undefined ? '0.5 solid #000000' : opts.bd, rows: [] };
      for (let r = 0; r < rows; r++) {
        const row = { id: PT.uid('w'), cells: [] };
        if (r === 0 && opts.header) row.hd = true;
        for (let c = 0; c < cols; c++) row.cells.push(PT.blocks.cell([PT.para.make(opts.cellProps)]));
        t.rows.push(row);
      }
      return t;
    },
  };
  // copia profunda de una tabla con ids nuevos (para pegar o duplicar)
  PT.cloneBlock = function (b, keepIds) {
    const c = PT.clone(b);
    if (keepIds) return reintern(c);
    const fresh = (x) => {
      if (x.t === 'p') x.id = PT.uid('p');
      else if (x.t === 'table') { x.id = PT.uid('t'); for (const row of x.rows) { row.id = PT.uid('w'); for (const cell of row.cells) { cell.id = PT.uid('d'); cell.blocks.forEach(fresh); } } }
      else x.id = PT.uid('b');
    };
    fresh(c);
    return reintern(c);
  };
  function reintern(b) {
    if (b.t === 'p') b.runs = R.normalize((b.runs || []).map((r) => (r.o ? { o: r.o, m: intern(r.m) } : { x: String(r.x == null ? '' : r.x), m: intern(r.m) })));
    else if (b.t === 'table') for (const row of b.rows) for (const cell of row.cells) cell.blocks.forEach(reintern);
    return b;
  }
  PT.reintern = reintern;

  // ---------------------------------------------------------------- estilos con nombre
  PT.DEFAULT_STYLES = () => ({
    normal: { name: 'Normal', p: { spA: 8, lh: 1.15 }, r: { ff: 'Calibri', fs: 11 } },
    nospace: { name: 'Sin espaciado', base: 'normal', p: { spA: 0, lh: 1 } },
    title: { name: 'Título', base: 'normal', next: 'normal', lvl: 0, p: { spA: 6, lh: 1, kn: true }, r: { ff: 'Calibri Light', fs: 28 } },
    subtitle: { name: 'Subtítulo', base: 'normal', next: 'normal', p: { spA: 10 }, r: { fs: 14, fc: '#5a5a5a', sp: 0.5 } },
    h1: { name: 'Título 1', base: 'normal', next: 'normal', lvl: 1, p: { spB: 16, spA: 6, lh: 1.08, kn: true, kl: true }, r: { ff: 'Calibri Light', fs: 16, fc: '#2f5496' } },
    h2: { name: 'Título 2', base: 'normal', next: 'normal', lvl: 2, p: { spB: 12, spA: 4, lh: 1.08, kn: true, kl: true }, r: { ff: 'Calibri Light', fs: 13, fc: '#2f5496' } },
    h3: { name: 'Título 3', base: 'normal', next: 'normal', lvl: 3, p: { spB: 10, spA: 4, lh: 1.08, kn: true, kl: true }, r: { ff: 'Calibri Light', fs: 12, fc: '#1f3763' } },
    h4: { name: 'Título 4', base: 'normal', next: 'normal', lvl: 4, p: { spB: 8, spA: 2, kn: true, kl: true }, r: { i: true, fc: '#2f5496' } },
    h5: { name: 'Título 5', base: 'normal', next: 'normal', lvl: 5, p: { spB: 8, spA: 2, kn: true, kl: true }, r: { fc: '#2f5496' } },
    h6: { name: 'Título 6', base: 'normal', next: 'normal', lvl: 6, p: { spB: 8, spA: 2, kn: true, kl: true }, r: { i: true, fc: '#1f3763' } },
    quote: { name: 'Cita', base: 'normal', next: 'normal', p: { spB: 10, spA: 10, inL: 43, inR: 43, al: 'center' }, r: { i: true, fc: '#404040' } },
    code: { name: 'Código', base: 'normal', p: { spA: 0, lh: 1, bg: '#f2f3f5' }, r: { ff: 'Consolas', fs: 10 } },
    caption: { name: 'Descripción', base: 'normal', next: 'normal', p: { spA: 10, lh: 1 }, r: { i: true, fs: 9, fc: '#44546a' } },
    fnote: { name: 'Texto de nota al pie', base: 'normal', p: { spA: 0, lh: 1 }, r: { fs: 10 } },
    hf: { name: 'Encabezado y pie', base: 'normal', p: { spA: 0, lh: 1 } },
  });
  PT.STYLE_ORDER = ['normal', 'nospace', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code', 'caption'];

  // ---------------------------------------------------------------- listas
  PT.LIST_KINDS = {
    bullet: 'Viñetas (• ◦ ▪)', dash: 'Guiones (–)', arrow: 'Flechas (➢)', square: 'Cuadrados (■)', diamond: 'Rombos (◆)', star: 'Estrellas (★)',
    check: 'Lista de verificación', decimal: 'Números (1. a. i.)', paren: 'Números (1) a) i))', lalpha: 'Letras (a. b. c.)', ualpha: 'Letras (A. B. C.)',
    lroman: 'Romanos (i. ii. iii.)', uroman: 'Romanos (I. II. III.)', outline: 'Esquema (1. 1.1. 1.1.1.)',
  };
  const BULLETS = { bullet: ['•', '◦', '▪'], dash: ['–', '–', '–'], arrow: ['➢', '➢', '➢'], square: ['■', '□', '▪'], diamond: ['◆', '◇', '▪'], star: ['★', '☆', '▪'] };
  PT.isBulletKind = (k) => k in BULLETS || k === 'check';
  const toAlpha = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(97 + m) + s; n = Math.floor((n - 1) / 26); } return s || 'a'; };
  const toRoman = (n) => {
    if (n <= 0 || n >= 4000) return String(n);
    const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
    return s;
  };
  PT.numFmt = function (n, fmt) {
    switch (fmt) {
      case 'lalpha': return toAlpha(n);
      case 'ualpha': return toAlpha(n).toUpperCase();
      case 'lroman': return toRoman(n);
      case 'uroman': return toRoman(n).toUpperCase();
      default: return String(n);
    }
  };
  const CYCLE = ['decimal', 'lalpha', 'lroman'];
  // formato de un nivel: {bullet} o {fmt, suffix}
  PT.listLevel = function (kind, lvl) {
    if (BULLETS[kind]) return { bullet: BULLETS[kind][lvl % 3] };
    if (kind === 'check') return { check: true };
    if (kind === 'outline') return { fmt: 'decimal', outline: true, suffix: '.' };
    if (kind === 'paren') return { fmt: CYCLE[lvl % 3], suffix: ')' };
    if (lvl === 0 && kind !== 'decimal') return { fmt: kind, suffix: '.' };
    const base = CYCLE.indexOf(kind === 'decimal' ? 'decimal' : kind);
    return { fmt: CYCLE[(Math.max(0, base) + lvl) % 3], suffix: '.' };
  };
  PT.LIST_INDENT = 36; // sangría por nivel (pt)
  PT.LIST_HANG = 18; // sangría francesa de la viñeta (pt)

  // ---------------------------------------------------------------- página
  PT.defaultPage = () => ({
    size: 'A4', w: 595.3, h: 841.9, orient: 'portrait',
    mt: PT.round(PT.cm2pt(2.5), 1), mb: PT.round(PT.cm2pt(2.5), 1), ml: PT.round(PT.cm2pt(3), 1), mr: PT.round(PT.cm2pt(3), 1),
    hd: PT.round(PT.cm2pt(1.25), 1), fd: PT.round(PT.cm2pt(1.25), 1),
    first: false, color: null, wm: null, start: 1, lnum: false,
  });
  PT.pageDims = function (pg) {
    const land = pg.orient === 'landscape';
    const W = land ? Math.max(pg.w, pg.h) : Math.min(pg.w, pg.h), H = land ? Math.min(pg.w, pg.h) : Math.max(pg.w, pg.h);
    const cw = Math.max(72, W - pg.ml - pg.mr), ch = Math.max(72, H - pg.mt - pg.mb);
    return { W, H, mt: pg.mt, mb: pg.mb, ml: pg.ml, mr: pg.mr, hd: pg.hd, fd: pg.fd, cw, ch };
  };

  // ---------------------------------------------------------------- utilidades de rutas (pasos 'set')
  function getPath(o, path) { for (const k of path) { if (o == null) return undefined; o = o[k]; } return o; }
  function setPath(o, path, v) {
    for (let i = 0; i < path.length - 1; i++) { if (o[path[i]] == null || typeof o[path[i]] !== 'object') o[path[i]] = {}; o = o[path[i]]; }
    const k = path[path.length - 1];
    if (v === undefined) delete o[k]; else o[k] = v;
  }
  const ROOT_STORIES = ['body', 'hdr', 'ftr', 'hdr1', 'ftr1'];
  const structural = (s) => s.del.length !== s.ins.length || s.del.some((b, i) => b.id !== s.ins[i].id || b.t !== 'p' || s.ins[i].t !== 'p');
  const invert = (s) => (s.k === 'rep' ? { k: 'rep', o: s.o, at: s.at, del: s.ins, ins: s.del } : { k: 'set', p: s.p, v: s.old, old: s.v });

  // ---------------------------------------------------------------- documento
  class Doc {
    constructor() {
      const now = nowIso();
      this.meta = { title: 'Documento sin título', author: '', subject: '', keywords: '', created: now, modified: now, lang: 'es-ES' };
      this.page = PT.defaultPage();
      this.styles = PT.DEFAULT_STYLES();
      for (const k in this.styles) this.styles[k].builtin = true;
      this.lists = {};
      this.body = [PT.para.make()];
      this.hdr = []; this.ftr = []; this.hdr1 = []; this.ftr1 = [];
      this.notes = {}; this.comments = {};
      this.track = false;
      this.undoStack = []; this.redoStack = []; this._tx = null; this._replay = false; this._ev = {};
      this._idx = null; this._styleCache = null; this.modified = false; this.selGetter = null;
    }
    static blank() { return new Doc(); }
    on(evt, fn) { (this._ev[evt] || (this._ev[evt] = [])).push(fn); }
    off(evt, fn) { const l = this._ev[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
    emit(evt, data) { const l = this._ev[evt]; if (l) for (const fn of l.slice()) fn(data); }

    // ------------------------------------------------------------ historias y listas de bloques
    stories() { return ROOT_STORIES.concat(Object.keys(this.notes).map((id) => 'fn:' + id)); }
    storyList(story) {
      if (ROOT_STORIES.includes(story)) return this[story];
      if (story && story.startsWith('fn:')) { const n = this.notes[story.slice(3)]; return n ? n.blocks : null; }
      return null;
    }
    list(owner) {
      const s = this.storyList(owner);
      if (s) return s;
      const c = this.index().cells.get(owner);
      return c ? c.cell.blocks : null;
    }
    index() { return this._idx || (this._idx = this._buildIndex()); }
    _buildIndex() {
      const loc = new Map(), cells = new Map(), flat = {}, ord = new Map();
      for (const story of this.stories()) {
        const ids = (flat[story] = []);
        const walk = (owner, list, depth, cellId) => {
          if (!list) return;
          list.forEach((b, i) => {
            loc.set(b.id, { owner, i, story, depth, cell: cellId || null });
            if (b.t === 'p') { ord.set(b.id, ids.length); ids.push(b.id); }
            else if (b.t === 'table') b.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
              cells.set(cell.id, { cell, tbl: b, r, c, story, owner, i, depth });
              if (!cell.mh && !cell.mv) walk(cell.id, cell.blocks, depth + 1, cell.id);
            }));
          });
        };
        walk(story, this.storyList(story), 0, null);
      }
      return { loc, cells, flat, ord };
    }
    loc(id) { return this.index().loc.get(id) || null; }
    block(id) { const l = this.loc(id); if (!l) return null; const L = this.list(l.owner); return L ? L[l.i] || null : null; }
    cellInfo(cellId) { return this.index().cells.get(cellId) || null; }
    // celda (y tabla) que contiene el párrafo
    cellOf(id) { const l = this.loc(id); return l && l.cell ? this.cellInfo(l.cell) : null; }
    parasOf(story) { return this.index().flat[story] || []; }
    storyOf(id) { const l = this.loc(id); return l ? l.story : null; }
    ord(id) { const v = this.index().ord.get(id); return v == null ? -1 : v; }
    cmp(a, b) { if (a.id === b.id) return a.off - b.off; return this.ord(a.id) - this.ord(b.id); }
    startPos(story) { const ids = this.parasOf(story); return ids.length ? { id: ids[0], off: 0 } : null; }
    endPos(story) { const ids = this.parasOf(story); if (!ids.length) return null; const id = ids[ids.length - 1]; return { id, off: PT.para.len(this.block(id)) }; }
    nextPara(id, d) { const l = this.loc(id); if (!l) return null; const ids = this.parasOf(l.story), n = this.ord(id) + d; return n >= 0 && n < ids.length ? this.block(ids[n]) : null; }

    // ------------------------------------------------------------ estilos resueltos (herencia por 'base')
    style(id) {
      if (!this._styleCache) this._styleCache = new Map();
      let s = this._styleCache.get(id);
      if (s) return s;
      const chain = [];
      let cur = this.styles[id] ? id : 'normal';
      const seen = new Set();
      while (cur && this.styles[cur] && !seen.has(cur)) { seen.add(cur); chain.unshift(this.styles[cur]); cur = this.styles[cur].base; }
      const p = {}, r = {};
      for (const st of chain) { Object.assign(p, st.p || {}); Object.assign(r, st.r || {}); }
      const own = this.styles[id] || this.styles.normal || {};
      s = { id: this.styles[id] ? id : 'normal', name: own.name || id, p, r, lvl: own.lvl, next: own.next };
      this._styleCache.set(id, s);
      return s;
    }
    styleOfPara(p) { return this.style(p.st || 'normal'); }
    // propiedades efectivas de un párrafo (estilo + formato directo)
    paraProps(p) { const s = this.styleOfPara(p); const o = Object.assign({}, s.p); for (const k of PT.P_KEYS) if (p[k] != null && k !== 'st') o[k] = p[k]; return o; }
    // marcas efectivas de un tramo (estilo del párrafo + formato directo)
    runProps(p, m) { const s = this.styleOfPara(p); return Object.assign({}, s.r, m); }
    headingLevel(p) { const lv = this.style(p.st || 'normal').lvl; return lv >= 1 && lv <= 6 ? lv : 0; }

    // ------------------------------------------------------------ pasos
    step(s) {
      this._applyStep(s);
      if (this._tx && !this._replay) this._tx.steps.push(s);
    }
    _applyStep(s) {
      if (s.k === 'rep') {
        const L = this.list(s.o);
        if (!L) throw new Error('Lista de bloques desconocida: ' + s.o);
        L.splice(s.at, s.del.length, ...s.ins);
        if (structural(s)) this._idx = null;
      } else {
        setPath(this, s.p, PT.clone(s.v));
        if (ROOT_STORIES.includes(s.p[0]) || s.p[0] === 'notes') this._idx = null;
        if (s.p[0] === 'styles') this._styleCache = null;
      }
    }
    // reemplaza count bloques desde at en la lista owner
    replace(owner, at, count, ins) {
      const L = this.list(owner);
      this.step({ k: 'rep', o: owner, at, del: L.slice(at, at + count), ins: ins || [] });
    }
    // sustituye un bloque por su nueva versión (mismo id)
    put(b) {
      const l = this.loc(b.id);
      if (!l) throw new Error('Bloque inexistente: ' + b.id);
      const L = this.list(l.owner);
      if (L[l.i] === b) return;
      this.step({ k: 'rep', o: l.owner, at: l.i, del: [L[l.i]], ins: [b] });
    }
    set(path, value) {
      if (typeof path === 'string') path = path.split('.');
      const old = getPath(this, path);
      if (JSON.stringify(old) === JSON.stringify(value)) return;
      this.step({ k: 'set', p: path, v: PT.clone(value), old: PT.clone(old) });
    }
    get(path) { return getPath(this, typeof path === 'string' ? path.split('.') : path); }

    // ------------------------------------------------------------ transacciones y deshacer
    begin(label, opts) {
      if (this._tx) { this._tx.depth++; return; }
      this._tx = { label: label || '', steps: [], depth: 1, story: opts && opts.story, merge: opts && opts.merge, selBefore: this.selGetter ? this.selGetter() : null, time: Date.now() };
    }
    commit() {
      const tx = this._tx;
      if (!tx || --tx.depth > 0) return null;
      this._tx = null;
      if (!tx.steps.length) return null;
      tx.selAfter = this.selGetter ? this.selGetter() : null;
      this.modified = true;
      const last = this.undoStack[this.undoStack.length - 1];
      if (tx.merge && last && !last.sealed && last.merge === tx.merge && tx.time - last.time < 2500 && this._mergeable(last, tx)) {
        last.steps[0] = { k: 'rep', o: last.steps[0].o, at: last.steps[0].at, del: last.steps[0].del, ins: tx.steps[0].ins };
        last.selAfter = tx.selAfter; last.time = tx.time;
      } else {
        this.undoStack.push(tx);
        if (this.undoStack.length > 300) this.undoStack.shift();
      }
      this.redoStack.length = 0;
      this.emit('change', tx);
      return tx;
    }
    _mergeable(a, b) {
      if (a.steps.length !== 1 || b.steps.length !== 1) return false;
      const x = a.steps[0], y = b.steps[0];
      return x.k === 'rep' && y.k === 'rep' && x.o === y.o && x.at === y.at && x.del.length === 1 && x.ins.length === 1 && y.del.length === 1 && y.ins.length === 1 && x.ins[0].id === y.ins[0].id && y.del[0] === x.ins[0];
    }
    // revierte la transacción en curso (cuando una operación falla a medias)
    abort() {
      const tx = this._tx;
      if (!tx) return;
      this._tx = null;
      this._replay = true;
      try { for (let i = tx.steps.length - 1; i >= 0; i--) this._applyStep(invert(tx.steps[i])); } finally { this._replay = false; }
      if (tx.steps.length) this.emit('change', Object.assign({}, tx, { aborted: true }));
    }
    seal() { const last = this.undoStack[this.undoStack.length - 1]; if (last) last.sealed = true; }
    undo() {
      const tx = this.undoStack.pop();
      if (!tx) return null;
      this._replay = true;
      try { for (let i = tx.steps.length - 1; i >= 0; i--) this._applyStep(invert(tx.steps[i])); } finally { this._replay = false; }
      tx.sealed = true;
      this.redoStack.push(tx);
      this.modified = true;
      this.emit('change', Object.assign({}, tx, { undo: true }));
      return tx;
    }
    redo() {
      const tx = this.redoStack.pop();
      if (!tx) return null;
      this._replay = true;
      try { for (const s of tx.steps) this._applyStep(s); } finally { this._replay = false; }
      this.undoStack.push(tx);
      this.modified = true;
      this.emit('change', Object.assign({}, tx, { redo: true }));
      return tx;
    }
    // ejecuta fn dentro de una transacción; si falla, la deshace
    tx(label, fn, opts) {
      this.begin(label, opts);
      try { const r = fn(); this.commit(); return r; } catch (e) { if (this._tx && this._tx.depth > 1) { this._tx.depth--; throw e; } this.abort(); throw e; }
    }

    // ------------------------------------------------------------ texto
    paraText(id) { const p = this.block(id); return p && p.t === 'p' ? R.text(p.runs) : ''; }
    plainText(story, opts) {
      const out = [];
      const walk = (list, depth) => {
        for (const b of list || []) {
          if (b.t === 'p') {
            let t = '';
            for (const r of b.runs) {
              if (r.m.del && !(opts && opts.withDeleted)) continue;
              t += r.o ? (opts && opts.atoms ? opts.atoms(r.o) : '') : r.x;
            }
            out.push(t);
          } else if (b.t === 'table') for (const row of b.rows) { const cells = []; for (const c of row.cells) if (!c.mh && !c.mv) { const sub = []; const keep = out.length; walk(c.blocks, depth + 1); sub.push(...out.splice(keep)); cells.push(sub.join(' ')); } out.push(cells.join('\t')); }
        }
      };
      walk(this.storyList(story || 'body'), 0);
      return out.join('\n');
    }

    // ------------------------------------------------------------ serialización
    toJSON() {
      const blocks = (list) => (list || []).map(blockJSON);
      const notes = {};
      for (const id in this.notes) notes[id] = { blocks: blocks(this.notes[id].blocks) };
      return {
        app: 'procesador-texto', v: 1,
        meta: PT.clone(this.meta), page: PT.clone(this.page), styles: PT.clone(this.styles), lists: PT.clone(this.lists),
        body: blocks(this.body), hdr: blocks(this.hdr), ftr: blocks(this.ftr), hdr1: blocks(this.hdr1), ftr1: blocks(this.ftr1),
        notes, comments: PT.clone(this.comments), track: !!this.track,
      };
    }
    static fromJSON(o) {
      if (!o || typeof o !== 'object' || !Array.isArray(o.body)) throw new Error('El archivo no contiene un documento válido.');
      const d = new Doc();
      const seen = new Set();
      if (o.meta) Object.assign(d.meta, o.meta);
      if (o.page) Object.assign(d.page, o.page);
      if (o.styles && typeof o.styles === 'object') {
        const def = PT.DEFAULT_STYLES();
        d.styles = Object.assign({}, def, o.styles);
        for (const k in def) if (o.styles[k]) d.styles[k] = Object.assign({}, o.styles[k], { builtin: true }); else d.styles[k].builtin = true;
      }
      if (o.lists) d.lists = PT.clone(o.lists);
      for (const s of ROOT_STORIES) d[s] = cleanBlocks(o[s], seen, s === 'body');
      d.notes = {};
      for (const id in o.notes || {}) d.notes[id] = { blocks: cleanBlocks((o.notes[id] || {}).blocks, seen, true) };
      d.comments = PT.clone(o.comments || {});
      d.track = !!o.track;
      return d;
    }
  }
  PT.Doc = Doc;
  PT.invertStep = invert;

  function blockJSON(b) {
    if (b.t === 'p') {
      const o = Object.assign({}, b);
      o.runs = b.runs.map((r) => {
        const x = r.o ? { o: r.o } : { x: r.x };
        if (r.m !== EMPTY) x.m = Object.assign({}, r.m);
        return x;
      });
      return o;
    }
    if (b.t === 'table') return Object.assign({}, b, { rows: b.rows.map((row) => Object.assign({}, row, { cells: row.cells.map((c) => Object.assign({}, c, { blocks: c.blocks.map(blockJSON) })) })) });
    return Object.assign({}, b);
  }
  PT.blockJSON = blockJSON;

  // valida y normaliza bloques leídos de un archivo (ids únicos, tablas rectangulares, al menos un párrafo)
  function cleanBlocks(list, seen, needOne) {
    const out = [];
    const id = (want, prefix) => { let v = typeof want === 'string' && want && !seen.has(want) ? want : PT.uid(prefix); seen.add(v); return v; };
    for (const b of Array.isArray(list) ? list : []) {
      if (!b || typeof b !== 'object') continue;
      if (b.t === 'p') out.push(cleanPara(b, id));
      else if (b.t === 'table' && Array.isArray(b.rows) && b.rows.length) {
        const ncols = Math.max(1, Array.isArray(b.cols) ? b.cols.length : 0, ...b.rows.map((r) => (r && Array.isArray(r.cells) ? r.cells.length : 0)));
        const cols = Array.from({ length: ncols }, (_, i) => (Array.isArray(b.cols) && b.cols[i] > 0 ? +b.cols[i] : 72));
        const t = { t: 'table', id: id(b.id, 't'), cols, rows: [] };
        for (const k of ['al', 'bd', 'pb', 'w', 'ind']) if (b[k] != null) t[k] = b[k];
        if (!('bd' in b)) t.bd = '0.5 solid #000000';
        b.rows.forEach((row, ri) => {
          const r = { id: id(row && row.id, 'w'), cells: [] };
          if (row && row.h > 0) r.h = +row.h;
          if (row && row.hd) r.hd = true;
          for (let c = 0; c < ncols; c++) {
            const src = row && Array.isArray(row.cells) ? row.cells[c] : null;
            const cell = { id: id(src && src.id, 'd'), blocks: [] };
            if (src) for (const k of ['bg', 'va', 'bd', 'w']) if (src[k] != null) cell[k] = src[k];
            if (src && src.mh && c > 0) cell.mh = true;
            if (src && src.mv && ri > 0) cell.mv = true;
            cell.blocks = cleanBlocks(src && src.blocks, seen, true);
            r.cells.push(cell);
          }
          t.rows.push(r);
        });
        out.push(t);
      } else if (b.t === 'hr') out.push({ t: 'hr', id: id(b.id, 'r') });
      else if (b.t === 'toc') out.push({ t: 'toc', id: id(b.id, 'c'), lv: PT.clamp(+b.lv || 3, 1, 6), title: b.title == null ? 'Índice' : b.title });
    }
    if (needOne && !out.some((b) => b.t === 'p')) out.push(PT.para.make());
    // el último bloque debe ser un párrafo para poder escribir después de una tabla
    if (out.length && out[out.length - 1].t !== 'p') out.push(PT.para.make());
    return out;
  }
  function cleanPara(b, id) {
    const p = { t: 'p', id: id(b.id, 'p') };
    for (const k of PT.P_KEYS) if (b[k] != null && b[k] !== false) p[k] = PT.clone(b[k]);
    const runs = [];
    for (const r of Array.isArray(b.runs) ? b.runs : []) {
      if (!r) continue;
      if (r.o && typeof r.o === 'object' && r.o.k) runs.push({ o: Object.freeze(PT.clone(r.o)), m: intern(r.m) });
      else if (r.x != null) runs.push({ x: String(r.x).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''), m: intern(r.m) });
    }
    p.runs = R.normalize(runs);
    return p;
  }
  PT.cleanBlocks = cleanBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
