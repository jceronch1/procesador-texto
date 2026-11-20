/* Conversión de formatos: texto, Markdown (lectura y escritura), HTML (exportar, abrir y pegar desde Word,
   Google Docs o páginas web), RTF (exportar) y fragmentos para el portapapeles. */
(function (root) {
  'use strict';
  const PT = root.PT, R = PT.runs, M = PT.marks, P = PT.para, O = PT.ops, OBJ = PT.OBJ;
  const C = (PT.convert = {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // texto de un objeto en línea
  C.atomText = function (doc, o) {
    switch (o.k) {
      case 'fld': return PT.view ? PT.view.fieldText(doc, o, null) : '';
      case 'chip': { if (o.c === 'date') { const d = PT.parseIso(o.v); return d ? PT.dateText(d, o.fmt || 'chip') : ''; } if (o.c === 'cb') return o.v ? '☒' : '☐'; return o.v || ''; }
      case 'eq': return PT.math ? PT.math.toText(o.tex) : o.tex || '';
      case 'fn': return '';
      case 'img': return '';
      default: return '';
    }
  };
  const runText = (doc, runs) => runs.filter((r) => !r.m.del).map((r) => (r.o ? C.atomText(doc, r.o) : r.x)).join('');

  // ---------------------------------------------------------------- texto sin formato
  C.blocksToText = function (doc, blocks) {
    const out = [];
    const counters = {};
    for (const b of blocks) {
      if (b.t === 'p') {
        let pre = '';
        if (b.ls && doc.lists[b.ls.id]) {
          const def = doc.lists[b.ls.id], kind = def.k, lv = b.ls.l || 0;
          const c = counters[b.ls.id] || (counters[b.ls.id] = []);
          c[lv] = (c[lv] || (def.start || 1) - 1) + 1;
          c.length = lv + 1;
          const f = PT.listLevel(kind, lv);
          const num = f.outline ? c.map((n) => n || 1).join('.') + '.' : f.fmt ? PT.numFmt(c[lv], f.fmt) + f.suffix : '';
          pre = '  '.repeat(lv) + (kind === 'check' ? (b.ck ? '☒ ' : '☐ ') : f.bullet ? f.bullet + ' ' : num + ' ');
        }
        out.push(pre + runText(doc, b.runs));
      } else if (b.t === 'table') for (const row of b.rows) out.push(row.cells.filter((c) => !c.mh && !c.mv).map((c) => C.blocksToText(doc, c.blocks).replace(/\n/g, ' ')).join('\t'));
      else if (b.t === 'hr') out.push('────────');
      else if (b.t === 'toc') out.push(...(PT.view ? PT.view.tocEntries(doc, b.lv).map((e) => '  '.repeat(e.lvl - 1) + e.text) : []));
    }
    return out.join('\n');
  };
  C.toText = function (doc) {
    let text = C.blocksToText(doc, doc.body);
    const notes = O.noteNumbers(doc);
    if (notes.size) { text += '\n\n────────\n'; for (const [id, n] of notes) text += n + '. ' + C.blocksToText(doc, doc.notes[id].blocks) + '\n'; }
    return text.replace(/\n?$/, '\n');
  };

  // ---------------------------------------------------------------- Markdown: escritura
  const mdEsc = (s) => s.replace(/([\\`*_[\]<>])/g, '\\$1');
  function mdInline(doc, runs, notes) {
    let out = '';
    const parts = [];
    for (const r of runs) {
      if (r.m.del) continue;
      if (r.o) {
        if (r.o.k === 'img') parts.push({ t: '![' + mdEsc(r.o.alt || '') + '](' + (r.o.src || '') + ')', m: M.EMPTY, raw: true });
        else if (r.o.k === 'fn') parts.push({ t: '[^' + (notes.get(r.o.id) || '?') + ']', m: M.EMPTY, raw: true });
        else if (r.o.k === 'eq') parts.push({ t: '$' + (r.o.tex || '') + '$', m: M.EMPTY, raw: true });
        else parts.push({ t: mdEsc(C.atomText(doc, r.o)), m: r.m, raw: true });
        continue;
      }
      parts.push({ t: r.x, m: r.m });
    }
    for (const p of parts) {
      if (p.raw) { out += p.t; continue; }
      const m = p.m;
      const code = m.ff && /mono|consol|courier|code/i.test(m.ff);
      let t = code ? p.t : mdEsc(p.t);
      t = t.replace(/\n/g, '  \n');
      const lead = /^\s*/.exec(t)[0], trail = /\s*$/.exec(t)[0];
      let core = t.slice(lead.length, t.length - trail.length);
      if (!core) { out += t; continue; }
      if (code) core = '`' + core + '`';
      else {
        if (m.s) core = '~~' + core + '~~';
        if (m.i) core = '*' + core + '*';
        if (m.b) core = '**' + core + '**';
      }
      if (m.ln) core = '[' + core + '](' + m.ln + ')';
      out += lead + core + trail;
    }
    return out.replace(/\*\*\*\*|~~~~/g, '');
  }
  C.toMarkdown = function (doc, slice) {
    const notes = O.noteNumbers(doc);
    const blocks = slice ? (slice.inline ? [P.make(null, slice.runs)] : slice.blocks) : doc.body;
    const markers = O.listMarkers(doc, 'body');
    const out = [];
    let inCode = false, prevList = false;
    const flushCode = () => { if (inCode) { out.push('```'); inCode = false; } };
    for (const b of blocks) {
      if (b.t !== 'p' || b.st !== 'code') flushCode();
      if (b.t === 'p') {
        const st = b.st || 'normal', lvl = doc.headingLevel(b);
        const text = mdInline(doc, b.runs, notes);
        if (st === 'code') { if (!inCode) { if (out.length && out[out.length - 1] !== '') out.push(''); out.push('```'); inCode = true; } out.push(runText(doc, b.runs)); continue; }
        if (b.ls && doc.lists[b.ls.id]) {
          const kind = doc.lists[b.ls.id].k, ind = '    '.repeat(b.ls.l || 0);
          let mk = kind === 'check' ? '- [' + (b.ck ? 'x' : ' ') + ']' : PT.isBulletKind(kind) ? '-' : (/^\d/.test(markers.get(b.id) || '') ? (markers.get(b.id) || '1.').replace(/\)$/, '.') : '1.');
          if (mk.split('.').length > 2) mk = mk.split('.').filter(Boolean).pop() + '.';
          if (!prevList && out.length && out[out.length - 1] !== '') out.push('');
          out.push(ind + mk + ' ' + text);
          prevList = true;
          continue;
        }
        if (prevList) { out.push(''); prevList = false; }
        if (b.pb && out.length) out.push('', '<div style="page-break-before: always"></div>', '');
        if (lvl || st === 'title') out.push('#'.repeat(Math.max(1, lvl)) + ' ' + text);
        else if (st === 'subtitle') out.push(text ? '*' + text.replace(/^\*|\*$/g, '') + '*' : '');
        else if (st === 'quote') out.push('> ' + text);
        else out.push(text);
        out.push('');
      } else if (b.t === 'table') {
        if (prevList) { out.push(''); prevList = false; }
        const rows = b.rows.map((row, ri) => row.cells.map((c) => {
          if (c.mh || c.mv) return '';
          const t = c.blocks.filter((x) => x.t === 'p').map((x) => mdInline(doc, x.runs, notes)).join('<br>').replace(/\|/g, '\\|');
          // en la fila de encabezado la negrita ya está implícita
          return ri === 0 ? t.replace(/^\*\*([^*]*)\*\*$/, '$1') : t;
        }));
        if (!rows.length) continue;
        out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- ').join('|') + '|');
        for (const r of rows.slice(1)) out.push('| ' + r.join(' | ') + ' |');
        out.push('');
      } else if (b.t === 'hr') { out.push('---', ''); prevList = false; }
      else if (b.t === 'toc' && PT.view) { for (const e of PT.view.tocEntries(doc, b.lv)) out.push('    '.repeat(e.lvl - 1) + '- [' + mdEsc(e.text) + '](#' + e.id + ')'); out.push(''); }
    }
    flushCode();
    if (!slice && notes.size) { out.push(''); for (const [id, n] of notes) out.push('[^' + n + ']: ' + doc.notes[id].blocks.filter((x) => x.t === 'p').map((x) => mdInline(doc, x.runs, notes)).join(' ')); }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
  };

  // ---------------------------------------------------------------- Markdown: lectura
  function mdInlineParse(text, base) {
    const runs = [];
    const push = (x, m) => { if (x) runs.push({ x, m: M.intern(m) }); };
    const walk = (s, m) => {
      let i = 0, buf = '';
      const flush = () => { push(buf, m); buf = ''; };
      while (i < s.length) {
        const ch = s[i], rest = s.slice(i);
        let mm;
        if (ch === '\\' && i + 1 < s.length && /[\\`*_[\]{}()#+\-.!<>|~$]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
        if (ch === '`' && (mm = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) { flush(); push(mm[2].trim(), Object.assign({}, m, { ff: 'Consolas', hl: '#eef0f3' })); i += mm[0].length; continue; }
        if (ch === '!' && (mm = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/.exec(rest))) { flush(); runs.push({ o: Object.freeze({ k: 'img', src: mm[2], w: 240, h: 160, alt: mm[1], auto: true }), m: M.EMPTY }); i += mm[0].length; continue; }
        if (ch === '[' && (mm = /^\[\^([^\]]+)\]/.exec(rest))) { flush(); runs.push({ o: Object.freeze({ k: 'fn', id: 'md' + mm[1] }), m: M.EMPTY }); i += mm[0].length; continue; }
        if (ch === '[' && (mm = /^\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/.exec(rest))) { flush(); walk(mm[1], Object.assign({}, m, { ln: mm[2] })); i += mm[0].length; continue; }
        if (ch === '<' && (mm = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest))) { flush(); push(mm[1], Object.assign({}, m, { ln: mm[1] })); i += mm[0].length; continue; }
        if (ch === '<' && (mm = /^<br\s*\/?>/i.exec(rest))) { buf += '\n'; i += mm[0].length; continue; }
        if (ch === '$' && (mm = /^\$([^$\n]+)\$/.exec(rest))) { flush(); runs.push({ o: Object.freeze({ k: 'eq', tex: mm[1] }), m: M.EMPTY }); i += mm[0].length; continue; }
        if ((ch === '*' || ch === '_' || ch === '~') && (mm = /^(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/.exec(rest) || /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest) || /^(~~)(?=\S)([\s\S]*?\S)~~/.exec(rest) || /^(\*|_)(?=\S)([\s\S]*?\S)\1(?![*_\w])/.exec(rest))) {
          if (ch === '_' && i > 0 && /\w/.test(s[i - 1])) { buf += ch; i++; continue; }
          flush();
          const mk = mm[1];
          const sub = mk === '~~' ? { s: true } : mk.length === 3 ? { b: true, i: true } : mk.length === 2 ? { b: true } : { i: true };
          walk(mm[2], Object.assign({}, m, sub));
          i += mm[0].length;
          continue;
        }
        if (ch === ' ' && /^ {2,}\n/.test(rest)) { buf += '\n'; i += /^ +\n/.exec(rest)[0].length; continue; }
        buf += ch === '\n' ? ' ' : ch;
        i++;
      }
      flush();
    };
    walk(text, base || {});
    return R.normalize(runs);
  }
  C.fromMarkdown = function (md) {
    const doc = PT.Doc.blank();
    const lines = String(md || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const blocks = [];
    const listStack = []; // [{indent, id, kind}]
    const notes = {};
    let para = null;
    const flushPara = () => { if (para) { blocks.push(P.make(para.props, mdInlineParse(para.text.join('\n')))); para = null; } };
    const listFor = (indent, kind) => {
      while (listStack.length && listStack[listStack.length - 1].indent > indent) listStack.pop();
      let top = listStack[listStack.length - 1];
      if (!top || top.indent < indent) {
        const parent = listStack[0];
        const id = parent && parent.kindGroup === (kind === 'check' ? 'bullet' : PT.isBulletKind(kind) ? 'bullet' : 'number') ? parent.id : PT.uid('L');
        if (!doc.lists[id]) doc.lists[id] = { k: kind };
        top = { indent, id, kind, kindGroup: kind === 'check' || PT.isBulletKind(kind) ? 'bullet' : 'number', level: listStack.length };
        listStack.push(top);
      } else if (top.kind !== kind && top.level === 0) {
        const id = PT.uid('L');
        doc.lists[id] = { k: kind };
        Object.assign(top, { id, kind });
      }
      return top;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^\s*```/.test(line)) {
        flushPara(); listStack.length = 0;
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        for (const c of code.length ? code : ['']) blocks.push(P.make({ st: 'code' }, R.fromText(c)));
        continue;
      }
      if (!line.trim()) { flushPara(); if (listStack.length && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1] || '')) listStack.length = 0; continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flushPara(); listStack.length = 0; blocks.push(P.make({ st: 'h' + m[1].length }, mdInlineParse(m[2]))); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); listStack.length = 0; blocks.push(PT.blocks.hr()); continue; }
      if ((m = /^\s*\[\^([^\]]+)\]:\s*(.*)$/.exec(line))) { flushPara(); notes['md' + m[1]] = m[2]; continue; }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
        flushPara(); listStack.length = 0;
        const rows = [];
        const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
        rows.push(cells(line));
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        i--;
        const nc = Math.max(...rows.map((r) => r.length));
        const t = PT.blocks.table(rows.length, nc, PT.pageDims(doc.page).cw, { header: true });
        rows.forEach((r, ri) => r.forEach((txt, ci) => { if (ci < nc) t.rows[ri].cells[ci].blocks = txt.split(/<br\s*\/?>/i).map((x) => P.make(null, mdInlineParse(x, ri === 0 ? { b: true } : {}))); }));
        blocks.push(t);
        continue;
      }
      if ((m = /^(\s*)>\s?(.*)$/.exec(line))) { flushPara(); listStack.length = 0; blocks.push(P.make({ st: 'quote' }, mdInlineParse(m[2]))); continue; }
      if ((m = /^(\s*)([-*+]|\d{1,9}[.)])\s+(\[[ xX]\]\s+)?(.*)$/.exec(line))) {
        flushPara();
        const indent = m[1].length, bullet = /^[-*+]$/.test(m[2]);
        const kind = m[3] ? 'check' : bullet ? 'bullet' : m[2].endsWith(')') ? 'paren' : 'decimal';
        const L = listFor(indent, kind);
        if (!bullet && !L.count) { const n = parseInt(m[2], 10); if (n > 1 && L.level === 0) doc.lists[L.id].start = n; }
        L.count = (L.count || 0) + 1;
        const p = P.make({ ls: { id: L.id, l: Math.min(8, L.level) }, ck: m[3] ? /x/i.test(m[3]) : undefined }, mdInlineParse(m[4]));
        blocks.push(p);
        continue;
      }
      if (listStack.length && /^\s{2,}\S/.test(line) && blocks.length && blocks[blocks.length - 1].ls) {
        const last = blocks[blocks.length - 1];
        blocks[blocks.length - 1] = P.with(last, { runs: R.normalize(last.runs.concat([{ x: ' ', m: M.EMPTY }], mdInlineParse(line.trim()))) });
        continue;
      }
      listStack.length = 0;
      if (!para) para = { props: null, text: [] };
      // subrayado de títulos (estilo setext)
      if (para.text.length === 0 && /^=+\s*$/.test(lines[i + 1] || '')) { blocks.push(P.make({ st: 'h1' }, mdInlineParse(line.trim()))); para = null; i++; continue; }
      if (para.text.length === 0 && /^-+\s*$/.test(lines[i + 1] || '') && lines[i + 1].trim().length >= 2) { blocks.push(P.make({ st: 'h2' }, mdInlineParse(line.trim()))); para = null; i++; continue; }
      para.text.push(line.replace(/^\s+/, ''));
    }
    flushPara();
    // notas al pie: las llamadas [^x] apuntan a su definición
    for (const id in notes) doc.notes[id] = { blocks: [P.make({ st: 'fnote' }, mdInlineParse(notes[id]))] };
    for (const b of blocks) if (b.t === 'p') b.runs = b.runs.filter((r) => !(r.o && r.o.k === 'fn' && !doc.notes[r.o.id]));
    doc.body = blocks.length ? blocks : [P.make()];
    if (doc.body[doc.body.length - 1].t !== 'p') doc.body.push(P.make());
    const first = doc.body.find((b) => b.t === 'p' && b.runs.length);
    if (first && first.st === 'h1') doc.meta.title = R.text(first.runs).replace(/\uFFFC/g, '').trim().slice(0, 100) || doc.meta.title;
    doc._idx = null;
    return doc;
  };

  // ---------------------------------------------------------------- HTML: escritura (estilos en línea)
  const css = (o) => Object.keys(o).map((k) => k + ':' + o[k]).join(';');
  C.blocksToHTML = function (doc, blocks, ctx) {
    ctx = ctx || {};
    const V = PT.view;
    const markers = ctx.markers || O.listMarkers(doc, 'body');
    const notes = ctx.notes || O.noteNumbers(doc);
    let html = '';
    const listOpen = []; // [{tag, id, lvl}]
    const closeLists = (lvl) => { while (listOpen.length > lvl) html += '</' + listOpen.pop().tag + '>'; };
    const inline = (p) => {
      const base = doc.styleOfPara(p).r;
      let out = '';
      for (const r of p.runs) {
        if (r.m.del && !ctx.withDeleted) continue;
        let s;
        if (r.o) {
          const o = r.o;
          if (o.k === 'img') s = '<img src="' + esc(o.src) + '" alt="' + esc(o.alt || '') + '" width="' + Math.round(PT.pt2px(o.w)) + '" height="' + Math.round(PT.pt2px(o.h)) + '" style="width:' + o.w + 'pt;height:' + o.h + 'pt' + (o.wrap === 'left' ? ';float:left;margin:0 12pt 6pt 0' : o.wrap === 'right' ? ';float:right;margin:0 0 6pt 12pt' : '') + '">';
          else if (o.k === 'fn') { const n = notes.get(o.id) || '*'; s = '<sup><a href="#nota-' + n + '" id="ref-' + n + '">' + n + '</a></sup>'; }
          else if (o.k === 'eq' && PT.math) s = PT.math.toMathML(o.tex);
          else s = esc(C.atomText(doc, o));
        } else s = esc(r.x).replace(/\n/g, '<br>').replace(/\t/g, '<span style="display:inline-block;width:36pt"></span>').replace(/ {2}/g, ' &nbsp;');
        const st = V ? V.runCss(M.without(r.m, ['ln', 'cm', 'ins', 'del']), base) : {};
        if (Object.keys(st).length) s = '<span style="' + esc(css(st)) + '">' + s + '</span>';
        if (r.m.ln) s = '<a href="' + esc(r.m.ln) + '">' + s + '</a>';
        out += s;
      }
      return out || '<br>';
    };
    const paraStyle = (p) => {
      const s = doc.style(p.st || 'normal');
      const o = V ? Object.assign(V.paraCss(Object.assign({}, s.p, PT.para.props(p)), true), V.runCss(s.r)) : {};
      o.margin = '0';
      if (p.pb) o['page-break-before'] = 'always';
      if (p.bdr) for (const [k, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) if (p.bdr[k]) o['border-' + side] = V.borderCss(p.bdr[k]);
      return css(o);
    };
    for (const b of blocks) {
      if (b.t === 'p' && b.ls && doc.lists[b.ls.id]) {
        const kind = doc.lists[b.ls.id].k, lvl = PT.clamp(b.ls.l | 0, 0, 8);
        const tag = PT.isBulletKind(kind) ? 'ul' : 'ol';
        closeLists(lvl + 1);
        if (listOpen.length === lvl + 1 && (listOpen[lvl].tag !== tag || listOpen[lvl].id !== b.ls.id)) closeLists(lvl);
        while (listOpen.length < lvl + 1) {
          const lf = PT.listLevel(kind, listOpen.length);
          const type = lf.fmt === 'lalpha' ? 'a' : lf.fmt === 'ualpha' ? 'A' : lf.fmt === 'lroman' ? 'i' : lf.fmt === 'uroman' ? 'I' : null;
          const start = listOpen.length === lvl && tag === 'ol' ? parseInt(markers.get(b.id), 10) : null;
          html += '<' + tag + (type ? ' type="' + type + '"' : '') + (start > 1 ? ' start="' + start + '"' : '') + (kind === 'check' ? ' style="list-style:none;padding-left:18pt"' : '') + '>';
          listOpen.push({ tag, id: b.ls.id });
        }
        const s = doc.style(b.st || 'normal');
        const o = V ? Object.assign(V.paraCss(Object.assign({}, s.p, { al: b.al, spB: b.spB, spA: b.spA, lh: b.lh, lhx: b.lhx }), false), V.runCss(s.r)) : {};
        html += '<li style="' + esc(css(o)) + '">' + (kind === 'check' ? (b.ck ? '☒ ' : '☐ ') : '') + inline(b) + '</li>';
        continue;
      }
      closeLists(0);
      if (b.t === 'p') {
        const lvl = doc.headingLevel(b), tag = lvl ? 'h' + lvl : 'p';
        const id = lvl ? ' id="' + b.id + '"' : '';
        html += '<' + tag + id + ' style="' + esc(paraStyle(b)) + '">' + inline(b) + '</' + tag + '>';
      } else if (b.t === 'table') {
        const bd = V ? V.borderCss(b.bd) : '1px solid #000';
        html += '<table style="border-collapse:collapse;table-layout:fixed;width:' + b.cols.reduce((s, x) => s + x, 0) + 'pt' + (b.al === 'center' ? ';margin-left:auto;margin-right:auto' : b.al === 'right' ? ';margin-left:auto' : '') + '"><colgroup>' + b.cols.map((w) => '<col style="width:' + w + 'pt">').join('') + '</colgroup>';
        b.rows.forEach((row, r) => {
          html += '<tr' + (row.h ? ' style="height:' + row.h + 'pt"' : '') + '>';
          row.cells.forEach((cell, c) => {
            if (cell.mh || cell.mv) return;
            const sp = O.spanOf(b, r, c), tag = row.hd ? 'th' : 'td';
            html += '<' + tag + (sp.cs > 1 ? ' colspan="' + sp.cs + '"' : '') + (sp.rs > 1 ? ' rowspan="' + sp.rs + '"' : '') + ' style="border:' + bd + ';padding:2pt 5.4pt;vertical-align:' + (cell.va || 'top') + (cell.bg ? ';background:' + cell.bg : '') + ';text-align:left;font-weight:normal">' + C.blocksToHTML(doc, cell.blocks, Object.assign({}, ctx, { markers, notes })) + '</' + tag + '>';
          });
          html += '</tr>';
        });
        html += '</table>';
      } else if (b.t === 'hr') html += '<hr>';
      else if (b.t === 'toc' && V) {
        html += '<nav class="toc">' + (b.title ? '<p style="font-size:14pt;font-weight:600;margin:0 0 6pt">' + esc(b.title) + '</p>' : '') + V.tocEntries(doc, b.lv).map((e) => '<p style="margin:0 0 2pt ' + (e.lvl - 1) * 14 + 'pt"><a href="#' + e.id + '">' + esc(e.text) + '</a></p>').join('') + '</nav>';
      }
    }
    closeLists(0);
    return html;
  };
  C.toHTML = function (doc) {
    const notes = O.noteNumbers(doc);
    const d = PT.pageDims(doc.page);
    let body = C.blocksToHTML(doc, doc.body, { notes });
    if (notes.size) {
      body += '<hr style="margin-top:24pt"><section class="notas">';
      for (const [id, n] of notes) body += '<div id="nota-' + n + '" style="font-size:10pt;margin:0 0 4pt"><a href="#ref-' + n + '">' + n + '</a>. ' + C.blocksToHTML(doc, doc.notes[id].blocks, { notes }).replace(/^<p[^>]*>|<\/p>$/g, '') + '</div>';
      body += '</section>';
    }
    const m = doc.meta;
    return '<!doctype html>\n<html lang="' + esc(m.lang || 'es') + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(m.title || 'Documento') + '</title>\n' + (m.author ? '<meta name="author" content="' + esc(m.author) + '">\n' : '') + (m.keywords ? '<meta name="keywords" content="' + esc(m.keywords) + '">\n' : '') +
      '<style>\nbody{margin:0;background:#f3f3f3;color:#000}\nmain{box-sizing:border-box;max-width:' + Math.round(PT.pt2px(d.W)) + 'px;margin:24px auto;padding:' + Math.round(PT.pt2px(d.mt)) + 'px ' + Math.round(PT.pt2px(d.mr)) + 'px ' + Math.round(PT.pt2px(d.mb)) + 'px ' + Math.round(PT.pt2px(d.ml)) + 'px;background:' + (doc.page.color || '#fff') + ';box-shadow:0 1px 4px rgba(0,0,0,.2)}\nh1,h2,h3,h4,h5,h6{margin:0}\ntable{margin:4pt 0}\nimg{max-width:100%}\na{color:#0563c1}\n@media print{body{background:none}main{box-shadow:none;margin:0;max-width:none;padding:0}}\n@page{size:' + d.W + 'pt ' + d.H + 'pt;margin:' + d.mt + 'pt ' + d.mr + 'pt ' + d.mb + 'pt ' + d.ml + 'pt}\n</style>\n</head>\n<body>\n<main>\n' + body + '\n</main>\n</body>\n</html>\n';
  };

  // ---------------------------------------------------------------- HTML: lectura (abrir y pegar)
  const BLOCK_TAGS = new Set('P DIV H1 H2 H3 H4 H5 H6 LI UL OL BLOCKQUOTE PRE TABLE HR SECTION ARTICLE HEADER FOOTER MAIN NAV ASIDE ADDRESS FIGURE FIGCAPTION DL DT DD CENTER FORM'.split(' '));
  const SKIP_TAGS = new Set('SCRIPT STYLE HEAD TITLE META LINK NOSCRIPT TEMPLATE IFRAME OBJECT EMBED SVG MATH BUTTON INPUT SELECT TEXTAREA CANVAS VIDEO AUDIO O:P XML'.split(' '));
  const pxToPt = (v, base) => {
    const m = /^(-?[\d.]+)(px|pt|em|rem|%|cm|mm|in)?$/.exec(String(v || '').trim());
    if (!m) return null;
    const n = parseFloat(m[1]), u = m[2] || 'px';
    return u === 'pt' ? n : u === 'px' ? n * 0.75 : u === 'em' || u === 'rem' ? n * (base || 11) : u === '%' ? (n / 100) * (base || 11) : u === 'cm' ? PT.cm2pt(n) : u === 'mm' ? PT.cm2pt(n / 10) : u === 'in' ? n * 72 : null;
  };
  const FONT_SIZES = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24 };
  function marksFromStyle(el, m, baseFs) {
    const st = el.style, tag = el.tagName;
    const o = Object.assign({}, m);
    if (tag === 'B' || tag === 'STRONG') o.b = true;
    if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'DFN') o.i = true;
    if (tag === 'U' || tag === 'INS') o.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') o.s = true;
    if (tag === 'SUP') { o.sup = true; o.sub = null; }
    if (tag === 'SUB') { o.sub = true; o.sup = null; }
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') o.ff = 'Consolas';
    if (tag === 'MARK') o.hl = '#ffff00';
    if (tag === 'FONT') { if (el.getAttribute('color')) o.fc = PT.hex(el.getAttribute('color')); if (el.getAttribute('face')) o.ff = el.getAttribute('face').split(',')[0].replace(/['"]/g, '').trim(); const sz = +el.getAttribute('size'); if (sz) o.fs = [0, 7.5, 10, 12, 13.5, 18, 24, 36][PT.clamp(sz, 1, 7)]; }
    if (tag === 'SMALL') o.fs = (o.fs || baseFs || 11) * 0.83;
    if (tag === 'BIG') o.fs = (o.fs || baseFs || 11) * 1.2;
    if (!st) return o;
    const fw = st.fontWeight;
    if (fw) o.b = fw === 'bold' || fw === 'bolder' || +fw >= 600 ? true : fw === 'normal' || +fw < 600 ? false : o.b;
    if (st.fontStyle) o.i = st.fontStyle === 'italic' || st.fontStyle === 'oblique' ? true : st.fontStyle === 'normal' ? false : o.i;
    const td = (st.textDecorationLine || st.textDecoration || '');
    if (td) { if (/underline/.test(td)) o.u = true; else if (/none/.test(td)) o.u = null; if (/line-through/.test(td)) o.s = true; }
    if (st.color) { const c = PT.hex(st.color); if (c && c !== '#000000') o.fc = c; else if (c === '#000000') o.fc = null; }
    const bg = st.backgroundColor || st.background;
    if (bg) { const c = PT.hex(bg); if (c && c !== '#ffffff' && c !== '#000000') o.hl = c; else if (!c || c === '#ffffff') o.hl = null; }
    if (st.fontSize) { const v = FONT_SIZES[st.fontSize] || pxToPt(st.fontSize, o.fs || baseFs); if (v && v > 1 && v < 400) o.fs = PT.round(v, 1); }
    if (st.fontFamily) { const f = st.fontFamily.split(',')[0].replace(/['"]/g, '').trim(); if (f && !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(f)) o.ff = f; }
    const va = st.verticalAlign;
    if (va === 'super') { o.sup = true; o.sub = null; } else if (va === 'sub') { o.sub = true; o.sup = null; } else if (va === 'baseline') { o.sup = null; o.sub = null; }
    if (st.textTransform === 'uppercase') o.caps = true;
    if (st.fontVariant === 'small-caps' || st.fontVariantCaps === 'small-caps') o.sc = true;
    if (st.letterSpacing && st.letterSpacing !== 'normal') { const v = pxToPt(st.letterSpacing); if (v) o.sp = PT.round(v, 1); }
    return o;
  }
  function paraFromStyle(el, props) {
    const st = el.style, o = Object.assign({}, props);
    if (!st) return o;
    const al = st.textAlign || el.getAttribute('align');
    if (al) o.al = /center/.test(al) ? 'center' : /right|end/.test(al) ? 'right' : /justify/.test(al) ? 'justify' : null;
    const ml = pxToPt(st.marginLeft) || pxToPt(st.paddingLeft);
    if (ml != null && ml > 2 && ml < 400) o.inL = PT.round(ml, 1);
    const ti = pxToPt(st.textIndent);
    if (ti != null && Math.abs(ti) > 1 && Math.abs(ti) < 300) o.inF = PT.round(ti, 1);
    const mt = pxToPt(st.marginTop), mb = pxToPt(st.marginBottom);
    if (mt != null && mt >= 0 && mt < 200) o.spB = PT.round(mt, 1);
    if (mb != null && mb >= 0 && mb < 200) o.spA = PT.round(mb, 1);
    const lh = st.lineHeight;
    if (lh && lh !== 'normal') { if (/^[\d.]+$/.test(lh)) o.lh = PT.round(parseFloat(lh) / PT.LINE_FACTOR, 2) || null; else if (/%$/.test(lh)) o.lh = PT.round(parseFloat(lh) / 100 / PT.LINE_FACTOR, 2) || null; else { const v = pxToPt(lh); if (v) o.lhx = PT.round(v, 1); } }
    if (st.backgroundColor) { const c = PT.hex(st.backgroundColor); if (c && c !== '#ffffff') o.bg = c; }
    if (st.pageBreakBefore === 'always' || st.breakBefore === 'page') o.pb = true;
    return o;
  }
  // convierte HTML en bloques del modelo; devuelve {blocks, lists}
  C.parseHTML = function (html, doc) {
    const dom = new DOMParser().parseFromString(String(html), 'text/html');
    const lists = {};
    const blocks = [];
    let cur = null; // párrafo en construcción {props, runs}
    const listStack = [];
    const msoLists = {};
    const flush = (force) => {
      if (!cur) return;
      let runs = R.normalize(cur.runs);
      // recorta espacios al principio y al final del párrafo
      if (runs.length && !runs[0].o) runs[0] = { x: runs[0].x.replace(/^[ \u00a0]+/, ''), m: runs[0].m };
      const li = runs.length - 1;
      if (li >= 0 && !runs[li].o) runs[li] = { x: runs[li].x.replace(/[ \u00a0]+$/, ''), m: runs[li].m };
      runs = R.normalize(runs.map((r) => (r.o ? r : { x: r.x.replace(/\u00a0/g, ' '), m: r.m })));
      if (runs.length || force || cur.props.ls) cur.target.push(P.make(cur.props, runs));
      cur = null;
    };
    const start = (props, target) => { flush(); cur = { props: props || {}, runs: [], target: target || blocks }; };
    const textOf = (node, m, ctx) => {
      const pre = ctx.pre;
      let t = node.data;
      if (!pre) t = t.replace(/[\t\n\r ]+/g, ' ');
      if (!t) return;
      if (cur && cur.target !== (ctx.target || blocks)) flush();
      if (!cur) { if (!t.trim()) return; start({}, ctx.target || blocks); }
      const last = cur.runs[cur.runs.length - 1];
      if (!pre && t[0] === ' ' && (!last || (!last.o && /[ \n]$/.test(last.x)))) t = t.slice(1);
      if (t) cur.runs.push({ x: t, m: M.intern(m) });
    };
    const styleByClass = (el) => {
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      if (/MsoTitle/i.test(cls)) return 'title';
      if (/MsoSubtitle/i.test(cls)) return 'subtitle';
      const hm = /MsoHeading(\d)/i.exec(cls);
      if (hm) return 'h' + hm[1];
      if (/MsoQuote|MsoIntenseQuote/i.test(cls)) return 'quote';
      if (/MsoNoSpacing/i.test(cls)) return 'nospace';
      if (/MsoCaption/i.test(cls)) return 'caption';
      return null;
    };
    const walk = (node, m, ctx) => {
      if (node.nodeType === 3) { textOf(node, m, ctx); return; }
      if (node.nodeType !== 1) return;
      const el = node, tag = el.tagName.toUpperCase();
      if (SKIP_TAGS.has(tag) || el.hidden || (el.style && el.style.display === 'none')) return;
      if (el.style && /mso-list:\s*Ignore/i.test(el.getAttribute('style') || '')) return; // números de lista de Word
      if (/^(O|W|V|M):/.test(el.tagName)) return;
      const target = ctx.target || blocks;
      if (tag === 'BR') { if (!cur) start({}, target); cur.runs.push({ x: '\n', m: M.intern(m) }); return; }
      if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!/^(data:image\/|https?:|blob:)/i.test(src)) return;
        let w = pxToPt(el.getAttribute('width')) || pxToPt(el.style.width) || (el.naturalWidth ? el.naturalWidth * 0.75 : 0);
        let hh = pxToPt(el.getAttribute('height')) || pxToPt(el.style.height) || (el.naturalHeight ? el.naturalHeight * 0.75 : 0);
        const auto = !(w && hh);
        if (!w) w = 240; if (!hh) hh = 160;
        if (!cur) start({}, target);
        cur.runs.push({ o: Object.freeze({ k: 'img', src, w: PT.round(w, 1), h: PT.round(hh, 1), alt: el.getAttribute('alt') || '', auto: auto || undefined, wrap: el.style && el.style.cssFloat === 'left' ? 'left' : el.style && el.style.cssFloat === 'right' ? 'right' : undefined }), m: M.EMPTY });
        return;
      }
      if (tag === 'HR') { flush(); target.push(PT.blocks.hr()); return; }
      if (tag === 'TABLE') { flush(); const t = tableFrom(el, m, ctx); if (t) target.push(t); return; }
      if (tag === 'UL' || tag === 'OL') {
        flush();
        const type = (el.getAttribute('type') || '').trim();
        const styleType = el.style ? el.style.listStyleType : '';
        let kind = tag === 'UL' ? 'bullet' : type === 'a' || /lower-alpha|lower-latin/.test(styleType) ? 'lalpha' : type === 'A' || /upper-alpha|upper-latin/.test(styleType) ? 'ualpha' : type === 'i' || /lower-roman/.test(styleType) ? 'lroman' : type === 'I' || /upper-roman/.test(styleType) ? 'uroman' : 'decimal';
        if (tag === 'UL' && (el.querySelector(':scope > li > input[type=checkbox]') || /checklist|task-list|contains-task-list/i.test(el.className || ''))) kind = 'check';
        const parent = listStack[listStack.length - 1];
        const id = parent && listStack.length ? parent.id : PT.uid('L');
        if (!lists[id]) { lists[id] = { k: kind }; const s = +el.getAttribute('start'); if (s > 1) lists[id].start = s; }
        listStack.push({ id, kind, level: listStack.length });
        for (const c of el.childNodes) walk(c, m, ctx);
        flush();
        listStack.pop();
        return;
      }
      const isBlock = BLOCK_TAGS.has(tag) || (el.style && /^(block|flex|grid|list-item)$/.test(el.style.display));
      let nm = marksFromStyle(el, m, ctx.fs);
      if (tag === 'A' && el.getAttribute('href')) { const href = el.getAttribute('href'); if (/^(https?:|mailto:|tel:)/i.test(href)) nm = Object.assign({}, nm, { ln: href }); }
      if (!isBlock) { for (const c of el.childNodes) walk(c, nm, ctx); return; }
      // bloque
      flush();
      let props = paraFromStyle(el, {});
      const hm = /^H([1-6])$/.exec(tag);
      if (hm) { props.st = 'h' + hm[1]; nm = Object.assign({}, nm, { b: null, fs: null, fc: nm.fc === '#2f5496' ? null : nm.fc }); }
      const cls = styleByClass(el);
      if (cls) props.st = cls;
      if (tag === 'BLOCKQUOTE') props.st = 'quote';
      if (tag === 'FIGCAPTION') props.st = 'caption';
      if (tag === 'CENTER') props.al = 'center';
      if (tag === 'PRE') {
        const lines = el.textContent.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
        for (const line of lines) target.push(P.make({ st: 'code' }, R.fromText(line)));
        return;
      }
      if (tag === 'LI' && listStack.length) {
        const L = listStack[listStack.length - 1];
        props.ls = { id: L.id, l: Math.min(8, L.level) };
        const cb = el.querySelector(':scope > input[type=checkbox]');
        if (L.kind === 'check' || cb) { props.ck = !!(cb && cb.checked); if (lists[L.id].k !== 'check' && cb) lists[L.id].k = 'check'; }
        delete props.inL; delete props.inF;
      }
      // listas de Word en HTML (mso-list: l0 level2 lfo1)
      const mso = /mso-list:\s*(l\d+)\s+level(\d+)\s+(lfo\d+)/i.exec(el.getAttribute('style') || '');
      if (mso) {
        const key = mso[1] + mso[3];
        if (!msoLists[key]) {
          const marker = (el.textContent || '').trim().slice(0, 4);
          msoLists[key] = PT.uid('L');
          lists[msoLists[key]] = { k: /^[0-9]/.test(marker) ? 'decimal' : /^[a-z][.)]/.test(marker) ? 'lalpha' : /^[ivx]+[.)]/i.test(marker) ? 'lroman' : 'bullet' };
        }
        props.ls = { id: msoLists[key], l: Math.min(8, +mso[2] - 1) };
        delete props.inL; delete props.inF;
      }
      start(props, target);
      const startCount = target.length;
      for (const c of el.childNodes) walk(c, nm, Object.assign({}, ctx, { target }));
      if (cur && cur.target === target) flush(tag === 'P' && target.length === startCount);
      else flush();
    };
    const tableFrom = (el, m, ctx) => {
      const rowsEl = Array.from(el.rows || []);
      if (!rowsEl.length) return null;
      const grid = []; // grid[r][c] = {cell, master: bool, mh, mv}
      let ncols = 0;
      rowsEl.forEach((tr, r) => {
        grid[r] = grid[r] || [];
        let c = 0;
        for (const td of Array.from(tr.cells)) {
          while (grid[r][c]) c++;
          const cs = Math.max(1, Math.min(50, td.colSpan || 1)), rs = Math.max(1, Math.min(500, td.rowSpan || 1));
          const blocksIn = [];
          walk(td, m, { target: blocksIn, fs: ctx.fs });
          flush();
          const cell = { id: PT.uid('d'), blocks: blocksIn.length ? blocksIn : [P.make()] };
          const bg = PT.hex(td.style.backgroundColor || td.getAttribute('bgcolor'));
          if (bg && bg !== '#ffffff') cell.bg = bg;
          const va = td.style.verticalAlign || td.getAttribute('valign');
          if (/middle|center/.test(va || '')) cell.va = 'middle'; else if (/bottom/.test(va || '')) cell.va = 'bottom';
          if (td.tagName === 'TH') for (const b of cell.blocks) if (b.t === 'p') b.runs = R.mapMarks(b.runs, 0, R.len(b.runs), (mm) => M.with(mm, { b: mm.b === false ? false : true }));
          for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
            grid[r + dr] = grid[r + dr] || [];
            grid[r + dr][c + dc] = dr === 0 && dc === 0 ? { cell } : { cell: { id: PT.uid('d'), blocks: [], mh: dc > 0 || undefined, mv: dc === 0 && dr > 0 || undefined } };
          }
          c += cs;
          ncols = Math.max(ncols, c);
        }
      });
      ncols = Math.max(1, Math.min(60, ncols));
      const colEls = el.querySelectorAll('col');
      const widths = [];
      for (let c = 0; c < ncols; c++) { const ce = colEls[c]; widths.push(ce ? pxToPt(ce.getAttribute('width')) || pxToPt(ce.style.width) : null); }
      const tw = pxToPt(el.getAttribute('width')) || pxToPt(el.style.width) || (doc ? PT.pageDims(doc.page).cw : 450);
      const known = widths.filter(Boolean).reduce((s, x) => s + x, 0), unknown = widths.filter((x) => !x).length;
      const total = Math.min(Math.max(tw || 450, 72), doc ? PT.pageDims(doc.page).cw * 1.4 : 700);
      const cols = widths.map((w) => PT.round(w || Math.max(24, (total - known) / Math.max(1, unknown)), 1));
      const t = { t: 'table', id: PT.uid('t'), cols, bd: '0.5 solid #000000', rows: [] };
      const noBorder = el.getAttribute('border') === '0' || /border:\s*(none|0)/i.test(el.getAttribute('style') || '');
      if (noBorder) t.bd = null;
      if (el.getAttribute('align') === 'center' || (el.style.marginLeft === 'auto' && el.style.marginRight === 'auto')) t.al = 'center';
      grid.forEach((g, r) => {
        const row = { id: PT.uid('w'), cells: [] };
        if (rowsEl[r] && rowsEl[r].parentNode && rowsEl[r].parentNode.tagName === 'THEAD') row.hd = true;
        for (let c = 0; c < ncols; c++) row.cells.push((g[c] && g[c].cell) || { id: PT.uid('d'), blocks: [P.make()] });
        t.rows.push(row);
      });
      return t;
    };
    const bodyEl = dom.body || dom.documentElement;
    // Google Docs envuelve el contenido en <b style="font-weight:normal">
    walk(bodyEl, {}, { target: blocks, fs: 11 });
    flush();
    return { blocks, lists };
  };
  // texto con formato Markdown en línea -> tramos (para plantillas)
  C.inline = (text, base) => mdInlineParse(String(text || ''), base);
  // lectura básica de RTF: párrafos, negrita, cursiva, subrayado, tamaño y caracteres especiales
  C.fromRTF = function (rtf) {
    const doc = PT.Doc.blank();
    const blocks = [];
    let runs = [], st = { b: false, i: false, u: false, fs: null }, stack = [], skip = 0, uc = 1, props = {};
    const push = (t) => { if (t) runs.push({ x: t, m: M.intern({ b: st.b || null, i: st.i || null, u: st.u || null, fs: st.fs }) }); };
    const endPara = () => { blocks.push(P.make(props, R.normalize(runs))); runs = []; };
    const s = String(rtf || '');
    let i = 0, text = '';
    const flush = () => { push(text); text = ''; };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '{') { flush(); stack.push(Object.assign({}, st, { skip })); i++; if (s.startsWith('\\*', i)) { skip++; } continue; }
      if (ch === '}') { flush(); const prev = stack.pop(); if (prev) { skip = prev.skip; st = { b: prev.b, i: prev.i, u: prev.u, fs: prev.fs }; } i++; continue; }
      if (ch === '\\') {
        const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i.exec(s.slice(i, i + 40));
        if (!m) { i++; continue; }
        i += m[0].length;
        if (m[3]) { if (!skip) text += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(m[3], 16)])); continue; }
        if (m[4]) { if (!skip && /[\\{}]/.test(m[4])) text += m[4]; else if (m[4] === '~' && !skip) text += ' '; continue; }
        const w = m[1], n = m[2] != null ? +m[2] : null;
        if (/^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|footnote|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|mmathPr)$/.test(w)) { skip++; continue; }
        if (skip) continue;
        flush();
        if (w === 'par' || w === 'sect') { endPara(); props = Object.assign({}, props); }
        else if (w === 'pard') props = {};
        else if (w === 'line') text += '\n';
        else if (w === 'tab') text += '\t';
        else if (w === 'b') st.b = n !== 0; else if (w === 'i') st.i = n !== 0;
        else if (w === 'ul') st.u = n !== 0; else if (w === 'ulnone') st.u = false;
        else if (w === 'plain') st = { b: false, i: false, u: false, fs: null };
        else if (w === 'fs') st.fs = n ? n / 2 : null;
        else if (w === 'qc') props.al = 'center'; else if (w === 'qr') props.al = 'right'; else if (w === 'qj') props.al = 'justify';
        else if (w === 'page') { endPara(); props = Object.assign({}, props, { pb: true }); }
        else if (w === 'uc') uc = n || 1;
        else if (w === 'u') {
          text += String.fromCharCode(n < 0 ? n + 65536 : n);
          // se salta el carácter alternativo que sigue a \uN
          for (let k = 0; k < uc && i < s.length; k++) { if (s[i] === '\\' && s[i + 1] === "'") i += 4; else if (!/[\\{}]/.test(s[i])) i++; }
        }
        else if (w === 'emdash') text += '—'; else if (w === 'endash') text += '–'; else if (w === 'bullet') text += '•';
        else if (w === 'lquote') text += '‘'; else if (w === 'rquote') text += '’'; else if (w === 'ldblquote') text += '“'; else if (w === 'rdblquote') text += '”';
        continue;
      }
      if (ch === '\r' || ch === '\n') { i++; continue; }
      if (!skip) text += ch;
      i++;
    }
    flush();
    if (runs.length) endPara();
    while (blocks.length > 1 && !blocks[blocks.length - 1].runs.length) blocks.pop();
    doc.body = blocks.length ? blocks : [P.make()];
    doc._idx = null;
    return doc;
  };
  C.htmlToSlice = function (html, doc) {
    const frag = /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/.exec(html);
    const { blocks, lists } = C.parseHTML(frag ? frag[1] : html, doc);
    if (!blocks.length) return null;
    doc.tx('Listas', () => { for (const id in lists) doc.set(['lists', id], lists[id]); });
    if (blocks.length === 1 && blocks[0].t === 'p' && !blocks[0].st && !blocks[0].ls) return { inline: true, runs: blocks[0].runs };
    return { blocks };
  };
  C.fromHTML = function (html) {
    const d = PT.Doc.blank();
    const { blocks, lists } = C.parseHTML(html, d);
    d.lists = lists;
    d.body = blocks.length ? blocks : [P.make()];
    if (d.body[d.body.length - 1].t !== 'p') d.body.push(P.make());
    const t = /<title>([^<]*)<\/title>/i.exec(html);
    if (t && t[1].trim()) d.meta.title = t[1].trim();
    d._idx = null;
    return d;
  };

  // ---------------------------------------------------------------- portapapeles
  C.sliceToText = function (doc, slice) {
    if (slice.inline) return runText(doc, slice.runs);
    return C.blocksToText(doc, slice.blocks);
  };
  C.sliceToHTML = function (doc, slice) {
    const blocks = slice.inline ? [P.make(null, slice.runs)] : slice.blocks;
    const inner = C.blocksToHTML(doc, blocks);
    return '<meta charset="utf-8"><div style="font-family:' + esc(PT.fontCss(doc.style('normal').r.ff) || 'Calibri') + ';font-size:' + (doc.style('normal').r.fs || 11) + 'pt">' + (slice.inline ? inner.replace(/^<p[^>]*>|<\/p>$/g, '') : inner) + '</div>';
  };

  // ---------------------------------------------------------------- RTF (exportar)
  C.toRTF = function (doc) {
    const fonts = ['Calibri'], colors = ['#000000'];
    const fontIdx = (f) => { f = f || doc.style('normal').r.ff || 'Calibri'; let i = fonts.indexOf(f); if (i < 0) { i = fonts.length; fonts.push(f); } return i; };
    const colorIdx = (c) => { if (!c) return 0; c = PT.hex(c) || '#000000'; let i = colors.indexOf(c); if (i < 0) { i = colors.length; colors.push(c); } return i; };
    const rtfEsc = (s) => Array.from(s).map((ch) => {
      const cp = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch;
      if (ch === '\n') return '\\line ';
      if (ch === '\t') return '\\tab ';
      if (cp < 128) return ch;
      if (cp > 0xffff) { const s2 = ch; return Array.from({ length: s2.length }, (_, k) => '\\u' + (s2.charCodeAt(k) - (s2.charCodeAt(k) > 32767 ? 65536 : 0)) + '?').join(''); }
      return '\\u' + (cp > 32767 ? cp - 65536 : cp) + '?';
    }).join('');
    const twip = (pt) => Math.round((pt || 0) * 20);
    const markers = O.listMarkers(doc, 'body');
    const para = (p) => {
      const pp = doc.paraProps(p), st = doc.style(p.st || 'normal');
      let s = '\\pard\\plain';
      const al = pp.al || 'left';
      s += al === 'center' ? '\\qc' : al === 'right' ? '\\qr' : al === 'justify' ? '\\qj' : '\\ql';
      let li = pp.inL || 0, fi = pp.inF || 0;
      if (p.ls) { li = p.inL != null ? li : PT.LIST_INDENT * ((p.ls.l || 0) + 1); fi = p.inF != null ? fi : -PT.LIST_HANG; }
      s += '\\li' + twip(li) + '\\ri' + twip(pp.inR) + '\\fi' + twip(fi) + '\\sb' + twip(pp.spB) + '\\sa' + twip(pp.spA);
      if (pp.lhx) s += '\\sl-' + twip(pp.lhx) + '\\slmult0'; else s += '\\sl' + Math.round(240 * (pp.lh || 1)) + '\\slmult1';
      if (p.pb) s += '\\pagebb';
      if (pp.kn) s += '\\keepn';
      const lvl = doc.headingLevel(p);
      if (lvl) s += '\\outlinelevel' + (lvl - 1);
      s += ' ';
      if (p.ls && doc.lists[p.ls.id]) { const kind = doc.lists[p.ls.id].k; s += rtfEsc(kind === 'check' ? (p.ck ? '☒' : '☐') : PT.isBulletKind(kind) ? PT.listLevel(kind, p.ls.l || 0).bullet : markers.get(p.id) || '') + '\\tab '; }
      for (const r of p.runs) {
        if (r.m.del) continue;
        const e = Object.assign({}, st.r, r.m);
        let t = r.o ? C.atomText(doc, r.o) : r.x;
        if (!t) continue;
        let fmt = '\\f' + fontIdx(e.ff) + '\\fs' + Math.round((e.fs || 11) * 2) + (e.b ? '\\b' : '') + (e.i ? '\\i' : '') + (e.u ? (e.u === 'double' ? '\\uldb' : e.u === 'dotted' ? '\\uld' : e.u === 'wavy' ? '\\ulwave' : '\\ul') : '') + (e.s ? '\\strike' : '') + (e.sup ? '\\super' : '') + (e.sub ? '\\sub' : '') + (e.caps ? '\\caps' : '') + (e.sc ? '\\scaps' : '') + (e.fc ? '\\cf' + colorIdx(e.fc) : '') + (e.hl ? '\\highlight' + colorIdx(e.hl) : '');
        t = rtfEsc(t);
        if (r.m.ln && /^https?:|^mailto:/.test(r.m.ln)) s += '{\\field{\\*\\fldinst{HYPERLINK "' + rtfEsc(r.m.ln) + '"}}{\\fldrslt{' + fmt + ' ' + t + '}}}';
        else s += '{' + fmt + ' ' + t + '}';
      }
      return s + '\\par\n';
    };
    const blocks = (list) => {
      let out = '';
      for (const b of list) {
        if (b.t === 'p') out += para(b);
        else if (b.t === 'hr') out += '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n';
        else if (b.t === 'table') {
          for (let r = 0; r < b.rows.length; r++) {
            let rowDef = '\\trowd\\trgaph108', x = 0;
            const row = b.rows[r];
            for (let c = 0; c < row.cells.length; c++) {
              const cell = row.cells[c];
              if (cell.mh) continue;
              const sp = cell.mv ? { cs: (() => { let n = 1; while (c + n < row.cells.length && row.cells[c + n].mh) n++; return n; })() } : O.spanOf(b, r, c);
              for (let k = 0; k < sp.cs; k++) x += b.cols[c + k];
              const brd = b.bd ? '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10' : '';
              rowDef += (cell.mv ? '\\clvmrg' : O.spanOf(b, r, c).rs > 1 ? '\\clvmgf' : '') + brd + (cell.bg ? '\\clcbpat' + colorIdx(cell.bg) : '') + '\\cellx' + twip(x);
            }
            out += rowDef + '\n';
            for (let c = 0; c < row.cells.length; c++) {
              const cell = row.cells[c];
              if (cell.mh) continue;
              const inner = cell.mv ? '\\pard\\intbl ' : blocks(cell.blocks.filter((x2) => x2.t === 'p')).replace(/\\par\n/g, '\\par ').replace(/\\pard\\plain/g, '\\pard\\plain\\intbl').replace(/\\par $/, '');
              out += inner + '\\cell ';
            }
            out += '\\row\n';
          }
          out += '\\pard\n';
        }
      }
      return out;
    };
    const d = PT.pageDims(doc.page);
    const body = blocks(doc.body);
    const head = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl' + fonts.map((f, i) => '{\\f' + i + '\\fnil ' + rtfEsc(f) + ';}').join('') + '}{\\colortbl;' + colors.slice(1).map((c) => { const [r, g, b] = PT.rgbOf(c); return '\\red' + r + '\\green' + g + '\\blue' + b + ';'; }).join('') + '}' +
      '{\\info{\\title ' + rtfEsc(doc.meta.title || '') + '}{\\author ' + rtfEsc(doc.meta.author || '') + '}}\\paperw' + twip(d.W) + '\\paperh' + twip(d.H) + '\\margl' + twip(d.ml) + '\\margr' + twip(d.mr) + '\\margt' + twip(d.mt) + '\\margb' + twip(d.mb) + (doc.page.orient === 'landscape' ? '\\landscape' : '') + '\n';
    return head + body + '}';
  };
})(typeof window !== 'undefined' ? window : globalThis);
