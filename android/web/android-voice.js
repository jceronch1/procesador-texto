/* Las órdenes de voz se ejecutan únicamente al elegirlas en la interfaz. */
(function () {
  'use strict';
  const PT = window.PT, bridge = window.AndroidVoice;
  if (!bridge) return;
  let sequence = 0, reading = null, dictation = null;

  function* fragments(doc, selection) {
    const [from, selectedEnd] = PT.ops.ordered(doc, selection);
    const end = PT.ops.same(from, selectedEnd) ? doc.endPos('body') : selectedEnd;
    for (const part of PT.ops.parasIn(doc, from, end)) {
      let text = PT.runs.text(PT.runs.slice(part.p.runs, part.from, part.to)).replace(/\uFFFC/g, ' ').trim();
      while (text.length > 1900) {
        const space = text.lastIndexOf(' ', 1900);
        const cut = space > 0 ? space : 1900;
        yield text.slice(0, cut);
        text = text.slice(cut).trimStart();
      }
      if (text) yield text;
    }
  }
  function next() {
    if (!reading) return;
    const item = reading.chunks.next();
    if (item.done || PT.app.doc !== reading.doc) { PT.tools.stopReading(); return; }
    reading.id = String(++sequence);
    bridge.speak(reading.id, item.value, reading.doc.meta.lang || 'es-ES', PT.app.settings.speechRate || 1);
  }
  PT.tools.stopReading = function () {
    reading = null;
    this.reading = false;
    bridge.stop();
    PT.chrome.updateAll();
  };
  PT.tools.readAloud = function () {
    if (reading) { this.stopReading(); return; }
    const app = PT.app;
    reading = { doc: app.doc, chunks: fragments(app.doc, app.bodyEditor.sel || PT.ops.caret(app.doc.startPos('body'))) };
    this.reading = true;
    next();
    PT.chrome.updateAll();
  };
  PT.tools.dictate = function () {
    const app = PT.app;
    if (dictation || app.readOnly || !app.editor) return;
    if (reading) this.stopReading();
    dictation = { id: String(++sequence), doc: app.doc, editor: app.editor, selection: PT.clone(app.editor.sel) };
    this.dictating = true;
    bridge.dictate(dictation.id, app.doc.meta.lang || 'es-ES');
  };
  PT.androidVoice = {
    result(event, id, value) {
      if (reading && reading.id === id) {
        if (event === 'speech-done') next();
        else if (event === 'speech-error') { PT.tools.stopReading(); PT.ui.toast(value); }
        return;
      }
      if (!dictation || dictation.id !== id) return;
      const target = dictation;
      dictation = null;
      PT.tools.dictating = false;
      if (event === 'dictation-error') PT.ui.toast(value);
      else if (value && target.doc === PT.app.doc && PT.app.editor === target.editor && !PT.app.readOnly) {
        const ed = target.editor;
        if (target.selection) ed.sel = target.selection;
        PT.app.focusEditor();
        const before = ed.sel ? target.doc.paraText(ed.sel.h.id).slice(0, ed.sel.h.off) : '';
        const prefix = before && !/\s$/.test(before) && !/^[.,;:!?]/.test(value) ? ' ' : '';
        ed.pasteData({text: prefix + value}, true);
      }
      PT.chrome.updateAll();
    }
  };
})();
