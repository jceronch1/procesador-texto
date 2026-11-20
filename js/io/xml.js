/* Analizador XML ligero (sin DOMParser, para que funcione igual en el navegador y en Node).
   Normaliza los prefijos de los espacios de nombres conocidos de Office (w:, r:, a:, wp:, pic:, v:, m:…)
   aunque el archivo use otros. Nodo: {n: nombre, a: atributos, c: hijos} o {t: texto}. */
(function (root) {
  'use strict';
  const PT = root.PT;
  const NS = {
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
    'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
    'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
    'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing': 'wp',
    'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing': 'wp',
    'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
    'http://purl.oclc.org/ooxml/drawingml/main': 'a',
    'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
    'http://purl.oclc.org/ooxml/drawingml/picture': 'pic',
    'urn:schemas-microsoft-com:vml': 'v',
    'urn:schemas-microsoft-com:office:office': 'o',
    'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
    'http://schemas.openxmlformats.org/officeDocument/2006/math': 'm',
    'http://schemas.openxmlformats.org/package/2006/relationships': 'pr',
    'http://schemas.openxmlformats.org/package/2006/content-types': 'ct',
    'http://schemas.openxmlformats.org/package/2006/metadata/core-properties': 'cp',
    'http://purl.org/dc/elements/1.1/': 'dc',
    'http://purl.org/dc/terms/': 'dcterms',
    'http://schemas.microsoft.com/office/word/2010/wordml': 'w14',
    'http://schemas.microsoft.com/office/word/2010/wordprocessingShape': 'wps',
    'http://www.w3.org/XML/1998/namespace': 'xml',
  };
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch (err) { return ''; } }
    return ENT[e] != null ? ENT[e] : m;
  }));
  function parse(text) {
    const s = String(text || '');
    const doc = { n: '#doc', a: {}, c: [] };
    const stack = [doc];
    const nsStack = [{ xml: 'http://www.w3.org/XML/1998/namespace' }];
    let i = 0;
    const len = s.length;
    const canon = (qname, scope, isAttr) => {
      const k = qname.indexOf(':');
      const pre = k < 0 ? '' : qname.slice(0, k), local = k < 0 ? qname : qname.slice(k + 1);
      if (isAttr && !pre) return local;
      const uri = scope[pre];
      const p = uri != null && NS[uri] ? NS[uri] : pre;
      return p ? p + ':' + local : local;
    };
    while (i < len) {
      const lt = s.indexOf('<', i);
      if (lt < 0) { const t = s.slice(i); if (t.trim()) stack[stack.length - 1].c.push({ t: decode(t) }); break; }
      if (lt > i) stack[stack.length - 1].c.push({ t: decode(s.slice(i, lt)) });
      const c1 = s[lt + 1];
      if (c1 === '?') { const e = s.indexOf('?>', lt); i = e < 0 ? len : e + 2; continue; }
      if (c1 === '!') {
        if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt); i = e < 0 ? len : e + 3; continue; }
        if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt); stack[stack.length - 1].c.push({ t: s.slice(lt + 9, e < 0 ? len : e) }); i = e < 0 ? len : e + 3; continue; }
        const e = s.indexOf('>', lt); i = e < 0 ? len : e + 1; continue;
      }
      if (c1 === '/') {
        const e = s.indexOf('>', lt);
        if (stack.length > 1) { stack.pop(); nsStack.pop(); }
        i = e < 0 ? len : e + 1;
        continue;
      }
      // etiqueta de apertura
      let j = lt + 1;
      while (j < len && !/[\s/>]/.test(s[j])) j++;
      const qname = s.slice(lt + 1, j);
      const rawAttrs = [];
      let selfClose = false;
      while (j < len) {
        while (j < len && /\s/.test(s[j])) j++;
        if (s[j] === '>') { j++; break; }
        if (s[j] === '/' && s[j + 1] === '>') { selfClose = true; j += 2; break; }
        let k = j;
        while (k < len && !/[\s=/>]/.test(s[k])) k++;
        const an = s.slice(j, k);
        j = k;
        while (j < len && /\s/.test(s[j])) j++;
        let val = '';
        if (s[j] === '=') {
          j++;
          while (j < len && /\s/.test(s[j])) j++;
          const q = s[j];
          if (q === '"' || q === "'") { const e = s.indexOf(q, j + 1); val = s.slice(j + 1, e < 0 ? len : e); j = e < 0 ? len : e + 1; }
          else { let e = j; while (e < len && !/[\s>]/.test(s[e])) e++; val = s.slice(j, e); j = e; }
        }
        if (an) rawAttrs.push([an, decode(val)]);
      }
      const scope = Object.create(nsStack[nsStack.length - 1]);
      for (const [an, v] of rawAttrs) { if (an === 'xmlns') scope[''] = v; else if (an.startsWith('xmlns:')) scope[an.slice(6)] = v; }
      const node = { n: canon(qname, scope, false), a: {}, c: [] };
      for (const [an, v] of rawAttrs) if (an !== 'xmlns' && !an.startsWith('xmlns:')) node.a[canon(an, scope, true)] = v;
      stack[stack.length - 1].c.push(node);
      if (!selfClose) { stack.push(node); nsStack.push(scope); }
      i = j;
    }
    return doc;
  }
  const X = (PT.xml = {
    parse,
    // primer elemento raíz
    root: (doc) => doc.c.find((x) => x.n),
    kids: (n, name) => (n && n.c ? n.c.filter((x) => x.n && (!name || x.n === name)) : []),
    kid: (n, name) => (n && n.c ? n.c.find((x) => x.n === name) || null : null),
    attr: (n, name) => (n && n.a ? (n.a[name] != null ? n.a[name] : null) : null),
    val: (n, name) => { const k = X.kid(n, name); return k ? X.attr(k, 'w:val') : null; },
    // ¿la propiedad booleana está activa? (<w:b/>, <w:b w:val="1"/>, false con "0"/"false"/"off")
    on: (n, name) => { const k = X.kid(n, name); if (!k) return null; const v = X.attr(k, 'w:val'); return v == null || !/^(0|false|off|none)$/i.test(v); },
    text: (n) => { if (!n) return ''; if (n.t != null) return n.t; let s = ''; for (const c of n.c || []) s += X.text(c); return s; },
    find(n, name) { if (!n || !n.c) return null; for (const c of n.c) { if (c.n === name) return c; const r = X.find(c, name); if (r) return r; } return null; },
    findAll(n, name, out) { out = out || []; if (!n || !n.c) return out; for (const c of n.c) { if (c.n === name) out.push(c); X.findAll(c, name, out); } return out; },
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ''),
  });
})(typeof window !== 'undefined' ? window : globalThis);
