/* Cinta de opciones: al abrir un menú, la barra de herramientas se cambia por los botones de todas sus
   opciones, agrupados por tema como las pestañas de Word. La pestaña «Inicio» vuelve a la barra de formato. */
(function () {
  'use strict';
  const PT = window.PT;
  const A = () => PT.app, C = () => PT.chrome, D = () => PT.app.doc, S = () => PT.chrome.state || {};

  // el contexto de tabla se calcula una sola vez en cada actualización
  let stamp = 0, tcAt = -1, tcVal = null;
  const tctx = () => { if (tcAt !== stamp) { tcAt = stamp; tcVal = A().tableCtx ? A().tableCtx() : null; } return tcVal; };
  const noTable = () => !tctx();
  const headerRow = () => { const t = tctx(); return !!(t && t.tbl.rows[0].hd); };
  const panelOn = (k) => C()._panel === k && !C().els.side.hidden;
  const lastFc = () => (A().lastFontColor === undefined ? '#c00000' : A().lastFontColor);
  const lastHl = () => (A().lastHighlight === undefined ? '#ffff00' : A().lastHighlight);
  let lastCell = '#d9e2f3';

  const aiItems = (ids) => ids.map((id) => { const x = (PT.ai ? PT.ai.ACTIONS : []).find((a) => a.id === id); return x ? { l: x.l, i: x.i, c: 'ai', a: x.id } : null; }).filter(Boolean);
  const GALLERY = ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'quote', 'code'];
  const EDITING = ['Inicio', 'Editar', 'Insertar', 'Formato', 'Tabla'];

  /* Cada pestaña es una lista de grupos {cap, gi, pri, launch, items}. Si la cinta no cabe, los grupos se
     pliegan en un botón con su icono gi y un menú, empezando por el de menor pri y el más a la derecha. En items:
     - un botón suelto se dibuja grande (icono y texto debajo);
     - {stack: [...]} son botones pequeños con texto, en columnas de tres;
     - {rows: [[...], ...]} son filas de botones de solo icono (como Fuente y Párrafo en Word);
     - {gallery: 'styles'} es la galería de estilos.
     Botón: l texto · i icono · k atajo · t ayuda · c/a comando · fn acción · drop menú · grid tabla ·
     pick color · split menú de la flecha · txt valor visible · w ancho · on activo · dis desactivado. */
  const CASES = () => [['sentence', 'Tipo oración.'], ['lower', 'minúsculas'], ['upper', 'MAYÚSCULAS'], ['title', 'Cada Palabra En Mayúscula'], ['toggle', 'tIPO iNVERSO']].map(([v, t]) => ({ label: t, action: () => A().run('case', v) }));
  const TABS = () => ({
    // como la pestaña Inicio de Word: portapapeles, fuente, párrafo, estilos, edición, voz y asistente
    Inicio: [
      { cap: 'Portapapeles', gi: 'paste', pri: -1, items: [
        { l: 'Pegar', i: 'paste', c: 'paste', k: 'Ctrl+V', split: () => [
          { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', action: () => A().run('paste') },
          { label: 'Pegar sin formato', icon: 'pastePlain', key: 'Ctrl+Mayús+V', action: () => A().run('pastePlain') },
          { label: 'Pegar desde Markdown', icon: 'code', action: () => A().run('pasteMarkdown') },
        ] },
        { rows: [
          [{ l: 'Cortar', i: 'cut', c: 'cut', k: 'Ctrl+X' }],
          [{ l: 'Copiar', i: 'copy', c: 'copy', k: 'Ctrl+C' }],
          [{ l: 'Copiar formato', i: 'paint', c: 'formatPainter', on: () => !!A().painter, t: 'Copia el formato y aplícalo seleccionando otro texto' }],
        ] },
      ] },
      { cap: 'Fuente', gi: 'caseAa', pri: 2, launch: { l: 'Más opciones de fuente', c: 'fontDialog' }, items: [{ rows: [
        [
          { l: 'Fuente', drop: () => C().fontItems(), menuCls: 'font-menu', txt: () => (S().ff === null ? '—' : S().ff || 'Calibri'), w: 116 },
          { l: 'Tamaño de fuente', drop: () => C().sizeItems(true), menuCls: 'size-menu', txt: () => (S().fs === null ? '' : String(S().fs || 11).replace('.', PT.locale.dec)), w: 48 },
          { l: 'Aumentar tamaño', i: 'plus', c: 'fontStep', a: 1, k: 'Ctrl+]' },
          { l: 'Reducir tamaño', i: 'minus', c: 'fontStep', a: -1, k: 'Ctrl+[' },
        ],
        [
          { l: 'Negrita', i: 'bold', c: 'bold', k: 'Ctrl+B', on: () => !!S().b },
          { l: 'Cursiva', i: 'italic', c: 'italic', k: 'Ctrl+I', on: () => !!S().i },
          { l: 'Subrayado', i: 'underline', c: 'underline', k: 'Ctrl+U', on: () => !!S().u, split: () => C().underlineItems() },
          { l: 'Tachado', i: 'strike', c: 'strike', k: 'Alt+Mayús+5', on: () => !!S().s },
          { l: 'Subíndice', i: 'sub', c: 'sub', k: 'Ctrl+,', on: () => !!S().sub },
          { l: 'Superíndice', i: 'sup', c: 'sup', k: 'Ctrl+.', on: () => !!S().sup },
        ],
        [
          { l: 'Color del texto', i: 'fontColor', pick: 'fc' },
          { l: 'Color de resaltado', i: 'highlight', pick: 'hl' },
          { l: 'Mayúsculas y minúsculas', i: 'caseAa', drop: CASES },
          { l: 'Borrar formato', i: 'clearFmt', c: 'clearFormat', k: 'Ctrl+\\' },
        ],
      ] }] },
      { cap: 'Párrafo', gi: 'alignL', pri: 2, launch: { l: 'Sangrías, espaciado y saltos', c: 'paragraph' }, items: [{ rows: [
        [
          { l: 'Viñetas', i: 'listBullet', c: 'listBullet', k: 'Ctrl+Mayús+8', on: () => !!S().list && PT.isBulletKind(S().list) && S().list !== 'check', split: () => C().listItems(['bullet', 'dash', 'arrow', 'square', 'diamond', 'star']) },
          { l: 'Numeración', i: 'listNumber', c: 'listNumber', k: 'Ctrl+Mayús+7', on: () => !!S().list && !PT.isBulletKind(S().list), split: () => C().listItems(['decimal', 'paren', 'lalpha', 'ualpha', 'lroman', 'uroman', 'outline']).concat(['-', { label: 'Reiniciar numeración', action: () => A().run('listRestart') }, { label: 'Continuar numeración', action: () => A().run('listContinue') }, { label: 'Empezar en…', action: () => A().run('listStart') }]) },
          { l: 'Lista de verificación', i: 'listCheck', c: 'listCheck', k: 'Ctrl+Mayús+9', on: () => S().list === 'check' },
          { l: 'Disminuir sangría', i: 'indentLess', c: 'indentLess' },
          { l: 'Aumentar sangría', i: 'indentMore', c: 'indentMore', k: 'Ctrl+M' },
        ],
        [
          { l: 'Alinear a la izquierda', i: 'alignL', c: 'align', a: 'left', k: 'Ctrl+Mayús+L', on: () => (S().al || 'left') === 'left' },
          { l: 'Centrar', i: 'alignC', c: 'align', a: 'center', k: 'Ctrl+Mayús+E', on: () => S().al === 'center' },
          { l: 'Alinear a la derecha', i: 'alignR', c: 'align', a: 'right', k: 'Ctrl+Mayús+R', on: () => S().al === 'right' },
          { l: 'Justificar', i: 'alignJ', c: 'align', a: 'justify', k: 'Ctrl+Mayús+J', on: () => S().al === 'justify' },
          { l: 'Interlineado y espaciado', i: 'spacing', drop: () => C().spacingItems() },
        ],
        [
          { l: 'Ordenar', i: 'sortAsc', drop: () => [{ label: 'De la A a la Z', icon: 'sortAsc', action: () => A().run('sortParas', false) }, { label: 'De la Z a la A', icon: 'sortDesc', action: () => A().run('sortParas', true) }], t: 'Ordena alfabéticamente los párrafos seleccionados (o la tabla)' },
          { l: 'Mostrar caracteres de formato', i: 'pilcrow', c: 'showMarks', on: () => !!A().settings.showMarks },
          { l: 'Sombreado del párrafo', i: 'cellColor', pick: 'pshade' },
          { l: 'Bordes y sombreado', i: 'borders', c: 'borders' },
        ],
      ] }] },
      { cap: 'Estilos', gi: 'pilcrow', pri: 1, launch: { l: 'Modificar y crear estilos', c: 'styles' }, items: [{ gallery: 'styles', short: true }] },
      { cap: 'Edición', gi: 'search', pri: -1, items: [{ stack: [
        { l: 'Buscar', i: 'search', c: 'find', k: 'Ctrl+F' },
        { l: 'Reemplazar', i: 'replace', c: 'replace', k: 'Ctrl+H' },
        { l: 'Seleccionar todo', i: 'selectAll', c: 'selectAll', k: 'Ctrl+A' },
      ] }] },
      { cap: 'Voz y asistente', gi: 'sparkle', pri: -1, items: [
        { l: 'Asistente IA', i: 'sparkle', c: 'ai', on: () => panelOn('ai'), t: 'Mejora, corrige, resume, traduce o continúa tu texto' },
        { stack: [
          { l: 'Dictar', i: 'mic', c: 'dictate', on: () => !!PT.tools.dictating, t: 'Escribe lo que dices' },
          { l: 'Leer en voz alta', i: 'speak', c: 'readAloud', on: () => !!PT.tools.reading },
          { l: 'Revisor de estilo', i: 'wand', c: 'styleCheck', on: () => panelOn('style') },
        ] },
      ] },
      { cap: 'Insertar', gi: 'image', pri: -2, items: [{ rows: [
        [{ l: 'Vínculo', i: 'link', c: 'link', k: 'Ctrl+K' }, { l: 'Comentario', i: 'comment', c: 'comment', k: 'Ctrl+Alt+M' }],
        [{ l: 'Imagen', i: 'image', c: 'image' }, { l: 'Tabla', i: 'table', grid: 1 }],
        [{ l: 'Nota al pie', i: 'footnote', c: 'footnote', k: 'Ctrl+Alt+F' }, { l: 'Símbolo', i: 'symbol', c: 'symbol' }],
      ] }] },
    ],
    Archivo: [
      { cap: 'Documento', items: [
        { l: 'Nuevo', i: 'fileNew', c: 'newDoc', t: 'Documento en blanco' },
        { l: 'Plantillas', i: 'template', c: 'template', t: 'Nuevo documento a partir de una plantilla' },
        { l: 'Abrir', i: 'folder', c: 'open', k: 'Ctrl+O', t: 'Word, Markdown, página web, RTF, texto o copia .json' },
        { l: 'Mis documentos', i: 'book', drop: () => C().recentItems(), t: 'Documentos guardados en este navegador' },
        { stack: [
          { l: 'Propiedades', i: 'info', c: 'docProps', t: 'Título, autor, asunto y palabras clave' },
          { l: 'Documento de ejemplo', i: 'file', c: 'example', t: 'Un informe que reúne casi todas las funciones' },
        ] },
      ] },
      { cap: 'Descargar como', items: [
        { l: 'Word', i: 'fWord', c: 'saveDocx', k: 'Ctrl+S', t: 'Documento de Word (.docx)' },
        { l: 'PDF', i: 'fPdf', c: 'pdf', t: 'Elige «Guardar como PDF» en el diálogo de impresión' },
        { stack: [
          { l: 'Página web', i: 'fHtml', c: 'saveAs', a: 'html', t: 'Archivo .html' },
          { l: 'Markdown', i: 'fMd', c: 'saveAs', a: 'md', t: 'Archivo .md' },
          { l: 'RTF', i: 'fRtf', c: 'saveAs', a: 'rtf', t: 'Formato de texto enriquecido' },
          { l: 'Texto sin formato', i: 'fTxt', c: 'saveAs', a: 'txt', t: 'Archivo .txt' },
          { l: 'Copia completa', i: 'fJson', c: 'saveAs', a: 'json', t: 'Archivo .json que se abre aquí sin perder nada' },
          { l: 'Copiar como Markdown', i: 'code', c: 'copyMarkdown', t: 'Copia todo el documento al portapapeles' },
        ] },
      ] },
      { cap: 'Versiones', pri: -1, items: [
        { l: 'Guardar versión', i: 'star', c: 'saveVersion', t: 'Guarda una versión con nombre' },
        { l: 'Historial', i: 'history', c: 'versions', t: 'Ver y restaurar versiones anteriores' },
      ] },
      { cap: 'Imprimir', pri: -1, items: [
        { l: 'Configurar página', i: 'pageSetup', c: 'pageSetup', t: 'Papel, orientación y márgenes' },
        { l: 'Imprimir', i: 'print', c: 'print', k: 'Ctrl+P' },
      ] },
      { cap: 'Opciones', items: [
        { l: 'Preferencias', i: 'gear', c: 'settings' },
      ] },
    ],
    Editar: [
      { cap: 'Deshacer', items: [
        { l: 'Deshacer', i: 'undo', c: 'undo', k: 'Ctrl+Z', dis: () => !D().undoStack.length },
        { l: 'Rehacer', i: 'redo', c: 'redo', k: 'Ctrl+Y', dis: () => !D().redoStack.length },
      ] },
      { cap: 'Portapapeles', items: [
        { l: 'Pegar', i: 'paste', c: 'paste', k: 'Ctrl+V' },
        { stack: [
          { l: 'Cortar', i: 'cut', c: 'cut', k: 'Ctrl+X' },
          { l: 'Copiar', i: 'copy', c: 'copy', k: 'Ctrl+C' },
          { l: 'Copiar formato', i: 'paint', c: 'formatPainter', on: () => !!A().painter, t: 'Copia el formato y aplícalo seleccionando otro texto' },
          { l: 'Pegar sin formato', i: 'pastePlain', c: 'pastePlain', k: 'Ctrl+Mayús+V' },
          { l: 'Pegar desde Markdown', i: 'code', c: 'pasteMarkdown', t: 'Convierte el Markdown del portapapeles en formato' },
          { l: 'Borrar formato', i: 'clearFmt', c: 'clearFormat', k: 'Ctrl+\\' },
        ] },
      ] },
      { cap: 'Buscar y seleccionar', items: [
        { l: 'Buscar', i: 'search', c: 'find', k: 'Ctrl+F' },
        { l: 'Reemplazar', i: 'replace', c: 'replace', k: 'Ctrl+H' },
        { l: 'Ir a', i: 'goTo', c: 'goTo', k: 'Ctrl+G', t: 'Ir a una página o a un título' },
        { l: 'Seleccionar todo', i: 'selectAll', c: 'selectAll', k: 'Ctrl+A' },
      ] },
      { cap: 'Comandos', items: [
        { l: 'Paleta de comandos', i: 'command', c: 'palette', k: 'Ctrl+Mayús+P', t: 'Busca y ejecuta cualquier función escribiendo su nombre' },
      ] },
    ],
    Ver: [
      { cap: 'Vistas', items: [
        { l: 'Diseño de impresión', i: 'printLayout', c: 'pageless', a: false, on: () => !A().settings.pageless },
        { l: 'Sin páginas', i: 'pageless', c: 'pageless', a: true, on: () => !!A().settings.pageless, t: 'Texto continuo, sin saltos de página' },
        { l: 'Lectura', i: 'eye', c: 'readMode', on: () => !!A().readOnly, t: 'Ver el documento sin poder modificarlo' },
        { l: 'Enfoque', i: 'focus', c: 'focusMode', t: 'Solo la página, sin barras (Esc para salir)' },
        { l: 'Presentar', i: 'present', c: 'present', t: 'Muestra el documento como diapositivas: una por cada título' },
      ] },
      { cap: 'Escritura enfocada', gi: 'typewriter', pri: -1, items: [{ stack: [
        { l: 'Máquina de escribir', i: 'typewriter', c: 'typewriter', on: () => !!A().settings.typewriter, t: 'La línea en la que escribes se queda siempre en el centro' },
        { l: 'Atenuar el resto', i: 'dim', c: 'dimOthers', on: () => !!A().settings.dimOthers, t: 'Solo se ve resaltado el párrafo actual' },
        { l: 'Autoría del texto', i: 'author', c: 'showAuthorship', on: () => !!A().settings.showSrc, t: 'Muestra lo pegado (naranja) y lo escrito por la IA (violeta)' },
      ] }] },
      { cap: 'Mostrar', gi: 'eye', items: [{ stack: [
        { l: 'Regla', i: 'ruler', c: 'ruler', on: () => !!A().settings.ruler },
        { l: 'Esquema', i: 'outline', c: 'outline', on: () => !!A().settings.outline, t: 'Los títulos del documento en el lateral' },
        { l: 'Caracteres de formato', i: 'pilcrow', c: 'showMarks', on: () => !!A().settings.showMarks, t: 'Marcas de párrafo, espacios y saltos' },
        { l: 'Marcas de cambios', i: 'track', c: 'showChanges', on: () => !!A().settings.showChanges },
        { l: 'Comentarios', i: 'comment', c: 'commentsPanel', on: () => panelOn('comments') },
        { l: 'Revisión de cambios', i: 'accept', c: 'changesPanel', on: () => panelOn('changes') },
      ] }] },
      { cap: 'Zoom', items: [
        { l: '100 %', i: 'zoom100', c: 'zoom', a: 1, on: () => Math.abs(A().zoom - 1) < 0.005 && !A().settings.zoomFit, t: 'Tamaño real' },
        { l: 'Ajustar al ancho', i: 'fitWidth', c: 'zoomFit', on: () => !!A().settings.zoomFit },
        { l: 'Página completa', i: 'fitPage', c: 'zoomPage' },
        { stack: [
          { l: 'Acercar', i: 'zoomIn', fn: () => { A().settings.zoomFit = false; A().setZoom(A().zoom + 0.1); } },
          { l: 'Alejar', i: 'zoomOut', fn: () => { A().settings.zoomFit = false; A().setZoom(A().zoom - 0.1); } },
          { l: 'Zoom', i: 'search', drop: () => C().zoomItems(), txt: () => 'Zoom: ' + Math.round(A().zoom * 100) + ' %' },
        ] },
      ] },
      { cap: 'Ventana', items: [
        { l: 'Pantalla completa', i: 'fullscreen', c: 'fullscreen', k: 'F11' },
        { l: 'Tema oscuro', i: 'moon', c: 'darkMode', on: () => !!A().settings.dark },
      ] },
    ],
    Insertar: [
      { cap: 'Tablas', items: [
        { l: 'Tabla', i: 'table', grid: 1, t: 'Elige columnas y filas' },
      ] },
      { cap: 'Imágenes', items: [
        { l: 'Imagen', i: 'image', c: 'image', t: 'Desde el equipo (también puedes arrastrarla o pegarla)' },
        { l: 'Imagen de internet', i: 'globe', c: 'imageUrl', t: 'Desde una dirección web' },
      ] },
      { cap: 'Vínculos y notas', items: [
        { l: 'Vínculo', i: 'link', c: 'link', k: 'Ctrl+K', t: 'A una página web o a un título del documento' },
        { l: 'Comentario', i: 'comment', c: 'comment', k: 'Ctrl+Alt+M' },
        { l: 'Nota al pie', i: 'footnote', c: 'footnote', k: 'Ctrl+Alt+F' },
      ] },
      { cap: 'Páginas', gi: 'pageBreak', items: [{ stack: [
        { l: 'Salto de página', i: 'pageBreak', c: 'pageBreak', k: 'Ctrl+Intro' },
        { l: 'Línea horizontal', i: 'hr', c: 'hr' },
        { l: 'Índice', i: 'toc', c: 'insertToc', t: 'Tabla de contenido con los títulos y sus páginas' },
        { l: 'Marca de agua', i: 'watermark', c: 'watermark' },
      ] }] },
      { cap: 'Encabezado y pie', gi: 'header', pri: -1, items: [{ stack: [
        { l: 'Encabezado', i: 'header', c: 'headerFooter', a: 'hdr' },
        { l: 'Pie de página', i: 'footer', c: 'headerFooter', a: 'ftr' },
        { l: 'Números de página', i: 'pageNum', c: 'pageNumbers' },
      ] }] },
      { cap: 'Campos', gi: 'hash', pri: -2, items: [{ stack: [
        { l: 'Número de página', i: 'hash', c: 'field', a: 'page' },
        { l: 'Total de páginas', i: 'pageNum', c: 'field', a: 'pages' },
        { l: 'Fecha de hoy', i: 'calendar', c: 'field', a: 'date' },
        { l: 'Hora', i: 'clock', c: 'field', a: 'time' },
        { l: 'Título', i: 'file', c: 'field', a: 'title', t: 'Título del documento' },
        { l: 'Autor', i: 'user', c: 'field', a: 'author' },
        { l: 'Palabras', i: 'words', c: 'field', a: 'words', t: 'Recuento de palabras' },
      ] }] },
      { cap: 'Fichas inteligentes (@)', gi: 'at', pri: -3, items: [{ stack: [
        { l: 'Fecha', i: 'calendar', c: 'dateChip', t: 'Fecha con calendario' },
        { l: 'Casilla', i: 'checkbox', c: 'checkboxChip', t: 'Casilla de verificación' },
        { l: 'Estado', i: 'dropdown', c: 'dropdownChip', a: 'status', t: 'Desplegable de estado' },
        { l: 'Prioridad', i: 'dropdown', c: 'dropdownChip', a: 'priority', t: 'Desplegable de prioridad' },
        { l: 'Sí / No', i: 'dropdown', c: 'dropdownChip', a: 'yesno', t: 'Desplegable Sí / No' },
        { l: 'Personalizado…', i: 'dropdown', c: 'dropdownChip', a: 'custom', t: 'Desplegable con tus opciones' },
      ] }] },
      { cap: 'Bloques y variables', gi: 'blocks', items: [
        { l: 'Bloques', i: 'blocks', drop: () => PT.extras.blockMenu(), t: 'Notas de reunión, plan de clase, rúbrica, tareas, cuadros de aviso… y tus propios bloques' },
        { l: 'Variable', i: 'variable', drop: () => PT.extras.varMenu(), t: 'Un dato que se escribe una vez y se actualiza en todo el documento' },
      ] },
      { cap: 'Símbolos', items: [
        { l: 'Símbolo', i: 'symbol', c: 'symbol', t: 'Símbolos y caracteres especiales' },
        { l: 'Emoji', i: 'emoji', c: 'emoji', t: 'También escribiendo :palabra' },
        { l: 'Ecuación', i: 'equation', c: 'equation', t: 'Notación LaTeX' },
      ] },
      { cap: 'A mano', gi: 'pen', pri: -1, items: [
        { l: 'Dibujo', i: 'pen', c: 'drawing', t: 'Dibuja con el ratón, el dedo o un lápiz' },
        { l: 'Firma', i: 'sign', c: 'signature', t: 'Firma a mano y se inserta como imagen' },
      ] },
    ],
    Formato: [
      { cap: 'Portapapeles', items: [
        { l: 'Copiar formato', i: 'paint', c: 'formatPainter', on: () => !!A().painter, t: 'Copia el formato y aplícalo seleccionando otro texto' },
      ] },
      { cap: 'Fuente', gi: 'caseAa', launch: { l: 'Más opciones de fuente', c: 'fontDialog' }, items: [{ rows: [
        [
          { l: 'Fuente', drop: () => C().fontItems(), menuCls: 'font-menu', txt: () => (S().ff === null ? '—' : S().ff || 'Calibri'), w: 128 },
          { l: 'Tamaño de fuente', drop: () => C().sizeItems(true), menuCls: 'size-menu', txt: () => (S().fs === null ? '' : String(S().fs || 11).replace('.', PT.locale.dec)), w: 50 },
          { l: 'Aumentar tamaño', i: 'plus', c: 'fontStep', a: 1, k: 'Ctrl+]' },
          { l: 'Reducir tamaño', i: 'minus', c: 'fontStep', a: -1, k: 'Ctrl+[' },
        ],
        [
          { l: 'Negrita', i: 'bold', c: 'bold', k: 'Ctrl+B', on: () => !!S().b },
          { l: 'Cursiva', i: 'italic', c: 'italic', k: 'Ctrl+I', on: () => !!S().i },
          { l: 'Subrayado', i: 'underline', c: 'underline', k: 'Ctrl+U', on: () => !!S().u, split: () => C().underlineItems() },
          { l: 'Tachado', i: 'strike', c: 'strike', k: 'Alt+Mayús+5', on: () => !!S().s },
          { l: 'Superíndice', i: 'sup', c: 'sup', k: 'Ctrl+.', on: () => !!S().sup },
          { l: 'Subíndice', i: 'sub', c: 'sub', k: 'Ctrl+,', on: () => !!S().sub },
        ],
        [
          { l: 'Versalitas', i: 'smallCaps', c: 'smallCaps', on: () => !!S().sc },
          { l: 'Todo en mayúsculas', i: 'allCaps', c: 'allCaps', on: () => !!S().caps },
          { l: 'Color del texto', i: 'fontColor', pick: 'fc' },
          { l: 'Color de resaltado', i: 'highlight', pick: 'hl' },
          { l: 'Borrar formato', i: 'clearFmt', c: 'clearFormat', k: 'Ctrl+\\' },
        ],
      ] }] },
      { cap: 'Párrafo', gi: 'alignL', launch: { l: 'Sangrías, espaciado y saltos', c: 'paragraph' }, items: [{ rows: [
        [
          { l: 'Viñetas', i: 'listBullet', c: 'listBullet', k: 'Ctrl+Mayús+8', on: () => !!S().list && PT.isBulletKind(S().list) && S().list !== 'check', split: () => C().listItems(['bullet', 'dash', 'arrow', 'square', 'diamond', 'star']) },
          { l: 'Numeración', i: 'listNumber', c: 'listNumber', k: 'Ctrl+Mayús+7', on: () => !!S().list && !PT.isBulletKind(S().list), split: () => C().listItems(['decimal', 'paren', 'lalpha', 'ualpha', 'lroman', 'uroman', 'outline']).concat(['-', { label: 'Reiniciar numeración', action: () => A().run('listRestart') }, { label: 'Continuar numeración', action: () => A().run('listContinue') }, { label: 'Empezar en…', action: () => A().run('listStart') }]) },
          { l: 'Lista de verificación', i: 'listCheck', c: 'listCheck', k: 'Ctrl+Mayús+9', on: () => S().list === 'check' },
          { l: 'Disminuir sangría', i: 'indentLess', c: 'indentLess' },
          { l: 'Aumentar sangría', i: 'indentMore', c: 'indentMore', k: 'Ctrl+M' },
        ],
        [
          { l: 'Alinear a la izquierda', i: 'alignL', c: 'align', a: 'left', k: 'Ctrl+Mayús+L', on: () => (S().al || 'left') === 'left' },
          { l: 'Centrar', i: 'alignC', c: 'align', a: 'center', k: 'Ctrl+Mayús+E', on: () => S().al === 'center' },
          { l: 'Alinear a la derecha', i: 'alignR', c: 'align', a: 'right', k: 'Ctrl+Mayús+R', on: () => S().al === 'right' },
          { l: 'Justificar', i: 'alignJ', c: 'align', a: 'justify', k: 'Ctrl+Mayús+J', on: () => S().al === 'justify' },
          { l: 'Interlineado y espaciado', i: 'spacing', drop: () => C().spacingItems() },
        ],
        [
          { l: 'Letra capital', i: 'dropcap', c: 'dropCap', on: () => !!S().dc },
          { l: 'Bordes y sombreado', i: 'borders', c: 'borders' },
          { l: 'Reiniciar numeración', i: 'restart', c: 'listRestart' },
          { l: 'Empezar la numeración en…', i: 'startAt', c: 'listStart' },
          { l: 'Mostrar caracteres de formato', i: 'pilcrow', c: 'showMarks', on: () => !!A().settings.showMarks },
        ],
      ] }] },
      { cap: 'Estilos', gi: 'pilcrow', launch: { l: 'Modificar y crear estilos', c: 'styles' }, items: [{ gallery: 'styles' }] },
      { cap: 'Mayúsculas y minúsculas', gi: 'caseAa', pri: -2, items: [{ stack: [
        { l: 'Tipo oración', i: 'caseSentence', c: 'case', a: 'sentence', t: 'Primera letra de cada oración en mayúscula' },
        { l: 'minúsculas', i: 'caseLower', c: 'case', a: 'lower' },
        { l: 'MAYÚSCULAS', i: 'caseUpper', c: 'case', a: 'upper' },
        { l: 'Cada Palabra', i: 'caseTitle', c: 'case', a: 'title', t: 'Poner en mayúscula cada palabra' },
        { l: 'iNVERTIR', i: 'caseToggle', c: 'case', a: 'toggle', t: 'Cambia mayúsculas por minúsculas y al revés' },
      ] }] },
      { cap: 'Página', gi: 'pageColor', pri: -1, items: [{ stack: [
        { l: 'Color de página', i: 'pageColor', pick: 'page' },
        { l: 'Marca de agua', i: 'watermark', c: 'watermark' },
        { l: 'Números de línea', i: 'lineNum', drop: () => C().lineNumItems(), on: () => !!(D().page.lnNum && D().page.lnNum.on) },
        { l: 'Configurar página', i: 'pageSetup', c: 'pageSetup' },
      ] }] },
    ],
    Revisar: [
      { cap: 'Revisión', items: [
        { l: 'Ortografía e idioma', i: 'spell', c: 'spellLang', k: 'F7' },
        { l: 'Revisor de estilo', i: 'wand', c: 'styleCheck', on: () => C()._panel === 'style' && !C().els.side.hidden, t: 'Oraciones largas, voz pasiva, repeticiones, muletillas y gramática, sin conexión' },
        { l: 'Accesibilidad', i: 'a11y', c: 'a11y', on: () => C()._panel === 'a11y' && !C().els.side.hidden, t: 'Comprueba que el documento sea accesible y ayuda a arreglarlo' },
        { stack: [
          { l: 'Recuento de palabras', i: 'stats', c: 'wordCount', k: 'Ctrl+Mayús+C' },
          { l: 'Autoría del texto', i: 'author', c: 'authorship', t: 'Cuánto escribiste tú, cuánto se pegó y cuánto hizo la IA' },
          { l: 'Objetivo de palabras', i: 'goal', c: 'wordGoal' },
        ] },
      ] },
      { cap: 'Comentarios', pri: -1, items: [
        { l: 'Nuevo comentario', i: 'comment', c: 'comment', k: 'Ctrl+Alt+M' },
        { l: 'Ver comentarios', i: 'note', c: 'commentsPanel', on: () => panelOn('comments') },
      ] },
      { cap: 'Control de cambios', items: [
        { l: 'Control de cambios', i: 'track', c: 'track', on: () => !!D().track, t: 'Lo que escribas o borres queda marcado como sugerencia' },
        { l: 'Revisar cambios', i: 'outline', c: 'changesPanel', on: () => panelOn('changes') },
        { stack: [
          { l: 'Aceptar este cambio', i: 'accept', c: 'acceptSel' },
          { l: 'Rechazar este cambio', i: 'reject', c: 'rejectSel' },
          { l: 'Aceptar todos', i: 'acceptAll', c: 'acceptAll' },
          { l: 'Rechazar todos', i: 'reject', c: 'rejectAll' },
        ] },
      ] },
      { cap: 'Comparar', items: [
        { l: 'Comparar documentos', i: 'compare', c: 'compare', t: 'Con una versión guardada o con otro archivo: las diferencias aparecen como cambios' },
      ] },
    ],
    Herramientas: [
      { cap: 'Voz', items: [
        { l: 'Leer en voz alta', i: 'speak', c: 'readAloud', on: () => !!PT.tools.reading },
        { l: 'Dictado', i: 'mic', c: 'dictate', on: () => !!PT.tools.dictating, t: 'Escribe lo que dices' },
      ] },
      { cap: 'Escritura', items: [
        { l: 'Objetivo de palabras', i: 'goal', c: 'wordGoal', on: () => !!(D().meta.goal && D().meta.goal.words), t: 'Cuántas palabras quieres escribir y para cuándo' },
        { stack: [
          { l: 'Máquina de escribir', i: 'typewriter', c: 'typewriter', on: () => !!A().settings.typewriter },
          { l: 'Atenuar el resto', i: 'dim', c: 'dimOthers', on: () => !!A().settings.dimOthers },
        ] },
      ] },
      { cap: 'Datos', items: [
        { l: 'Variables', i: 'variable', c: 'variables', on: () => panelOn('vars'), t: 'Datos que se escriben una vez y se repiten en el documento' },
        { l: 'Combinar correspondencia', i: 'merge2', c: 'mailMerge', t: 'Una copia por cada fila de una hoja de cálculo o un CSV' },
      ] },
      { cap: 'Bloques', pri: -1, items: [
        { l: 'Guardar bloque', i: 'plus', c: 'saveBlock', t: 'Guarda la selección para reutilizarla' },
        { l: 'Mis bloques', i: 'blocks', c: 'myBlocks' },
      ] },
      { cap: 'Opciones', items: [
        { l: 'Paleta de comandos', i: 'command', c: 'palette', k: 'Ctrl+Mayús+P' },
        { stack: [
          { l: 'Autocorrección', i: 'wand', fn: () => PT.dlg.settings(1), t: 'Autocorrección y formato automático' },
          { l: 'Preferencias', i: 'gear', c: 'settings' },
        ] },
      ] },
    ],
    Tabla: [
      { cap: 'Tabla', items: [
        { l: 'Insertar tabla', i: 'table', grid: 1, t: 'Elige columnas y filas' },
        { l: 'Propiedades', i: 'gear', c: 'tableProps', dis: noTable, t: 'Ancho, bordes, alineación y fila de encabezado' },
      ] },
      { cap: 'Filas y columnas', gi: 'rowBelow', items: [{ stack: [
        { l: 'Fila encima', i: 'rowAbove', c: 'tableRowAbove', dis: noTable },
        { l: 'Fila debajo', i: 'rowBelow', c: 'tableRowBelow', dis: noTable },
        { l: 'Eliminar fila', i: 'rowDel', c: 'tableDelRow', dis: noTable },
        { l: 'Columna a la izquierda', i: 'colLeft', c: 'tableColLeft', dis: noTable },
        { l: 'Columna a la derecha', i: 'colRight', c: 'tableColRight', dis: noTable },
        { l: 'Eliminar columna', i: 'colDel', c: 'tableDelCol', dis: noTable },
      ] }] },
      { cap: 'Combinar', items: [
        { l: 'Combinar celdas', i: 'merge', c: 'tableMerge', dis: noTable, t: 'Selecciona varias celdas antes' },
        { l: 'Dividir celdas', i: 'split', c: 'tableSplit', dis: noTable, t: 'Separa una celda combinada' },
      ] },
      { cap: 'Diseño', gi: 'headerRow', pri: -1, items: [{ stack: [
        { l: 'Fila de encabezado', i: 'headerRow', c: 'tableHeader', dis: noTable, on: headerRow, t: 'Se repite en cada página' },
        { l: 'Distribuir columnas', i: 'distribute', c: 'tableDistribute', dis: noTable, t: 'Todas las columnas del mismo ancho' },
        { l: 'Ordenar de A a Z', i: 'sortAsc', c: 'tableSort', a: false, dis: noTable, t: 'Según la columna actual' },
        { l: 'Ordenar de Z a A', i: 'sortDesc', c: 'tableSort', a: true, dis: noTable, t: 'Según la columna actual' },
        { l: 'Con bordes', i: 'borders', c: 'tableBorders', a: true, dis: noTable },
        { l: 'Sin bordes', i: 'noBorders', c: 'tableBorders', a: false, dis: noTable },
      ] }] },
      { cap: 'Celdas', gi: 'cellColor', pri: -1, items: [{ stack: [
        { l: 'Color de celda', i: 'cellColor', pick: 'cell', dis: noTable },
        { l: 'Alinear arriba', i: 'valignT', c: 'cellAlign', a: 'top', dis: noTable },
        { l: 'Alinear en medio', i: 'valignM', c: 'cellAlign', a: 'middle', dis: noTable },
        { l: 'Alinear abajo', i: 'valignB', c: 'cellAlign', a: 'bottom', dis: noTable },
      ] }] },
      { cap: 'Eliminar', items: [
        { l: 'Eliminar tabla', i: 'trash', c: 'tableDelete', dis: noTable },
      ] },
    ],
    IA: [
      { cap: 'Asistente', items: [
        { l: 'Abrir el asistente', i: 'sparkle', c: 'ai', on: () => panelOn('ai'), t: 'Pide lo que quieras o usa una acción rápida' },
      ] },
      { cap: 'Reescribir', items: [{ stack: aiItems(['improve', 'fix', 'shorter', 'longer', 'formal', 'friendly', 'simple', 'translate']) }] },
      { cap: 'Crear a partir del texto', items: [{ stack: aiItems(['summary', 'bullets', 'outline', 'questions', 'titles', 'continue']) }] },
      { cap: 'Configuración', items: [
        { l: 'Configurar', i: 'gear', c: 'aiConfig', t: 'Claude con tu clave o un modelo local de Ollama' },
      ] },
    ],
    Ayuda: [
      { cap: 'Ayuda', items: [
        { l: 'Guía rápida', i: 'help', c: 'guide' },
        { l: 'Atajos de teclado', i: 'keyboard', c: 'shortcuts' },
        { l: 'Acerca de', i: 'info', c: 'about' },
      ] },
    ],
  });

  PT.ribbon = {
    current: 'Inicio', live: [], rendered: null,
    get el() { return C().els.ribbon; },

    // muestra los botones de un menú; «Inicio» vuelve a la barra de formato
    show(name) {
      const E = C().els, tabs = TABS();
      if (!tabs[name]) name = 'Inicio';
      this.current = name;
      // todas las pestañas, también «Inicio», son cintas (la antigua barra de formato queda oculta)
      E.toolbar.hidden = true;
      E.ribbon.hidden = false;
      for (const b of E.menubar.querySelectorAll('[data-tab]')) b.classList.toggle('tab-on', b.dataset.tab === name);
      this.bindOnce();
      if (name === 'Archivo' && PT.files.refreshRecent) PT.files.refreshRecent();
      if (this.rendered !== name) this.render(tabs[name]); else this.update();
    },
    bindOnce() {
      if (this._bound) return;
      this._bound = true;
      const el = this.el;
      // la rueda del ratón desplaza la cinta en horizontal cuando no cabe
      el.addEventListener('wheel', (e) => {
        if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });
      // al cambiar el ancho disponible se vuelve a repartir el espacio (se vigila la propia cinta)
      let lastW = el.clientWidth;
      const refit = PT.debounce(() => {
        if (el.hidden || Math.abs(el.clientWidth - lastW) < 2) return;
        lastW = el.clientWidth;
        this.render(TABS()[this.current]);
      }, 150);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(el);
      else window.addEventListener('resize', refit);
    },
    render(groups) {
      const el = this.el;
      this.live = [];
      this.rendered = this.current; this.gen = A().styleGen; this.doc = D();
      this.groups = groups;
      el.replaceChildren(...groups.map((g) => (g.el = this.group(g))));
      el.setAttribute('aria-label', 'Botones del menú ' + this.current);
      el.classList.toggle('rb-edit', EDITING.includes(this.current));
      this.fit();
      el.scrollLeft = 0;
      this.update();
    },
    // si la cinta no cabe, pliega grupos (menor prioridad primero y, a igualdad, el de más a la derecha);
    // en pantallas estrechas se desplaza con el dedo y no se pliega nada
    fit() {
      const el = this.el;
      if (window.matchMedia('(max-width: 720px)').matches) return;
      const fits = () => el.scrollWidth <= el.clientWidth + 1;
      const order = this.groups.map((g, i) => ({ g, i })).sort((x, y) => (x.g.pri || 0) - (y.g.pri || 0) || y.i - x.i);
      const folded = [];
      for (const { g } of order) {
        if (fits()) break;
        if (g.el.offsetWidth > 96) { this.fold(g); folded.push(g); }
      }
      // al plegar un grupo grande puede que los plegados antes vuelvan a caber
      for (let k = folded.length - 2; k >= 0; k--) { this.unfold(folded[k]); if (!fits()) this.fold(folded[k]); }
    },
    unfold(g) {
      g.el.replaceWith(g.full);
      g.el = g.full;
      this.live.push(...g.lost);
    },
    fold(g) {
      const ui = PT.ui, h = ui.h, old = g.el;
      g.full = old;
      g.lost = this.live.filter((x) => old.contains(x.el));
      this.live = this.live.filter((x) => !old.contains(x.el));
      const b = h('button.rb-btn.rb-l.rb-folded', { type: 'button', title: g.cap + ': todas sus opciones', 'aria-label': g.cap, 'aria-haspopup': 'true' },
        ui.icon(g.gi || this.firstIcon(g), 24), h('span.rb-lbl', g.cap), h('span.rb-caret', ui.icon('down', 9)));
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        const a = A();
        if (a.editor) a.editor.readSel();
        C().computeState();
        stamp++;
        ui.menu(this.menuOf(g, b), b, g.items.some((e) => e.gallery) ? { cls: 'style-menu' } : undefined);
      });
      g.el = h('div.rb-group.rb-group-folded', { role: 'group', 'aria-label': g.cap }, h('div.rb-body', b), h('div.rb-cap', h('span', ' ')));
      old.replaceWith(g.el);
    },
    firstIcon(g) {
      for (const e of g.items) {
        const list = e.stack || (e.rows ? [].concat(...e.rows) : [e]);
        const it = list.find((x) => x.i);
        if (it) return it.i;
      }
      return 'more';
    },
    // las opciones de un grupo plegado, como menú
    menuOf(g, at) {
      const out = [];
      for (const e of g.items) {
        if (e.stack) e.stack.forEach((it) => out.push(this.menuItem(it, at)));
        else if (e.rows) e.rows.forEach((row, k) => { if (k) out.push('-'); row.forEach((it) => out.push(this.menuItem(it, at))); });
        else if (e.gallery) out.push(...C().styleMenuItems());
        else out.push(this.menuItem(e, at));
      }
      if (g.launch) out.push('-', { label: g.launch.l + '…', icon: 'launch', action: () => A().run(g.launch.c) });
      return out;
    },
    menuItem(it, at) {
      const later = (f) => () => setTimeout(f, 0);
      const m = { label: it.txt ? it.l + ': ' + it.txt() : it.l, icon: it.i, key: it.k, hint: it.t, checked: it.on ? !!it.on() : false, disabled: it.dis ? !!it.dis() : false };
      if (it.drop) m.sub = () => it.drop();
      else if (it.split) m.sub = () => [{ label: it.l, icon: it.i, key: it.k, action: () => this.exec(it) }, '-'].concat(it.split());
      else if (it.grid) m.action = later(() => PT.ui.popup(C().tableGrid(), at));
      else if (it.pick) m.action = later(() => this.picker(it.pick, at));
      else m.action = () => this.exec(it);
      return m;
    },
    group(g) {
      const ui = PT.ui, h = ui.h;
      const body = h('div.rb-body');
      for (const e of g.items) {
        if (e.stack) body.appendChild(h('div.rb-stack', e.stack.map((it) => this.button(it, 's'))));
        else if (e.rows) body.appendChild(h('div.rb-rows', e.rows.map((row) => h('div.rb-row', row.map((it) => this.button(it, 'i'))))));
        else if (e.gallery) body.appendChild(this.gallery(e.short));
        else body.appendChild(this.button(e, 'l'));
      }
      const cap = h('div.rb-cap', h('span', g.cap));
      if (g.launch) {
        const lb = h('button.rb-launch', { type: 'button', title: g.launch.l, 'aria-label': g.launch.l }, ui.icon('launch', 11));
        this.bind(lb, g.launch, true);
        cap.appendChild(lb);
      }
      return h('div.rb-group', { role: 'group', 'aria-label': g.cap }, body, cap);
    },
    tip(it) { return it.l + (it.k ? ' (' + it.k + ')' : '') + (it.t ? '. ' + it.t : ''); },
    // kind: 'l' grande con texto, 's' pequeño con texto, 'i' solo icono
    button(it, kind) {
      const ui = PT.ui, h = ui.h;
      if (kind === 'l' && it.split) {
        // botón grande dividido (como «Pegar» en Word): arriba la acción, abajo sus opciones
        const main = h('button.rb-btn.rb-bs-main', { type: 'button', title: this.tip(it), 'aria-label': it.l }, ui.icon(it.i, 24));
        const arrow = h('button.rb-btn.rb-bs-arrow', { type: 'button', title: it.l + ': más opciones', 'aria-label': it.l + ': más opciones', 'aria-haspopup': 'true' }, h('span.rb-lbl', it.l), h('span.rb-caret', ui.icon('down', 9)));
        this.bind(main, it, false);
        this.bind(arrow, it, true);
        this.track(main, it);
        return h('span.rb-bigsplit', main, arrow);
      }
      if (kind === 'i' && (it.split || it.pick)) {
        // botón dividido: la parte principal aplica y la flecha abre las opciones
        const main = h('button.rb-btn.rb-i.rb-split-main', { type: 'button', title: this.tip(it), 'aria-label': it.l }, ui.icon(it.i, 16));
        const arrow = h('button.rb-btn.rb-split-arrow', { type: 'button', title: it.l + ': más opciones', 'aria-label': it.l + ': más opciones', 'aria-haspopup': 'true' }, ui.icon('down', 9));
        this.bind(main, it, false);
        this.bind(arrow, it, true);
        this.track(main, it);
        return h('span.rb-split', main, arrow);
      }
      const opens = !!(it.drop || it.grid || it.pick);
      let b;
      if (it.txt && kind === 'i') { // lista con su valor a la vista (fuente, tamaño)
        b = h('button.rb-btn.rb-field', { type: 'button', title: this.tip(it), 'aria-label': it.l, 'aria-haspopup': 'true', style: { width: it.w + 'px' } }, h('span.rb-val'), ui.icon('down', 9));
      } else {
        b = h('button.rb-btn.rb-' + kind, { type: 'button', title: this.tip(it), 'aria-label': it.l, 'aria-haspopup': opens ? 'true' : null },
          ui.icon(it.i || 'more', kind === 'l' ? 24 : 16),
          kind === 'i' ? null : h('span.rb-lbl', it.l),
          opens ? h('span.rb-caret', ui.icon('down', 9)) : null);
      }
      this.bind(b, it, true);
      this.track(b, it);
      return b;
    },
    track(b, it) {
      if (it.on) b.setAttribute('aria-pressed', 'false');
      if (it.on || it.dis || it.txt || it.pick) this.live.push({ el: b, it });
    },
    bind(b, it, opens) {
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => this.activate(it, b, opens));
    },
    activate(it, b, opens) {
      const a = A(), ui = PT.ui;
      if (a.editor) a.editor.readSel();
      C().computeState();
      const at = b.parentNode && (b.parentNode.classList.contains('rb-split') || b.parentNode.classList.contains('rb-bigsplit')) ? b.parentNode : b;
      if (opens && it.split) { ui.menu(it.split(), at); return; }
      if (opens && it.drop) { ui.menu(it.drop(), at, it.menuCls ? { cls: it.menuCls } : undefined); return; }
      if (opens && it.grid) { ui.popup(C().tableGrid(), at); return; }
      if (opens && it.pick) { this.picker(it.pick, at); return; }
      this.exec(it);
    },
    exec(it) {
      const a = A();
      if (it.pick === 'fc') a.run('fontColor', lastFc());
      else if (it.pick === 'hl') a.run('highlight', lastHl());
      else if (it.fn) it.fn();
      else if (it.c) a.run(it.c, it.a);
      // los botones de estado reflejan el cambio enseguida
      setTimeout(() => { C().updateSwatches(); this.update(); }, 0);
    },
    picker(kind, at) {
      const a = A(), st = S();
      const after = () => { C().updateSwatches(); this.update(); };
      const conf = {
        fc: { value: st.fc, autoLabel: 'Automático', onPick: (c) => { a.run('fontColor', c); after(); } },
        hl: { value: st.hl, autoLabel: 'Sin resaltado', palette: 'highlight', onPick: (c) => { a.run('highlight', c); after(); } },
        cell: { value: lastCell, autoLabel: 'Sin color', onPick: (c) => { if (c) lastCell = c; a.run('cellColor', c); after(); } },
        page: { value: a.doc.page.color, autoLabel: 'Sin color (blanco)', onPick: (c) => { a.run('pageColor', c); after(); } },
        pshade: { value: st.para && st.para.bg, autoLabel: 'Sin sombreado', onPick: (c) => { a.run('paraShade', c); after(); } },
      }[kind];
      PT.ui.colorPicker(at, conf);
    },
    // short: versión de dos columnas para Inicio (los títulos más usados y «Más estilos»)
    gallery(short) {
      const h = PT.ui.h, doc = D(), box = h('div.rb-gallery');
      for (const id of short ? ['normal', 'title', 'h1', 'h2', 'h3'] : GALLERY) {
        if (!doc.styles[id]) continue;
        const s = doc.style(id), css = PT.view.runCss(s.r);
        const key = id === 'normal' ? 'Ctrl+Alt+0' : /^h[1-6]$/.test(id) ? 'Ctrl+Alt+' + id[1] : '';
        const it = { l: 'Estilo «' + s.name + '»', k: key, c: 'style', a: id, on: () => (S().st || 'normal') === id };
        const name = h('span.rb-style-name', { style: { fontFamily: css['font-family'] || '', fontWeight: css['font-weight'] || '', fontStyle: css['font-style'] || '', color: css.color || '' } }, s.name);
        const b = h('button.rb-btn.rb-style', { type: 'button', title: this.tip(it), 'aria-label': it.l }, name);
        this.bind(b, it, false);
        this.track(b, it);
        box.appendChild(b);
      }
      box.appendChild(this.button({ l: 'Más estilos', i: 'more', drop: () => C().styleMenuItems(), menuCls: 'style-menu', t: 'Todos los estilos, actualizar con la selección y modificar' }, 's'));
      return box;
    },
    // estado activo, desactivado, valores y colores de los botones visibles
    update() {
      const el = this.el;
      if (!el || el.hidden) return;
      if (this.rendered !== this.current || this.gen !== A().styleGen || this.doc !== D()) { this.render(TABS()[this.current]); return; }
      stamp++;
      for (const { el: b, it } of this.live) {
        try {
          if (it.on) { const on = !!it.on(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
          if (it.dis) {
            const dis = !!it.dis();
            b.disabled = dis;
            if (b.parentNode.classList.contains('rb-split')) b.parentNode.lastChild.disabled = dis;
          }
          if (it.txt) { const v = b.querySelector('.rb-val') || b.querySelector('.rb-lbl'); if (v) v.textContent = it.txt(); }
          if (it.pick) {
            const sw = b.querySelector('.swatch');
            const c = it.pick === 'fc' ? lastFc() || 'currentColor' : it.pick === 'hl' ? lastHl() || 'transparent' : it.pick === 'cell' ? lastCell : null;
            if (sw && c) sw.setAttribute('fill', c);
          }
        } catch (e) { /* estado no disponible todavía */ }
      }
    },
  };
})();
