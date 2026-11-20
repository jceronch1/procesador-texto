/* Adaptador de la app instalada. Se carga después de los módulos del editor. */
(function () {
  'use strict';
  const PT = window.PT;
  const bridge = window.AndroidText;
  if (!PT || !bridge) return;

  const chunkSize = 192 * 1024;
  let pendingExport = null;
  let closing = false;

  async function save(blob, name) {
    if (pendingExport || !bridge.beginExport()) {
      throw new Error('No se pudo iniciar la exportación. Si hay otra en curso, espera a que termine.');
    }
    let complete;
    const result = new Promise((resolve) => { complete = resolve; });
    pendingExport = complete;
    try {
      for (let start = 0; start < blob.size; start += chunkSize) {
        const url = await PT.ui.readDataURL(blob.slice(start, start + chunkSize));
        if (!bridge.appendExport(url.slice(url.indexOf(',') + 1))) {
          throw new Error('No se pudo preparar la copia del documento.');
        }
      }
      if (!bridge.finishExport(name)) throw new Error('No se pudo abrir el selector de destino.');
    } catch (error) {
      pendingExport = null;
      bridge.abortExport();
      throw error;
    }
    const status = await result;
    if (status === 'saved') return true;
    if (status === 'cancel') return false;
    throw new Error('Android no pudo escribir el archivo en el destino elegido.');
  }

  function exportResult(status) {
    if (pendingExport) {
      const complete = pendingExport;
      pendingExport = null;
      complete(status);
    } else if (status === 'saved') {
      PT.ui.toast('Archivo guardado.');
    } else if (status !== 'cancel') {
      PT.ui.toast('No se pudo guardar el archivo en el destino elegido.');
    }
  }

  function copySelection(cut) {
    const app = PT.app;
    const editor = app.editor;
    if (!editor || (cut && app.readOnly)) return;
    const slice = editor.selectionSlice();
    if (!slice) return;
    const text = PT.convert.sliceToText(app.doc, slice);
    if (bridge.copyText(text) === false) {
      PT.ui.toast('No se pudo copiar el texto.');
      return;
    }
    app.clip = { doc: app.doc, slice, text };
    if (cut) editor.deleteSelection();
  }

  function pasteSelection(plain) {
    const app = PT.app;
    const editor = app.editor;
    if (!editor || app.readOnly) return;
    const text = bridge.pasteText();
    if (text == null) return;
    editor.readSel();
    if (!plain && app.clip && app.clip.doc === app.doc && app.clip.text === text) {
      editor.exec('Pegar', () => PT.ops.insertSlice(app.doc, editor.sel, app.clip.slice));
    } else {
      editor.pasteData({ text }, true);
    }
  }

  async function saveAndClose() {
    try {
      if (await PT.app.saveNow()) {
        bridge.closeEditor();
      } else if (await PT.ui.confirm('El documento no pudo guardarse en este dispositivo. ¿Quieres salir de todos modos?', { title: 'Cerrar documento', ok: 'Salir sin guardar' })) {
        bridge.closeEditor();
      }
    } finally {
      closing = false;
    }
  }

  function back() {
    const app = PT.app;
    if (PT.ui.popupOpen()) { PT.ui.closePopups(); return true; }
    const dialogs = document.querySelectorAll('.dlg-back .dlg-x');
    if (dialogs.length) { dialogs[dialogs.length - 1].click(); return true; }
    if (document.querySelector('.pal-back, .pres')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
    if (PT.chrome.els.side && !PT.chrome.els.side.hidden) {
      PT.chrome.closePanel();
      return true;
    }
    if (app.activeHost) { app.editStory(null); return true; }
    if (!app.doc) return false;
    if (!closing && !pendingExport) {
      closing = true;
      saveAndClose().catch(() => PT.ui.toast('No se pudo cerrar el documento.'));
    }
    return true;
  }

  PT.android = { save, exportResult, copySelection, pasteSelection, back };
})();
