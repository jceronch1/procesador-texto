/* Estilos del documento (páginas, párrafos, listas, tablas, objetos, notas, índice). Se usan en pantalla,
   al imprimir o guardar como PDF y al copiar; los estilos con nombre se generan aparte (PT.view.styleSheet). */
(function () {
  'use strict';
  const PT = window.PT;
  const CHECK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2.3 2.3L9.6 3.6' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
  PT.DOC_CSS = `
.pt-canvas{position:relative;transform-origin:0 0;color:#000}
.pt-pages{position:absolute;left:0;top:0;width:100%;height:100%}
.pt-sheet{position:absolute;left:0;background:var(--page-color,#fff);box-shadow:0 1px 3px rgba(60,64,67,.28),0 2px 10px rgba(60,64,67,.12);overflow:hidden}
.pt-hdr,.pt-ftr{position:absolute;overflow:hidden;color:#000;opacity:.72}
.pt-ftr{display:flex;flex-direction:column;justify-content:flex-end}
.pt-hdr.pt-editing,.pt-ftr.pt-editing{opacity:1;overflow:visible;z-index:3;outline:1px dashed #1a73e8;outline-offset:4px;background:rgba(255,255,255,.75);cursor:text}
.pt-canvas.editing-hf .pt-flow{opacity:.42}
.pt-wm{position:absolute;left:50%;top:50%;white-space:nowrap;font:700 72px Calibri,Carlito,Arial,sans-serif;letter-spacing:.06em;pointer-events:none;user-select:none;opacity:.55}
.pt-flow,.pt-hdr,.pt-ftr,.pt-note-body,.pt-notes-measure{white-space:pre-wrap;overflow-wrap:break-word;font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.38;tab-size:35.4pt;-moz-tab-size:35.4pt;font-kerning:normal;text-rendering:optimizeLegibility}
.pt-flow{position:absolute;z-index:1;outline:none;caret-color:#000}
.pt-flow:focus{outline:none}
:where(.pt-p){margin:0;font-weight:400;font-size:inherit;font-style:normal;min-height:1px}
.pt-p{position:relative}
.pt-li::before{content:attr(data-marker);display:inline-block;box-sizing:border-box;min-width:var(--hang,18pt);padding-right:3pt;text-indent:0;white-space:pre;font-style:normal;font-weight:var(--mk-weight,inherit);font-size:var(--mk-size,inherit);color:var(--mk-color,inherit);text-decoration:none;vertical-align:baseline}
.pt-check::before{content:'';min-width:0;width:11pt;height:11pt;padding:0;margin-right:calc(var(--hang,18pt) - 11pt);border:1.25pt solid #5f6368;border-radius:2.5pt;vertical-align:-1.6pt;cursor:pointer;background:#fff}
.pt-checked::before{background:#1a73e8 url("${CHECK}") center/9pt no-repeat;border-color:#1a73e8}
.pt-checked{color:#80868b;text-decoration:line-through}
.pt-dc::first-letter{float:left;font-size:3.05em;line-height:.86;padding:.05em .07em 0 0}
.pt-table{border-collapse:collapse;table-layout:fixed;empty-cells:show;margin:0}
.pt-table td{padding:0 5.4pt;vertical-align:top;overflow-wrap:anywhere;min-width:6pt}
.pt-noborder>tbody>tr>td{outline:1px dashed rgba(0,0,0,.16);outline-offset:-1px}
tr.pt-gap:not(.pt-hclone)>td{border:none!important;padding:0!important;background:transparent!important;outline:none!important}
tr.pt-hclone{pointer-events:none}
.pt-gap{pointer-events:none;user-select:none}
div.pt-gap{display:block}
span.pt-gap-in{display:inline-block;width:100%;vertical-align:top;line-height:0;font-size:0}
.pt-obj{white-space:normal;text-indent:0}
.pt-img{display:inline-block;line-height:0;vertical-align:baseline}
.pt-img img{display:block;max-width:none;user-select:none}
.pt-wrap-left{float:left;margin:2pt 9pt 4pt 0}
.pt-wrap-right{float:right;margin:2pt 0 4pt 9pt}
.pt-fnref{font-size:.65em;vertical-align:super;line-height:0;padding:0 1px;cursor:pointer}
.pt-fld{background:rgba(0,0,0,.07);border-radius:2px}
.pt-fld[data-f="var"]{background:rgba(66,133,244,.13);border-radius:3px;cursor:pointer}
.pt-lnums{position:absolute;left:0;top:0;width:0;height:100%;pointer-events:none;user-select:none}
.pt-lnums>span{position:absolute;left:0;text-align:right;font:9pt/14px Calibri,Carlito,Arial,sans-serif;color:#7d7d7d}
.pt-chip{display:inline-block;padding:0 .5em;border-radius:1em;background:#e8eaed;color:#202124;font-size:.92em;line-height:1.4;cursor:pointer;white-space:nowrap;vertical-align:baseline;font-style:normal}
.pt-chip:hover{filter:brightness(.95)}
.pt-chip.colored{background:var(--chip)}
.pt-chip-date::before{content:'';display:inline-block;width:.75em;height:.75em;margin-right:.3em;border:1.5px solid currentColor;border-top-width:3px;border-radius:2px;vertical-align:-.05em;opacity:.7}
.pt-chip-cb{background:none;padding:0 .1em;font-size:1.15em;line-height:1}
.pt-chip-cb.on{color:#1a73e8}
.pt-eq{display:inline-block;padding:0 2px;cursor:pointer;line-height:1.2}
.pt-eq math{font-size:1.08em;font-family:"Cambria Math","STIX Two Math","Latin Modern Math",serif}
.pt-link{color:#0563c1;text-decoration:underline;cursor:text}
.pt-cm{background:rgba(255,210,0,.3);border-bottom:2px solid rgba(232,170,0,.75)}
.pt-ins{color:var(--tc,#1a56db);text-decoration:underline;text-decoration-color:var(--tc,#1a56db)}
.pt-del{color:var(--tc,#c5221f);text-decoration:line-through}
.pt-obj.pt-del{opacity:.45}
.pt-hr{padding:6pt 0;cursor:default}
.pt-hr hr{border:none;border-top:1px solid #a6a6a6;margin:0;height:0}
.pt-toc{padding:2pt 0 10pt;cursor:default;user-select:none}
.pt-toc-title{font-family:"Calibri Light",Calibri,Carlito,Arial,sans-serif;font-size:16pt;color:#2f5496;margin-bottom:6pt}
.pt-toc-e{display:flex;align-items:baseline;gap:4pt;padding:1.5pt 0;cursor:pointer}
.pt-toc-e:hover .t{text-decoration:underline;color:#0563c1}
.pt-toc-e .t{white-space:normal}
.pt-toc-e .d{flex:1;min-width:12pt;border-bottom:1.3px dotted #7a7a7a;transform:translateY(-3pt)}
.pt-toc-l2{padding-left:14pt}.pt-toc-l3{padding-left:28pt}.pt-toc-l4{padding-left:42pt}.pt-toc-l5{padding-left:56pt}.pt-toc-l6{padding-left:70pt}
.pt-toc-empty{color:#80868b;font-style:italic;white-space:normal}
.pt-fnotes{position:absolute;z-index:2;font-size:10pt;line-height:1.25}
.pt-fnsep{width:33%;border-top:.75pt solid #000;margin:0 0 3pt}
.pt-note{display:flex;gap:3pt;margin-bottom:2pt;cursor:text}
.pt-note-n{font-size:.75em;line-height:1.7;min-width:.8em}
.pt-note-body{flex:1;min-width:0;outline:none;font-size:inherit;line-height:inherit}
.pt-note-body.pt-editing{outline:1px dashed #1a73e8;outline-offset:2px;background:rgba(255,255,255,.8)}
.pt-notes-measure{position:absolute;left:-10000px;top:0;visibility:hidden;font-size:10pt;line-height:1.25}
.pt-pilcrow{color:#7baaf7;font:400 .9em Arial,sans-serif;user-select:none;pointer-events:none;text-decoration:none}
.pt-canvas.pageless{background:var(--page-color,#fff);box-shadow:0 1px 3px rgba(60,64,67,.28)}
.pt-canvas.pageless .pt-p[data-pb]{border-top:1px dashed #b0b0b0}
.pt-canvas.show-marks .pt-p[data-pb]::after{content:'Salto de página';position:absolute;right:0;top:-1.2em;font:9px Arial,sans-serif;color:#7baaf7}
::highlight(pt-find){background-color:rgba(255,213,0,.5)}
::highlight(pt-find-cur){background-color:rgba(255,140,0,.75)}
::highlight(pt-speak){background-color:rgba(26,115,232,.3)}
.pt-flow.painting{cursor:copy}
.pt-flow.col-resize{cursor:col-resize}
`;
})();
