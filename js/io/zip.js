/* ZIP propio para los paquetes de Office (.docx): escritura con la compresión del navegador
   (CompressionStream 'deflate-raw') y lectura con DecompressionStream. Funciona también en Node 18+. */
(function (root) {
  'use strict';
  const PT = root.PT;
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function deflate(u8) { try { return typeof CompressionStream === 'undefined' ? null : await pipe(u8, new CompressionStream('deflate-raw')); } catch (e) { return null; } }
  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir archivos de Word. Actualízalo a una versión reciente.');
    return pipe(u8, new DecompressionStream('deflate-raw'));
  }
  // files: [{name, data: string | Uint8Array}]
  async function zip(files, mime) {
    const enc = new TextEncoder(), parts = [], central = [];
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(raw);
      let comp = raw.length > 100 && !f.store ? await deflate(raw) : null, method = 8;
      if (!comp || comp.length >= raw.length) { comp = raw; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true);
      lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, comp);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, raw.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + comp.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: mime || 'application/zip' });
  }
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('El archivo no es un paquete ZIP válido (¿es un .doc antiguo?).');
    const count = dv.getUint16(e + 10, true), dec = new TextDecoder(), entries = {};
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < count && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/^\//, '').replace(/\\/g, '/');
      p += 46 + nlen + xlen + clen;
      if (loff + 30 > u8.length) continue;
      const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
      entries[name] = { method, data: u8.subarray(start, start + csize) };
    }
    const lower = {};
    for (const n in entries) lower[n.toLowerCase()] = n;
    const bytes = async (n) => {
      const real = lower[String(n).toLowerCase().replace(/^\//, '')];
      if (!real) return null;
      const en = entries[real];
      return en.method === 8 ? inflate(en.data) : en.data;
    };
    return {
      names: () => Object.keys(entries),
      has: (n) => String(n).toLowerCase().replace(/^\//, '') in lower,
      bytes,
      async text(n) { const b = await bytes(n); return b ? new TextDecoder('utf-8').decode(b) : null; },
    };
  }
  PT.zip = { zip, unzip, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
