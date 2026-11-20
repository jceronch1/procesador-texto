/* Carga el motor (sin interfaz) en Node para las pruebas. */
const path = require('path');
const files = ['core/base.js', 'model/doc.js', 'model/ops.js', 'model/compare.js', 'io/zip.js', 'io/xml.js', 'io/convert.js', 'io/docx.js'];
for (const f of files) {
  try { require(path.join(__dirname, '..', 'js', f)); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' && /js[\\/]io/.test(e.message)) continue;
    throw e;
  }
}
module.exports = globalThis.PT;
