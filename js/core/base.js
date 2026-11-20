/* Procesador de texto · base: espacio de nombres, unidades, colores, papel y utilidades.
   Todos los módulos son scripts clásicos (sin import/export) para que la app abra con doble clic. */
(function (root) {
  'use strict';
  const PT = root.PT = root.PT || {};
  PT.VERSION = '1.0.0';

  // ---------------------------------------------------------------- unidades (el modelo guarda puntos tipográficos)
  PT.pt2px = (pt) => (pt * 96) / 72;
  PT.px2pt = (px) => (px * 72) / 96;
  PT.cm2pt = (cm) => (cm * 72) / 2.54;
  PT.pt2cm = (pt) => (pt * 2.54) / 72;
  PT.in2pt = (i) => i * 72;
  PT.pt2in = (pt) => pt / 72;
  PT.twip2pt = (t) => t / 20;
  PT.pt2twip = (p) => Math.round(p * 20);
  PT.emu2pt = (e) => e / 12700;
  PT.pt2emu = (p) => Math.round(p * 12700);
  PT.round = (v, d) => { const k = Math.pow(10, d == null ? 2 : d); return Math.round(v * k) / k; };

  // Factor entre el interlineado "múltiple" de los procesadores (1 = sencillo) y line-height de CSS.
  PT.LINE_FACTOR = 1.2;

  // ---------------------------------------------------------------- configuración regional
  PT.locale = { dec: ',', lang: 'es', units: 'cm', author: '' };
  PT.detectDec = function () {
    try {
      const parts = new Intl.NumberFormat(undefined).formatToParts(1.5);
      const dec = (parts.find((p) => p.type === 'decimal') || {}).value;
      return dec === '.' ? '.' : ',';
    } catch (e) { return ','; }
  };
  // número con la coma o el punto como separador decimal
  PT.num = function (s) {
    if (typeof s === 'number') return s;
    const t = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    return parseFloat(t);
  };
  PT.fmtNum = function (n, d) {
    if (n == null || isNaN(n)) return '';
    const s = String(PT.round(n, d == null ? 2 : d));
    return PT.locale.dec === ',' ? s.replace('.', ',') : s;
  };
  // longitud en la unidad de la interfaz (cm o pulgadas) <-> puntos
  PT.unitLabel = () => (PT.locale.units === 'in' ? 'in' : 'cm');
  PT.toUnit = (pt) => PT.fmtNum(PT.locale.units === 'in' ? PT.pt2in(pt) : PT.pt2cm(pt), 2);
  PT.fromUnit = function (s) {
    const v = PT.num(String(s).replace(/(cm|in|pulg|")$/i, ''));
    if (v == null) return null;
    return PT.locale.units === 'in' ? PT.in2pt(v) : PT.cm2pt(v);
  };

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  PT.monthNames = () => MONTHS;
  PT.isoDate = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  PT.parseIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  // estilos: 'long' (19 de noviembre de 2026), 'short' (19/11/2026), 'chip' (19 nov 2026), 'full' (jueves, 19 de ...)
  PT.dateText = function (d, style) {
    d = d || new Date();
    const dd = d.getDate(), mm = d.getMonth(), yy = d.getFullYear();
    switch (style) {
      case 'short': return String(dd).padStart(2, '0') + '/' + String(mm + 1).padStart(2, '0') + '/' + yy;
      case 'chip': return dd + ' ' + MONTHS[mm].slice(0, 3) + ' ' + yy;
      case 'full': return DAYS[d.getDay()] + ', ' + dd + ' de ' + MONTHS[mm] + ' de ' + yy;
      default: return dd + ' de ' + MONTHS[mm] + ' de ' + yy;
    }
  };
  PT.timeText = (d) => { d = d || new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  PT.agoText = function (iso) {
    const t = new Date(iso), s = (Date.now() - t.getTime()) / 1000;
    if (!isFinite(s)) return '';
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hoy, ' + PT.timeText(t);
    if (s < 172800) return 'ayer, ' + PT.timeText(t);
    return PT.dateText(t, 'chip') + ', ' + PT.timeText(t);
  };

  // ---------------------------------------------------------------- papel (puntos)
  PT.PAPER = {
    A4: { name: 'A4 (21 × 29,7 cm)', w: 595.3, h: 841.9 },
    Letter: { name: 'Carta (21,59 × 27,94 cm)', w: 612, h: 792 },
    Legal: { name: 'Oficio (21,59 × 35,56 cm)', w: 612, h: 1008 },
    A5: { name: 'A5 (14,8 × 21 cm)', w: 419.5, h: 595.3 },
    A3: { name: 'A3 (29,7 × 42 cm)', w: 841.9, h: 1190.6 },
    B5: { name: 'B5 (17,6 × 25 cm)', w: 498.9, h: 708.7 },
    Executive: { name: 'Ejecutivo (18,4 × 26,7 cm)', w: 522, h: 756 },
  };
  PT.paperOf = function (w, h) {
    const a = Math.min(w, h), b = Math.max(w, h);
    for (const k in PT.PAPER) { const p = PT.PAPER[k]; if (Math.abs(p.w - a) < 3 && Math.abs(p.h - b) < 3) return k; }
    return 'custom';
  };

  // ---------------------------------------------------------------- fuentes
  PT.FONTS = ['Arial', 'Book Antiqua', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Garamond', 'Georgia', 'Lucida Sans', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  // familia CSS con alternativas métricamente compatibles (Carlito, Liberation…) para equipos sin la fuente
  const FALLBACK = {
    'Calibri': 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',
    'Calibri Light': '"Calibri Light", Calibri, Carlito, "Segoe UI Light", "Segoe UI", Arial, sans-serif',
    'Cambria': 'Cambria, Caladea, Georgia, serif',
    'Arial': 'Arial, "Liberation Sans", Helvetica, sans-serif',
    'Times New Roman': '"Times New Roman", "Liberation Serif", Times, serif',
    'Courier New': '"Courier New", "Liberation Mono", monospace',
    'Consolas': 'Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Courier New", monospace',
    'Georgia': 'Georgia, serif',
  };
  PT.fontCss = function (f) {
    if (!f) return null;
    if (FALLBACK[f]) return FALLBACK[f];
    const q = /^[\w-]+$/.test(f) ? f : '"' + String(f).replace(/["\\]/g, '') + '"';
    const serif = /times|garamond|georgia|cambria|book|palatino|constantia|serif|roman/i.test(f);
    const mono = /mono|courier|consol|code/i.test(f);
    return q + (mono ? ', monospace' : serif ? ', serif' : ', sans-serif');
  };

  // ---------------------------------------------------------------- colores
  PT.hex = function (c) {
    if (!c) return null;
    let s = String(c).trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    if (/^[0-9a-f]{6}$/.test(s)) return '#' + s;
    const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) {
      if (m[4] != null && parseFloat(m[4]) === 0) return null;
      return '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, '0')).join('');
    }
    const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080', darkblue: '#00008b', darkred: '#8b0000', darkgreen: '#006400', darkcyan: '#008b8b', darkmagenta: '#8b008b', darkyellow: '#808000', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', orange: '#ffa500', purple: '#800080', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000', silver: '#c0c0c0', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', pink: '#ffc0cb', brown: '#a52a2a' };
    return NAMED[s] || null;
  };
  const rgbOf = (c) => { const h = PT.hex(c) || '#000000'; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  PT.rgbOf = rgbOf;
  PT.mixColor = function (a, b, t) {
    const x = rgbOf(a), y = rgbOf(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  PT.luma = (c) => { const [r, g, b] = rgbOf(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  // colores de resaltado de Word (w:highlight)
  PT.HIGHLIGHT = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };

  // ---------------------------------------------------------------- utilidades varias
  PT.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PT.clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  PT.uid = (() => {
    let n = 0;
    const seed = Math.floor(Math.random() * 46655).toString(36);
    return (p) => (p || 'x') + seed + (++n).toString(36);
  })();
  // Quita acentos conservando la ñ (para buscar sin distinguir tildes).
  PT.fold = function (s) {
    return String(s).replace(/ñ/g, '\u0001').replace(/Ñ/g, '\u0002')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0001/g, 'ñ').replace(/\u0002/g, 'Ñ');
  };
  PT.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  PT.safeName = (s) => (String(s || 'Documento').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'Documento').slice(0, 80);
  // Recuento de palabras (letras, números y apóstrofos; los guiones unen palabras compuestas).
  const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  PT.countWords = (s) => { const m = String(s).match(WORD_RE); return m ? m.length : 0; };
  PT.wordRe = () => new RegExp(WORD_RE.source, 'gu');
  // Sílabas aproximadas en español (para el índice de legibilidad).
  PT.syllables = function (word) {
    const w = PT.fold(String(word).toLowerCase()).replace(/[^a-zñü]/g, '');
    if (!w) return 0;
    const groups = w.replace(/[^aeiouüy]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const g of groups) n += /[aeo][aeo]/.test(g) ? g.replace(/([aeo])(?=[aeo])/g, '$1 ').split(' ').length : 1;
    return Math.max(1, n);
  };
  PT.debounce = function (fn, ms) {
    let t = null;
    const d = function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
    d.cancel = () => clearTimeout(t);
    return d;
  };
  PT.OBJ = '\uFFFC'; // carácter que representa un objeto en línea (imagen, campo, nota…)
})(typeof window !== 'undefined' ? window : globalThis);
