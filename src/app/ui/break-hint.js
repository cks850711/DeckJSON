'use strict';
/* ================= 狀態列：可能被換行拆開的寫法 =================
   規則在 model/textlint.js（與 DJ.lint、deck-lint 同一份）。這裡只負責讓自己動手編輯的人也看得到：
   狀態列顯示全簡報共幾處，按一下跳到下一個有問題的元素並選取它，後面列出那個元素裡的片段。
   只提醒、不修改——要不要黏住是寫的人的判斷（見 textlint.js 開頭）。

   每次改動都會走 renderAll，全簡報掃一遍正則的成本不高，但拖曳、連續輸入時沒必要每次都掃，
   所以延後到停手之後再算。 */
const BH={list:[], cur:-1, curId:null, curPage:null, timer:0};
function scheduleBreakHint(){ clearTimeout(BH.timer); BH.timer=setTimeout(updateBreakHint,300); }
function bhWhere(it){
  if(it.page==='master') return _t('母版');
  const i=APP.deck.pages.findIndex(p=>p.id===it.page);
  return _t('第 {0} 頁',i+1);
}
function bhElName(it){
  const els= it.page==='master'? (APP.deck.master&&APP.deck.master.elements||[]) : ((APP.deck.pages.find(p=>p.id===it.page)||{}).elements||[]);
  const el=els.find(e=>e.id===it.id);
  return el? layerLabel(el) : it.id;
}
function updateBreakHint(){
  const s=$('#breakHint'); if(!s) return;
  BH.list=breakScan(APP.deck);
  // 剛跳到的元素改好了就不再指著它；還有問題就留著，片段清單跟著更新
  BH.cur=BH.list.findIndex(it=>it.id===BH.curId&&it.page===BH.curPage);
  const n=BH.list.reduce((a,it)=>a+it.hits.length,0);
  if(!n){ s.textContent=''; return; }
  let txt=_t('ℹ {0} 處可能被換行拆開',n);
  if(BH.cur>=0){
    const it=BH.list[BH.cur];
    const frags=it.hits.slice(0,3).map(h=>_t('「{0}」',h)).join('')+(it.hits.length>3? _t('…等 {0} 處',it.hits.length) : '');
    txt+=_t('　▸ {0}／{1}：{2}　（{3}/{4}）',bhWhere(it),bhElName(it),frags,BH.cur+1,BH.list.length);
  }
  s.textContent=txt;
}
function nextBreakHint(){
  if(!BH.list.length) return;
  const it=BH.list[(BH.cur+1)%BH.list.length];
  BH.curId=it.id; BH.curPage=it.page;
  if(it.page==='master'){ if(!APP.masterEdit) setMasterEdit(true); }
  else{ if(APP.masterEdit) setMasterEdit(false); if(APP.page!==it.page) setPage(it.page); }
  setSel([it.id]); renderAll();
  updateBreakHint();
}
$('#breakHint').onclick=nextBreakHint;
