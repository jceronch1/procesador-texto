/* Marco de la aplicación: barra de título, menús, barra de herramientas, regla, esquema del documento,
   paneles de comentarios y de cambios, barra de estado y menús contextuales. */
(function () {
  'use strict';
  const PT = window.PT, O = PT.ops, R = PT.runs, M = PT.marks, P = PT.para, V = PT.view, ui = PT.ui, h = ui.h;
  const app = () => PT.app;
  const run = (name, arg) => () => PT.app.run(name, arg);
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 175, 200];
  const SPACINGS = [[1, 'Sencillo'], [1.15, '1,15'], [1.5, '1,5'], [2, 'Doble'], [2.5, '2,5'], [3, 'Triple']];
  const BULLET_KINDS = ['bullet', 'dash', 'arrow', 'square', 'diamond', 'star'];
  const NUMBER_KINDS = ['decimal', 'paren', 'lalpha', 'ualpha', 'lroman', 'uroman', 'outline'];

  const chrome = (PT.chrome = {
    els: {}, btn: {}, state: {},

    build() {
      const root = document.getElementById('app'), E = this.els;
      E.title = h('input#doc-title', { type: 'text', 'aria-label': 'Nombre del documento', spellcheck: false, maxlength: 120 });
      E.title.addEventListener('change', () => { const a = app(), t = E.title.value.trim() || 'Documento sin título'; a.doc.tx('Título', () => a.doc.set(['meta', 'title'], t)); a.refresh({ noScroll: true }); a.focusEditor(); });
      E.title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') E.title.value = app().doc.meta.title; E.title.blur(); app().focusEditor(); } e.stopPropagation(); });
      E.save = h('span#save-state', { 'aria-live': 'polite' });
      E.modeBtn = h('button#mode-btn', { type: 'button', title: 'Modo de edición' });
      E.modeBtn.addEventListener('click', () => this.modeMenu(E.modeBtn));
      E.menubar = h('nav#menubar', { role: 'menubar', 'aria-label': 'Menú principal' });
      E.toolbar = h('div#toolbar', { role: 'toolbar', 'aria-label': 'Barra de herramientas' });
      // cinta con los botones del menú elegido (sustituye a la barra mientras está visible)
      E.ribbon = h('div#ribbon', { role: 'toolbar', 'aria-label': 'Opciones del menú', hidden: true });
      E.ruler = h('div#ruler', { 'aria-hidden': 'true' });
      E.rulerWrap = h('div#ruler-wrap', E.ruler);
      E.pages = h('div.pt-pages');
      E.flow = h('div#flow.pt-flow');
      E.canvas = h('div#canvas.pt-canvas', E.pages, E.flow);
      E.sizer = h('div#sizer', E.canvas);
      E.workspace = h('div#workspace', E.rulerWrap, E.sizer);
      E.outline = h('aside#outline', { 'aria-label': 'Esquema del documento' });
      E.side = h('aside#sidepanel', { hidden: true });
      E.status = h('footer#statusbar');
      // barra de acceso rápido (como en Word): deshacer y rehacer siempre a la vista, sea cual sea la pestaña
      E.qatUndo = this.tbButton('undo', 'Deshacer (Ctrl+Z)', run('undo'));
      E.qatRedo = this.tbButton('redo', 'Rehacer (Ctrl+Y)', run('redo'));
      root.append(
        h('header#titlebar', h('span.app-ico', ui.icon('logo', 24)), h('span.qat', E.qatUndo, E.qatRedo), E.title, E.save, h('span.grow'), E.modeBtn),
        E.menubar, E.toolbar, E.ribbon,
        h('div#main', E.outline, h('div#center', E.workspace), E.side),
        E.status);
      this.buildMenubar();
      this.buildToolbar();
      this.btn.undo = E.qatUndo; this.btn.redo = E.qatRedo;
      this.buildStatus();
      this.bindCanvas();
      this.updateLayout();
    },
    tbButton(icon, label, action, opts) {
      opts = opts || {};
      const b = h('button.tb-btn' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', title: label, 'aria-label': label }, typeof icon === 'string' ? ui.icon(icon) : icon, opts.text ? h('span.tb-text', opts.text) : null, opts.caret ? h('span.tb-caret', ui.icon('down', 10)) : null);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => action(e));
      return b;
    },

    // ------------------------------------------------------------ menús
    styleItems() {
      const a = app(), doc = a.doc, cur = (this.state.st || 'normal');
      const ids = PT.STYLE_ORDER.filter((id) => doc.styles[id]).concat(Object.keys(doc.styles).filter((id) => !PT.STYLE_ORDER.includes(id) && !doc.styles[id].builtin && !doc.styles[id].hidden));
      return ids.map((id) => {
        const s = doc.style(id);
        const css = V.runCss(s.r);
        const preview = { fontFamily: css['font-family'], fontWeight: css['font-weight'], fontStyle: css['font-style'], color: css.color, fontSize: Math.min(20, Math.max(11, (s.r.fs || 11) * 0.9)) + 'pt' };
        const key = id === 'normal' ? 'Ctrl+Alt+0' : /^h[1-6]$/.test(id) ? 'Ctrl+Alt+' + id[1] : '';
        return { label: s.name, checked: cur === id, preview, key, action: run('style', id) };
      });
    },
    listItems(kinds) {
      return kinds.map((k) => ({ label: PT.LIST_KINDS[k], checked: this.state.list === k, action: () => { const a = app(); if (PT.isBulletKind(k)) a.lastBullet = k; else a.lastNumber = k; a.run('list', k); } }));
    },
    tableGrid() {
      const el = h('div.tbl-grid-pop');
      const label = h('div.tbl-grid-label', 'Insertar tabla');
      const grid = h('div.tbl-grid');
      const cells = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) {
        const cell = h('span.tbl-grid-cell');
        cell.addEventListener('pointerenter', () => { for (const x of cells) x.el.classList.toggle('on', x.r <= r && x.c <= c); label.textContent = (c + 1) + ' × ' + (r + 1) + ' (columnas × filas)'; });
        cell.addEventListener('pointerdown', (e) => e.preventDefault());
        cell.addEventListener('click', () => { ui.closePopups(); app().run('insertTable', { rows: r + 1, cols: c + 1 }); });
        cells.push({ el: cell, r, c });
        grid.appendChild(cell);
      }
      el.append(label, grid, h('button.btn.small', { type: 'button', onclick: () => { ui.closePopups(); PT.dlg.insertTable(); } }, 'Más opciones…'));
      return el;
    },
    menus() {
      const a = app(), doc = a.doc, s = a.settings, st = this.state;
      const inTable = !!a.tableCtx();
      const recent = PT.files.recentCache || [];
      return [
        ['Archivo', [
          { label: 'Nuevo documento', icon: 'fileNew', action: run('newDoc') },
          { label: 'Nuevo desde plantilla…', icon: 'template', action: run('template') },
          { label: 'Abrir…', icon: 'folder', key: 'Ctrl+O', action: run('open') },
          { label: 'Mis documentos', icon: 'book', sub: () => this.recentItems() },
          '-',
          { label: 'Descargar como', icon: 'download', sub: [
            { label: 'Word (.docx)', key: 'Ctrl+S', action: run('saveDocx') },
            { label: 'PDF (con el diálogo de impresión)', action: run('pdf') },
            { label: 'Página web (.html)', action: run('saveAs', 'html') },
            { label: 'Markdown (.md)', action: run('saveAs', 'md') },
            { label: 'Formato de texto enriquecido (.rtf)', action: run('saveAs', 'rtf') },
            { label: 'Texto sin formato (.txt)', action: run('saveAs', 'txt') },
            { label: 'Copia completa (.json)', action: run('saveAs', 'json') },
          ] },
          { label: 'Copiar como Markdown', icon: 'code', action: run('copyMarkdown') },
          '-',
          { label: 'Guardar una versión…', icon: 'star', action: run('saveVersion') },
          { label: 'Historial de versiones…', icon: 'history', action: run('versions') },
          '-',
          { label: 'Configurar página…', icon: 'pageSetup', action: run('pageSetup') },
          { label: 'Propiedades del documento…', action: run('docProps') },
          { label: 'Imprimir…', icon: 'print', key: 'Ctrl+P', action: run('print') },
          '-',
          { label: 'Abrir documento de ejemplo', icon: 'file', action: run('example') },
          { label: 'Preferencias…', icon: 'gear', action: run('settings') },
        ]],
        ['Editar', [
          { label: 'Deshacer', icon: 'undo', key: 'Ctrl+Z', disabled: !doc.undoStack.length, action: run('undo') },
          { label: 'Rehacer', icon: 'redo', key: 'Ctrl+Y', disabled: !doc.redoStack.length, action: run('redo') },
          '-',
          { label: 'Cortar', icon: 'cut', key: 'Ctrl+X', action: run('cut') },
          { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', action: run('copy') },
          { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', action: run('paste') },
          { label: 'Pegar sin formato', key: 'Ctrl+Mayús+V', action: run('pastePlain') },
          { label: 'Pegar desde Markdown', action: run('pasteMarkdown') },
          '-',
          { label: 'Seleccionar todo', key: 'Ctrl+A', action: run('selectAll') },
          '-',
          { label: 'Buscar…', icon: 'search', key: 'Ctrl+F', action: run('find') },
          { label: 'Buscar y reemplazar…', key: 'Ctrl+H', action: run('replace') },
          { label: 'Ir a…', key: 'Ctrl+G', action: run('goTo') },
          '-',
          { label: 'Paleta de comandos…', icon: 'command', key: 'Ctrl+Mayús+P', action: run('palette') },
        ]],
        ['Ver', [
          { label: 'Diseño de impresión', checked: !s.pageless, action: run('pageless', false) },
          { label: 'Sin páginas (continuo)', checked: !!s.pageless, action: run('pageless', true) },
          '-',
          { label: 'Regla', icon: s.ruler ? null : 'ruler', checked: s.ruler, action: run('ruler') },
          { label: 'Esquema del documento', checked: s.outline, action: run('outline') },
          { label: 'Caracteres de formato (¶)', checked: s.showMarks, action: run('showMarks') },
          { label: 'Marcas de cambios', checked: s.showChanges, action: run('showChanges') },
          { label: 'Autoría del texto (pegado e IA)', icon: s.showSrc ? null : 'author', checked: !!s.showSrc, action: run('showAuthorship') },
          '-',
          { label: 'Escritura enfocada', icon: 'typewriter', sub: [
            { label: 'Máquina de escribir (la línea actual siempre en el centro)', checked: !!s.typewriter, action: run('typewriter') },
            { label: 'Atenuar el resto del texto', checked: !!s.dimOthers, action: run('dimOthers') },
          ] },
          { label: 'Modo presentación', icon: 'present', action: run('present') },
          '-',
          { label: 'Comentarios', icon: 'comment', action: run('commentsPanel') },
          { label: 'Revisión de cambios', icon: 'track', action: run('changesPanel') },
          '-',
          { label: 'Zoom', sub: this.zoomItems() },
          { label: 'Modo enfoque', icon: 'focus', checked: document.body.classList.contains('focus-mode'), action: run('focusMode') },
          { label: 'Modo lectura', icon: 'eye', checked: a.readOnly, action: run('readMode') },
          { label: 'Pantalla completa', icon: 'fullscreen', key: 'F11', action: run('fullscreen') },
          { label: 'Tema oscuro', icon: 'moon', checked: s.dark, action: run('darkMode') },
        ]],
        ['Insertar', [
          { label: 'Imagen', icon: 'image', sub: [{ label: 'Desde el equipo…', icon: 'upload', action: run('image') }, { label: 'Desde una dirección web…', icon: 'globe', action: run('imageUrl') }, '-', { label: 'Dibujo a mano…', icon: 'pen', action: run('drawing') }] },
          { label: 'Tabla', icon: 'table', sub: [{ label: 'Insertar tabla…', icon: 'table', action: () => PT.dlg.insertTable() }, { label: '2 × 2', action: run('insertTable', { rows: 2, cols: 2 }) }, { label: '3 × 3', action: run('insertTable', { rows: 3, cols: 3 }) }, { label: '4 × 4 con encabezado', action: run('insertTable', { rows: 4, cols: 4, header: true }) }] },
          { label: 'Vínculo…', icon: 'link', key: 'Ctrl+K', action: run('link') },
          { label: 'Comentario', icon: 'comment', key: 'Ctrl+Alt+M', action: run('comment') },
          { label: 'Nota al pie', icon: 'footnote', key: 'Ctrl+Alt+F', action: run('footnote') },
          '-',
          // agrupado en submenús para que el menú sea corto (todas las opciones están también en la cinta)
          { label: 'Páginas', icon: 'pageBreak', sub: [
            { label: 'Salto de página', icon: 'pageBreak', key: 'Ctrl+Intro', action: run('pageBreak') },
            { label: 'Línea horizontal', icon: 'hr', action: run('hr') },
            { label: 'Índice (tabla de contenido)', icon: 'toc', action: run('insertToc') },
            { label: 'Marca de agua…', icon: 'watermark', action: run('watermark') },
          ] },
          { label: 'Encabezado y pie de página', icon: 'header', sub: [
            { label: 'Encabezado', icon: 'header', action: run('headerFooter', 'hdr') },
            { label: 'Pie de página', icon: 'footer', action: run('headerFooter', 'ftr') },
            { label: 'Números de página…', icon: 'pageNum', action: run('pageNumbers') },
          ] },
          { label: 'Campo', icon: 'hash', sub: [
            { label: 'Número de página', action: run('field', 'page') }, { label: 'Número total de páginas', action: run('field', 'pages') },
            { label: 'Fecha de hoy', action: run('field', 'date') }, { label: 'Hora', action: run('field', 'time') },
            { label: 'Título del documento', action: run('field', 'title') }, { label: 'Autor', action: run('field', 'author') }, { label: 'Recuento de palabras', action: run('field', 'words') },
          ] },
          { label: 'Fichas inteligentes', icon: 'at', sub: [
            { label: 'Fecha', icon: 'calendar', action: run('dateChip') }, { label: 'Casilla de verificación', icon: 'checkbox', action: run('checkboxChip') },
            { label: 'Desplegable de estado', icon: 'dropdown', action: run('dropdownChip', 'status') }, { label: 'Desplegable de prioridad', icon: 'dropdown', action: run('dropdownChip', 'priority') },
            { label: 'Desplegable personalizado…', icon: 'dropdown', action: run('dropdownChip', 'custom') }, '-', { title: 'Consejo: escribe @ en el texto' },
          ] },
          '-',
          { label: 'Bloques prediseñados', icon: 'blocks', sub: () => PT.extras.blockMenu() },
          { label: 'Variable', icon: 'variable', sub: () => PT.extras.varMenu() },
          '-',
          { label: 'Símbolos y ecuaciones', icon: 'symbol', sub: [
            { label: 'Símbolo o carácter especial…', icon: 'symbol', action: run('symbol') },
            { label: 'Emoji…', icon: 'emoji', action: run('emoji') },
            { label: 'Ecuación…', icon: 'equation', action: run('equation') },
          ] },
          { label: 'Firma…', icon: 'sign', action: run('signature') },
        ]],
        ['Formato', [
          { label: 'Texto', icon: 'bold', sub: [
            { label: 'Negrita', icon: 'bold', key: 'Ctrl+B', checked: st.b, action: run('bold') }, { label: 'Cursiva', icon: 'italic', key: 'Ctrl+I', checked: st.i, action: run('italic') },
            { label: 'Subrayado', icon: 'underline', key: 'Ctrl+U', checked: st.u, action: run('underline') },
            { label: 'Estilo de subrayado', sub: this.underlineItems() },
            { label: 'Tachado', icon: 'strike', key: 'Alt+Mayús+5', checked: st.s, action: run('strike') },
            { label: 'Superíndice', icon: 'sup', key: 'Ctrl+.', checked: st.sup, action: run('sup') }, { label: 'Subíndice', icon: 'sub', key: 'Ctrl+,', checked: st.sub, action: run('sub') },
            { label: 'Versalitas', checked: st.sc, action: run('smallCaps') }, { label: 'Todo en mayúsculas', checked: st.caps, action: run('allCaps') },
            '-', { label: 'Aumentar tamaño', key: 'Ctrl+]', action: run('fontStep', 1) }, { label: 'Reducir tamaño', key: 'Ctrl+[', action: run('fontStep', -1) },
          ] },
          { label: 'Estilos de párrafo', sub: () => this.styleMenuItems() },
          { label: 'Fuente…', action: run('fontDialog') },
          { label: 'Párrafo…', action: run('paragraph') },
          '-',
          { label: 'Alineación', icon: 'alignL', sub: [['left', 'Izquierda', 'alignL', 'Ctrl+Mayús+L'], ['center', 'Centro', 'alignC', 'Ctrl+Mayús+E'], ['right', 'Derecha', 'alignR', 'Ctrl+Mayús+R'], ['justify', 'Justificado', 'alignJ', 'Ctrl+Mayús+J']].map(([v, t, ic, k]) => ({ label: t, icon: ic, key: k, checked: (st.al || 'left') === v, action: run('align', v) })) },
          { label: 'Interlineado y espaciado', icon: 'spacing', sub: () => this.spacingItems() },
          { label: 'Viñetas y numeración', icon: 'listBullet', sub: [{ title: 'Viñetas' }, ...this.listItems(BULLET_KINDS), { title: 'Numeración' }, ...this.listItems(NUMBER_KINDS), '-', { label: PT.LIST_KINDS.check, icon: 'listCheck', action: run('listCheck') }, '-', { label: 'Reiniciar numeración', action: run('listRestart') }, { label: 'Continuar numeración', action: run('listContinue') }, { label: 'Empezar en…', action: run('listStart') }] },
          { label: 'Sangría', icon: 'indentMore', sub: [{ label: 'Aumentar sangría', icon: 'indentMore', key: 'Ctrl+M', action: run('indentMore') }, { label: 'Disminuir sangría', icon: 'indentLess', action: run('indentLess') }] },
          { label: 'Mayúsculas y minúsculas', icon: 'caseAa', sub: [['sentence', 'Tipo oración.'], ['lower', 'minúsculas'], ['upper', 'MAYÚSCULAS'], ['title', 'Poner En Mayúsculas Cada Palabra'], ['toggle', 'tIPO iNVERSO']].map(([v, t]) => ({ label: t, action: run('case', v) })) },
          { label: 'Letra capital', icon: 'dropcap', checked: st.dc, action: run('dropCap') },
          { label: 'Bordes y sombreado…', action: run('borders') },
          { label: 'Copiar formato', icon: 'paint', action: run('formatPainter') },
          '-',
          { label: 'Color de página', sub: [{ label: 'Sin color', swatch: '#ffffff', action: run('pageColor', null) }, ...['#fffdf5', '#fdf6e3', '#f3f7fb', '#eef7ee', '#fbeff2', '#f2f2f2'].map((c) => ({ label: c, swatch: c, checked: doc.page.color === c, action: run('pageColor', c) }))] },
          { label: 'Números de línea', icon: 'lineNum', sub: () => this.lineNumItems() },
          { label: 'Borrar formato', icon: 'clearFmt', key: 'Ctrl+\\', action: run('clearFormat') },
        ]],
        ['Revisar', [
          { label: 'Ortografía e idioma…', icon: 'spell', key: 'F7', action: run('spellLang') },
          { label: 'Revisor de estilo', icon: 'wand', hint: 'Oraciones largas, voz pasiva, repeticiones, muletillas…', action: run('styleCheck') },
          { label: 'Comprobar accesibilidad', icon: 'a11y', action: run('a11y') },
          { label: 'Recuento de palabras', icon: 'stats', key: 'Ctrl+Mayús+C', action: run('wordCount') },
          { label: 'Autoría del texto…', icon: 'author', action: run('authorship') },
          '-',
          { label: 'Nuevo comentario', icon: 'comment', key: 'Ctrl+Alt+M', action: run('comment') },
          { label: 'Ver comentarios', action: run('commentsPanel') },
          '-',
          { label: 'Control de cambios', icon: 'track', checked: doc.track, action: run('track') },
          { label: 'Revisar cambios…', action: run('changesPanel') },
          { label: 'Aceptar todos los cambios', icon: 'accept', action: run('acceptAll') },
          { label: 'Rechazar todos los cambios', icon: 'reject', action: run('rejectAll') },
          '-',
          { label: 'Comparar documentos…', icon: 'compare', action: run('compare') },
        ]],
        ['Herramientas', [
          { label: 'Leer en voz alta', icon: 'speak', checked: PT.tools.reading, action: run('readAloud') },
          { label: 'Dictado por voz', icon: 'mic', checked: PT.tools.dictating, action: run('dictate') },
          '-',
          { label: 'Objetivo de palabras…', icon: 'goal', action: run('wordGoal') },
          { label: 'Variables del documento', icon: 'variable', action: run('variables') },
          { label: 'Combinar correspondencia…', icon: 'merge2', action: run('mailMerge') },
          { label: 'Mis bloques…', icon: 'blocks', action: run('myBlocks') },
          '-',
          { label: 'Paleta de comandos…', icon: 'command', key: 'Ctrl+Mayús+P', action: run('palette') },
          { label: 'Autocorrección y formato automático…', action: () => PT.dlg.settings(1) },
          { label: 'Preferencias…', icon: 'gear', action: run('settings') },
        ]],
        ['Tabla', [
          { label: 'Insertar tabla', icon: 'table', sub: [{ label: 'Insertar tabla…', action: () => PT.dlg.insertTable() }, { label: '2 × 2', action: run('insertTable', { rows: 2, cols: 2 }) }, { label: '3 × 3', action: run('insertTable', { rows: 3, cols: 3 }) }, { label: '5 × 4 con encabezado', action: run('insertTable', { rows: 5, cols: 4, header: true }) }] },
          '-',
          { label: 'Insertar fila encima', icon: 'rowAdd', disabled: !inTable, action: run('tableRowAbove') },
          { label: 'Insertar fila debajo', icon: 'rowAdd', disabled: !inTable, action: run('tableRowBelow') },
          { label: 'Insertar columna a la izquierda', icon: 'colAdd', disabled: !inTable, action: run('tableColLeft') },
          { label: 'Insertar columna a la derecha', icon: 'colAdd', disabled: !inTable, action: run('tableColRight') },
          '-',
          { label: 'Eliminar fila', icon: 'rowDel', disabled: !inTable, action: run('tableDelRow') },
          { label: 'Eliminar columna', icon: 'colDel', disabled: !inTable, action: run('tableDelCol') },
          { label: 'Eliminar tabla', icon: 'trash', disabled: !inTable, action: run('tableDelete') },
          '-',
          { label: 'Combinar celdas', icon: 'merge', disabled: !inTable, action: run('tableMerge') },
          { label: 'Dividir celdas combinadas', icon: 'split', disabled: !inTable, action: run('tableSplit') },
          { label: 'Repetir fila de encabezado', disabled: !inTable, checked: inTable && !!(a.tableCtx().tbl.rows[0].hd), action: run('tableHeader') },
          { label: 'Distribuir columnas', disabled: !inTable, action: run('tableDistribute') },
          { label: 'Ordenar', disabled: !inTable, sub: [{ label: 'De A a Z (columna actual)', icon: 'sortAsc', action: run('tableSort', false) }, { label: 'De Z a A (columna actual)', icon: 'sortDesc', action: run('tableSort', true) }] },
          { label: 'Color de celda', disabled: !inTable, sub: () => [{ label: 'Sin color', swatch: 'transparent', action: run('cellColor', null) }, ...['#f2f2f2', '#d9e2f3', '#e2efd9', '#fbe4d5', '#fff2cc', '#ededed', '#ddebf7', '#4472c4', '#70ad47'].map((c) => ({ label: c, swatch: c, action: run('cellColor', c) }))] },
          { label: 'Alineación vertical', disabled: !inTable, sub: [['top', 'Arriba'], ['middle', 'En medio'], ['bottom', 'Abajo']].map(([v, t]) => ({ label: t, action: run('cellAlign', v) })) },
          { label: 'Bordes', disabled: !inTable, sub: [{ label: 'Con bordes', action: run('tableBorders', true) }, { label: 'Sin bordes', action: run('tableBorders', false) }] },
          { label: 'Propiedades de tabla…', icon: 'gear', disabled: !inTable, action: run('tableProps') },
        ]],
        ['IA', [
          { label: 'Abrir el asistente de IA', icon: 'sparkle', action: run('ai') },
          '-',
          ...(PT.ai ? PT.ai.ACTIONS.map((x) => ({ label: x.l, icon: x.i, action: run('ai', x.id) })) : []),
          '-',
          { label: 'Configurar el asistente…', icon: 'gear', action: run('aiConfig') },
        ]],
        ['Ayuda', [
          { label: 'Guía rápida', icon: 'help', action: run('guide') },
          { label: 'Atajos de teclado', icon: 'menu', action: run('shortcuts') },
          { label: 'Acerca del procesador de texto', action: run('about') },
        ]],
      ];
      void recent;
    },
    recentItems() {
      const list = (PT.files.recentCache || []).slice(0, 10);
      const cur = app().doc && PT.files.currentId;
      const items = list.map((d) => ({ label: (d.title || 'Sin título') + ' · ' + PT.agoText(d.modified), checked: d.id === cur, action: () => PT.files.openStored(d.id) }));
      if (!items.length) items.push({ label: 'Todavía no hay documentos guardados', disabled: true });
      items.push('-', { label: 'Administrar documentos…', icon: 'book', action: run('library') });
      return items;
    },
    spacingItems() {
      const st = this.state;
      return SPACINGS.map(([v, t]) => ({ label: t, checked: Math.abs((st.lh || 1.15) - v) < 0.01 && !st.lhx, action: run('lineSpacing', v) })).concat([
        '-',
        { label: st.spB ? 'Quitar espacio antes del párrafo' : 'Agregar espacio antes del párrafo', action: run('spaceBefore', !st.spB) },
        { label: st.spA ? 'Quitar espacio después del párrafo' : 'Agregar espacio después del párrafo', action: run('spaceAfter', !st.spA) },
        '-',
        { label: 'Espaciado personalizado…', action: run('paragraph') },
      ]);
    },
    fontItems() {
      const cur = this.state.ff;
      return [{ label: 'Fuente del estilo', checked: !this.state._mff, action: run('font', null) }, '-']
        .concat(PT.FONTS.map((f) => ({ label: f, checked: f === cur, preview: { fontFamily: PT.fontCss(f) }, action: run('font', f) })))
        .concat(['-', { label: 'Otra fuente…', action: async () => { const v = await ui.prompt('Nombre de la fuente instalada en el equipo', cur || '', { title: 'Fuente' }); if (v) app().run('font', v.trim()); } }]);
    },
    sizeItems(more) {
      const items = SIZES.map((s) => ({ label: String(s).replace('.', ','), checked: this.state.fs === s, action: run('fontSize', s) }));
      if (more) items.push('-', { label: 'Otro tamaño…', action: async () => { const fs = this.state.fs; const v = await ui.prompt('Tamaño de la fuente en puntos', fs ? String(fs).replace('.', PT.locale.dec) : '', { title: 'Tamaño de fuente' }); if (v) app().run('fontSize', v); } });
      return items;
    },
    zoomItems() {
      return ZOOMS.map((z) => ({ label: z + ' %', checked: Math.round(app().zoom * 100) === z, action: run('zoom', z / 100) })).concat(['-', { label: 'Ajustar al ancho', action: run('zoomFit') }, { label: 'Página completa', action: run('zoomPage') }]);
    },
    underlineItems() {
      const u = this.state.u;
      return [['single', 'Sencillo'], ['double', 'Doble'], ['dotted', 'Punteado'], ['dashed', 'Discontinuo'], ['wavy', 'Ondulado']].map(([v, t]) => ({ label: t, checked: v === 'single' ? u === true : u === v, action: run('underlineStyle', v === 'single' ? true : v) }));
    },
    lineNumItems() {
      const ln = app().doc.page.lnNum, on = !!(ln && ln.on);
      return [
        { label: 'Ninguno', checked: !on, action: run('lineNumbers', 'none') },
        { label: 'Continuos', checked: on && ln.restart !== 'page', action: run('lineNumbers', 'cont') },
        { label: 'Reiniciar en cada página', checked: on && ln.restart === 'page', action: run('lineNumbers', 'page') },
        '-',
        { label: 'Numerar solo cada 5 líneas', checked: on && ln.by === 5, disabled: !on, action: run('lineNumbers', 'step') },
      ];
    },
    styleMenuItems() {
      return this.styleItems().concat(['-', { label: 'Actualizar el estilo con la selección', action: run('updateStyle') }, { label: 'Modificar y crear estilos…', icon: 'gear', action: run('styles') }]);
    },
    buildMenubar() {
      const names = ['Archivo', 'Editar', 'Ver', 'Insertar', 'Formato', 'Revisar', 'Herramientas', 'Tabla', 'IA', 'Ayuda'];
      const buttons = [];
      // pasar el puntero por un menú muestra sus botones en la cinta (sin desplegarlo); con un clic se despliega también.
      // Hay una pequeña espera para que cruzar la barra camino de otro sitio no cambie la cinta.
      const hoverShow = (b, name) => {
        b.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'touch' || this._menuOpen >= 0) return;
          clearTimeout(this._hoverT);
          this._hoverT = setTimeout(() => { if (this._menuOpen < 0 && b.matches(':hover')) PT.ribbon.show(name); }, 140);
        });
        b.addEventListener('pointerleave', () => clearTimeout(this._hoverT));
      };
      // «Inicio»: la pestaña con los botones más usados (no tiene menú desplegable)
      const home = h('button.menu-btn.tab-on', { type: 'button', role: 'menuitem', 'data-tab': 'Inicio', title: 'Inicio: portapapeles, fuente, párrafo, estilos, edición, voz y asistente' }, 'Inicio');
      home.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') e.preventDefault(); });
      home.addEventListener('click', () => { ui.closePopups(); PT.ribbon.show('Inicio'); });
      home.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); PT.ribbon.show('Inicio'); } });
      hoverShow(home, 'Inicio');
      this.els.menubar.appendChild(home);
      const open = (i) => {
        const b = buttons[i];
        if (this.ribbonTabsOnly) ui.closePopups();
        app().editor && app().editor.readSel();
        this.computeState();
        PT.ribbon.show(names[i]);
        clearTimeout(this._hoverT);
        if (this.ribbonTabsOnly) return;
        buttons.forEach((x) => x.classList.remove('open'));
        b.classList.add('open');
        this._menuOpen = i;
        ui.menu(this.menus()[i][1], b, {
          below: true,
          onClose: () => { b.classList.remove('open'); if (this._menuOpen === i) this._menuOpen = -1; },
          onSide: (d) => open((i + d + buttons.length) % buttons.length),
        });
      };
      names.forEach((n, i) => {
        const b = h('button.menu-btn', { type: 'button', role: 'menuitem', 'aria-haspopup': 'true', 'data-tab': n }, n);
        const toggle = () => { if (this._menuOpen === i) { ui.closePopups(); return; } if (i === 0) PT.files.refreshRecent(); open(i); };
        b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') { e.preventDefault(); toggle(); } });
        b.addEventListener('click', (e) => { if (e.pointerType === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) || (this.ribbonTabsOnly && e.detail === 0)) toggle(); });
        // con un menú ya desplegado, pasar a otro lo despliega (como en cualquier barra de menús)
        b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && this._menuOpen >= 0 && this._menuOpen !== i) open(i); });
        hoverShow(b, n);
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(i); } });
        buttons.push(b); this.els.menubar.appendChild(b);
      });
      this._menuOpen = -1;
    },

    // ------------------------------------------------------------ barra de herramientas
    buildToolbar() {
      const B = this.btn, tb = this.els.toolbar, sep = () => h('span.tb-sep', { role: 'separator' });
      const add = (id, icon, label, action, opts) => (B[id] = this.tbButton(icon, label, action, opts));
      const a = app;
      const split = (id, icon, label, apply, openPicker) => {
        const main = this.tbButton(icon, label, apply, { cls: 'split-main' });
        const arrow = this.tbButton(ui.icon('down', 10), label + ': más opciones', (e) => openPicker(e.currentTarget.parentNode), { cls: 'split-arrow' });
        B[id] = main;
        return h('span.tb-split', main, arrow);
      };
      // selector de estilo
      B.style = h('button.tb-drop.style-drop', { type: 'button', title: 'Estilo de párrafo' }, h('span.tb-drop-label', 'Normal'), ui.icon('down', 10));
      B.style.addEventListener('pointerdown', (e) => e.preventDefault());
      B.style.addEventListener('click', () => { a().editor.readSel(); this.computeState(); ui.menu(this.styleMenuItems(), B.style, { cls: 'style-menu' }); });
      // fuente
      B.font = h('button.tb-drop.font-drop', { type: 'button', title: 'Fuente' }, h('span.tb-drop-label', 'Calibri'), ui.icon('down', 10));
      B.font.addEventListener('pointerdown', (e) => e.preventDefault());
      B.font.addEventListener('click', () => ui.menu(this.fontItems(), B.font, { cls: 'font-menu' }));
      // tamaño
      B.size = h('input.tb-size', { type: 'text', inputmode: 'decimal', 'aria-label': 'Tamaño de fuente', title: 'Tamaño de fuente' });
      B.size.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); a().run('fontSize', B.size.value); a().focusEditor(); } else if (e.key === 'Escape') { this.updateSelection(); a().focusEditor(); } });
      B.size.addEventListener('focus', () => { B.size.select(); ui.menu(this.sizeItems(), B.size, { noFocus: true, noRefocus: true, cls: 'size-menu' }); });
      const sizeBox = h('span.tb-sizebox', this.tbButton('minus', 'Reducir tamaño (Ctrl+[)', run('fontStep', -1)), B.size, this.tbButton('plus', 'Aumentar tamaño (Ctrl+])', run('fontStep', 1)));
      B.zoom = h('button.tb-drop.zoom-drop', { type: 'button', title: 'Zoom' }, h('span.tb-drop-label', '100 %'), ui.icon('down', 10));
      B.zoom.addEventListener('pointerdown', (e) => e.preventDefault());
      B.zoom.addEventListener('click', () => ui.menu(this.zoomItems(), B.zoom));
      tb.append(
        add('undo', 'undo', 'Deshacer (Ctrl+Z)', run('undo')), add('redo', 'redo', 'Rehacer (Ctrl+Y)', run('redo')),
        add('print', 'print', 'Imprimir (Ctrl+P)', run('print')), add('paint', 'paint', 'Copiar formato', run('formatPainter')),
        sep(), B.zoom, sep(), B.style, sep(), B.font, sep(), sizeBox, sep(),
        add('bold', 'bold', 'Negrita (Ctrl+B)', run('bold')), add('italic', 'italic', 'Cursiva (Ctrl+I)', run('italic')),
        add('underline', 'underline', 'Subrayado (Ctrl+U)', run('underline')), add('strike', 'strike', 'Tachado (Alt+Mayús+5)', run('strike')),
        split('fontColor', 'fontColor', 'Color del texto', () => a().run('fontColor', a().lastFontColor === undefined ? '#c00000' : a().lastFontColor), (at) => ui.colorPicker(at, { value: this.state.fc, autoLabel: 'Automático', onPick: (c) => { a().run('fontColor', c); this.updateSwatches(); } })),
        split('highlight', 'highlight', 'Color de resaltado', () => a().run('highlight', a().lastHighlight === undefined ? '#ffff00' : a().lastHighlight), (at) => ui.colorPicker(at, { value: this.state.hl, autoLabel: 'Sin resaltado', palette: 'highlight', onPick: (c) => { a().run('highlight', c); this.updateSwatches(); } })),
        sep(),
        add('link', 'link', 'Insertar vínculo (Ctrl+K)', run('link')), add('comment', 'comment', 'Añadir comentario (Ctrl+Alt+M)', run('comment')),
        add('image', 'image', 'Insertar imagen', run('image')),
        add('table', 'table', 'Insertar tabla', (e) => ui.popup(this.tableGrid(), e.currentTarget), { caret: true }),
        sep(),
        add('alignL', 'alignL', 'Alinear a la izquierda (Ctrl+Mayús+L)', run('align', 'left')), add('alignC', 'alignC', 'Centrar (Ctrl+Mayús+E)', run('align', 'center')),
        add('alignR', 'alignR', 'Alinear a la derecha (Ctrl+Mayús+R)', run('align', 'right')), add('alignJ', 'alignJ', 'Justificar (Ctrl+Mayús+J)', run('align', 'justify')),
        add('spacing', 'spacing', 'Interlineado y espaciado', (e) => { this.computeState(); ui.menu(this.spacingItems(), e.currentTarget); }, { caret: true }),
        sep(),
        add('check', 'listCheck', 'Lista de verificación (Ctrl+Mayús+9)', run('listCheck')),
        split('bullets', 'listBullet', 'Lista con viñetas (Ctrl+Mayús+8)', run('listBullet'), (at) => ui.menu(this.listItems(BULLET_KINDS), at)),
        split('numbers', 'listNumber', 'Lista numerada (Ctrl+Mayús+7)', run('listNumber'), (at) => ui.menu(this.listItems(NUMBER_KINDS).concat(['-', { label: 'Reiniciar numeración', action: run('listRestart') }, { label: 'Continuar numeración', action: run('listContinue') }, { label: 'Empezar en…', action: run('listStart') }]), at)),
        add('indentLess', 'indentLess', 'Disminuir sangría', run('indentLess')), add('indentMore', 'indentMore', 'Aumentar sangría (Ctrl+M)', run('indentMore')),
        sep(),
        add('clear', 'clearFmt', 'Borrar formato (Ctrl+\\)', run('clearFormat')),
        add('find', 'search', 'Buscar y reemplazar (Ctrl+H)', run('replace')),
      );
      this.updateSwatches();
    },
    updateSwatches() {
      const a = app(), set = (b, c) => { const s = b && b.querySelector('.swatch'); if (s) s.setAttribute('fill', c || 'transparent'); };
      set(this.btn.fontColor, a.lastFontColor === undefined ? '#c00000' : a.lastFontColor || 'currentColor');
      set(this.btn.highlight, a.lastHighlight === undefined ? '#ffff00' : a.lastHighlight);
    },
    modeMenu(at) {
      const a = app(), doc = a.doc;
      ui.menu([
        { label: 'Edición', icon: 'track', checked: !doc.track && !a.readOnly, hint: 'Editar el documento directamente', action: () => { if (a.readOnly) a.run('readMode'); if (doc.track) a.run('track'); } },
        { label: 'Sugerencias', icon: 'comment', checked: doc.track && !a.readOnly, hint: 'Los cambios quedan marcados para revisarlos', action: () => { if (a.readOnly) a.run('readMode'); if (!doc.track) a.run('track'); } },
        { label: 'Lectura', icon: 'eye', checked: a.readOnly, hint: 'Ver el documento sin modificarlo', action: () => { if (!a.readOnly) a.run('readMode'); } },
      ], at);
    },

    // ------------------------------------------------------------ barra de estado
    buildStatus() {
      const E = this.els, st = E.status;
      E.pageLbl = h('button.st-btn', { type: 'button', title: 'Ir a una página' });
      E.pageLbl.addEventListener('click', run('goTo'));
      E.words = h('button.st-btn', { type: 'button', title: 'Recuento de palabras (Ctrl+Mayús+C)' });
      E.words.addEventListener('click', run('wordCount'));
      E.lang = h('button.st-btn', { type: 'button', title: 'Idioma de la ortografía' });
      E.lang.addEventListener('click', run('spellLang'));
      E.trackLbl = h('button.st-btn.track-lbl', { type: 'button', title: 'Control de cambios' });
      E.trackLbl.addEventListener('click', run('changesPanel'));
      E.viewBtns = h('span.st-views',
        this.tbButton('file', 'Diseño de impresión', run('pageless', false), { cls: 'v-print' }),
        this.tbButton('menu', 'Sin páginas', run('pageless', true), { cls: 'v-pageless' }),
        this.tbButton('focus', 'Modo enfoque', run('focusMode')));
      E.zoomRange = h('input#zoom-range', { type: 'range', min: 25, max: 300, step: 5, 'aria-label': 'Zoom' });
      E.zoomRange.addEventListener('input', () => { app().settings.zoomFit = false; app().setZoom(E.zoomRange.value / 100); });
      E.zoomRange.addEventListener('change', () => app().focusEditor());
      E.zoomLbl = h('button#zoom-lbl', { type: 'button', title: 'Zoom' });
      E.zoomLbl.addEventListener('click', () => ui.menu(this.zoomItems(), E.zoomLbl));
      st.append(E.pageLbl, E.words, E.lang, E.trackLbl, h('span.grow'), E.viewBtns,
        h('span#zoom', this.tbButton('minus', 'Alejar', () => app().setZoom(app().zoom - 0.1)), E.zoomRange, this.tbButton('plus', 'Acercar', () => app().setZoom(app().zoom + 0.1)), E.zoomLbl));
      E.exitFocus = h('button#exit-focus.btn.small', { type: 'button', onclick: run('focusMode') }, 'Salir del modo enfoque');
      document.body.appendChild(E.exitFocus);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !ui.popupOpen() && !ui.dialogOpen() && !app().imageSel) { document.body.classList.remove('focus-mode'); } });
    },

    // ------------------------------------------------------------ lienzo: zonas de encabezado y pie, menú contextual
    bindCanvas() {
      const E = this.els;
      E.canvas.addEventListener('dblclick', (e) => {
        const a = app();
        if (e.target.closest('.pt-imgsel')) return;
        const z = a.layout.zoneAt(e.clientX, e.clientY);
        if (!z) return;
        if (z.zone === 'hdr' || z.zone === 'ftr') {
          e.preventDefault();
          const first = z.page === 0 && a.doc.page.first;
          a.editStory(z.zone + (first ? '1' : ''), false, z.page);
        } else if (a.activeHost && !a.activeHost.story.startsWith('fn:') && !a.activeHost.el.contains(e.target)) a.editStory(null);
      });
      E.canvas.addEventListener('pointerdown', (e) => {
        const a = app();
        if (e.button !== 0) return;
        const note = e.target.closest('.pt-note');
        if (note && (!a.activeHost || !a.activeHost.el.contains(e.target))) { e.preventDefault(); a.editNote(note.dataset.note); return; }
        if (a.activeHost && !a.activeHost.el.contains(e.target) && !e.target.closest('.pt-imgsel')) {
          const z = a.layout.zoneAt(e.clientX, e.clientY);
          if (!a.activeHost.story.startsWith('fn:') && z && (z.zone === 'hdr' || z.zone === 'ftr')) return;
          a.editStory(null, true);
          PT.chrome.updateAll();
        }
        // clic en el margen: el cursor va a la línea más cercana
        if (e.target === E.canvas || e.target.closest('.pt-sheet') && !e.target.closest('.pt-note') && !e.target.closest('.pt-hdr.pt-editing, .pt-ftr.pt-editing')) {
          const fr = E.flow.getBoundingClientRect();
          if (e.clientY >= fr.top && e.clientY <= fr.bottom && !a.activeHost) {
            const x = PT.clamp(e.clientX, fr.left + 2, fr.right - 2);
            const pos = a.bodyEditor.posFromPoint(x, e.clientY);
            if (pos) { e.preventDefault(); a.bodyEditor.host.focus({ preventScroll: true }); a.bodyEditor.setSel(O.caret(pos)); }
          }
        }
      });
      E.canvas.addEventListener('contextmenu', (e) => {
        if (e.ctrlKey || e.metaKey) return; // menú del navegador (sugerencias de ortografía)
        const a = app(), ed = a.editor;
        if (!ed || !ed.host.contains(e.target)) return;
        e.preventDefault();
        const sel = ed.readSel();
        const pos = ed.posFromPoint(e.clientX, e.clientY);
        if (pos && sel && O.isCollapsed(sel)) ed.setSel(O.caret(pos));
        this.contextMenu({ x: e.clientX, y: e.clientY }, e.target);
      });
      E.workspace.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); app().settings.zoomFit = false; app().setZoom(app().zoom + (e.deltaY < 0 ? 0.1 : -0.1)); } }, { passive: false });
      E.workspace.addEventListener('scroll', () => { if (app().imageSel) app().positionImageSel(); this.updatePageLabel(); });
    },
    contextMenu(at, target) {
      const a = app(), inTable = !!a.tableCtx(), img = target.closest && target.closest('.pt-img'), link = target.closest && target.closest('a.pt-link');
      const sel = a.sel(), doc = a.doc;
      const hasChange = sel && O.marksInfo(doc, sel);
      const items = [];
      if (img) items.push({ label: 'Propiedades de la imagen…', icon: 'image', action: run('imageProps') }, { label: 'En línea con el texto', action: run('imageWrap', 'inline') }, { label: 'Ajustar a la izquierda', action: run('imageWrap', 'left') }, { label: 'Ajustar a la derecha', action: run('imageWrap', 'right') }, { label: 'Eliminar imagen', icon: 'trash', action: run('deleteImage') }, '-');
      items.push(
        { label: 'Cortar', icon: 'cut', key: 'Ctrl+X', action: run('cut') }, { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', action: run('copy') },
        { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', action: run('paste') }, { label: 'Pegar sin formato', key: 'Ctrl+Mayús+V', action: run('pastePlain') },
        '-');
      if (link) items.push({ label: 'Abrir vínculo', icon: 'globe', action: () => a.openLink(link.getAttribute('href')) }, { label: 'Editar vínculo…', icon: 'link', action: run('link') }, { label: 'Quitar vínculo', icon: 'unlink', action: run('unlink') });
      else items.push({ label: 'Vínculo…', icon: 'link', key: 'Ctrl+K', action: run('link') });
      items.push({ label: 'Comentario', icon: 'comment', key: 'Ctrl+Alt+M', action: run('comment') });
      if (hasChange && (hasChange.ins || hasChange.del || hasChange.ins === null || hasChange.del === null)) items.push({ label: 'Aceptar cambio', icon: 'accept', action: run('acceptSel') }, { label: 'Rechazar cambio', icon: 'reject', action: run('rejectSel') });
      items.push('-',
        { label: 'Estilo', sub: () => this.styleItems() },
        { label: 'Fuente…', action: run('fontDialog') }, { label: 'Párrafo…', action: run('paragraph') },
        { label: 'Viñetas y numeración', icon: 'listBullet', sub: [...this.listItems(BULLET_KINDS.slice(0, 3)), ...this.listItems(NUMBER_KINDS.slice(0, 3)), { label: PT.LIST_KINDS.check, action: run('listCheck') }, '-', { label: 'Reiniciar numeración', action: run('listRestart') }, { label: 'Continuar numeración', action: run('listContinue') }] },
        { label: 'Borrar formato', icon: 'clearFmt', action: run('clearFormat') });
      if (inTable) items.push('-', { label: 'Tabla', icon: 'table', sub: [
        { label: 'Insertar fila encima', action: run('tableRowAbove') }, { label: 'Insertar fila debajo', action: run('tableRowBelow') },
        { label: 'Insertar columna a la izquierda', action: run('tableColLeft') }, { label: 'Insertar columna a la derecha', action: run('tableColRight') }, '-',
        { label: 'Eliminar fila', action: run('tableDelRow') }, { label: 'Eliminar columna', action: run('tableDelCol') }, { label: 'Eliminar tabla', icon: 'trash', action: run('tableDelete') }, '-',
        { label: 'Combinar celdas', icon: 'merge', action: run('tableMerge') }, { label: 'Dividir celdas', icon: 'split', action: run('tableSplit') },
        { label: 'Distribuir columnas', action: run('tableDistribute') }, { label: 'Propiedades de tabla…', icon: 'gear', action: run('tableProps') },
      ] });
      items.push('-', { title: 'Ctrl + clic derecho: menú del navegador (ortografía)' });
      ui.menu(items, at);
    },

    // ------------------------------------------------------------ estado de la selección
    computeState() {
      const a = app(), doc = a.doc, ed = a.editor;
      const st = (this.state = {});
      if (!ed || !ed.sel || !doc.block(ed.sel.h.id)) return st;
      const sel = ed.sel;
      const info = O.marksInfo(doc, sel, ed.stored);
      Object.assign(st, info);
      const m = info._m || M.EMPTY;
      st._mff = !!m.ff;
      const p = doc.block(sel.h.id);
      const pp = doc.paraProps(p);
      st.st = p.st || 'normal';
      st.al = pp.al || 'left'; st.lh = pp.lh; st.lhx = pp.lhx; st.spB = pp.spB; st.spA = pp.spA; st.dc = !!p.dc;
      st.list = O.listKindOf(doc, p);
      st.para = p;
      return st;
    },
    updateSelection() {
      const a = app();
      if (!a.doc || !a.editor) return;
      const st = this.computeState(), B = this.btn;
      const on = (b, v) => b && b.classList.toggle('on', !!v);
      on(B.bold, st.b); on(B.italic, st.i); on(B.underline, st.u); on(B.strike, st.s);
      on(B.alignL, st.al === 'left'); on(B.alignC, st.al === 'center'); on(B.alignR, st.al === 'right'); on(B.alignJ, st.al === 'justify');
      on(B.check, st.list === 'check'); on(B.bullets, st.list && PT.isBulletKind(st.list) && st.list !== 'check'); on(B.numbers, st.list && !PT.isBulletKind(st.list));
      on(B.paint, !!a.painter);
      on(B.link, !!st.ln);
      const sname = st.st && a.doc.styles[st.st] ? a.doc.styles[st.st].name : 'Normal';
      B.style.querySelector('.tb-drop-label').textContent = sname;
      B.font.querySelector('.tb-drop-label').textContent = st.ff === null ? '—' : st.ff || 'Calibri';
      if (document.activeElement !== B.size) B.size.value = st.fs === null ? '' : String(st.fs || 11).replace('.', PT.locale.dec);
      if (PT.ribbon) PT.ribbon.update();
      if (PT.extras && PT.extras.onSelection) PT.extras.onSelection();
      this.updateRuler();
      this.updatePageLabel();
    },
    updateAll() {
      const a = app();
      if (!a.doc) return;
      const doc = a.doc, E = this.els;
      if (document.activeElement !== E.title) E.title.value = doc.meta.title || 'Documento sin título';
      this.btn.undo.disabled = !doc.undoStack.length;
      this.btn.redo.disabled = !doc.redoStack.length;
      E.modeBtn.replaceChildren(ui.icon(a.readOnly ? 'eye' : doc.track ? 'comment' : 'track', 15), h('span', a.readOnly ? 'Lectura' : doc.track ? 'Sugerencias' : 'Edición'), ui.icon('down', 10));
      E.modeBtn.classList.toggle('suggest', doc.track && !a.readOnly);
      E.trackLbl.hidden = !doc.track && !O.changes(doc).length;
      E.trackLbl.textContent = doc.track ? 'Control de cambios activado' : 'Hay cambios sin revisar';
      E.lang.textContent = PT.dlg && PT.dlg.langName ? PT.dlg.langName(doc.meta.lang) : doc.meta.lang;
      E.viewBtns.querySelector('.v-print').classList.toggle('on', !a.settings.pageless);
      E.viewBtns.querySelector('.v-pageless').classList.toggle('on', !!a.settings.pageless);
      E.canvas.classList.toggle('show-marks', !!a.settings.showMarks);
      this.updateSelection();
      this.updateZoom();
      clearTimeout(this._slowT);
      this._slowT = setTimeout(() => this.updateSlow(), 250);
    },
    // recuentos, esquema y paneles (se actualizan con un pequeño retraso)
    updateSlow() {
      const a = app(), doc = a.doc, E = this.els;
      const st = O.stats(doc, 'body');
      E.words.textContent = st.words.toLocaleString('es-ES') + (st.words === 1 ? ' palabra' : ' palabras');
      this.updateOutline();
      if (!E.side.hidden) this.renderPanel(true);
    },
    updatePageLabel() {
      const a = app(), E = this.els;
      if (!a.layout) return;
      const n = a.layout.count, start = a.doc.page.start || 1;
      let cur = 0;
      const r = a.editor && a.editor.story === 'body' && document.activeElement === a.editor.host ? a.editor.caretRect() : null;
      if (r) cur = a.layout.pageAtClientY(r.top + 2);
      else { const wr = E.workspace.getBoundingClientRect(); cur = a.layout.pageAtClientY(wr.top + wr.height / 3); }
      E.pageLbl.textContent = a.layout.pageless ? 'Sin páginas' : 'Página ' + (cur + start) + ' de ' + (n + start - 1);
    },
    updateZoom() {
      const z = Math.round(app().zoom * 100), E = this.els;
      E.zoomLbl.textContent = z + ' %'; E.zoomRange.value = z;
      this.btn.zoom.querySelector('.tb-drop-label').textContent = z + ' %';
      if (PT.ribbon) PT.ribbon.update();
    },
    setSaveState(t) { if (this.els.save) this.els.save.textContent = t; },
    updateLayout() {
      const s = app().settings, E = this.els;
      E.rulerWrap.hidden = !s.ruler;
      E.outline.hidden = !s.outline;
      if (app().doc) { this.updateOutline(true); this.updateRuler(); }
    },

    // ------------------------------------------------------------ regla
    updateRuler() {
      const a = app(), E = this.els;
      if (!a.layout || !a.doc || E.rulerWrap.hidden || document.body.classList.contains('focus-mode')) return;
      const z = a.zoom, d = a.layout.dims(), pageless = a.layout.pageless;
      const W = pageless ? d.cw + 96 : d.W, ml = pageless ? 48 : d.ml, mr = pageless ? 48 : d.mr;
      const ruler = E.ruler;
      ruler.style.width = W * z + 'px';
      const unitPx = PT.locale.units === 'in' ? 96 : 96 / 2.54;
      let html = '<div class="rl-margin" style="left:0;width:' + ml * z + 'px"></div><div class="rl-margin" style="right:0;width:' + mr * z + 'px"></div>';
      const step = z < 0.6 ? 2 : 1;
      for (let k = 0, x = ml; x <= W - mr + 0.5; k++, x = ml + k * unitPx / 2) {
        const major = k % 2 === 0;
        if (!major && z < 0.75) continue;
        html += '<span class="rl-tick' + (major ? ' major' : '') + '" style="left:' + x * z + 'px"></span>';
        if (major && k > 0 && (k / 2) % step === 0) html += '<span class="rl-num" style="left:' + x * z + 'px">' + k / 2 + '</span>';
      }
      for (let k = 1, x = ml - unitPx; x >= 0; k++, x = ml - k * unitPx) if (k % step === 0) html += '<span class="rl-num" style="left:' + x * z + 'px">' + k + '</span>';
      ruler.innerHTML = html;
      // marcadores de sangría del párrafo actual
      const ed = a.editor, st = this.state;
      if (!ed || !ed.sel || !st.para) return;
      const pEl = ed.view.paraEl(ed.sel.h.id);
      if (!pEl) return;
      const cr = E.canvas.getBoundingClientRect(), pr = pEl.getBoundingClientRect();
      const left = (pr.left - cr.left) / z, right = (pr.right - cr.left) / z;
      const cs = getComputedStyle(pEl);
      const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight), ind = parseFloat(cs.textIndent);
      const mk = (cls, x, title, kind) => {
        const m = h('span.rl-mk.' + cls, { title, style: { left: x * z + 'px' } });
        m.addEventListener('pointerdown', (e) => this.dragIndent(e, kind, { left, right, padL, padR, ind }));
        ruler.appendChild(m);
      };
      mk('first', left + padL + ind, 'Sangría de primera línea', 'first');
      mk('hang', left + padL, 'Sangría francesa', 'hang');
      mk('left', left + padL, 'Sangría izquierda', 'left');
      mk('right', right - padR, 'Sangría derecha', 'right');
    },
    dragIndent(e, kind, g) {
      e.preventDefault();
      const a = app(), z = a.zoom, x0 = e.clientX, E = this.els;
      const target = e.currentTarget;
      const guide = h('div.rl-guide');
      E.workspace.appendChild(guide);
      const ids = O.paraIds(a.doc, a.editor.sel);
      const base = { inL: g.padL, inF: g.ind, inR: g.padR };
      let val = Object.assign({}, base);
      const snap = (px) => { const u = PT.locale.units === 'in' ? 96 / 8 : 96 / 2.54 / 4; return Math.round(px / u) * u; };
      const move = (ev) => {
        const dx = snap((ev.clientX - x0) / z);
        val = Object.assign({}, base);
        if (kind === 'first') val.inF = base.inF + dx;
        else if (kind === 'hang') { val.inL = Math.max(0, base.inL + dx); val.inF = base.inF - (val.inL - base.inL); }
        else if (kind === 'left') val.inL = Math.max(0, base.inL + dx);
        else if (kind === 'right') val.inR = Math.max(0, base.inR - dx);
        const xr = kind === 'right' ? g.right - val.inR : kind === 'first' ? g.left + val.inL + val.inF : g.left + val.inL;
        target.style.left = xr * z + 'px';
        const wr = E.workspace.getBoundingClientRect(), rr = E.ruler.getBoundingClientRect();
        guide.style.left = rr.left - wr.left + E.workspace.scrollLeft + xr * z + 'px';
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        guide.remove();
        const pt = (v) => PT.round(PT.px2pt(v), 1);
        a.edit('Sangría', () => { O.setPara(a.doc, ids, kind === 'right' ? { inR: pt(val.inR) || null } : { inL: pt(val.inL), inF: pt(val.inF) || 0 }); return a.editor.sel; });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    },

    // ------------------------------------------------------------ esquema del documento
    updateOutline(force) {
      const a = app(), doc = a.doc, E = this.els;
      if (E.outline.hidden) return;
      const entries = V.tocEntries(doc, 6).concat(doc.parasOf('body').filter((id) => (doc.block(id).st === 'title')).map((id) => ({ id, lvl: 0, text: doc.paraText(id).replace(/￼/g, '').trim() })).filter((x) => x.text));
      entries.sort((x, y) => doc.ord(x.id) - doc.ord(y.id));
      const sig = entries.map((e) => e.id + e.lvl + e.text).join('|');
      if (!force && sig === this._outlineSig) { this.markOutline(); return; }
      this._outlineSig = sig;
      const list = h('nav.ol-list');
      if (!entries.length) list.appendChild(h('p.ol-empty', 'Los títulos que añadas al documento aparecerán aquí.'));
      for (const e of entries) {
        const it = h('button.ol-item.ol-l' + e.lvl, { type: 'button', title: e.text, 'data-id': e.id }, e.text);
        it.addEventListener('click', () => a.goToPara(e.id));
        list.appendChild(it);
      }
      E.outline.replaceChildren(h('div.side-head', h('span', 'Esquema'), this.tbButton('close', 'Ocultar esquema', run('outline'))), list);
      this.markOutline();
    },
    markOutline() {
      const a = app(), doc = a.doc, ed = a.editor, E = this.els;
      if (!ed || !ed.sel || ed.story !== 'body') return;
      const n = doc.ord(ed.sel.h.id);
      let cur = null;
      for (const el of E.outline.querySelectorAll('.ol-item')) { if (doc.ord(el.dataset.id) <= n) cur = el; el.classList.remove('on'); }
      if (cur) cur.classList.add('on');
    },

    // ------------------------------------------------------------ paneles laterales (comentarios y cambios)
    showPanel(kind) {
      const E = this.els;
      if (!E.side.hidden && this._panel === kind) { this.closePanel(); return; }
      const prev = this._panel && PT.panels && PT.panels[this._panel];
      if (prev && prev.onClose && this._panel !== kind) prev.onClose();
      this._panel = kind;
      E.side.hidden = false;
      this.renderPanel();
      if (PT.ribbon) PT.ribbon.update();
    },
    closePanel() {
      const p = this._panel && PT.panels && PT.panels[this._panel];
      if (p && p.onClose) p.onClose();
      this.els.side.hidden = true;
      this._panel = null;
      this.setActiveComment(null);
      if (PT.ribbon) PT.ribbon.update();
      app().focusEditor();
    },
    // soft: actualización tras un cambio del documento (los paneles propios no se redibujan enteros)
    renderPanel(soft) {
      const p = PT.panels && PT.panels[this._panel];
      if (p) { if (!soft) p.render(this.els.side); else if (p.update) p.update(this.els.side); return; }
      if (this._panel === 'comments') this.renderComments();
      else if (this._panel === 'changes') this.renderChanges();
    },
    newComment(range) {
      this._newComment = range;
      this.renderComments();
      const ta = this.els.side.querySelector('.cm-new textarea');
      if (ta) ta.focus();
    },
    renderComments() {
      const a = app(), doc = a.doc, E = this.els;
      const ranges = O.commentRanges(doc);
      const showDone = !!this._showDone;
      const list = h('div.cm-list');
      if (this._newComment) {
        const ta = h('textarea.inp', { rows: 3, placeholder: 'Escribe un comentario…', 'aria-label': 'Nuevo comentario' });
        const save = () => {
          const text = ta.value.trim();
          const r = this._newComment;
          this._newComment = null;
          if (!text) { this.renderComments(); return; }
          a.edit('Comentario', () => { O.addComment(doc, r[0], r[1], text); return a.editor.sel; });
          this.renderComments();
        };
        ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } if (e.key === 'Escape') { this._newComment = null; this.renderComments(); a.focusEditor(); } });
        list.appendChild(h('div.cm-card.cm-new', h('div.cm-who', h('b', PT.locale.author)), ta, h('div.cm-actions', h('button.btn.small', { type: 'button', onclick: () => { this._newComment = null; this.renderComments(); a.focusEditor(); } }, 'Cancelar'), h('button.btn.small.primary', { type: 'button', onclick: save }, 'Comentar'))));
      }
      const ids = Array.from(ranges.keys()).filter((id) => doc.comments[id]);
      const orphan = Object.keys(doc.comments).filter((id) => !ranges.has(id));
      let shown = 0;
      for (const id of ids.concat(orphan)) {
        const c = doc.comments[id], rg = ranges.get(id);
        if (c.done && !showDone) continue;
        shown++;
        const card = h('div.cm-card' + (c.done ? '.done' : '') + (this._activeCm === id ? '.on' : ''));
        card.addEventListener('click', (e) => { if (e.target.closest('button,textarea')) return; this.activateComment(id, rg); });
        const replyBox = h('textarea.inp', { rows: 2, placeholder: 'Responder…', 'aria-label': 'Responder' });
        replyBox.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reply(); } });
        const reply = () => { const t = replyBox.value.trim(); if (!t) return; doc.tx('Responder', () => doc.set(['comments', id, 're'], (c.re || []).concat([{ by: PT.locale.author, at: new Date().toISOString(), text: t }]))); a.refresh({ noScroll: true }); };
        card.append(
          h('div.cm-who', h('span.cm-dot', { style: { background: V.authorColor(c.by) } }), h('b', c.by || 'Autor'), h('span.muted', PT.agoText(c.at))),
          rg && rg.text ? h('div.cm-quote', '«' + rg.text.replace(/￼/g, '').slice(0, 90) + (rg.text.length > 90 ? '…' : '') + '»') : h('div.cm-quote.muted', '(el texto comentado se eliminó)'),
          h('div.cm-text', c.text),
          ...(c.re || []).map((r) => h('div.cm-reply', h('div.cm-who', h('b', r.by), h('span.muted', PT.agoText(r.at))), h('div.cm-text', r.text))),
          c.done ? null : replyBox,
          h('div.cm-actions',
            c.done ? null : h('button.btn.small', { type: 'button', onclick: reply }, 'Responder'),
            h('button.btn.small', { type: 'button', onclick: () => { doc.tx(c.done ? 'Reabrir comentario' : 'Resolver comentario', () => doc.set(['comments', id, 'done'], !c.done)); a.refresh({ noScroll: true }); } }, c.done ? 'Reabrir' : 'Resolver'),
            h('button.btn.small', { type: 'button', title: 'Editar', onclick: async () => { const t = await ui.prompt('Comentario', c.text, { title: 'Editar comentario' }); if (t != null) { doc.tx('Editar comentario', () => doc.set(['comments', id, 'text'], t)); a.refresh({ noScroll: true }); } } }, 'Editar'),
            h('button.btn.small.danger-text', { type: 'button', onclick: () => { a.edit('Eliminar comentario', () => { O.removeComment(doc, id); return a.editor.sel; }); } }, 'Eliminar')));
        list.appendChild(card);
      }
      if (!shown && !this._newComment) list.appendChild(h('p.muted.cm-empty', 'No hay comentarios. Selecciona un texto y pulsa Ctrl+Alt+M.'));
      E.side.replaceChildren(
        h('div.side-head', h('span', 'Comentarios'), this.tbButton('close', 'Cerrar panel', () => { E.side.hidden = true; this._panel = null; this.setActiveComment(null); })),
        h('div.side-tools', ui.check('Mostrar resueltos', showDone, (v) => { this._showDone = v; this.renderComments(); }), h('button.btn.small', { type: 'button', onclick: run('comment') }, '+ Nuevo')),
        list);
    },
    activateComment(id, rg) {
      this._activeCm = id;
      this.setActiveComment(id);
      for (const c of this.els.side.querySelectorAll('.cm-card')) c.classList.remove('on');
      if (rg) { app().goToPara(rg.from.id, rg.from.off); app().editor.setSel({ a: rg.from, h: rg.to }); }
      this.renderComments();
    },
    setActiveComment(id) {
      let st = document.getElementById('pt-active-cm');
      if (!st) st = document.head.appendChild(h('style#pt-active-cm'));
      st.textContent = id && /^[\w-]+$/.test(id) ? '.pt-flow [data-cm~="' + id + '"], .pt-sheet [data-cm~="' + id + '"] { background: var(--cm-active) !important; }' : '';
    },
    renderChanges() {
      const a = app(), doc = a.doc, E = this.els;
      const changes = O.changes(doc);
      const list = h('div.cm-list');
      for (const c of changes) {
        const card = h('div.cm-card.tc-card');
        card.addEventListener('click', (e) => { if (e.target.closest('button')) return; a.goToPara(c.from.id, c.from.off); a.editor.setSel({ a: c.from, h: c.to }); });
        const resolve = (accept) => { a.edit(accept ? 'Aceptar cambio' : 'Rechazar cambio', () => { O.resolveChanges(doc, accept, c.from, c.to); return a.editor.sel; }); };
        card.append(
          h('div.cm-who', h('span.cm-dot', { style: { background: V.authorColor(c.by) } }), h('b', c.by), h('span.muted', PT.agoText(c.at))),
          h('div.tc-what', h('span.tc-kind.' + c.kind, c.kind === 'ins' ? 'Insertó' : 'Eliminó'), ' «' + c.text.slice(0, 80) + (c.text.length > 80 ? '…' : '') + '»'),
          h('div.cm-actions', h('button.btn.small', { type: 'button', onclick: () => resolve(true) }, 'Aceptar'), h('button.btn.small', { type: 'button', onclick: () => resolve(false) }, 'Rechazar')));
        list.appendChild(card);
      }
      if (!changes.length) list.appendChild(h('p.muted.cm-empty', doc.track ? 'Los cambios que hagas quedarán aquí como sugerencias.' : 'No hay cambios pendientes. Activa el control de cambios para que tus ediciones queden marcadas.'));
      E.side.replaceChildren(
        h('div.side-head', h('span', 'Revisión de cambios'), this.tbButton('close', 'Cerrar panel', () => { E.side.hidden = true; this._panel = null; })),
        h('div.side-tools', ui.check('Control de cambios', doc.track, () => a.run('track')), h('span.grow')),
        h('div.side-tools', h('button.btn.small', { type: 'button', onclick: run('acceptAll'), disabled: !changes.length }, 'Aceptar todos'), h('button.btn.small', { type: 'button', onclick: run('rejectAll'), disabled: !changes.length }, 'Rechazar todos')),
        list);
    },
  });
})();
