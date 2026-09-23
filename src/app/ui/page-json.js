'use strict';
function applyPageJson(obj){
  if(!obj||typeof obj!=='object') throw new Error(_t('不是有效的頁面 JSON'));
  if(Array.isArray(obj)) obj={elements:obj};          // 也接受純 elements 陣列
  if(!Array.isArray(obj.elements)) throw new Error(_t('頁面 JSON 缺 elements'));
  resolveAssets(obj);   // @asset 佔位 → 還原 base64
  if(APP.masterEdit){   // 編輯母版時，本面板換成母版的 JSON，套用只動 master.elements
    const t=structuredClone(APP.deck);
    t.master=Object.assign({on:true,flatten:false},t.master,{elements:obj.elements});
    const dm=normalizeDeck(t);
    commitUndo(); APP.edit=null; APP.editing=null; APP.deck=dm; setSel([]); renderAll(); reportChartIssues(); return;
  }
  const temp=structuredClone(APP.deck);
  const idx=temp.pages.findIndex(p=>p.id===APP.page);
  const cur=temp.pages[idx];
  // 未出現在貼入 JSON 的鍵一律沿用原頁（notes／bgImage 若不列入，貼一次頁面 JSON 就會被清空）
  temp.pages[idx]={id:obj.id||cur.id, name:obj.name??cur.name, bg:obj.bg||cur.bg,
    notes:('notes' in obj)?obj.notes:cur.notes,
    bgImage:('bgImage' in obj)?obj.bgImage:cur.bgImage,
    section:('section' in obj)?obj.section:cur.section,
    skip:('skip' in obj)?obj.skip:cur.skip,
    transition:('transition' in obj)?obj.transition:cur.transition, elements:obj.elements};
  const d=normalizeDeck(temp);
  commitUndo();
  APP.edit=null; APP.editing=null;   // 同 loadDeck：整頁換掉，編輯狀態一併收掉
  APP.deck=d; APP.page=d.pages[idx].id; setSel([]);
  renderAll();
  reportChartIssues();
}
// 右上：整份簡報＋全域 JSON（modal；圖片以 @asset 佔位顯示）
$('#btnJson').onclick=()=>{ $('#jsonArea').value=maskedJson(APP.deck); $('#jsonModal').hidden=false; };
$('#btnJsonClose').onclick=()=>$('#jsonModal').hidden=true;
$('#btnJsonRefresh').onclick=()=>{ $('#jsonArea').value=maskedJson(APP.deck); };
$('#btnJsonCopy').onclick=async()=>{
  $('#jsonArea').value=maskedJson(APP.deck);
  try{ await navigator.clipboard.writeText($('#jsonArea').value); $('#btnJsonCopy').textContent=_t('已複製 ✓'); }
  catch(err){ $('#jsonArea').select(); document.execCommand('copy'); $('#btnJsonCopy').textContent=_t('已複製 ✓'); }
  setTimeout(()=>$('#btnJsonCopy').textContent=_t('複製到剪貼簿'),1200);
};
$('#btnJsonApply').onclick=()=>{
  try{ loadDeck(JSON.parse($('#jsonArea').value)); $('#jsonModal').hidden=true; }
  catch(err){ alert(_t('JSON 解析失敗：{0}',err.message)); }
};

// 右欄：本頁 JSON 浮動面板（點畫布元素聚焦其 JSON）
let pageJsonDirty=false;
function pageJsonOpen(){ return !$('#pageJsonPanel').hidden; }
function refreshPageJson(){
  const src=APP.masterEdit? {elements:masterEls()} : curPage();
  $('#pageJsonArea').value=maskedJson(src); pageJsonDirty=false;
  $('#pageJsonName').textContent=' — '+(APP.masterEdit? _t('母版')
    : (curPage().name||_t('頁 {0}',APP.deck.pages.indexOf(curPage())+1))); }
function focusElementJson(id){
  const ta=$('#pageJsonArea'), txt=ta.value;
  const idx=txt.indexOf('"id": "'+id+'"'); if(idx<0) return;
  let s=txt.lastIndexOf('{',idx), depth=0, e=s;
  for(;e<txt.length;e++){ const ch=txt[e]; if(ch==='{')depth++; else if(ch==='}'){ depth--; if(depth===0){ e++; break; } } }
  ta.setSelectionRange(s,e);   // 不 focus，避免搶走畫布鍵盤
  const line=txt.slice(0,s).split('\n').length;
  const lh=parseFloat(getComputedStyle(ta).lineHeight)||16;
  ta.scrollTop=Math.max(0,(line-2)*lh);
}
// 表格儲存格 → 該格 JSON：從元素 id 起找 "cells"，字串感知走訪括號深度定位第 r 列第 c 格
// （covered 佔位格也在 cells 陣列內，r/c 與 td.dataset 同一索引空間）
function focusCellJson(id,r,c){
  if(!pageJsonOpen()) return;
  const ta=$('#pageJsonArea'), txt=ta.value;
  let i=txt.indexOf('"id": "'+id+'"'); if(i<0) return;
  i=txt.indexOf('"cells"',i); if(i<0) return;
  i=txt.indexOf('[',i); if(i<0) return;
  let depth=0,row=-1,col=-1,inStr=false,esc=false,start=-1;
  for(let k=i;k<txt.length;k++){
    const ch=txt[k];
    if(inStr){ if(esc)esc=false; else if(ch==='\\')esc=true; else if(ch==='"')inStr=false; continue; }
    if(ch==='"'){ inStr=true; continue; }
    if(ch==='['){ depth++; if(depth===2){ row++; col=-1; } }
    else if(ch==='{'){ if(depth===2){ col++; if(row===r&&col===c) start=k; } depth++; }
    else if(ch==='}'){ depth--; if(start>=0&&depth===2){
      ta.setSelectionRange(start,k+1);
      const line=txt.slice(0,start).split('\n').length;
      const lh=parseFloat(getComputedStyle(ta).lineHeight)||16;
      ta.scrollTop=Math.max(0,(line-2)*lh); return; } }
    else if(ch===']'){ depth--; if(depth===0) return; }
  }
}
function syncPageJson(){
  if(!pageJsonOpen()) return;
  if(!pageJsonDirty) refreshPageJson();
  if(APP.selIds.length===1) focusElementJson(APP.selIds[0]);
}
function openPageJson(){ $('#pageJsonPanel').hidden=false; refreshPageJson(); if(APP.selIds.length===1) focusElementJson(APP.selIds[0]); updateCopyPalWin(); }
$('#pageJsonArea').addEventListener('input',()=>pageJsonDirty=true);
$('#btnPageJsonClose').onclick=()=>{ $('#pageJsonPanel').hidden=true; updateCopyPalWin(); };
$('#btnPageJsonRefresh').onclick=refreshPageJson;
$('#btnPageJsonCopy').onclick=async()=>{
  const t=$('#pageJsonArea').value;
  try{ await navigator.clipboard.writeText(t); $('#btnPageJsonCopy').textContent=_t('已複製 ✓'); }
  catch(err){ $('#pageJsonArea').select(); document.execCommand('copy'); $('#btnPageJsonCopy').textContent=_t('已複製 ✓'); }
  setTimeout(()=>$('#btnPageJsonCopy').textContent=_t('複製'),1200);
};
/* 含 base64 的複製：給能讀 deck JSON 的外部工具用。
   面板裡顯示的是 maskedJson，圖片被換成 @asset 佔位——那個佔位只有本簡報自己按 id
   還原得回位元組，貼到別的地方就是一張破圖。這裡直接取未遮罩的原始物件。
   ⚠ 目前只解遮罩，仍是「單頁片段」：不含 stage／fonts／master，外部工具得自己套預設。 */
$('#btnPageJsonCopyRaw').onclick=async()=>{
  const src=APP.masterEdit? {elements:masterEls()} : curPage();
  const t=JSON.stringify(src,null,1);
  const done=()=>{ $('#btnPageJsonCopyRaw').textContent=_t('已複製 ✓');
    setTimeout(()=>$('#btnPageJsonCopyRaw').textContent=_t('複製（含 base64）'),1200); };
  try{ await navigator.clipboard.writeText(t); done(); }
  catch(err){
    // 面板的 textarea 裝的是遮罩版，不能拿來當退路，改用臨時節點
    const ta=document.createElement('textarea');
    ta.value=t; ta.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }
    catch(e2){ alert(_t('複製失敗：{0}',e2.message)); }
    finally{ ta.remove(); }
  }
};
$('#btnPageJsonApply').onclick=()=>{
  try{ applyPageJson(JSON.parse($('#pageJsonArea').value)); refreshPageJson(); }
  catch(err){ alert(_t('本頁 JSON 解析失敗：{0}',err.message)); }
};
