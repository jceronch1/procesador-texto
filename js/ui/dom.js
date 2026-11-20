/* Utilidades de interfaz: creación de elementos, iconos, menús emergentes, diálogos, avisos,
   selector de color, descargas y selección de archivos. */
(function () {
  'use strict';
  const PT = window.PT;
  const ui = (PT.ui = {});

  // h('div.clase#id', {attr}, hijos…): crea un elemento.
  function h(spec, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec);
    const el = document.createElement(m[1] || 'div');
    if (m[2]) for (const p of m[2].match(/[.#][\w-]+/g)) { if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1); }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  }
  ui.h = h;
  ui.esc = PT.esc;

  // ---------------------------------------------------------------- iconos (trazos de 16×16)
  const P = {
    undo: 'M4 6h6a3.5 3.5 0 0 1 0 7H6M4 6l3-3M4 6l3 3',
    redo: 'M12 6H6a3.5 3.5 0 0 0 0 7h4M12 6l-3-3M12 6l-3 3',
    print: 'M4.5 6V2.5h7V6M4.5 11.5h-2V6h11v5.5h-2M4.5 9.5h7v4h-7z',
    paint: 'M3 2.5h8v3H3zM11 4h2.5v3.5H8V10M7 10h2v3.5H7z',
    alignL: 'M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7',
    alignC: 'M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7',
    alignR: 'M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7',
    alignJ: 'M2.5 4h11M2.5 7h11M2.5 10h11M2.5 13h11',
    spacing: 'M7.5 4h6M7.5 8h6M7.5 12h6M3.5 2.5v11M3.5 2.5L2 4M3.5 2.5L5 4M3.5 13.5L2 12M3.5 13.5L5 12',
    listCheck: 'M2 2.5h3.5V6H2zM2 10h3.5v3.5H2zM7.5 4.2h6.5M7.5 11.8h6.5M2.7 4.3l.8.8 1.3-1.6',
    indentMore: 'M2.5 3h11M7 6.5h6.5M7 9.5h6.5M2.5 13h11M2.5 6l2.5 2-2.5 2',
    indentLess: 'M2.5 3h11M7 6.5h6.5M7 9.5h6.5M2.5 13h11M5 6L2.5 8 5 10',
    clearFmt: 'M3 3.5h8M7 3.5v9M10.5 10.5l3 3M13.5 10.5l-3 3',
    link: 'M6.5 9.5l3-3M7.2 4.6l1-1a2.5 2.5 0 0 1 3.6 3.6l-1 1M8.8 11.4l-1 1a2.5 2.5 0 0 1-3.6-3.6l1-1',
    unlink: 'M7.2 4.6l1-1a2.5 2.5 0 0 1 3.6 3.6l-1 1M8.8 11.4l-1 1a2.5 2.5 0 0 1-3.6-3.6l1-1M2.5 2.5l2 2M13.5 13.5l-2-2',
    comment: 'M2.5 3h11v8H8l-3 2.5V11H2.5zM8 5v4M6 7h4',
    note: 'M2.5 3h11v8H8l-3 2.5V11H2.5z',
    image: 'M2.5 3h11v10h-11zM2.5 11l3.5-3.5 2.5 2.5 2-2 3 3M10.5 6.2h.01',
    table: 'M2.5 3h11v10h-11zM2.5 6.3h11M2.5 9.6h11M6.2 3v10M9.8 3v10',
    search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6l3 3',
    plus: 'M8 3v10M3 8h10',
    minus: 'M3 8h10',
    close: 'M4 4l8 8M12 4l-8 8',
    check: 'M3 8.5l3.2 3.2L13 5',
    down: 'M4.5 6.5L8 10l3.5-3.5',
    up: 'M4.5 9.5L8 6l3.5 3.5',
    right: 'M6.5 4.5L10 8l-3.5 3.5',
    left: 'M9.5 4.5L6 8l3.5 3.5',
    menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
    file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
    fileNew: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3M8 7.5v4M6 9.5h4',
    folder: 'M2 4.5h4l1.5 1.5h6.5v7.5H2z',
    download: 'M8 2.5v8M8 10.5l-3-3M8 10.5l3-3M3 13.5h10',
    upload: 'M8 10.5v-8M8 2.5l-3 3M8 2.5l3 3M3 13.5h10',
    trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9',
    gear: 'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2',
    help: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.6-.8 1.2M8 11.4v.2',
    copy: 'M5.5 5.5h8v8h-8zM3 10.5h-.5v-8h8V3',
    cut: 'M4.5 13a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM11.5 13a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM5.7 10L11 2.5M10.3 10L5 2.5',
    paste: 'M5 3.5H3.5v10h9v-10H11M5.5 2.5h5v2h-5z',
    eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    moon: 'M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z',
    pageBreak: 'M3.5 2.5v3h9v-3M3.5 13.5v-3h9v3M2 8h2M6 8h4M12 8h2',
    hr: 'M2 8h12M2 5.5h3M11 5.5h3M2 10.5h3M11 10.5h3',
    toc: 'M2.5 3.5h7M12 3.5h1.5M4.5 6.5h5M12 6.5h1.5M4.5 9.5h5M12 9.5h1.5M2.5 12.5h7M12 12.5h1.5',
    header: 'M2.5 2.5h11v11h-11zM2.5 5.5h11',
    footer: 'M2.5 2.5h11v11h-11zM2.5 10.5h11',
    calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    outline: 'M2.5 3.5h3M7.5 3.5h6M4.5 8h2M8.5 8h5M4.5 12.5h2M8.5 12.5h5',
    track: 'M10.5 2.5l3 3-7.5 7.5H3v-3zM9 4l3 3',
    speak: 'M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4',
    mic: 'M8 10.5a2.5 2.5 0 0 0 2.5-2.5V4.5a2.5 2.5 0 0 0-5 0V8A2.5 2.5 0 0 0 8 10.5zM4 8a4 4 0 0 0 8 0M8 12v2',
    focus: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3',
    ruler: 'M1.5 5.5h13v5h-13zM4 5.5v2M6.5 5.5v3M9 5.5v2M11.5 5.5v3',
    history: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.5l2.5 1.5',
    watermark: 'M3.5 2.5h9v11h-9zM5.5 11l5-6',
    pageSetup: 'M4 2.5h8v11H4zM6 5h4M6 7.5h4M6 10h2',
    template: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
    stats: 'M2.5 13.5h11M4.5 13.5V9M8 13.5V4M11.5 13.5V7',
    sortAsc: 'M4.5 3v10M4.5 13l-2-2M4.5 13l2-2M9 4.5h2.5M9 8h4M9 11.5h5.5',
    sortDesc: 'M4.5 3v10M4.5 13l-2-2M4.5 13l2-2M9 4.5h5.5M9 8h4M9 11.5h2.5',
    merge: 'M2.5 4h11v8h-11zM5 8h6M5 8l1.7-1.7M5 8l1.7 1.7M11 8L9.3 6.3M11 8l-1.7 1.7',
    split: 'M2.5 4h11v8h-11zM8 4v8M6.5 8H3.5M3.5 8l1.3-1.3M3.5 8l1.3 1.3M9.5 8h3M12.5 8l-1.3-1.3M12.5 8l-1.3 1.3',
    rowAdd: 'M2.5 3h11v6h-11zM2.5 6h11M8 11v4M6 13h4',
    colAdd: 'M3 2.5h6v11H3zM6 2.5v11M11 8h4M13 6v4',
    rowDel: 'M2.5 3h11v6h-11zM2.5 6h11M6 13h4',
    colDel: 'M3 2.5h6v11H3zM6 2.5v11M11 8h4',
    sidebar: 'M2.5 3h11v10h-11zM6 3v10',
    code: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
    columns: 'M2.5 3h4.5v10H2.5zM9 3h4.5v10H9z',
    star: 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z',
    lock: 'M4 7.5h8v6H4zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5',
    globe: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12',
    emoji: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM5.5 9.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6.5h.01M10 6.5h.01',
    dropdown: 'M2.5 4.5h11v7h-11zM9.5 4.5v7M10.6 7.4l1 1 1-1',
    checkbox: 'M3 3h10v10H3zM5.5 8l2 2 3-4',
    fullscreen: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3',
    book: 'M8 4.5c-1.5-1.3-3.5-1.5-5.5-1v9.5c2-.5 4-.3 5.5 1 1.5-1.3 3.5-1.5 5.5-1V3.5c-2-.5-4-.3-5.5 1zM8 4.5v9.5',
    accept: 'M3 8.5l3.2 3.2L13 5',
    reject: 'M4 4l8 8M12 4l-8 8',
    acceptAll: 'M1.8 8.8l2.6 2.6L9.5 6M6.6 11.4L13 5',
    info: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.2V11M8 5v.2',
    selectAll: 'M2.5 2.5h2M6.5 2.5h3M11.5 2.5h2v2M13.5 6.5v3M13.5 11.5v2h-2M9.5 13.5h-3M4.5 13.5h-2v-2M2.5 9.5v-3M2.5 4.5v-2M5.5 6h5M5.5 8h5M5.5 10h3',
    zoomIn: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6l3 3M5 7h4M7 5v4',
    zoomOut: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6l3 3M5 7h4',
    fitWidth: 'M2.5 8h11M2.5 8l2-2M2.5 8l2 2M13.5 8l-2-2M13.5 8l-2 2M1.5 3v10M14.5 3v10',
    fitPage: 'M4.5 2.5h7v11h-7zM6.5 5.5h3M6.5 8h3M6.5 10.5h2',
    pageless: 'M3.5 1.5v13M12.5 1.5v13M6 4.5h4M6 7h4M6 9.5h4M6 12h3',
    user: 'M8 8a2.7 2.7 0 1 0 0-5.4A2.7 2.7 0 0 0 8 8zM3 14a5 5 0 0 1 10 0',
    keyboard: 'M1.5 4.5h13v7h-13zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M4.5 9.5h7',
    wand: 'M2.5 13.5l8-8M9 4l3 3M12 1.5v2M14.5 4h-2M13.6 2.4l-1 1',
    valignT: 'M2.5 2.5h11M8 13.5V6M8 6L5.5 8.5M8 6l2.5 2.5',
    valignM: 'M2.5 8h11M8 2v3.5M8 5.5L6.5 4M8 5.5L9.5 4M8 14v-3.5M8 10.5L6.5 12M8 10.5L9.5 12',
    valignB: 'M2.5 13.5h11M8 2.5V10M8 10L5.5 7.5M8 10l2.5-2.5',
    borders: 'M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11',
    noBorders: 'M2.5 2.5h2M6.5 2.5h3M11.5 2.5h2v2M13.5 6.5v3M13.5 11.5v2h-2M9.5 13.5h-3M4.5 13.5h-2v-2M2.5 9.5v-3M2.5 4.5v-2',
    pageColor: 'M3.5 2.5h7l2 2v9h-9zM5.8 9.4l2.4-2.4 2.4 2.4-2.4 2.4z',
    rowAbove: 'M2.5 7h11v6.5h-11zM2.5 10.3h11M8 1.5v4M6 3.5h4',
    rowBelow: 'M2.5 2.5h11V9h-11zM2.5 5.8h11M8 10.5v4M6 12.5h4',
    colLeft: 'M7 2.5h6.5v11H7zM10.3 2.5v11M1.5 8h4M3.5 6v4',
    colRight: 'M2.5 2.5H9v11H2.5zM5.8 2.5v11M10.5 8h4M12.5 6v4',
    distribute: 'M2.5 3h11v10h-11zM6.2 3v10M9.8 3v10M3.7 8h1.3M7.3 8h1.4M10.9 8h1.4',
    restart: 'M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.4 2.3v2.8h2.8',
    printLayout: 'M4 2.5h8v11H4zM6 5h4M6 7.5h4M6 10h2.5',
    launch: 'M2.5 7V2.5H7M6 6l6.5 6.5M12.5 8.5v4h-4',
    replace: 'M2.5 5.5H12M9.5 3L12 5.5 9.5 8M13.5 10.5H4M6.5 8L4 10.5 6.5 13',
    goTo: 'M2.5 8H11M8 5l3 3-3 3M13.5 2.5v11',
    sparkle: 'M7.5 1.8l1.5 3.7 3.7 1.5-3.7 1.5-1.5 3.7L6 8.5 2.3 7 6 5.5zM12.6 10.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z',
    compare: 'M2.5 2.5H7v11H2.5zM9 2.5h4.5v11H9zM4 5h1.5M4 7.5h1.5M10.5 5H12M10.5 7.5H12M10.5 10H12',
    a11y: 'M8 4.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM3 5.6l5 1.1 5-1.1M8 6.7V10M8 10l-2.2 4.2M8 10l2.2 4.2',
    present: 'M1.5 2.5h13V11h-13zM8 11v2.5M5.5 13.5h5M6.6 4.8l3.4 2-3.4 2z',
    goal: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 8h.01',
    pen: 'M11 2.5l2.5 2.5-8 8H3v-2.5zM9.5 4L12 6.5',
    sign: 'M1.8 12c1.9-3 3-6.2 4.4-6.2s-.9 5.4 1.2 5.4 2.4-3.1 3.5-3.1.4 2.1 1.9 2.1 1.4-1 1.4-1M2 14.2h12',
    blocks: 'M2.5 2.5h5v5h-5zM8.5 2.5h5v5h-5zM2.5 8.5h5v5h-5zM8.5 8.5h5v5h-5z',
    command: 'M5.5 5.5h5v5h-5zM5.5 5.5H4a1.5 1.5 0 1 1 1.5-1.5zM10.5 5.5V4A1.5 1.5 0 1 1 12 5.5zM5.5 10.5V12A1.5 1.5 0 1 1 4 10.5zM10.5 10.5H12a1.5 1.5 0 1 1-1.5 1.5z',
    typewriter: 'M3 9.5h10v4H3zM4.5 9.5V6h7v3.5M6 3.5h4M5.5 11.5h5',
    merge2: 'M3 3.5h7l3 3v6.5H3zM10 3.5v3h3M5 9h6M5 11h4M1.5 6v8.5H9',
  };
  const FILE = '<path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3"/>';
  const T = (txt, o) => '<text x="' + ((o && o.x) || 8) + '" y="' + ((o && o.y) || 12.5) + '" text-anchor="middle" font-size="' + ((o && o.s) || 12) + '"' + (o && o.w ? ' font-weight="' + o.w + '"' : '') + (o && o.i ? ' font-style="italic"' : '') + ' font-family="' + ((o && o.f) || 'Arial,sans-serif') + '" fill="currentColor" stroke="none">' + txt + '</text>';
  const SPECIAL = {
    bold: T('N', { w: 800 }),
    italic: T('K', { i: 1, f: 'Georgia,serif' }),
    underline: T('S', { y: 11, s: 11 }) + '<path d="M3.5 14h9"/>',
    strike: T('ab', { y: 12, s: 11 }) + '<path d="M2.5 8.5h11"/>',
    sup: T('x', { x: 6, y: 13, s: 11 }) + T('2', { x: 12, y: 7.5, s: 7.5 }),
    sub: T('x', { x: 6, y: 11, s: 11 }) + T('2', { x: 12, y: 15, s: 7.5 }),
    fontColor: T('A', { y: 10.5, s: 11, w: 700 }) + '<rect class="swatch" x="2.5" y="12.2" width="11" height="2.6" rx=".6" stroke="none"/>',
    highlight: '<path d="M10 2.5l3 3-5.5 5.5H4.5V8z"/><path d="M4.5 11l-1.5 1.5"/><rect class="swatch" x="2.5" y="13" width="11" height="2.2" rx=".6" stroke="none"/>',
    listBullet: '<circle cx="3.3" cy="4" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.3" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.3" cy="12" r="1.1" fill="currentColor" stroke="none"/><path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/>',
    listNumber: T('1', { x: 3.3, y: 5.8, s: 5.5 }) + T('2', { x: 3.3, y: 9.8, s: 5.5 }) + T('3', { x: 3.3, y: 13.8, s: 5.5 }) + '<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/>',
    footnote: T('ab', { x: 6.5, y: 13, s: 10 }) + T('1', { x: 13.5, y: 7, s: 7 }),
    pageNum: '<path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3"/>' + T('#', { y: 12.2, s: 6.5 }),
    symbol: T('Ω', { s: 12.5, y: 12.5 }),
    caseAa: T('Aa', { s: 10.5, y: 12 }),
    dropcap: T('A', { x: 5, y: 10, s: 11, w: 700 }) + '<path d="M9.5 4h4M9.5 7h4M2.5 13h11"/>',
    at: T('@', { s: 12, y: 12 }),
    pilcrow: T('¶', { s: 13, y: 12.5 }),
    quote: T('“', { s: 18, y: 15, f: 'Georgia,serif' }),
    equation: T('π', { s: 13, y: 12, f: 'Georgia,serif', i: 1 }),
    spell: T('abc', { y: 8.5, s: 7 }) + '<path d="M4 11.5l2 2 5-5"/>',
    more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
    fWord: FILE + T('W', { y: 12.6, s: 6, w: 800 }),
    fPdf: FILE + T('PDF', { y: 12.4, s: 4.2, w: 700 }),
    fHtml: FILE + T('&lt;/&gt;', { y: 12.3, s: 4.4, w: 700 }),
    fMd: FILE + T('MD', { y: 12.4, s: 4.6, w: 700 }),
    fRtf: FILE + T('RTF', { y: 12.4, s: 4.2, w: 700 }),
    fTxt: FILE + T('TXT', { y: 12.4, s: 4.2, w: 700 }),
    fJson: FILE + T('{ }', { y: 12.4, s: 5, w: 700 }),
    pastePlain: '<path d="M5 3.5H3.5v10h9v-10H11M5.5 2.5h5v2h-5z"/>' + T('T', { y: 12, s: 6.5, w: 700 }),
    hash: T('#', { s: 12, y: 12.5 }),
    words: T('123', { s: 7, y: 10.5 }) + '<path d="M3 12.5h10"/>',
    clock: '<path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.5l2.5 1.5"/>',
    smallCaps: T('A', { x: 5.5, y: 12.5, s: 11 }) + T('A', { x: 11.6, y: 12.5, s: 7.5 }),
    allCaps: T('AB', { s: 9.5, y: 12 }),
    caseLower: T('ab', { s: 10, y: 12 }),
    caseUpper: T('AB', { s: 9, y: 12 }),
    caseTitle: T('Ab', { s: 10, y: 12 }),
    caseSentence: T('Ab.', { s: 9, y: 12 }),
    caseToggle: T('aB', { s: 10, y: 12 }),
    startAt: T('1', { x: 4.5, y: 12, s: 9, w: 700 }) + '<path d="M8.5 8h5M11.5 6l2 2-2 2"/>',
    headerRow: '<path d="M2.5 3h11v10h-11zM2.5 9.6h11M6.2 6.3V13M9.8 6.3V13"/><rect x="2.5" y="3" width="11" height="3.3" fill="currentColor" stroke="none" opacity=".55"/>',
    cellColor: '<path d="M7 2.5l5 5-4.2 4.2a1 1 0 0 1-1.4 0L3 8.3z"/><path d="M13.2 9.6c.6.9.9 1.4.9 1.8a.9.9 0 0 1-1.8 0c0-.4.3-.9.9-1.8z" fill="currentColor"/><rect class="swatch" x="2.5" y="13" width="11" height="2.2" rx=".6" stroke="none"/>',
    zoom100: '<rect x="1.5" y="3" width="13" height="10" rx="2"/>' + T('1:1', { s: 7, y: 10.6, w: 700 }),
    variable: T('{x}', { s: 8.6, y: 11.2, w: 700 }),
    lineNum: T('1', { x: 3, y: 5.6, s: 4.8 }) + T('2', { x: 3, y: 9.6, s: 4.8 }) + T('3', { x: 3, y: 13.6, s: 4.8 }) + '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>',
    dim: '<path d="M2.5 4h11" opacity=".35"/><path d="M2.5 8h11"/><path d="M2.5 12h11" opacity=".35"/>',
    author: '<path d="M6 7.5a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM1.8 13.5a4.2 4.2 0 0 1 8.4 0"/><path d="M11.5 5.5l1.2 1.2 2-2.4"/>',
    logo: '<rect x="2" y="1" width="12" height="14" rx="2" fill="var(--accent)" stroke="none"/><path d="M4.6 5h6.8M4.6 7.6h6.8M4.6 10.2h4.4" stroke="#fff" stroke-width="1.2"/>',
  };
  ui.icon = function (name, size) {
    const span = h('span.ico');
    const body = SPECIAL[name] || '<path d="' + (P[name] || '') + '"/>';
    span.innerHTML = '<svg viewBox="0 0 16 16" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
    return span;
  };
  ui.iconSvg = (name) => ui.icon(name).innerHTML;

  // ---------------------------------------------------------------- capas emergentes
  const layer = () => document.getElementById('popups') || document.body.appendChild(h('div#popups'));
  const stack = [];
  function closeFrom(i) { while (stack.length > i) { const p = stack.pop(); p.el.remove(); if (p.onClose) p.onClose(); } }
  ui.closePopups = () => closeFrom(0);
  ui.popupOpen = () => stack.length > 0;
  document.addEventListener('pointerdown', (e) => {
    if (!stack.length) return;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].el.contains(e.target) || (stack[i].anchor && stack[i].anchor.contains && stack[i].anchor.contains(e.target))) { closeFrom(i + 1); return; }
    }
    closeFrom(0);
  }, true);
  window.addEventListener('blur', () => { if (!stack.some((s) => s.keepOnBlur)) closeFrom(0); });
  let popupViewportWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.AndroidText && window.innerWidth === popupViewportWidth) {
      // El teclado cambia la altura al tocar Archivo. Conserva el menú y ajusta su área desplazable.
      for (const popup of stack) {
        const top = popup.el.getBoundingClientRect().top;
        popup.el.style.maxHeight = Math.max(80, window.innerHeight - top - 8) + 'px';
      }
    } else {
      closeFrom(0);
    }
    popupViewportWidth = window.innerWidth;
  });
  // Muestra el elemento junto a un ancla (elemento o {x, y}). opts: {side: 'bottom'|'right', level, onClose}
  ui.popup = function (el, at, opts) {
    opts = opts || {};
    const level = opts.level || 0;
    closeFrom(level);
    el.classList.add('popup');
    layer().appendChild(el);
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x, y, maxH = null;
    if (at instanceof Element) {
      const r = at.getBoundingClientRect();
      if (opts.side === 'right') { x = r.right - 2; y = r.top - 4; } else { x = r.left; y = r.bottom + 2; }
      if (x + w > vw - 4) x = opts.side === 'right' ? Math.max(4, r.left - w + 2) : Math.max(4, vw - w - 4);
      if (y + hh > vh - 4) {
        if (opts.side === 'right') y = Math.max(4, vh - hh - 4);
        else {
          // si no cabe debajo: encima solo si cabe entero; si no, debajo con barra de desplazamiento
          // (así un menú largo nunca tapa la barra de menús ni el botón que lo abrió)
          const below = vh - r.bottom - 10, above = r.top - 8;
          if (!opts.below && hh <= above) y = r.top - hh - 2;
          else if (opts.below || below >= Math.min(hh, 220) || below >= above) { y = r.bottom + 2; maxH = below; }
          else { maxH = above; y = r.top - Math.min(hh, above) - 2; }
        }
      }
    } else {
      x = Math.max(4, Math.min(at.x, vw - w - 4));
      y = Math.max(4, Math.min(at.y, vh - hh - 4));
    }
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.style.maxHeight = Math.max(120, maxH != null ? maxH : vh - Math.max(4, y) - 8) + 'px';
    const rec = { el, anchor: at instanceof Element ? at : null, onClose: opts.onClose, level, keepOnBlur: opts.keepOnBlur };
    stack.push(rec);
    return () => { const i = stack.indexOf(rec); if (i >= 0) closeFrom(i); };
  };

  // items: [{label, icon, key, action, checked, disabled, sub: [...], hint, swatch, preview} | '-' | {title}]
  ui.menu = function (items, at, opts) {
    opts = opts || {};
    const level = opts.level || 0;
    const el = h('div.menu', { tabindex: '-1', role: 'menu' });
    if (opts.cls) el.classList.add(opts.cls);
    // los menús largos usan filas más bajas para que quepan mejor
    if (items.filter((x) => x && x !== '-' && !x.title).length > 13) el.classList.add('menu-compact');
    let active = -1;
    const rows = [];
    const setActive = (i, openSub) => {
      if (active >= 0 && rows[active]) rows[active].el.classList.remove('active');
      active = i;
      closeFrom(level + 1);
      if (i < 0 || !rows[i]) return;
      rows[i].el.classList.add('active');
      rows[i].el.scrollIntoView({ block: 'nearest' });
      const it = rows[i].item;
      if (it.sub && openSub && !it.disabled) ui.menu(typeof it.sub === 'function' ? it.sub() : it.sub, rows[i].el, { side: 'right', level: level + 1, parent: el });
    };
    const run = (it) => {
      if (it.disabled || it.sub) return;
      closeFrom(0);
      if (it.action) it.action();
    };
    items.forEach((it) => {
      if (!it) return;
      if (it === '-') { el.appendChild(h('div.menu-sep')); return; }
      if (it.title) { el.appendChild(h('div.menu-title', it.title)); return; }
      const label = h('span.menu-label', it.label);
      if (it.preview) Object.assign(label.style, it.preview);
      const row = h('div.menu-item' + (it.disabled ? '.disabled' : ''), { role: 'menuitem', title: it.hint || null },
        h('span.menu-ico', it.checked ? ui.icon('check', 14) : it.icon ? ui.icon(it.icon, 15) : it.swatch ? h('span.menu-swatch', { style: { background: it.swatch } }) : null),
        label,
        it.key ? h('span.menu-key', it.key) : null,
        it.sub ? h('span.menu-arrow', ui.icon('right', 12)) : null);
      const idx = rows.length;
      rows.push({ el: row, item: it });
      row.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setActive(idx, true); });
      row.addEventListener('pointerdown', (e) => e.preventDefault());
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.sub && (e.pointerType === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents))) setActive(idx, true);
        else run(it);
      });
      el.appendChild(row);
    });
    el.addEventListener('keydown', (e) => {
      const n = rows.length;
      const step = (d) => { if (!n) return; let i = active; for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!rows[i].item.disabled) break; } setActive(i, false); };
      if (e.key === 'ArrowDown') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { step(-1); e.preventDefault(); }
      else if (e.key === 'Home') { active = -1; step(1); e.preventDefault(); }
      else if (e.key === 'End') { active = 0; step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { if (active >= 0 && rows[active].item.sub) { setActive(active, true); const top = stack[stack.length - 1]; if (top && top.el !== el) top.el.focus(); } else if (opts.onSide) opts.onSide(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { if (opts.parent) { closeFrom(level); opts.parent.focus(); } else if (opts.onSide) opts.onSide(-1); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (active >= 0) { const it = rows[active].item; if (it.sub) { setActive(active, true); const top = stack[stack.length - 1]; if (top && top.el !== el) top.el.focus(); } else run(it); } e.preventDefault(); }
      else if (e.key === 'Escape') { closeFrom(level); if (opts.parent) opts.parent.focus(); e.preventDefault(); }
      e.stopPropagation();
    });
    const close = ui.popup(el, at, { side: opts.side, level, below: opts.below, onClose: () => { if (opts.onClose) opts.onClose(); if (level === 0 && PT.app && !ui.dialogOpen() && !opts.noRefocus) PT.app.focusEditor(); } });
    if (!opts.noFocus) el.focus({ preventScroll: true });
    return close;
  };

  // ---------------------------------------------------------------- diálogos
  const dialogs = [];
  ui.dialogOpen = () => dialogs.length > 0;
  // opts: {title, body, buttons: [{label, primary, danger, action (devuelve false para no cerrar)}], width, onClose, modeless}
  ui.dialog = function (opts) {
    closeFrom(0);
    const body = h('div.dlg-body', opts.body);
    const foot = h('div.dlg-foot');
    const panel = h('div.dlg', { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title, style: { width: (opts.width || 420) + 'px' } },
      h('div.dlg-head', h('span.dlg-title', opts.title), h('button.dlg-x', { type: 'button', title: 'Cerrar', onclick: () => close() }, ui.icon('close', 14))),
      body, foot);
    const back = h('div.dlg-back', panel);
    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true; back.remove();
      const i = dialogs.indexOf(rec); if (i >= 0) dialogs.splice(i, 1);
      if (opts.onClose) opts.onClose(result);
      if (!dialogs.length && PT.app && !opts.noRefocus) PT.app.focusEditor();
    }
    let primary = null;
    for (const b of opts.buttons || [{ label: 'Cerrar', primary: true }]) {
      if (b.left) { foot.appendChild(h('span.dlg-foot-left', b.el)); continue; }
      const btn = h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { type: 'button' }, b.label);
      btn.addEventListener('click', () => { const r = b.action ? b.action() : undefined; if (r !== false) close(r); });
      if (b.primary) primary = btn;
      foot.appendChild(btn);
    }
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); e.preventDefault(); }
      else if (e.key === 'Enter' && primary && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && !e.target.isContentEditable) { primary.click(); e.preventDefault(); }
      else if (e.key === 'Tab') {
        const f = Array.from(panel.querySelectorAll('input,select,textarea,button,[tabindex]')).filter((x) => !x.disabled && x.offsetParent !== null && x.tabIndex >= 0);
        if (f.length) { const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); } }
      }
      e.stopPropagation();
    });
    back.addEventListener('pointerdown', (e) => { if (e.target === back) { e.preventDefault(); close(); } });
    panel.tabIndex = -1;
    document.body.appendChild(back);
    const rec = { close, panel };
    dialogs.push(rec);
    const visible = (sel) => Array.from(panel.querySelectorAll(sel)).find((x) => x.offsetParent !== null && !x.disabled);
    const focusEl = visible('[autofocus]') || visible('.dlg-body input:not([type=checkbox]):not([type=radio]):not([type=color]), .dlg-body select, .dlg-body textarea') || primary || visible('button');
    if (focusEl) { focusEl.focus(); if (focusEl.select && focusEl.tagName === 'INPUT') focusEl.select(); }
    if (!panel.contains(document.activeElement)) panel.focus();
    rec.panel = panel;
    return close;
  };
  ui.alert = (msg, title) => new Promise((res) => ui.dialog({ title: title || 'Procesador de texto', body: h('p.dlg-msg', msg), buttons: [{ label: 'Aceptar', primary: true }], onClose: () => res() }));
  ui.confirm = (msg, opts) => new Promise((res) => {
    let ok = false;
    ui.dialog({ title: (opts && opts.title) || 'Confirmar', body: h('p.dlg-msg', msg), buttons: [{ label: (opts && opts.cancel) || 'Cancelar' }, { label: (opts && opts.ok) || 'Aceptar', primary: true, danger: opts && opts.danger, action: () => { ok = true; } }], onClose: () => res(ok) });
  });
  ui.prompt = (label, value, opts) => new Promise((res) => {
    const input = h('input.inp', { type: 'text', value: value == null ? '' : value, autofocus: true, placeholder: (opts && opts.placeholder) || '' });
    let out = null;
    ui.dialog({ title: (opts && opts.title) || 'Procesador de texto', body: ui.field(label, input, opts && opts.hint), buttons: [{ label: 'Cancelar' }, { label: (opts && opts.ok) || 'Aceptar', primary: true, action: () => { out = input.value; } }], onClose: () => res(out) });
  });
  let toastTimer = null;
  ui.toast = function (msg, ms, action) {
    let t = document.getElementById('toast');
    if (!t) t = document.body.appendChild(h('div#toast', { role: 'status', 'aria-live': 'polite' }));
    t.replaceChildren(h('span', msg));
    if (action) t.appendChild(h('button.toast-btn', { type: 'button', onclick: () => { t.classList.remove('show'); action.run(); } }, action.label));
    t.classList.add('show');
    t.classList.toggle('interactive', !!action);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3200);
  };

  // ---------------------------------------------------------------- controles de formulario
  ui.field = (label, control, hint) => h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
  ui.select = function (options, value, onchange) {
    const s = h('select.inp');
    for (const o of options) { const [v, t] = Array.isArray(o) ? o : [o, o]; s.appendChild(h('option', { value: v, selected: String(v) === String(value) }, t)); }
    if (onchange) s.addEventListener('change', () => onchange(s.value));
    return s;
  };
  ui.check = function (label, checked, onchange) {
    const c = h('input', { type: 'checkbox', checked: !!checked });
    if (onchange) c.addEventListener('change', () => onchange(c.checked));
    const l = h('label.check', c, h('span', label));
    l.input = c;
    return l;
  };
  ui.radios = function (name, options, value, onchange) {
    const box = h('div.radios');
    for (const [v, t] of options) {
      const r = h('input', { type: 'radio', name, value: v, checked: String(v) === String(value) });
      r.addEventListener('change', () => { if (r.checked && onchange) onchange(v); });
      box.appendChild(h('label.check', r, h('span', t)));
    }
    box.value = () => { const c = box.querySelector('input:checked'); return c ? c.value : null; };
    return box;
  };
  ui.tabs = function (defs, start) { // [{label, body}]
    const heads = h('div.tabs-head', { role: 'tablist' }), bodies = h('div.tabs-body');
    const on = start || 0;
    defs.forEach((d, i) => {
      const b = h('button.tab' + (i === on ? '.on' : ''), { type: 'button', role: 'tab' }, d.label);
      const pane = h('div.tab-pane', { hidden: i !== on }, d.body);
      b.addEventListener('click', () => { Array.from(heads.children).forEach((x, k) => { x.classList.toggle('on', k === i); bodies.children[k].hidden = k !== i; }); });
      heads.appendChild(b); bodies.appendChild(pane);
    });
    return h('div.tabs', heads, bodies);
  };
  // campo numérico con unidad (cm, pt, %…)
  ui.numInput = function (value, opts) {
    opts = opts || {};
    const inp = h('input.inp.num', { type: 'text', inputmode: 'decimal', value: value == null ? '' : value, placeholder: opts.placeholder || '', 'aria-label': opts.label || null });
    if (opts.width) inp.style.width = opts.width + 'px';
    return opts.unit ? h('span.unit-wrap', inp, h('span.unit', opts.unit)) : inp;
  };
  ui.numOf = (el) => PT.num((el.tagName === 'INPUT' ? el : el.querySelector('input')).value);

  // ---------------------------------------------------------------- selector de color
  const BASE = ['#000000', '#ffffff', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
  const tint = (hex, t) => (t >= 0 ? PT.mixColor(hex, '#ffffff', t) : PT.mixColor(hex, '#000000', -t));
  const ROWS = [0, 0.8, 0.6, 0.4, -0.25, -0.5];
  ui.PALETTE = ROWS.map((t, i) => BASE.map((c, j) => {
    if (!i) return c;
    if (j === 0) return tint('#000000', [0, 0.5, 0.35, 0.25, 0.15, 0.05][i]);
    if (j === 1) return tint('#ffffff', [0, -0.05, -0.15, -0.25, -0.35, -0.5][i]);
    return tint(c, t);
  }));
  ui.STANDARD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
  ui.HIGHLIGHTS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#0000ff', '#ff0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0', '#000000'];
  // opts: {value, autoLabel ('Automático' / 'Sin color'), onPick(color|null), level, palette}
  ui.colorPicker = function (at, opts) {
    const el = h('div.colorpick');
    const pick = (c) => { ui.closePopups(); opts.onPick(c); };
    if (opts.autoLabel) el.appendChild(h('button.cp-auto', { type: 'button', onclick: () => pick(null) }, opts.autoLabel));
    const sw = (c) => h('button.cp-sw' + (opts.value && opts.value.toLowerCase() === c ? '.on' : ''), { type: 'button', title: c, style: { background: c }, 'aria-label': 'Color ' + c, onclick: () => pick(c) });
    if (opts.palette === 'highlight') {
      const grid = h('div.cp-grid.hl'); ui.HIGHLIGHTS.forEach((c) => grid.appendChild(sw(c))); el.appendChild(grid);
    } else {
      const grid = h('div.cp-grid');
      ui.PALETTE.forEach((row) => row.forEach((c) => grid.appendChild(sw(c))));
      el.appendChild(grid);
      el.appendChild(h('div.cp-label', 'Colores estándar'));
      const std = h('div.cp-grid'); ui.STANDARD.forEach((c) => std.appendChild(sw(c))); el.appendChild(std);
    }
    const native = h('input', { type: 'color', value: opts.value || '#000000' });
    native.addEventListener('change', () => pick(native.value));
    el.appendChild(h('label.cp-more', h('span', 'Más colores…'), native));
    el.addEventListener('pointerdown', (e) => { if (e.target !== native) e.preventDefault(); });
    return ui.popup(el, at, { level: opts.level || 0, keepOnBlur: true });
  };
  // botón con muestra de color para formularios
  ui.colorButton = function (value, onPick, autoLabel) {
    const b = h('button.swatch-btn', { type: 'button', title: 'Elegir color' });
    const set = (c) => { b.value = c || ''; b.style.background = c || 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 4px, var(--border-soft) 4px, var(--border-soft) 8px)'; };
    set(value || null);
    b.addEventListener('click', () => ui.colorPicker(b, { value: b.value, autoLabel: autoLabel || 'Ninguno', level: 0, onPick: (c) => { set(c); if (onPick) onPick(c); } }));
    b.getColor = () => b.value || null;
    return b;
  };

  // ---------------------------------------------------------------- archivos
  ui.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  };
  ui.pickFile = (accept, multiple) => new Promise((res) => {
    const inp = h('input', { type: 'file', accept, multiple: !!multiple, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(multiple ? Array.from(inp.files) : inp.files[0] || null); inp.remove(); });
    inp.addEventListener('cancel', () => { res(null); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  });
  ui.readDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  // tamaño natural de una imagen (dataURL)
  ui.imageSize = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 100, h: im.naturalHeight || 100 }); im.onerror = () => res(null); im.src = src; });
})();
