/* Complemento exclusivo de la WebView. Cargar después de js/io/files.js. */
(function () {
  'use strict';
  const { app, chrome, ui } = window.PT;
  const compact = matchMedia('(max-width: 900px), (max-height: 540px)');
  PT.dlg.about = function () {
    ui.dialog({ title: 'Acerca del procesador de texto',
      body: [ui.h('p', 'Procesador de texto ' + (document.querySelector('meta[name="android-version"]')?.content || PT.VERSION) + ' para Android'),
        ui.h('p', 'Los documentos se guardan en este dispositivo. Puedes exportar una copia desde Archivo.'),
        ui.h('p', 'El asistente de IA envía la solicitud y el contenido que elijas al proveedor configurado. El dictado usa el servicio de voz del dispositivo.')],
      buttons: [{ label: 'Cerrar', primary: true }] });
  };

  // El esquema se abre desde Ver. Un teléfono empieza con el documento a la vista.
  const buildChrome = chrome.build;
  chrome.build = function () {
    if (compact.matches) app.settings.outline = false;
    buildChrome.call(this);
    const { workspace, canvas, menubar, outline } = this.els;
    installRibbonSwitch(menubar);
    installPinch(workspace, canvas);
    // Los botones de zoom manual deben conservar el nivel al abrir/cerrar el teclado.
    this.els.status.addEventListener('click', (ev) => {
      if (ev.target.closest('#zoom .tb-btn')) app.settings.zoomFit = false;
    }, true);
    outline.addEventListener('click', (ev) => {
      if (compact.matches && app.settings.outline && ev.target.closest('.ol-item')) app.run('outline');
    });
  };

  function installRibbonSwitch(menubar) {
    const button = ui.h('button#mobile-ribbon-toggle', {
      type: 'button', 'aria-controls': 'ribbon'
    }, 'Cinta');
    document.getElementById('titlebar').appendChild(button);
    const fold = (value) => {
      ui.closePopups();
      chrome.ribbonTabsOnly = !value;
      for (const tab of menubar.querySelectorAll('[data-tab]:not([data-tab="Inicio"])')) {
        tab.setAttribute('aria-haspopup', String(value));
      }
      document.body.classList.toggle('mobile-ribbon-folded', value);
      button.setAttribute('aria-expanded', String(!value));
      button.setAttribute('aria-label', value ? 'Mostrar cinta de herramientas' : 'Plegar cinta de herramientas');
    };
    fold(true);
    button.addEventListener('click', () => fold(button.getAttribute('aria-expanded') === 'true'));
    menubar.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-tab="Inicio"]')) fold(false);
    });
  }

  // Una pulsación prolongada conserva los tiradores y el menú de selección de Android.
  // Las acciones de contexto sobre objetos siguen disponibles en el menú del editor.
  let lastPointer = '';
  document.addEventListener('pointerdown', (ev) => { lastPointer = ev.pointerType; }, true);
  document.addEventListener('contextmenu', (ev) => {
    if (lastPointer === 'touch' && ev.target.closest('[contenteditable="true"]') &&
        !ev.target.closest('.pt-obj, .pt-atomblock')) ev.stopPropagation();
  }, true);

  function installPinch(workspace, canvas) {
    let gesture = null;
    let next = null;
    let frame = 0;
    const geometry = (a, b) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    });
    const render = () => {
      frame = 0;
      if (!gesture || !next) return;
      const point = next;
      next = null;
      const z = Math.max(0.25, Math.min(3, Math.round(100 * gesture.zoom * point.distance / gesture.startDistance) / 100));
      if (z !== app.zoom) app.setZoom(z, true);
      const rect = canvas.getBoundingClientRect();
      workspace.scrollLeft += rect.left + gesture.docX * app.zoom - point.x;
      workspace.scrollTop += rect.top + gesture.docY * app.zoom - point.y;
    };
    const finish = () => {
      if (frame) { cancelAnimationFrame(frame); render(); }
      gesture = null;
      next = null;
    };
    workspace.addEventListener('touchstart', (ev) => {
      if (ev.touches.length !== 2 || !app.doc) { finish(); return; }
      if (!Array.from(ev.touches).every(touch => workspace.contains(touch.target))) return;
      const point = geometry(ev.touches[0], ev.touches[1]);
      if (point.distance < 2) return;
      const rect = canvas.getBoundingClientRect();
      gesture = {
        zoom: app.zoom, startDistance: point.distance,
        docX: (point.x - rect.left) / app.zoom,
        docY: (point.y - rect.top) / app.zoom
      };
      app.settings.zoomFit = false;
      if (ev.cancelable) ev.preventDefault();
    }, { passive: false });
    workspace.addEventListener('touchmove', (ev) => {
      if (!gesture || ev.touches.length !== 2) return;
      if (ev.cancelable) ev.preventDefault();
      next = geometry(ev.touches[0], ev.touches[1]);
      if (!frame) frame = requestAnimationFrame(render);
    }, { passive: false });
    workspace.addEventListener('touchend', finish, { passive: true });
    workspace.addEventListener('touchcancel', finish, { passive: true });
  }
})();
