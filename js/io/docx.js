/* Archivos de Word (.docx): escritura y lectura de estilos, párrafos, formato de carácter, listas, tablas
   (con celdas combinadas), imágenes, vínculos, marcadores, notas al pie, comentarios, control de cambios,
   encabezados, pies, campos (página, total, fecha…), índice, saltos de página y configuración de página. */
(function (root) {
  'use strict';
  const PT = root.PT, R = PT.runs, M = PT.marks, P = PT.para, O = PT.ops, X = PT.xml;
  const xe = X.esc;
  const XHDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS = 'xmlns:w="' + W_NS + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const CT = 'application/vnd.openxmlformats-officedocument.';
  const twip = (pt) => Math.round((pt || 0) * 20);
  const hp = (pt) => Math.round(pt * 2);
  const emu = (pt) => Math.round(pt * 12700);
  const hex6 = (c) => (PT.hex(c) || '#000000').slice(1).toUpperCase();
  const isoW = (s) => { const d = s ? new Date(s) : new Date(); return (isNaN(d) ? new Date() : d).toISOString().replace(/\.\d+Z$/, 'Z'); };

  // estilos integrados <-> identificadores y nombres de Word
  const STYLE_IDS = { normal: 'Normal', nospace: 'NoSpacing', title: 'Title', subtitle: 'Subtitle', h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6', quote: 'Quote', code: 'Codigo', caption: 'Caption', fnote: 'FootnoteText', hf: 'Header' };
  const STYLE_NAMES = { normal: 'Normal', nospace: 'No Spacing', title: 'Title', subtitle: 'Subtitle', h1: 'heading 1', h2: 'heading 2', h3: 'heading 3', h4: 'heading 4', h5: 'heading 5', h6: 'heading 6', quote: 'Quote', code: 'Código', caption: 'caption', fnote: 'footnote text', hf: 'header' };
  const styleIdOf = (id) => STYLE_IDS[id] || ('E_' + String(id).replace(/[^A-Za-z0-9_]/g, '')).slice(0, 40);
  const HL_NAMES = {};
  for (const k in PT.HIGHLIGHT) HL_NAMES[PT.HIGHLIGHT[k]] = k;
  const U_VAL = { double: 'double', dotted: 'dotted', dashed: 'dash', wavy: 'wave' };
  const BULLET_FONT = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr>';

  // ================================================================ escritura
  function rPrXml(m, style) {
    let s = '';
    if (style) s += '<w:rStyle w:val="' + style + '"/>';
    if (m.ff) s += '<w:rFonts w:ascii="' + xe(m.ff) + '" w:hAnsi="' + xe(m.ff) + '" w:eastAsia="' + xe(m.ff) + '" w:cs="' + xe(m.ff) + '"/>';
    if (m.b != null) s += m.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
    if (m.i != null) s += m.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
    if (m.caps != null) s += m.caps ? '<w:caps/>' : '<w:caps w:val="0"/>';
    if (m.sc != null) s += m.sc ? '<w:smallCaps/>' : '<w:smallCaps w:val="0"/>';
    if (m.s != null) s += m.s ? '<w:strike/>' : '<w:strike w:val="0"/>';
    if (m.fc) s += '<w:color w:val="' + hex6(m.fc) + '"/>';
    if (m.sp) s += '<w:spacing w:val="' + twip(m.sp) + '"/>';
    if (m.fs) s += '<w:sz w:val="' + hp(m.fs) + '"/><w:szCs w:val="' + hp(m.fs) + '"/>';
    const hlName = m.hl ? HL_NAMES[(PT.hex(m.hl) || '').toLowerCase()] : null;
    if (hlName) s += '<w:highlight w:val="' + hlName + '"/>';
    if (m.u != null) s += m.u ? '<w:u w:val="' + (U_VAL[m.u] || 'single') + '"/>' : '<w:u w:val="none"/>';
    if (m.hl && !hlName) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + hex6(m.hl) + '"/>';
    if (m.sup || m.sub) s += '<w:vertAlign w:val="' + (m.sup ? 'superscript' : 'subscript') + '"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }
  const textXml = (text, del) => text.split(/(\t|\n)/).map((seg) => (seg === '\t' ? '<w:tab/>' : seg === '\n' ? '<w:br/>' : seg ? (del ? '<w:delText xml:space="preserve">' : '<w:t xml:space="preserve">') + xe(seg) + (del ? '</w:delText>' : '</w:t>') : '')).join('');
  const borderXml = (tag, spec) => {
    if (!spec || spec === 'none') return '<w:' + tag + ' w:val="nil"/>';
    const [w, st, c] = String(spec).split(' ');
    const val = { solid: 'single', single: 'single', dashed: 'dashed', dotted: 'dotted', double: 'double' }[st] || 'single';
    return '<w:' + tag + ' w:val="' + val + '" w:sz="' + Math.max(2, Math.round((+w || 0.5) * 8)) + '" w:space="0" w:color="' + (c ? hex6(c) : 'auto') + '"/>';
  };
  const NUMFMT = { decimal: 'decimal', lalpha: 'lowerLetter', ualpha: 'upperLetter', lroman: 'lowerRoman', uroman: 'upperRoman' };

  class WCtx {
    constructor(doc) {
      this.doc = doc; this.parts = {}; this.media = []; this.mediaBySrc = new Map(); this.docPr = 0;
      this.nums = new Map(); this.numDefs = []; this.notes = []; this.noteIds = new Map();
      this.cmIds = new Map(); this.revId = 1; this.bookmarks = new Map(); this.images = null;
      const ranges = O.commentRanges(doc);
      this.cmStart = new Map(); this.cmEnd = new Map();
      let n = 0;
      for (const [cid, r] of ranges) {
        if (!doc.comments[cid]) continue;
        const num = n++;
        this.cmIds.set(cid, num);
        const ks = r.from.id + ':' + r.from.off, ke = r.to.id + ':' + r.to.off;
        (this.cmStart.get(ks) || this.cmStart.set(ks, []).get(ks)).push(num);
        (this.cmEnd.get(ke) || this.cmEnd.set(ke, []).get(ke)).push(num);
      }
      // marcadores: títulos (para el índice) y destinos de vínculos internos
      let b = 0;
      O.eachPara(doc, (p) => {
        for (const r of p.runs) if (r.m.ln && r.m.ln[0] === '#' && !this.bookmarks.has(r.m.ln.slice(1))) this.bookmarks.set(r.m.ln.slice(1), { n: b++, name: '_pt' + r.m.ln.slice(1).replace(/[^\w]/g, '').slice(0, 30) });
      });
      for (const id of doc.parasOf('body')) if (doc.headingLevel(doc.block(id)) && !this.bookmarks.has(id)) this.bookmarks.set(id, { n: b++, name: '_Toc' + id.replace(/[^\w]/g, '').slice(0, 30) });
    }
    part(name) { return this.parts[name] || (this.parts[name] = { rels: [], n: 1 }); }
    rel(part, type, target, external) {
      const p = this.part(part);
      const found = p.rels.find((r) => r.type === type && r.target === target);
      if (found) return found.id;
      const id = 'rId' + p.n++;
      p.rels.push({ id, type, target, external });
      return id;
    }
    numId(p) {
      const def = this.doc.lists[p.ls.id];
      if (!def) return null;
      const key = p.ls.id + (def.k === 'check' ? (p.ck ? ':x' : ':o') : '');
      if (!this.nums.has(key)) { this.numDefs.push({ key, def, checked: !!p.ck }); this.nums.set(key, this.numDefs.length); }
      return this.nums.get(key);
    }
  }

  // imágenes: bytes y tipo; convierte a PNG los formatos que Word no admite (WebP, SVG)
  async function prepareImages(doc) {
    const out = new Map();
    const srcs = new Set();
    O.eachPara(doc, (p) => { for (const r of p.runs) if (r.o && r.o.k === 'img' && r.o.src) srcs.add(r.o.src); });
    for (const src of srcs) {
      try {
        let mime = null, bytes = null;
        const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
        if (m) { mime = m[1].toLowerCase(); bytes = m[2] ? fromB64(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3])); }
        else if (/^(https?:|blob:)/i.test(src) && typeof fetch !== 'undefined') { const res = await fetch(src); const b = await res.blob(); mime = b.type; bytes = new Uint8Array(await b.arrayBuffer()); }
        if (!bytes) continue;
        if (!/^image\/(png|jpe?g|gif|bmp)$/.test(mime)) {
          const png = await rasterize(src, mime, bytes);
          if (!png) continue;
          mime = 'image/png'; bytes = png;
        }
        out.set(src, { mime, bytes, ext: mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : mime.split('/')[1] });
      } catch (e) { /* imagen no disponible: se omite */ }
    }
    return out;
  }
  async function rasterize(src, mime, bytes) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
    const url = /^data:/.test(src) ? src : URL.createObjectURL(new Blob([bytes], { type: mime }));
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = Math.max(1, img.naturalWidth || 300); c.height = Math.max(1, img.naturalHeight || 150);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }
  function fromB64(s) {
    s = s.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function toB64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function imageXml(ctx, part, o) {
    const img = ctx.images.get(o.src);
    if (!img) return '<w:r><w:t xml:space="preserve">' + xe(o.alt ? '[' + o.alt + ']' : '') + '</w:t></w:r>';
    let name = ctx.mediaBySrc.get(o.src);
    if (!name) { name = 'image' + (ctx.media.length + 1) + '.' + img.ext; ctx.media.push({ name, bytes: img.bytes, ext: img.ext }); ctx.mediaBySrc.set(o.src, name); }
    const rid = ctx.rel(part, REL + 'image', 'media/' + name);
    const id = ++ctx.docPr, cx = emu(o.w), cy = emu(o.h), alt = xe(o.alt || '');
    const graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '" descr="' + alt + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' + (o.bd ? '<a:ln w="9525"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:ln>' : '') + '</pic:spPr></pic:pic></a:graphicData></a:graphic>';
    const docPr = '<wp:docPr id="' + id + '" name="Imagen ' + id + '" descr="' + alt + '"/>';
    if (o.wrap === 'left' || o.wrap === 'right') {
      return '<w:r><w:drawing><wp:anchor distT="0" distB="76200" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (251658240 + id) + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>' + o.wrap + '</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/>' + docPr + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' + graphic + '</wp:anchor></w:drawing></w:r>';
    }
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + docPr + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' + graphic + '</wp:inline></w:drawing></w:r>';
  }
  const FIELD = { page: ' PAGE ', pages: ' NUMPAGES ', date: ' DATE \\@ "d \'de\' MMMM \'de\' yyyy" ', time: ' TIME \\@ "HH:mm" ', title: ' TITLE ', author: ' AUTHOR ', words: ' NUMWORDS ' };
  function atomXml(ctx, part, o, m) {
    const doc = ctx.doc;
    switch (o.k) {
      case 'img': return imageXml(ctx, part, o);
      case 'fn': {
        if (!doc.notes[o.id] || part === 'footnotes') return '';
        let n = ctx.noteIds.get(o.id);
        if (n == null) { n = ctx.notes.length + 1; ctx.noteIds.set(o.id, n); ctx.notes.push(o.id); }
        return '<w:r>' + rPrXml(M.without(m, ['sup', 'sub', 'ln', 'cm', 'ins', 'del']), 'FootnoteReference') + '<w:footnoteReference w:id="' + n + '"/></w:r>';
      }
      case 'fld': {
        const txt = PT.view ? PT.view.fieldText(doc, o, null) : o.f === 'page' ? '1' : o.f === 'var' ? (doc.meta.vars || {})[o.name] || '' : '';
        const instr = o.f === 'var' ? ' DOCVARIABLE "' + String(o.name || '').replace(/"/g, '') + '" ' : FIELD[o.f] || ' PAGE ';
        return '<w:fldSimple w:instr="' + xe(instr) + '"><w:r>' + rPrXml(m) + '<w:t xml:space="preserve">' + xe(txt === '#' ? '1' : txt) + '</w:t></w:r></w:fldSimple>';
      }
      case 'eq': return '<w:r>' + rPrXml(M.with(m, { ff: 'Cambria Math', i: true })) + textXml(PT.math ? PT.math.toText(o.tex) : o.tex || '') + '</w:r>';
      default: { const t = PT.convert ? PT.convert.atomText(doc, o) : ''; return t ? '<w:r>' + rPrXml(m) + textXml(t) + '</w:r>' : ''; }
    }
  }
  function runsXml(ctx, part, p) {
    let out = '', pos = 0, link = null, linkBuf = '';
    const flushLink = () => {
      if (!link) return;
      if (link[0] === '#') { const bm = ctx.bookmarks.get(link.slice(1)); out += bm ? '<w:hyperlink w:anchor="' + bm.name + '" w:history="1">' + linkBuf + '</w:hyperlink>' : linkBuf; }
      else out += '<w:hyperlink r:id="' + ctx.rel(part, REL + 'hyperlink', link, true) + '" w:history="1">' + linkBuf + '</w:hyperlink>';
      link = null; linkBuf = '';
    };
    for (const r of p.runs) {
      const len = R.rlen(r), start = pos;
      pos += len;
      const starts = ctx.cmStart.get(p.id + ':' + start);
      if (starts) { flushLink(); for (const n of starts) out += '<w:commentRangeStart w:id="' + n + '"/>'; }
      const m = r.m;
      let x;
      if (r.o) x = atomXml(ctx, part, r.o, M.without(m, ['ln', 'cm', 'ins', 'del']));
      else x = '<w:r>' + rPrXml(M.without(m, ['ln', 'cm', 'ins', 'del']), m.ln ? 'Hyperlink' : null) + textXml(r.x, !!m.del) + '</w:r>';
      if (m.del) { const s = O.stampInfo(m.del); x = '<w:del w:id="' + ctx.revId++ + '" w:author="' + xe(s.by || 'Autor') + '" w:date="' + isoW(s.at) + '">' + x.replace(/<w:t /g, '<w:delText ').replace(/<\/w:t>/g, '</w:delText>') + '</w:del>'; }
      else if (m.ins) { const s = O.stampInfo(m.ins); x = '<w:ins w:id="' + ctx.revId++ + '" w:author="' + xe(s.by || 'Autor') + '" w:date="' + isoW(s.at) + '">' + x + '</w:ins>'; }
      const ln = m.ln && !r.o ? m.ln : m.ln && r.o && r.o.k === 'img' ? m.ln : null;
      if (ln !== link) { flushLink(); link = ln; }
      if (link) linkBuf += x; else out += x;
      const ends = ctx.cmEnd.get(p.id + ':' + pos);
      if (ends) { flushLink(); for (const n of ends) out += '<w:commentRangeEnd w:id="' + n + '"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="' + n + '"/></w:r>'; }
    }
    flushLink();
    return out;
  }
  function pPrXml(ctx, p, extra) {
    let s = '';
    if (p.st && p.st !== 'normal' && ctx.doc.styles[p.st]) s += '<w:pStyle w:val="' + styleIdOf(p.st) + '"/>';
    if (p.kn) s += '<w:keepNext/>';
    if (p.kl) s += '<w:keepLines/>';
    if (p.pb) s += '<w:pageBreakBefore/>';
    const numId = p.ls ? ctx.numId(p) : null;
    if (numId) s += '<w:numPr><w:ilvl w:val="' + PT.clamp(p.ls.l | 0, 0, 8) + '"/><w:numId w:val="' + numId + '"/></w:numPr>';
    if (p.bdr || (extra && extra.hr)) {
      const b = (extra && extra.hr) ? { b: '0.75 solid #a6a6a6' } : p.bdr;
      s += '<w:pBdr>' + [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right']].filter(([k]) => b[k]).map(([k, tag]) => borderXml(tag, b[k]).replace('w:space="0"', 'w:space="1"')).join('') + '</w:pBdr>';
    }
    if (p.bg) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + hex6(p.bg) + '"/>';
    if (extra && extra.tabs) s += extra.tabs;
    if (p.rtl) s += '<w:bidi/>';
    if (p.spB != null || p.spA != null || p.lh != null || p.lhx != null) s += '<w:spacing' + (p.spB != null ? ' w:before="' + twip(p.spB) + '"' : '') + (p.spA != null ? ' w:after="' + twip(p.spA) + '"' : '') + (p.lhx ? ' w:line="' + twip(p.lhx) + '" w:lineRule="exact"' : p.lh != null ? ' w:line="' + Math.round(p.lh * 240) + '" w:lineRule="auto"' : '') + '/>';
    if (p.inL != null || p.inR != null || p.inF != null) s += '<w:ind' + (p.inL != null ? ' w:left="' + twip(p.inL) + '"' : '') + (p.inR != null ? ' w:right="' + twip(p.inR) + '"' : '') + (p.inF > 0 ? ' w:firstLine="' + twip(p.inF) + '"' : p.inF < 0 ? ' w:hanging="' + twip(-p.inF) + '"' : '') + '/>';
    if (p.al) s += '<w:jc w:val="' + (p.al === 'justify' ? 'both' : p.al) + '"/>';
    if (p.pm) s += rPrXml(M.intern(p.pm));
    return s ? '<w:pPr>' + s + '</w:pPr>' : '';
  }
  function paraXml(ctx, part, p) {
    const bm = ctx.bookmarks.get(p.id);
    const body = runsXml(ctx, part, p);
    return '<w:p>' + pPrXml(ctx, p) + (bm ? '<w:bookmarkStart w:id="' + bm.n + '" w:name="' + bm.name + '"/>' : '') + body + (bm ? '<w:bookmarkEnd w:id="' + bm.n + '"/>' : '') + '</w:p>';
  }
  function tableXml(ctx, part, t) {
    const width = t.cols.reduce((s, x) => s + x, 0);
    const bd = t.bd;
    let s = '<w:tbl><w:tblPr><w:tblW w:w="' + twip(width) + '" w:type="dxa"/>' + (t.al ? '<w:jc w:val="' + t.al + '"/>' : '') + (t.ind ? '<w:tblInd w:w="' + twip(t.ind) + '" w:type="dxa"/>' : '') +
      '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => borderXml(k, bd)).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>';
    s += '<w:tblGrid>' + t.cols.map((w) => '<w:gridCol w:w="' + twip(w) + '"/>').join('') + '</w:tblGrid>';
    t.rows.forEach((row, r) => {
      s += '<w:tr>' + (row.h || row.hd ? '<w:trPr>' + (row.h ? '<w:trHeight w:val="' + twip(row.h) + '"/>' : '') + (row.hd ? '<w:tblHeader/>' : '') + '</w:trPr>' : '');
      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c];
        if (cell.mh) continue;
        let cs = 1;
        while (c + cs < row.cells.length && row.cells[c + cs].mh) cs++;
        const master = cell.mv ? t.rows[O.masterOf(t, r, c).r].cells[O.masterOf(t, r, c).c] : cell;
        const rs = cell.mv ? 1 : O.spanOf(t, r, c).rs;
        let w = 0;
        for (let k = 0; k < cs; k++) w += t.cols[c + k] || 0;
        let tc = '<w:tcW w:w="' + twip(w) + '" w:type="dxa"/>' + (cs > 1 ? '<w:gridSpan w:val="' + cs + '"/>' : '') + (cell.mv ? '<w:vMerge/>' : rs > 1 ? '<w:vMerge w:val="restart"/>' : '');
        const cb = master.bd;
        if (cb) tc += '<w:tcBorders>' + [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right']].filter(([k]) => cb[k] != null).map(([k, tag]) => borderXml(tag, cb[k])).join('') + '</w:tcBorders>';
        if (master.bg) tc += '<w:shd w:val="clear" w:color="auto" w:fill="' + hex6(master.bg) + '"/>';
        if (master.va) tc += '<w:vAlign w:val="' + (master.va === 'middle' ? 'center' : master.va) + '"/>';
        let content = cell.mv ? '<w:p/>' : blocksXml(ctx, part, cell.blocks);
        if (!/<w:p[ >/]/.test(content.slice(-400)) || /<\/w:tbl>$/.test(content)) content += '<w:p/>';
        s += '<w:tc><w:tcPr>' + tc + '</w:tcPr>' + content + '</w:tc>';
      }
      s += '</w:tr>';
    });
    return s + '</w:tbl>';
  }
  function tocXml(ctx, part, b) {
    const doc = ctx.doc, cw = PT.pageDims(doc.page).cw;
    const entries = [];
    for (const id of doc.parasOf('body')) { const p = doc.block(id), l = doc.headingLevel(p); if (l && l <= (b.lv || 3)) { const text = R.text(p.runs.filter((r) => !r.o && !r.m.del)).trim(); if (text) entries.push({ id, lvl: l, text }); } }
    const pageOf = (id) => (typeof window !== 'undefined' && PT.app && PT.app.layout ? String(PT.app.layout.pageOfId(id) || '') : '');
    let s = b.title ? '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t xml:space="preserve">' + xe(b.title) + '</w:t></w:r></w:p>' : '';
    const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-' + (b.lv || 3) + '" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const tabs = '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="' + twip(cw) + '"/></w:tabs>';
    if (!entries.length) s += '<w:p>' + begin + '<w:r><w:t>No hay entradas de índice.</w:t></w:r>' + end + '</w:p>';
    entries.forEach((e, i) => {
      const bm = ctx.bookmarks.get(e.id);
      s += '<w:p><w:pPr><w:pStyle w:val="TOC' + e.lvl + '"/>' + tabs + '</w:pPr>' + (i === 0 ? begin : '') + '<w:hyperlink w:anchor="' + (bm ? bm.name : '') + '" w:history="1"><w:r><w:t xml:space="preserve">' + xe(e.text) + '</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>' + xe(pageOf(e.id)) + '</w:t></w:r></w:hyperlink>' + (i === entries.length - 1 ? end : '') + '</w:p>';
    });
    // como Word: el índice va dentro de un control de contenido de tipo «Tabla de contenido»
    return '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>' + s + '</w:sdtContent></w:sdt>';
  }
  function blocksXml(ctx, part, blocks) {
    let s = '';
    for (const b of blocks || []) {
      if (b.t === 'p') s += paraXml(ctx, part, b);
      else if (b.t === 'table') s += (b.pb ? '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:after="0"/></w:pPr></w:p>' : '') + tableXml(ctx, part, b);
      else if (b.t === 'hr') s += '<w:p>' + pPrXml(ctx, {}, { hr: true }) + '</w:p>';
      else if (b.t === 'toc') s += tocXml(ctx, part, b);
    }
    return s;
  }
  function stylePPr(p) {
    const q = Object.assign({}, p);
    return pPrXml({ doc: { styles: {}, lists: {} }, numId: () => null }, Object.assign({ t: 'p' }, q, { st: null, ls: null }));
  }
  function stylesXml(doc) {
    const nst = doc.style('normal');
    const ff = nst.r.ff || 'Calibri', fs = nst.r.fs || 11;
    let s = XHDR + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + xe(ff) + '" w:eastAsia="' + xe(ff) + '" w:hAnsi="' + xe(ff) + '" w:cs="' + xe(ff) + '"/><w:sz w:val="' + hp(fs) + '"/><w:szCs w:val="' + hp(fs) + '"/><w:lang w:val="' + xe(doc.meta.lang || 'es-ES') + '" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="' + twip(nst.p.spA || 0) + '" w:line="' + Math.round((nst.p.lh || 1) * 240) + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>';
    const ids = Object.keys(doc.styles);
    for (const id of ids) {
      const st = doc.styles[id];
      const sid = styleIdOf(id), name = STYLE_NAMES[id] || st.name || id;
      const base = st.base && doc.styles[st.base] ? styleIdOf(st.base) : id === 'normal' ? null : 'Normal';
      const next = st.next && doc.styles[st.next] ? styleIdOf(st.next) : null;
      const p = Object.assign({}, st.p || {});
      const lvl = st.lvl;
      let ppr = stylePPr(p);
      if (lvl >= 1 && lvl <= 6) ppr = ppr ? ppr.replace('</w:pPr>', '<w:outlineLvl w:val="' + (lvl - 1) + '"/></w:pPr>') : '<w:pPr><w:outlineLvl w:val="' + (lvl - 1) + '"/></w:pPr>';
      s += '<w:style w:type="paragraph"' + (id === 'normal' ? ' w:default="1"' : '') + (st.builtin ? '' : ' w:customStyle="1"') + ' w:styleId="' + sid + '"><w:name w:val="' + xe(name) + '"/>' + (base ? '<w:basedOn w:val="' + base + '"/>' : '') + (next ? '<w:next w:val="' + next + '"/>' : '') + (lvl >= 0 && lvl <= 6 && lvl != null ? '<w:uiPriority w:val="' + (lvl ? 9 : 10) + '"/>' : '') + '<w:qFormat/>' + ppr + rPrXml(st.r || {}) + '</w:style>';
    }
    s += '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Header"/></w:style>';
    s += '<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>';
    s += '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/></w:style>';
    for (let k = 1; k <= 6; k++) s += '<w:style w:type="paragraph" w:styleId="TOC' + k + '"><w:name w:val="toc ' + k + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="100"/><w:ind w:left="' + (k - 1) * 220 + '"/></w:pPr></w:style>';
    s += '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>';
    s += '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>';
    s += '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>';
    s += '<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>';
    s += '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>';
    s += '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>';
    return s + '</w:styles>';
  }
  function numberingXml(ctx) {
    let abs = '', nums = '';
    ctx.numDefs.forEach((d, i) => {
      const kind = d.def.k;
      let lv = '';
      for (let l = 0; l < 9; l++) {
        const f = PT.listLevel(kind, l);
        const ind = '<w:pPr><w:ind w:left="' + 720 * (l + 1) + '" w:hanging="360"/></w:pPr>';
        if (f.check) lv += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + (d.checked ? '☒' : '☐') + '"/><w:lvlJc w:val="left"/>' + ind + '<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:hint="default"/></w:rPr></w:lvl>';
        else if (f.bullet) lv += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + xe(f.bullet) + '"/><w:lvlJc w:val="left"/>' + ind + BULLET_FONT + '</w:lvl>';
        else {
          const text = f.outline ? Array.from({ length: l + 1 }, (_, k) => '%' + (k + 1)).join('.') + '.' : '%' + (l + 1) + f.suffix;
          lv += '<w:lvl w:ilvl="' + l + '"><w:start w:val="' + (l === 0 ? Math.max(0, d.def.start || 1) : 1) + '"/><w:numFmt w:val="' + (NUMFMT[f.fmt] || 'decimal') + '"/><w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/>' + ind + '</w:lvl>';
        }
      }
      abs += '<w:abstractNum w:abstractNumId="' + i + '"><w:multiLevelType w:val="hybridMultilevel"/>' + lv + '</w:abstractNum>';
      nums += '<w:num w:numId="' + (i + 1) + '"><w:abstractNumId w:val="' + i + '"/></w:num>';
    });
    return XHDR + '<w:numbering ' + NS + '>' + abs + nums + '</w:numbering>';
  }
  function relsXml(rels) {
    return XHDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.map((r) => '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + xe(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>').join('') + '</Relationships>';
  }

  async function write(doc) {
    const ctx = new WCtx(doc);
    ctx.images = await prepareImages(doc);
    const files = [];
    const pg = doc.page, d = PT.pageDims(pg);
    // encabezados y pies
    const hfRefs = [];
    let hfN = 0;
    for (const [story, kind, type] of [['hdr', 'header', 'default'], ['hdr1', 'header', 'first'], ['ftr', 'footer', 'default'], ['ftr1', 'footer', 'first']]) {
      const list = doc.storyList(story);
      const needed = list.some((b) => b.t !== 'p' || b.runs.length) || (type === 'first' && pg.first);
      if (!needed) continue;
      if (type === 'first' && !pg.first) continue;
      hfN++;
      const name = kind + hfN + '.xml';
      const tag = kind === 'header' ? 'w:hdr' : 'w:ftr';
      let content = blocksXml(ctx, name, list);
      if (!content) content = '<w:p><w:pPr><w:pStyle w:val="' + (kind === 'header' ? 'Header' : 'Footer') + '"/></w:pPr></w:p>';
      files.push({ name: 'word/' + name, data: XHDR + '<' + tag + ' ' + NS + '>' + content + '</' + tag + '>' });
      hfRefs.push({ kind, type, rid: ctx.rel('document', REL + kind, name), name });
    }
    let body = blocksXml(ctx, 'document', doc.body);
    // notas al pie (pueden añadir imágenes y vínculos a su parte)
    let footnotes = null;
    if (ctx.notes.length) {
      let fx = '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';
      ctx.notes.forEach((id, k) => {
        const blocks = doc.notes[id].blocks.length ? doc.notes[id].blocks : [P.make({ st: 'fnote' })];
        let inner = blocksXml(ctx, 'footnotes', blocks);
        inner = inner.replace(/^(<w:p>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)/, '$1<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>');
        fx += '<w:footnote w:id="' + (k + 1) + '">' + inner + '</w:footnote>';
      });
      footnotes = XHDR + '<w:footnotes ' + NS + '>' + fx + '</w:footnotes>';
      ctx.rel('document', REL + 'footnotes', 'footnotes.xml');
    }
    // comentarios
    let comments = null;
    if (ctx.cmIds.size) {
      let cx = '';
      for (const [cid, n] of ctx.cmIds) {
        const c = doc.comments[cid];
        const by = c.by || 'Autor', initials = by.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase();
        const paras = [c.text || ''].concat((c.re || []).map((r) => (r.by || '') + ': ' + (r.text || '')));
        cx += '<w:comment w:id="' + n + '" w:author="' + xe(by) + '" w:date="' + isoW(c.at) + '" w:initials="' + xe(initials) + '">' + paras.map((t, i) => '<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>' + (i === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : '') + '<w:r>' + textXml(String(t)) + '</w:r></w:p>').join('') + '</w:comment>';
      }
      comments = XHDR + '<w:comments ' + NS + '>' + cx + '</w:comments>';
      ctx.rel('document', REL + 'comments', 'comments.xml');
    }
    ctx.rel('document', REL + 'styles', 'styles.xml');
    ctx.rel('document', REL + 'settings', 'settings.xml');
    if (ctx.numDefs.length) ctx.rel('document', REL + 'numbering', 'numbering.xml');
    const land = pg.orient === 'landscape';
    const sect = '<w:sectPr>' + hfRefs.map((h) => '<w:' + h.kind + 'Reference w:type="' + h.type + '" r:id="' + h.rid + '"/>').join('') +
      '<w:pgSz w:w="' + twip(d.W) + '" w:h="' + twip(d.H) + '"' + (land ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + twip(d.mt) + '" w:right="' + twip(d.mr) + '" w:bottom="' + twip(d.mb) + '" w:left="' + twip(d.ml) + '" w:header="' + twip(d.hd) + '" w:footer="' + twip(d.fd) + '" w:gutter="0"/>' +
      (pg.lnNum && pg.lnNum.on ? '<w:lnNumType w:countBy="' + (pg.lnNum.by || 1) + '" w:distance="284" w:restart="' + (pg.lnNum.restart === 'page' ? 'newPage' : 'continuous') + '"/>' : '') +
      (pg.start && pg.start !== 1 ? '<w:pgNumType w:start="' + pg.start + '"/>' : '') + '<w:cols w:space="708"/>' + (pg.first ? '<w:titlePg/>' : '') + '<w:docGrid w:linePitch="360"/></w:sectPr>';
    const documentXml = XHDR + '<w:document ' + NS + '><w:body>' + body + sect + '</w:body></w:document>';
    body = null;
    const vars = Object.keys(doc.meta.vars || {}).filter((k) => k);
    const docVars = vars.length ? '<w:docVars>' + vars.map((k) => '<w:docVar w:name="' + xe(k) + '" w:val="' + xe(String(doc.meta.vars[k] == null ? '' : doc.meta.vars[k])) + '"/>').join('') + '</w:docVars>' : '';
    const settings = XHDR + '<w:settings ' + NS + '><w:zoom w:percent="100"/>' + (doc.track ? '<w:trackRevisions/>' : '') + '<w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>' + (footnotes ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : '') + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' + docVars + '</w:settings>';
    const m = doc.meta;
    const core = XHDR + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xe(m.title || '') + '</dc:title><dc:subject>' + xe(m.subject || '') + '</dc:subject><dc:creator>' + xe(m.author || PT.locale.author || '') + '</dc:creator><cp:keywords>' + xe(m.keywords || '') + '</cp:keywords><cp:lastModifiedBy>' + xe(PT.locale.author || '') + '</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">' + isoW(m.created) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + isoW(new Date().toISOString()) + '</dcterms:modified></cp:coreProperties>';
    const words = PT.countWords(doc.plainText('body'));
    const pages = typeof window !== 'undefined' && PT.app && PT.app.layout ? PT.app.layout.count : 1;
    const app = XHDR + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Procesador de texto</Application><Pages>' + pages + '</Pages><Words>' + words + '</Words><AppVersion>' + PT.VERSION.replace(/^(\d+)\.(\d+).*$/, '$1.$2') + '</AppVersion></Properties>';
    const exts = new Set(ctx.media.map((x) => x.ext));
    const contentTypes = XHDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Array.from(exts).map((e) => '<Default Extension="' + e + '" ContentType="image/' + e + '"/>').join('') +
      '<Override PartName="/word/document.xml" ContentType="' + CT + 'wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="' + CT + 'wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="' + CT + 'wordprocessingml.settings+xml"/>' +
      (ctx.numDefs.length ? '<Override PartName="/word/numbering.xml" ContentType="' + CT + 'wordprocessingml.numbering+xml"/>' : '') +
      (footnotes ? '<Override PartName="/word/footnotes.xml" ContentType="' + CT + 'wordprocessingml.footnotes+xml"/>' : '') +
      (comments ? '<Override PartName="/word/comments.xml" ContentType="' + CT + 'wordprocessingml.comments+xml"/>' : '') +
      hfRefs.map((h) => '<Override PartName="/word/' + h.name + '" ContentType="' + CT + 'wordprocessingml.' + h.kind + '+xml"/>').join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="' + CT + 'extended-properties+xml"/></Types>';
    files.unshift(
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: relsXml([{ id: 'rId1', type: REL + 'officeDocument', target: 'word/document.xml' }, { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' }, { id: 'rId3', type: REL + 'extended-properties', target: 'docProps/app.xml' }]) },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: stylesXml(doc) },
      { name: 'word/settings.xml', data: settings });
    if (ctx.numDefs.length) files.push({ name: 'word/numbering.xml', data: numberingXml(ctx) });
    if (footnotes) files.push({ name: 'word/footnotes.xml', data: footnotes });
    if (comments) files.push({ name: 'word/comments.xml', data: comments });
    for (const partName in ctx.parts) {
      const relName = partName === 'document' ? 'document.xml' : partName === 'footnotes' ? 'footnotes.xml' : partName;
      if (ctx.parts[partName].rels.length) files.push({ name: 'word/_rels/' + relName + '.rels', data: relsXml(ctx.parts[partName].rels) });
    }
    for (const md of ctx.media) files.push({ name: 'word/media/' + md.name, data: md.bytes, store: true });
    files.push({ name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app });
    return PT.zip.zip(files, CT + 'wordprocessingml.document');
  }

  // ================================================================ lectura
  const NAME_MAP = [
    [/^(heading|t[ií]tulo|encabezado)\s*([1-9])$/, (m) => 'h' + Math.min(6, +m[2])],
    [/^(title|t[ií]tulo)$/, () => 'title'], [/^(subtitle|subt[ií]tulo)$/, () => 'subtitle'],
    [/^(quote|cita|intense quote|cita destacada)$/, () => 'quote'], [/^(no spacing|sin espaciado)$/, () => 'nospace'],
    [/^(caption|descripci[oó]n|epígrafe)$/, () => 'caption'], [/^(footnote text|texto nota pie|texto de nota al pie|endnote text)$/, () => 'fnote'],
    [/^(header|footer|encabezado|pie de p[aá]gina)$/, () => 'hf'], [/^(normal|list paragraph|p[aá]rrafo de lista|normal \(web\)|body text|texto independiente)$/, () => 'normal'],
    [/^(c[oó]digo|code|html preformatted|html con formato previo|plain text|texto sin formato)$/, () => 'code'],
  ];
  function mapStyleName(name) {
    const n = String(name || '').toLowerCase().trim();
    for (const [re, f] of NAME_MAP) { const m = re.exec(n); if (m) return f(m); }
    return null;
  }
  const SYM = { F0B7: '•', F0A7: '▪', F076: '❖', F0D8: '➢', F0FC: '✓', F06E: '■', F0A8: '◻', F0E0: '→', F02D: '–', F06F: '□', F071: '❑', F0FE: '☒' };

  function parseRels(text) {
    const out = {};
    if (!text) return out;
    for (const r of X.kids(X.root(X.parse(text)), 'pr:Relationship')) out[X.attr(r, 'Id')] = { type: X.attr(r, 'Type') || '', target: X.attr(r, 'Target') || '', mode: X.attr(r, 'TargetMode') };
    return out;
  }
  const joinPath = (dir, target) => {
    if (/^\//.test(target)) return target.slice(1);
    const parts = (dir + target).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
    return out.join('/');
  };
  async function loadMedia(z, rels, dir) {
    const out = {};
    for (const id in rels) {
      const r = rels[id];
      if (!/\/image$/.test(r.type) || r.mode === 'External') continue;
      const path = joinPath(dir, r.target);
      const bytes = await z.bytes(path);
      if (!bytes) continue;
      const ext = (/\.([a-z0-9]+)$/i.exec(path) || [])[1] || 'png';
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' }[ext.toLowerCase()];
      if (!mime) continue; // EMF/WMF no se pueden mostrar en el navegador
      out[id] = 'data:' + mime + ';base64,' + toB64(bytes);
    }
    return out;
  }

  class RCtx {
    constructor(z) { this.z = z; this.doc = PT.Doc.blank(); this.styles = {}; this.used = new Set(); this.theme = { major: 'Calibri Light', minor: 'Calibri', colors: {} }; this.abs = {}; this.nums = {}; this.bookmarks = new Map(); this.links = []; this.comments = new Map(); this.unknownImages = 0; this.lostObjects = 0; }
  }

  // ------------------------------------------------------------ tema, estilos y numeración
  function readTheme(ctx, text) {
    if (!text) return;
    const t = X.parse(text);
    const fs = X.find(t, 'a:fontScheme');
    if (fs) {
      const maj = X.kid(X.kid(fs, 'a:majorFont'), 'a:latin'), min = X.kid(X.kid(fs, 'a:minorFont'), 'a:latin');
      if (maj && X.attr(maj, 'typeface')) ctx.theme.major = X.attr(maj, 'typeface');
      if (min && X.attr(min, 'typeface')) ctx.theme.minor = X.attr(min, 'typeface');
    }
    const cs = X.find(t, 'a:clrScheme');
    if (cs) for (const c of X.kids(cs)) {
      const k = c.n.replace('a:', ''), v = X.kid(c, 'a:srgbClr') || X.kid(c, 'a:sysClr');
      if (v) ctx.theme.colors[k] = '#' + (X.attr(v, 'val') === 'windowText' ? '000000' : X.attr(v, 'val') === 'window' ? 'FFFFFF' : X.attr(v, 'lastClr') || X.attr(v, 'val')).toLowerCase();
    }
  }
  const THEME_COLOR = { text1: 'dk1', dark1: 'dk1', background1: 'lt1', light1: 'lt1', text2: 'dk2', dark2: 'dk2', background2: 'lt2', light2: 'lt2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hyperlink: 'hlink', followedHyperlink: 'folHlink' };
  function colorOf(ctx, el) {
    if (!el) return null;
    const tc = X.attr(el, 'w:themeColor');
    let c = null;
    if (tc && ctx.theme.colors[THEME_COLOR[tc] || tc]) {
      c = ctx.theme.colors[THEME_COLOR[tc] || tc];
      const shade = X.attr(el, 'w:themeShade'), tint = X.attr(el, 'w:themeTint');
      if (shade) c = PT.mixColor(c, '#000000', 1 - parseInt(shade, 16) / 255);
      if (tint) c = PT.mixColor(c, '#ffffff', 1 - parseInt(tint, 16) / 255);
    }
    if (!c) { const v = X.attr(el, 'w:val'); if (v && v !== 'auto') c = PT.hex(v); }
    return c;
  }
  function fontOf(ctx, rf) {
    if (!rf) return null;
    const theme = X.attr(rf, 'w:asciiTheme') || X.attr(rf, 'w:hAnsiTheme');
    if (theme) return /major/i.test(theme) ? ctx.theme.major : ctx.theme.minor;
    return X.attr(rf, 'w:ascii') || X.attr(rf, 'w:hAnsi') || X.attr(rf, 'w:cs') || X.attr(rf, 'w:eastAsia') || null;
  }
  function readRPr(ctx, rPr) {
    const m = {};
    if (!rPr) return m;
    const ff = fontOf(ctx, X.kid(rPr, 'w:rFonts'));
    if (ff) m.ff = ff;
    for (const [tag, key] of [['w:b', 'b'], ['w:i', 'i'], ['w:caps', 'caps'], ['w:smallCaps', 'sc'], ['w:strike', 's'], ['w:dstrike', 's']]) { const v = X.on(rPr, tag); if (v != null) m[key] = v || (key === 's' ? m.s || null : false); }
    const u = X.kid(rPr, 'w:u');
    if (u) { const v = X.attr(u, 'w:val') || 'single'; m.u = v === 'none' ? false : v === 'double' ? 'double' : /dot/.test(v) ? 'dotted' : /dash/.test(v) ? 'dashed' : /wave/.test(v) ? 'wavy' : true; }
    const c = colorOf(ctx, X.kid(rPr, 'w:color'));
    if (c) m.fc = c;
    const sz = X.val(rPr, 'w:sz');
    if (sz) m.fs = +sz / 2;
    const hl = X.val(rPr, 'w:highlight');
    if (hl && hl !== 'none' && PT.HIGHLIGHT[hl]) m.hl = PT.HIGHLIGHT[hl];
    const shd = X.kid(rPr, 'w:shd');
    if (shd && !m.hl) { const f = X.attr(shd, 'w:fill'); if (f && f !== 'auto' && /^[0-9a-f]{6}$/i.test(f) && f.toUpperCase() !== 'FFFFFF') m.hl = '#' + f.toLowerCase(); }
    const va = X.val(rPr, 'w:vertAlign');
    if (va === 'superscript') m.sup = true; else if (va === 'subscript') m.sub = true;
    const sp = X.val(rPr, 'w:spacing');
    if (sp && +sp) m.sp = PT.round(+sp / 20, 1);
    return m;
  }
  function readPPr(ctx, pPr) {
    const p = {};
    if (!pPr) return p;
    const jc = X.val(pPr, 'w:jc');
    if (jc) p.al = /center/.test(jc) ? 'center' : /right|end/.test(jc) ? 'right' : /both|distribute|justify/.test(jc) ? 'justify' : 'left';
    const ind = X.kid(pPr, 'w:ind');
    if (ind) {
      const g = (k) => { const v = X.attr(ind, k); return v != null ? +v / 20 : null; };
      const l = g('w:left') != null ? g('w:left') : g('w:start'), r = g('w:right') != null ? g('w:right') : g('w:end');
      if (l != null) p.inL = PT.round(l, 1);
      if (r != null) p.inR = PT.round(r, 1);
      if (g('w:hanging') != null) p.inF = -PT.round(g('w:hanging'), 1); else if (g('w:firstLine') != null) p.inF = PT.round(g('w:firstLine'), 1);
    }
    const sp = X.kid(pPr, 'w:spacing');
    if (sp) {
      const b = X.attr(sp, 'w:before'), a = X.attr(sp, 'w:after'), line = X.attr(sp, 'w:line'), rule = X.attr(sp, 'w:lineRule');
      if (b != null && X.attr(sp, 'w:beforeAutospacing') !== '1') p.spB = PT.round(+b / 20, 1);
      if (a != null && X.attr(sp, 'w:afterAutospacing') !== '1') p.spA = PT.round(+a / 20, 1);
      if (line != null) { if (!rule || rule === 'auto') p.lh = PT.round(+line / 240, 2); else p.lhx = PT.round(+line / 20, 1); }
    }
    if (X.on(pPr, 'w:keepNext')) p.kn = true; else if (X.on(pPr, 'w:keepNext') === false) p.kn = false;
    if (X.on(pPr, 'w:keepLines')) p.kl = true;
    if (X.on(pPr, 'w:pageBreakBefore')) p.pb = true;
    if (X.on(pPr, 'w:bidi')) p.rtl = true;
    const shd = X.kid(pPr, 'w:shd');
    if (shd) { const f = X.attr(shd, 'w:fill'); if (f && f !== 'auto' && /^[0-9a-f]{6}$/i.test(f) && f.toUpperCase() !== 'FFFFFF') p.bg = '#' + f.toLowerCase(); }
    const bdr = X.kid(pPr, 'w:pBdr');
    if (bdr) {
      const b = {};
      for (const [tag, k] of [['w:top', 't'], ['w:bottom', 'b'], ['w:left', 'l'], ['w:right', 'r']]) {
        const e = X.kid(bdr, tag);
        if (!e) continue;
        const v = X.attr(e, 'w:val');
        if (!v || v === 'nil' || v === 'none') continue;
        const c = colorOf(ctx, e) || '#000000';
        b[k] = PT.round((+X.attr(e, 'w:sz') || 4) / 8, 2) + ' ' + (v === 'double' ? 'double' : /dot/.test(v) ? 'dotted' : /dash/.test(v) ? 'dashed' : 'solid') + ' ' + c;
      }
      if (Object.keys(b).length) p.bdr = b;
    }
    const fp = X.kid(pPr, 'w:framePr');
    if (fp && X.attr(fp, 'w:dropCap')) p.dc = true;
    const num = X.kid(pPr, 'w:numPr');
    if (num) { const id = X.val(num, 'w:numId'); if (id && id !== '0') p._num = { id, l: +(X.val(num, 'w:ilvl') || 0) }; else if (id === '0') p._num = { id: '0' }; }
    const ol = X.val(pPr, 'w:outlineLvl');
    if (ol != null && +ol < 9) p._ol = +ol;
    return p;
  }
  function readStyles(ctx, text) {
    if (!text) return;
    const t = X.root(X.parse(text));
    const dd = X.kid(t, 'w:docDefaults');
    ctx.defR = dd ? readRPr(ctx, X.kid(X.kid(dd, 'w:rPrDefault'), 'w:rPr')) : {};
    ctx.defP = dd ? readPPr(ctx, X.kid(X.kid(dd, 'w:pPrDefault'), 'w:pPr')) : {};
    for (const s of X.kids(t, 'w:style')) {
      const id = X.attr(s, 'w:styleId'), type = X.attr(s, 'w:type') || 'paragraph';
      ctx.styles[id] = { id, type, name: X.val(s, 'w:name') || id, base: X.val(s, 'w:basedOn'), next: X.val(s, 'w:next'), p: readPPr(ctx, X.kid(s, 'w:pPr')), r: readRPr(ctx, X.kid(s, 'w:rPr')), def: X.attr(s, 'w:default') === '1', tbl: X.kid(s, 'w:tblPr') };
    }
  }
  // id de nuestro estilo para un estilo de Word; crea los estilos propios que se usen
  function styleFor(ctx, wid) {
    if (!wid) return 'normal';
    const s = ctx.styles[wid];
    if (!s) return 'normal';
    if (s.ours) return s.ours;
    const mapped = mapStyleName(s.name) || mapStyleName(wid.replace(/(\D)(\d)$/, '$1 $2')) || (s.def ? 'normal' : null);
    const doc = ctx.doc;
    if (mapped) {
      s.ours = mapped;
      if (!ctx.used.has(mapped)) {
        ctx.used.add(mapped);
        const st = doc.styles[mapped];
        const p = Object.assign({}, s.p), r = Object.assign({}, s.r);
        delete p._num; delete p._ol;
        if (mapped === 'normal') { Object.assign(st, { p: Object.assign({ spA: 0, lh: 1 }, cleanP(ctx.defP), cleanP(p)), r: Object.assign({ ff: 'Times New Roman', fs: 10 }, ctx.defR, r) }); }
        else {
          // herencia de Word: lo que no define el estilo viene de su estilo base
          const chain = [];
          for (let b = s.base, k = 0; b && ctx.styles[b] && k < 10; b = ctx.styles[b].base, k++) chain.unshift(ctx.styles[b]);
          const fullP = {}, fullR = {};
          for (const x of chain) { if (mapStyleName(x.name) === 'normal' || x.def) continue; Object.assign(fullP, cleanP(x.p)); Object.assign(fullR, x.r); }
          Object.assign(st, { base: 'normal', p: Object.assign(fullP, cleanP(p)), r: Object.assign(fullR, r) });
          if (s.next) { const nx = ctx.styles[s.next]; const nm = nx ? mapStyleName(nx.name) : null; if (nm) st.next = nm; }
        }
      }
      return mapped;
    }
    // estilo propio del documento
    const ours = 'x' + wid.replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
    s.ours = ours;
    const base = s.base ? styleFor(ctx, s.base) : 'normal';
    const p = cleanP(s.p);
    doc.styles[ours] = { name: s.name, base, p, r: Object.assign({}, s.r), lvl: s.p._ol != null ? s.p._ol + 1 : undefined };
    if (s.next && s.next !== wid) { const nx = styleFor(ctx, s.next); if (nx !== ours) doc.styles[ours].next = nx; }
    return ours;
  }
  const cleanP = (p) => { const o = Object.assign({}, p); delete o._num; delete o._ol; delete o.pb; return o; };
  function readNumbering(ctx, text) {
    if (!text) return;
    const t = X.root(X.parse(text));
    for (const a of X.kids(t, 'w:abstractNum')) {
      const levels = [];
      for (const l of X.kids(a, 'w:lvl')) {
        const il = +(X.attr(l, 'w:ilvl') || 0);
        const ind = X.kid(X.kid(l, 'w:pPr'), 'w:ind');
        levels[il] = { fmt: X.val(l, 'w:numFmt') || 'decimal', text: X.val(l, 'w:lvlText') || '', start: +(X.val(l, 'w:start') || 1), left: ind ? +(X.attr(ind, 'w:left') || X.attr(ind, 'w:start') || 0) / 20 : null, hang: ind ? +(X.attr(ind, 'w:hanging') || 0) / 20 : null, font: fontOf(ctx, X.kid(X.kid(l, 'w:rPr'), 'w:rFonts')) };
      }
      ctx.abs[X.attr(a, 'w:abstractNumId')] = { levels, link: X.val(a, 'w:numStyleLink') };
    }
    for (const n of X.kids(t, 'w:num')) {
      const ov = {};
      for (const o of X.kids(n, 'w:lvlOverride')) { const s = X.val(o, 'w:startOverride'); if (s != null) ov[X.attr(o, 'w:ilvl')] = +s; }
      ctx.nums[X.attr(n, 'w:numId')] = { abs: X.val(n, 'w:abstractNumId'), ov };
    }
  }
  function listFor(ctx, numId) {
    const doc = ctx.doc, id = 'L' + numId;
    if (doc.lists[id]) return { id, def: doc.lists[id] };
    const n = ctx.nums[numId];
    const a = n && ctx.abs[n.abs];
    if (!a || !a.levels[0]) return null;
    const l0 = a.levels[0], l1 = a.levels[1];
    let k = 'decimal';
    if (l0.fmt === 'bullet' || l0.fmt === 'none') {
      let ch = l0.text;
      if (/^[-]$/.test(ch)) ch = SYM[ch.charCodeAt(0).toString(16).toUpperCase()] || '•';
      k = /[☐☒□❑◻]/.test(ch) ? 'check' : /[–\-—]/.test(ch) ? 'dash' : /[➢►→➤⮚]/.test(ch) ? 'arrow' : /[■▪§]/.test(ch) ? 'square' : /[◆❖]/.test(ch) ? 'diamond' : /[★☆]/.test(ch) ? 'star' : 'bullet';
      a.checked = /☒/.test(ch);
    } else if (l0.fmt === 'lowerLetter') k = 'lalpha';
    else if (l0.fmt === 'upperLetter') k = 'ualpha';
    else if (l0.fmt === 'lowerRoman') k = 'lroman';
    else if (l0.fmt === 'upperRoman') k = 'uroman';
    else if (l1 && /%1\.%2/.test(l1.text)) k = 'outline';
    else if (/\)\s*$/.test(l0.text)) k = 'paren';
    const def = { k };
    const start = n.ov[0] != null ? n.ov[0] : l0.start;
    if (start != null && start !== 1 && k !== 'check' && !PT.isBulletKind(k)) def.start = start;
    doc.lists[id] = def;
    def._checked = a.checked;
    def._levels = a.levels;
    return { id, def };
  }

  // ------------------------------------------------------------ contenido
  function partReader(ctx, rels, media, partName) {
    const doc = ctx.doc;
    const st = { fields: [], cm: new Set(), tocSkip: 0 };
    const blocksFrom = (nodes, out) => {
      out = out || [];
      for (const n of nodes) {
        if (!n.n) continue;
        if (n.n === 'w:p') paraFrom(n, out);
        else if (n.n === 'w:tbl') { const t = tableFrom(n); if (t) out.push(t); }
        else if (n.n === 'w:sdt') {
          const gal = X.find(X.kid(n, 'w:sdtPr'), 'w:docPartGallery');
          const content = X.kid(n, 'w:sdtContent');
          if (gal && /table of contents/i.test(X.attr(gal, 'w:val') || '')) {
            const ps = X.kids(content, 'w:p');
            const titleP = ps.find((p) => { const s = X.val(X.kid(p, 'w:pPr'), 'w:pStyle'); return s && /toc ?heading|tdc|encabezado de tabla de contenido|ttulodetdc/i.test(s + ' ' + ((ctx.styles[s] || {}).name || '')); });
            const lv = (() => { const instr = X.findAll(content, 'w:instrText').map((x) => X.text(x)).join(''); const m = /\\o\s+"?\d-(\d)/.exec(instr); return m ? +m[1] : 3; })();
            out.push({ t: 'toc', id: PT.uid('c'), lv, title: titleP ? X.text(titleP).trim() || 'Índice' : 'Índice' });
          } else if (content) blocksFrom(content.c, out);
        } else if (n.n === 'mc:AlternateContent') { const ch = X.kid(n, 'mc:Choice') || X.kid(n, 'mc:Fallback'); if (ch) blocksFrom(ch.c, out); }
        else if (n.n === 'w:customXml' || n.n === 'w:smartTag') blocksFrom(n.c, out);
        else if (n.n === 'w:sectPr') ctx.sectPr = ctx.sectPr || (partName === 'document' ? n : null);
      }
      return out;
    };
    const paraFrom = (pn, out) => {
      const pPr = X.kid(pn, 'w:pPr');
      const props = readPPr(ctx, pPr);
      const wst = X.val(pPr, 'w:pStyle');
      const ours = styleFor(ctx, wst || Object.keys(ctx.styles).find((k) => ctx.styles[k].def && ctx.styles[k].type === 'paragraph'));
      const styleDef = ctx.styles[wst];
      const p0 = { t: 'p', id: PT.uid('p') };
      if (ours !== 'normal') p0.st = ours;
      // listas: del párrafo o de su estilo
      let num = props._num || (styleDef && styleDef.p._num);
      if (num && num.id !== '0') {
        const L = listFor(ctx, num.id);
        if (L) {
          p0.ls = { id: L.id, l: PT.clamp(num.l || 0, 0, 8) };
          if (L.def.k === 'check') p0.ck = !!L.def._checked;
          // la sangría de la numeración no se copia al párrafo
          const lev = L.def._levels && L.def._levels[p0.ls.l];
          if (lev && props.inL != null && Math.abs(props.inL - lev.left) < 1) delete props.inL;
          if (lev && props.inF != null && Math.abs(-props.inF - lev.hang) < 1) delete props.inF;
          if (props.inL == null && lev && lev.left != null && Math.abs(lev.left - PT.LIST_INDENT * (p0.ls.l + 1)) > 2) { props.inL = lev.left; props.inF = -(lev.hang || PT.LIST_HANG); }
        }
      }
      for (const k of PT.P_KEYS) if (props[k] != null && !(k in p0) && k !== 'st' && k !== 'ls') p0[k] = props[k];
      // las propiedades iguales a las del estilo se quitan
      const sp = doc.style(p0.st || 'normal').p;
      for (const k of ['al', 'inL', 'inR', 'inF', 'spB', 'spA', 'lh', 'lhx', 'kn', 'kl', 'bg']) if (p0[k] != null && sp[k] === p0[k]) delete p0[k];
      if (p0.al === 'left' && !sp.al) delete p0.al;
      if (p0.kn === false && !sp.kn) delete p0.kn;
      const sectBreak = pPr && X.kid(pPr, 'w:sectPr');
      if (ctx.pendingBreak) { p0.pb = true; ctx.pendingBreak = false; }
      const runs = [];
      const pieces = [{ p: p0, runs }];
      const ctxR = { runs, pieces, para: p0 };
      const inTocBefore = st.tocSkip > 0;
      st.tocTouched = false;
      inlineFrom(pn.c, {}, ctxR);
      if (st.tocTouched) { pieces.forEach((pc) => { if (!pc.runs.length) pc.skip = true; }); }
      // el índice (campo TOC) se sustituye por el bloque de índice automático
      if (ctx.tocPending && !ctx.tocPending.done) { ctx.tocPending.done = true; out.push({ t: 'toc', id: PT.uid('c'), lv: ctx.tocPending.lv, title: null }); }
      // marcas de la marca de párrafo
      const pm = pPr ? readRPr(ctx, X.kid(pPr, 'w:rPr')) : {};
      if (Object.keys(pm).length && !runs.length) p0.pm = cleanMarks(pm, doc.style(p0.st || 'normal').r);
      pieces.forEach((piece, k) => {
        const q = piece.p;
        q.runs = R.normalize(piece.runs);
        if (piece.skip) return;
        if (inTocBefore || st.tocSkip) { if (!q.runs.length || st.tocSkip) return; }
        // párrafo vacío con solo un borde inferior: línea horizontal
        if (!q.runs.length && q.bdr && q.bdr.b && !q.bdr.t && !q.bdr.l && !q.bdr.r && !q.ls) { out.push(PT.blocks.hr()); return; }
        // un salto de página al final del párrafo pasa al párrafo siguiente
        if (k > 0 && !q.runs.length && q.pb) { ctx.pendingBreak = true; return; }
        out.push(q);
      });
      if (sectBreak && X.val(sectBreak, 'w:type') !== 'continuous') ctx.pendingBreak = true;
    };
    const cleanMarks = (m, base) => {
      const o = Object.assign({}, m);
      for (const k of ['ff', 'fs', 'fc', 'b', 'i', 'caps', 'sc', 's']) if (o[k] != null && (o[k] === base[k] || (o[k] === false && !base[k]))) delete o[k];
      if (o.u === false && !base.u) delete o.u;
      return o;
    };
    // contenido en línea de un párrafo (con estado de campos complejos)
    const inlineFrom = (nodes, inh, cr) => {
      for (const n of nodes) {
        if (!n.n) continue;
        switch (n.n) {
          case 'w:r': runFrom(n, inh, cr); break;
          case 'w:hyperlink': {
            const rid = X.attr(n, 'r:id'), anchor = X.attr(n, 'w:anchor');
            let ln = null;
            if (rid && rels[rid]) ln = rels[rid].target + (anchor ? '#' + anchor : '');
            else if (anchor) ln = '#bm:' + anchor;
            if (ln && !/^(https?:|mailto:|tel:|#bm:)/i.test(ln)) ln = /^www\./i.test(ln) ? 'https://' + ln : null;
            inlineFrom(n.c, Object.assign({}, inh, ln ? { ln } : {}), cr);
            break;
          }
          case 'w:ins': case 'w:moveTo': inlineFrom(n.c, Object.assign({}, inh, { ins: (X.attr(n, 'w:author') || 'Autor').replace(/\|/g, '/') + '|' + (X.attr(n, 'w:date') || '') }), cr); break;
          case 'w:del': case 'w:moveFrom': inlineFrom(n.c, Object.assign({}, inh, { del: (X.attr(n, 'w:author') || 'Autor').replace(/\|/g, '/') + '|' + (X.attr(n, 'w:date') || '') }), cr); break;
          case 'w:fldSimple': {
            const instr = (X.attr(n, 'w:instr') || '').trim();
            const f = fieldAtom(instr);
            if (f) push(cr, { o: f, m: inh });
            else if (/^HYPERLINK/i.test(instr)) { const m = /HYPERLINK\s+"([^"]+)"/i.exec(instr); inlineFrom(n.c, Object.assign({}, inh, m ? { ln: m[1] } : {}), cr); }
            else inlineFrom(n.c, inh, cr);
            break;
          }
          case 'w:bookmarkStart': { const name = X.attr(n, 'w:name'); if (name && name !== '_GoBack') ctx.bookmarks.set(name, cr.para.id); break; }
          case 'w:commentRangeStart': { const c = ctx.comments.get(X.attr(n, 'w:id')); if (c) st.cm.add(c); break; }
          case 'w:commentRangeEnd': { const c = ctx.comments.get(X.attr(n, 'w:id')); if (c) st.cm.delete(c); break; }
          case 'w:sdt': { const c = X.kid(n, 'w:sdtContent'); if (c) inlineFrom(c.c, inh, cr); break; }
          case 'w:smartTag': case 'w:customXml': case 'w:dir': case 'w:bdo': inlineFrom(n.c, inh, cr); break;
          case 'mc:AlternateContent': { const ch = X.kid(n, 'mc:Choice') || X.kid(n, 'mc:Fallback'); if (ch) inlineFrom(ch.c, inh, cr); break; }
          case 'm:oMathPara': case 'm:oMath': { const tex = X.findAll(n, 'm:t').map((t) => X.text(t)).join(''); if (tex) push(cr, { o: { k: 'eq', tex }, m: inh }); break; }
          default: break;
        }
      }
    };
    const fieldAtom = (instr) => {
      const w = (/^\s*(\w+)/.exec(instr) || [])[1];
      switch ((w || '').toUpperCase()) {
        case 'PAGE': return { k: 'fld', f: 'page' };
        case 'NUMPAGES': case 'SECTIONPAGES': return { k: 'fld', f: 'pages' };
        case 'DATE': case 'CREATEDATE': case 'SAVEDATE': case 'PRINTDATE': return { k: 'fld', f: 'date' };
        case 'TIME': return { k: 'fld', f: 'time' };
        case 'TITLE': return { k: 'fld', f: 'title' };
        case 'AUTHOR': return { k: 'fld', f: 'author' };
        case 'NUMWORDS': return { k: 'fld', f: 'words' };
        case 'DOCVARIABLE': { const nm = (/^\s*\w+\s+"?([^"\\]+?)"?\s*(\\|$)/.exec(instr) || [])[1]; return nm ? { k: 'fld', f: 'var', name: nm.trim() } : null; }
        default: return null;
      }
    };
    const push = (cr, r) => {
      if (st.fields.some((f) => f.skip)) return;
      const m = Object.assign({}, r.m);
      if (st.cm.size) m.cm = Array.from(st.cm).join(' ');
      const link = st.fields.find((f) => f.ln);
      if (link && !m.ln) m.ln = link.ln;
      if (r.o) cr.runs.push({ o: Object.freeze(r.o), m: M.intern(cleanMarks(M.without(m, []), doc.style(cr.para.st || 'normal').r)) });
      else if (r.x) cr.runs.push({ x: r.x, m: M.intern(cleanMarks(m, doc.style(cr.para.st || 'normal').r)) });
    };
    const runFrom = (rn, inh, cr) => {
      const rPr = X.kid(rn, 'w:rPr');
      let m = readRPr(ctx, rPr);
      const rs = X.val(rPr, 'w:rStyle');
      if (rs && ctx.styles[rs]) {
        const cs = ctx.styles[rs];
        const chain = [];
        for (let b = cs, k = 0; b && k < 8; b = ctx.styles[b.base], k++) chain.unshift(b.r);
        const base = Object.assign({}, ...chain);
        if (/hyperlink|hipervínculo/i.test(cs.name)) { delete base.fc; delete base.u; }
        m = Object.assign(base, m);
      }
      m = Object.assign({}, m, inh);
      if (inh.ln) { if (m.fc && /^#(0563c1|0000ff)$/i.test(m.fc)) delete m.fc; if (m.u === true) delete m.u; }
      for (const c of rn.c) {
        if (!c.n) continue;
        switch (c.n) {
          case 'w:t': case 'w:delText': push(cr, { x: X.text(c), m }); break;
          case 'w:tab': case 'w:ptab': push(cr, { x: '\t', m }); break;
          case 'w:br': {
            const type = X.attr(c, 'w:type');
            if (type === 'page') {
              // salto de página dentro del párrafo: el resto empieza en una página nueva
              if (!cr.runs.length) { cr.para.pb = true; break; }
              const np = PT.para.make(PT.para.props(cr.para));
              np.pb = true;
              cr.runs = [];
              cr.para = np;
              cr.pieces.push({ p: np, runs: cr.runs });
            } else push(cr, { x: '\n', m });
            break;
          }
          case 'w:cr': push(cr, { x: '\n', m }); break;
          case 'w:noBreakHyphen': push(cr, { x: '‑', m }); break;
          case 'w:softHyphen': push(cr, { x: '­', m }); break;
          case 'w:sym': {
            const ch = (X.attr(c, 'w:char') || '').toUpperCase(), code = parseInt(ch, 16);
            push(cr, { x: SYM[ch] || (!ch || isNaN(code) ? '' : code >= 0xf000 && code <= 0xf0ff ? '•' : String.fromCharCode(code)), m });
            break;
          }
          case 'w:drawing': { const im = drawingImage(c); if (im) push(cr, { o: im, m: M.without(m, ['fs', 'b', 'i']) }); else ctx.lostObjects++; break; }
          case 'w:pict': { const im = vmlImage(c); if (im) push(cr, { o: im, m: {} }); else ctx.lostObjects++; break; }
          case 'mc:AlternateContent': { const ch = X.kid(c, 'mc:Choice'); const dr = ch && X.find(ch, 'w:drawing'); const im = dr ? drawingImage(dr) : null; if (im) push(cr, { o: im, m: {} }); else { const fb = X.kid(c, 'mc:Fallback'); const pic = fb && X.find(fb, 'w:pict'); const vi = pic ? vmlImage(pic) : null; if (vi) push(cr, { o: vi, m: {} }); else ctx.lostObjects++; } break; }
          case 'w:footnoteReference': case 'w:endnoteReference': { const id = (c.n === 'w:footnoteReference' ? 'f' : 'e') + X.attr(c, 'w:id'); if (doc.notes[id]) push(cr, { o: { k: 'fn', id }, m: {} }); break; }
          case 'w:fldChar': {
            const t = X.attr(c, 'w:fldCharType');
            if (t === 'begin') st.fields.push({ instr: '', phase: 'instr' });
            else if (t === 'separate') { const f = st.fields[st.fields.length - 1]; if (f) { f.phase = 'result'; fieldStart(f, cr, m); } }
            else if (t === 'end') { const f = st.fields.pop(); if (f) { if (f.phase === 'instr') fieldStart(f, cr, m); if (f.toc) st.tocSkip = Math.max(0, st.tocSkip - 1); } }
            break;
          }
          case 'w:instrText': { const f = st.fields[st.fields.length - 1]; if (f) f.instr += X.text(c); break; }
          default: break;
        }
      }
    };
    const fieldStart = (f, cr, m) => {
      const instr = f.instr.trim();
      const atom = fieldAtom(instr);
      if (atom) { f.skip = false; push(cr, { o: atom, m }); f.skip = true; return; }
      const hl = /^HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(instr);
      if (hl) { f.ln = /\\l/.test(instr) ? '#bm:' + hl[1] : hl[1]; return; }
      if (/^TOC\b/i.test(instr)) {
        f.toc = true; f.skip = true; st.tocSkip++; st.tocTouched = true;
        const lvm = /\\o\s+"?\d-(\d)/.exec(instr);
        ctx.tocPending = { lv: lvm ? +lvm[1] : 3 };
        return;
      }
      if (/^(PAGEREF|REF|SEQ|NOTEREF|STYLEREF|FILENAME|DOCPROPERTY|MERGEFIELD|IF|FORMTEXT)\b/i.test(instr) || !instr) return;
    };
    const drawingImage = (dn) => {
      const holder = X.kid(dn, 'wp:inline') || X.kid(dn, 'wp:anchor');
      if (!holder) return null;
      const blip = X.find(holder, 'a:blip');
      const rid = blip && (X.attr(blip, 'r:embed') || X.attr(blip, 'r:link'));
      let src = rid && media[rid];
      if (!src && rid && rels[rid] && rels[rid].mode === 'External' && /^https?:/i.test(rels[rid].target)) src = rels[rid].target;
      if (!src) { if (blip) ctx.unknownImages++; return null; }
      const ext = X.kid(holder, 'wp:extent');
      const w = ext ? PT.emu2pt(+X.attr(ext, 'cx')) : 200, h = ext ? PT.emu2pt(+X.attr(ext, 'cy')) : 150;
      const dp = X.kid(holder, 'wp:docPr');
      const o = { k: 'img', src, w: PT.round(w, 1) || 100, h: PT.round(h, 1) || 100, alt: (dp && (X.attr(dp, 'descr') || X.attr(dp, 'title'))) || '' };
      if (holder.n === 'wp:anchor') {
        const al = X.text(X.find(X.kid(holder, 'wp:positionH'), 'wp:align'));
        const off = X.find(X.kid(holder, 'wp:positionH'), 'wp:posOffset');
        if (al === 'right' || al === 'outside') o.wrap = 'right';
        else if (al === 'left' || al === 'inside' || (off && +X.text(off) < emu(200))) o.wrap = 'left';
        else o.wrap = X.kid(holder, 'wp:wrapSquare') || X.kid(holder, 'wp:wrapTight') ? 'right' : undefined;
        if (X.kid(holder, 'wp:wrapTopAndBottom') || X.kid(holder, 'wp:wrapNone')) delete o.wrap;
      }
      if (X.find(holder, 'a:ln') && X.find(X.find(holder, 'a:ln'), 'a:solidFill')) o.bd = '0.75 solid #7f7f7f';
      return o;
    };
    const vmlImage = (pn) => {
      const im = X.find(pn, 'v:imagedata');
      const rid = im && X.attr(im, 'r:id');
      const src = rid && media[rid];
      if (!src) return null;
      const shape = X.find(pn, 'v:shape');
      const style = (shape && X.attr(shape, 'style')) || '';
      const g = (k) => { const m = new RegExp(k + ':\\s*([\\d.]+)(pt|in|px|cm)?').exec(style); if (!m) return null; const v = +m[1]; return m[2] === 'in' ? v * 72 : m[2] === 'px' ? v * 0.75 : m[2] === 'cm' ? PT.cm2pt(v) : v; };
      return { k: 'img', src, w: PT.round(g('width') || 200, 1), h: PT.round(g('height') || 150, 1), alt: (shape && X.attr(shape, 'alt')) || '' };
    };
    const tableFrom = (tn) => {
      const tblPr = X.kid(tn, 'w:tblPr');
      const grid = X.kids(X.kid(tn, 'w:tblGrid'), 'w:gridCol').map((g) => PT.round(+(X.attr(g, 'w:w') || 0) / 20, 1));
      const trs = X.kids(tn, 'w:tr');
      if (!trs.length) return null;
      let ncols = grid.length;
      const rowsRaw = trs.map((tr) => {
        const trPr = X.kid(tr, 'w:trPr');
        const cells = [];
        let gb = +(X.val(trPr, 'w:gridBefore') || 0);
        for (let k = 0; k < gb; k++) cells.push({ span: 1, empty: true });
        const tcs = [];
        const collect = (nodes) => { for (const x of nodes) { if (x.n === 'w:tc') tcs.push(x); else if (x.n === 'w:sdt' || x.n === 'w:customXml') collect((X.kid(x, 'w:sdtContent') || x).c || []); } };
        collect(tr.c);
        for (const tc of tcs) {
          const tcPr = X.kid(tc, 'w:tcPr');
          const span = Math.max(1, +(X.val(tcPr, 'w:gridSpan') || 1));
          const vm = X.kid(tcPr, 'w:vMerge');
          const vmerge = vm ? (X.attr(vm, 'w:val') === 'restart' ? 'restart' : 'cont') : null;
          const shd = X.kid(tcPr, 'w:shd');
          const fill = shd && X.attr(shd, 'w:fill');
          const va = X.val(tcPr, 'w:vAlign');
          cells.push({ span, vmerge, bg: fill && fill !== 'auto' && /^[0-9a-f]{6}$/i.test(fill) && fill.toUpperCase() !== 'FFFFFF' ? '#' + fill.toLowerCase() : null, va: va === 'center' ? 'middle' : va === 'bottom' ? 'bottom' : null, blocks: vmerge === 'cont' ? [] : blocksFrom(tc.c, []) });
        }
        const total = cells.reduce((s, c) => s + c.span, 0);
        ncols = Math.max(ncols, total);
        const hgt = X.kid(trPr, 'w:trHeight');
        return { cells, hd: X.on(trPr, 'w:tblHeader') || false, h: hgt ? +(X.attr(hgt, 'w:val') || 0) / 20 : 0 };
      });
      ncols = Math.max(1, Math.min(63, ncols));
      const cols = Array.from({ length: ncols }, (_, i) => grid[i] > 0 ? grid[i] : 72);
      // bordes: directos o del estilo de tabla
      let bd = null;
      const tblStyle = X.val(tblPr, 'w:tblStyle');
      const styleTbl = tblStyle && ctx.styles[tblStyle] && ctx.styles[tblStyle].tbl;
      const borders = X.kid(tblPr, 'w:tblBorders') || (styleTbl && X.kid(styleTbl, 'w:tblBorders'));
      if (borders) {
        const e = X.kid(borders, 'w:insideH') || X.kid(borders, 'w:top') || X.kid(borders, 'w:bottom');
        const v = e && X.attr(e, 'w:val');
        if (e && v && v !== 'nil' && v !== 'none') bd = PT.round((+X.attr(e, 'w:sz') || 4) / 8, 2) + ' ' + (v === 'double' ? 'double' : /dot/.test(v) ? 'dotted' : /dash/.test(v) ? 'dashed' : 'solid') + ' ' + (colorOf(ctx, e) || '#000000');
      } else if (tblStyle && /grid|cuadr/i.test(tblStyle + ' ' + ((ctx.styles[tblStyle] || {}).name || ''))) bd = '0.5 solid #000000';
      if (!bd) {
        // bordes de las celdas: si la primera celda tiene, se usan para toda la tabla
        const tc0 = X.find(tn, 'w:tcBorders');
        const e = tc0 && (X.kid(tc0, 'w:top') || X.kid(tc0, 'w:bottom'));
        if (e && X.attr(e, 'w:val') && !/nil|none/.test(X.attr(e, 'w:val'))) bd = PT.round((+X.attr(e, 'w:sz') || 4) / 8, 2) + ' solid ' + (colorOf(ctx, e) || '#000000');
      }
      const t = { t: 'table', id: PT.uid('t'), cols, bd, rows: [] };
      const jc = X.val(tblPr, 'w:jc');
      if (jc === 'center') t.al = 'center'; else if (jc === 'right' || jc === 'end') t.al = 'right';
      const tind = X.kid(tblPr, 'w:tblInd');
      if (tind && +X.attr(tind, 'w:w') > 40 && !t.al) t.ind = PT.round(+X.attr(tind, 'w:w') / 20, 1);
      rowsRaw.forEach((rr, r) => {
        const row = { id: PT.uid('w'), cells: [] };
        if (rr.hd) row.hd = true;
        if (rr.h > 2) row.h = PT.round(rr.h, 1);
        for (const c of rr.cells) {
          for (let k = 0; k < c.span && row.cells.length < ncols; k++) {
            const cell = { id: PT.uid('d'), blocks: [] };
            if (k === 0) {
              if (c.vmerge === 'cont' && r > 0) cell.mv = true;
              else cell.blocks = c.blocks && c.blocks.length ? c.blocks : [PT.para.make()];
              if (c.bg) cell.bg = c.bg;
              if (c.va) cell.va = c.va;
            } else cell.mh = true;
            row.cells.push(cell);
          }
        }
        while (row.cells.length < ncols) row.cells.push({ id: PT.uid('d'), blocks: [PT.para.make()] });
        t.rows.push(row);
      });
      // una celda "continuación" sin celda maestra encima se convierte en normal
      t.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
        if (cell.mv && (r === 0 || !(t.rows[r - 1].cells[c]) || t.rows[r - 1].cells[c].mh)) { delete cell.mv; cell.blocks = [PT.para.make()]; }
      }));
      if (t.rows[0] && t.rows[0].cells.every((x) => x.mh || x.mv)) return null;
      return t;
    };
    return { blocksFrom, st };
  }

  async function readPart(ctx, path, rootTag) {
    const z = ctx.z;
    const text = await z.text(path);
    if (!text) return null;
    const dir = path.replace(/[^/]*$/, '');
    const rels = parseRels(await z.text(dir + '_rels/' + path.slice(dir.length) + '.rels'));
    const media = await loadMedia(z, rels, dir);
    const root = X.root(X.parse(text));
    return { root: rootTag ? root : root, rels, media, dir };
  }

  async function read(buf) {
    const z = PT.zip.unzip(buf);
    const ctx = new RCtx(z);
    const doc = ctx.doc;
    doc.body = []; doc.styles = PT.DEFAULT_STYLES(); for (const k in doc.styles) doc.styles[k].builtin = true;
    const pkg = parseRels(await z.text('_rels/.rels'));
    const mainRel = Object.values(pkg).find((r) => /\/officeDocument$/.test(r.type));
    const mainPath = mainRel ? mainRel.target.replace(/^\//, '') : 'word/document.xml';
    if (!z.has(mainPath)) throw new Error('El archivo no parece un documento de Word (.docx).');
    const main = await readPart(ctx, mainPath);
    const relOf = (re) => Object.values(main.rels).find((r) => re.test(r.type));
    const relPath = (re) => { const r = relOf(re); return r ? joinPath(main.dir, r.target) : null; };
    const themePath = relPath(/\/theme$/);
    if (themePath) readTheme(ctx, await z.text(themePath));
    const stylesPath = relPath(/\/styles$/);
    readStyles(ctx, stylesPath ? await z.text(stylesPath) : null);
    if (!ctx.defR) { ctx.defR = {}; ctx.defP = {}; }
    styleFor(ctx, Object.keys(ctx.styles).find((k) => ctx.styles[k].def && ctx.styles[k].type === 'paragraph') || 'Normal');
    if (!ctx.used.has('normal')) Object.assign(doc.styles.normal, { p: Object.assign({ spA: 0, lh: 1 }, cleanP(ctx.defP)), r: Object.assign({ ff: 'Times New Roman', fs: 10 }, ctx.defR) });
    const numPath = relPath(/\/numbering$/);
    readNumbering(ctx, numPath ? await z.text(numPath) : null);
    // variables del documento (campos DOCVARIABLE)
    const varsPath = relPath(/\/settings$/);
    if (varsPath) {
      try {
        const sroot = X.root(X.parse(await z.text(varsPath)));
        const dv = X.kid(sroot, 'w:docVars');
        if (dv) for (const v of X.kids(dv, 'w:docVar')) { const nm = X.attr(v, 'w:name'); if (nm) (doc.meta.vars = doc.meta.vars || {})[nm] = X.attr(v, 'w:val') || ''; }
      } catch (e) { /* configuración ilegible: se ignora */ }
    }
    // comentarios
    const cmPath = relPath(/\/comments$/);
    if (cmPath) {
      const cm = await readPart(ctx, cmPath);
      const ext = relPath(/\/commentsExtended$/);
      const exMap = {};
      if (ext) { const ex = X.root(X.parse(await z.text(ext))); for (const e of X.kids(ex)) exMap[X.attr(e, 'w15:paraId')] = { done: X.attr(e, 'w15:done') === '1', parent: X.attr(e, 'w15:paraIdParent') }; }
      const byPara = {};
      for (const c of X.kids(cm.root, 'w:comment')) {
        const id = 'c' + X.attr(c, 'w:id');
        const paras = X.kids(c, 'w:p');
        const text = paras.map((p) => X.findAll(p, 'w:t').map((t) => X.text(t)).join('')).join('\n').trim();
        const lastId = paras.length ? X.attr(paras[paras.length - 1], 'w14:paraId') : null;
        const info = lastId ? exMap[lastId] : null;
        const rec = { by: X.attr(c, 'w:author') || 'Autor', at: X.attr(c, 'w:date') || '', text, done: !!(info && info.done), re: [] };
        if (lastId) byPara[lastId] = id;
        if (info && info.parent && byPara[info.parent] && doc.comments[byPara[info.parent]]) { doc.comments[byPara[info.parent]].re.push({ by: rec.by, at: rec.at, text: rec.text }); ctx.comments.set(X.attr(c, 'w:id'), byPara[info.parent]); continue; }
        doc.comments[id] = rec;
        ctx.comments.set(X.attr(c, 'w:id'), id);
      }
    }
    // notas al pie y al final
    for (const [re, tag, prefix] of [[/\/footnotes$/, 'w:footnote', 'f'], [/\/endnotes$/, 'w:endnote', 'e']]) {
      const path = relPath(re);
      if (!path) continue;
      const part = await readPart(ctx, path);
      const rd = partReader(ctx, part.rels, part.media, 'notes');
      for (const fnode of X.kids(part.root, tag)) {
        const type = X.attr(fnode, 'w:type');
        if (type && type !== 'normal') continue;
        const id = prefix + X.attr(fnode, 'w:id');
        doc.notes[id] = { blocks: [] };
        const blocks = rd.blocksFrom(fnode.c, []);
        if (blocks[0] && blocks[0].t === 'p' && blocks[0].runs.length && !blocks[0].runs[0].o && /^\s/.test(blocks[0].runs[0].x)) blocks[0].runs[0] = { x: blocks[0].runs[0].x.replace(/^\s+/, ''), m: blocks[0].runs[0].m };
        doc.notes[id].blocks = blocks.length ? blocks.map((b) => (b.t === 'p' && !b.st ? Object.assign(b, { st: 'fnote' }) : b)) : [PT.para.make({ st: 'fnote' })];
      }
    }
    // cuerpo
    const body = X.kid(main.root, 'w:body');
    if (!body) throw new Error('El documento de Word no tiene contenido.');
    const rd = partReader(ctx, main.rels, main.media, 'document');
    const blocks = rd.blocksFrom(body.c, []);
    doc.body = blocks.length ? blocks : [PT.para.make()];
    // configuración de página
    const sect = X.kid(body, 'w:sectPr') || ctx.sectPr;
    if (sect) {
      const sz = X.kid(sect, 'w:pgSz'), mar = X.kid(sect, 'w:pgMar');
      const pg = doc.page;
      if (sz) {
        const w = +(X.attr(sz, 'w:w') || 11906) / 20, hh = +(X.attr(sz, 'w:h') || 16838) / 20;
        pg.w = PT.round(Math.min(w, hh), 1); pg.h = PT.round(Math.max(w, hh), 1);
        pg.orient = X.attr(sz, 'w:orient') === 'landscape' || w > hh ? 'landscape' : 'portrait';
        pg.size = PT.paperOf(pg.w, pg.h);
      }
      if (mar) for (const [k, a] of [['mt', 'w:top'], ['mb', 'w:bottom'], ['ml', 'w:left'], ['mr', 'w:right'], ['hd', 'w:header'], ['fd', 'w:footer']]) { const v = X.attr(mar, a); if (v != null) pg[k] = PT.round(Math.abs(+v) / 20, 1); }
      pg.first = !!X.on(sect, 'w:titlePg');
      const pn = X.kid(sect, 'w:pgNumType');
      if (pn && X.attr(pn, 'w:start')) pg.start = +X.attr(pn, 'w:start');
      const ln = X.kid(sect, 'w:lnNumType');
      if (ln) pg.lnNum = { on: true, by: Math.max(1, +(X.attr(ln, 'w:countBy') || 1)), restart: X.attr(ln, 'w:restart') === 'newPage' ? 'page' : 'cont' };
      for (const ref of X.kids(sect)) {
        if (ref.n !== 'w:headerReference' && ref.n !== 'w:footerReference') continue;
        const type = X.attr(ref, 'w:type') || 'default';
        if (type === 'even') continue;
        const rel = main.rels[X.attr(ref, 'r:id')];
        if (!rel) continue;
        const part = await readPart(ctx, joinPath(main.dir, rel.target));
        if (!part) continue;
        const r2 = partReader(ctx, part.rels, part.media, 'hf');
        const list = r2.blocksFrom(part.root.c, []).map((b) => (b.t === 'p' && (!b.st || b.st === 'normal') ? Object.assign(b, { st: 'hf' }) : b));
        const story = (ref.n === 'w:headerReference' ? 'hdr' : 'ftr') + (type === 'first' ? '1' : '');
        const real = list.filter((b) => b.t !== 'p' || b.runs.length);
        doc[story] = real.length ? list : [];
      }
    }
    // propiedades del documento
    const corePath = Object.values(pkg).find((r) => /core-properties$/.test(r.type));
    if (corePath) {
      const t = await z.text(corePath.target.replace(/^\//, ''));
      if (t) {
        const c = X.root(X.parse(t));
        const g = (n) => X.text(X.kid(c, n)).trim();
        if (g('dc:title')) doc.meta.title = g('dc:title');
        doc.meta.author = g('dc:creator'); doc.meta.subject = g('dc:subject'); doc.meta.keywords = g('cp:keywords');
        if (g('dcterms:created')) doc.meta.created = g('dcterms:created');
        if (g('dcterms:modified')) doc.meta.modified = g('dcterms:modified');
      }
    }
    const setPath = relPath(/\/settings$/);
    if (setPath) { const t = await z.text(setPath); if (t && /<w:trackRevisions(\s|\/|>)/.test(t) && !/<w:trackRevisions w:val="(0|false)"/.test(t)) doc.track = true; }
    // vínculos internos: marcador -> párrafo
    const fix = (p) => {
      if (!p.runs.some((r) => r.m.ln && r.m.ln.startsWith('#bm:'))) return p;
      p.runs = R.normalize(p.runs.map((r) => {
        if (!r.m.ln || !r.m.ln.startsWith('#bm:')) return r;
        const target = ctx.bookmarks.get(r.m.ln.slice(4));
        const m = M.with(r.m, { ln: target ? '#' + target : null });
        return r.o ? { o: r.o, m } : { x: r.x, m };
      }));
      return p;
    };
    const walkFix = (list) => { for (const b of list) { if (b.t === 'p') fix(b); else if (b.t === 'table') for (const row of b.rows) for (const c of row.cells) walkFix(c.blocks); } };
    for (const s of ['body', 'hdr', 'ftr', 'hdr1', 'ftr1']) walkFix(doc[s]);
    for (const id in doc.notes) walkFix(doc.notes[id].blocks);
    for (const id in doc.lists) { delete doc.lists[id]._levels; delete doc.lists[id]._checked; }
    if (!doc.meta.title || doc.meta.title === 'Documento sin título') {
      const first = doc.body.find((b) => b.t === 'p' && R.len(b.runs));
      if (first && (first.st === 'title' || first.st === 'h1')) doc.meta.title = R.text(first.runs).replace(/￼/g, '').trim().slice(0, 100);
    }
    // normalización final (ids únicos, tablas rectangulares, al menos un párrafo)
    const clean = PT.Doc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
    clean.importInfo = { lostObjects: ctx.lostObjects, unknownImages: ctx.unknownImages };
    return clean;
  }

  PT.docx = { write, read };
})(typeof window !== 'undefined' ? window : globalThis);
