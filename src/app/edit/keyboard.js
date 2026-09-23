'use strict';
/* ================= 鍵盤 ================= */
document.addEventListener('keydown',e=>{
  if(GEO.open) return;   // 圖形編輯器開著時，快捷鍵歸它管（它自己那組在 capture 階段先攔）
  const inField=APP.editing||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||document.activeElement.isContentEditable;
  if(APP.cropping&&!inField&&(e.key==='Escape'||e.key==='Enter')){
    e.preventDefault(); endCrop(); return;   // 裁切模式：兩顆鍵都是收工（已即時寫入，沒有「取消」語義，要反悔用 Undo）
  }
  if(e.key==='Escape'){
    if(APP.painter){ APP.painter=null; updatePainterHint(); return; }
    if(inField) return;
    if(APP.selIds.length){ setSel([]); updateSelBox(); renderProps(); syncPageJson(); }
    return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
    if(inField) return;
    e.preventDefault(); if(e.shiftKey) redo(); else undo(); return;
  }
  // Cmd/Ctrl+S 存檔（加 Shift＝另存新檔）：這裡不擋 inField，改標題／編輯文字中按存檔是常見動作
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){ e.preventDefault(); if(e.shiftKey) saveDeckAs(); else saveDeck(); return; }
  if(inField) return;
  if(!APP.selIds.length) return;
  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); deleteSelected(); return; }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelected(); return; }
  const st=e.shiftKey?10:1;
  const mv={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
  if(mv){ e.preventDefault(); commitUndo();
    for(const el of selEls()){ el.x+=mv[0]; el.y+=mv[1]; updateElStyle(el); }
    updateSelBox(); }
});

