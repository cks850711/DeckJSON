'use strict';
/* ================= 檢視縮放 ================= */
const WORK_PAD=240;   // 投影片四周工作區留白（CSS px）：拖出畫布的物件落在可捲範圍內，救得回
function setZoom(pct){
  pct=Math.round(Math.min(300,Math.max(10,pct)));
  APP.zoom=pct/100;
  $('#zoomNum').value=pct;
  stage.style.transform=`scale(${APP.zoom})`;
  // 邊距取「WORK_PAD」與「置中所需」較大者：投影片小於檢視區的軸自動置中（不捲也居中），
  // 大於檢視區時維持 WORK_PAD 工作區留白（拖出畫布的物件救得回）
  const sc=$('#stageScroll');
  const mw=Math.max(WORK_PAD,Math.round((sc.clientWidth -STAGE_W*APP.zoom)/2));
  const mh=Math.max(WORK_PAD,Math.round((sc.clientHeight-STAGE_H*APP.zoom)/2));
  stage.style.margin=mh+'px '+mw+'px';
  $('#stageOuter').style.width=(STAGE_W*APP.zoom+mw*2)+'px';
  $('#stageOuter').style.height=(STAGE_H*APP.zoom+mh*2)+'px';
}
$('#zoomNum').addEventListener('change',e=>setZoom(+e.target.value));
// 適寬/適高：投影片留 16px 邊距後貼近檢視區，並於兩軸置中（另一軸的黑區左右/上下均分，不再單側一條黑）
// 置中不靠邊距常數回推，直接量白色投影片的實際座標（getBoundingClientRect 含縮放）對齊檢視區中心
function centerSlide(){ const sc=$('#stageScroll');
  const sr=sc.getBoundingClientRect(), st=stage.getBoundingClientRect();
  // 用 client 區域中心（排除傳統捲軸佔位；rect 含捲軸會偏 15px）
  sc.scrollLeft+=Math.round((st.left+st.width /2)-(sr.left+sc.clientLeft+sc.clientWidth /2));
  sc.scrollTop +=Math.round((st.top +st.height/2)-(sr.top +sc.clientTop +sc.clientHeight/2)); }
// 算兩次：第一次縮放後另一軸可能冒出/收起捲軸使 clientWidth/Height 改變，第二次以新值修正
function fitWidth(){ const sc=$('#stageScroll'); if(sc.clientWidth<200) return;
  for(let i=0;i<2;i++) setZoom(Math.floor((sc.clientWidth -32)/STAGE_W*100));
  requestAnimationFrame(centerSlide); }
function fitHeight(){ const sc=$('#stageScroll'); if(sc.clientHeight<160) return;
  for(let i=0;i<2;i++) setZoom(Math.floor((sc.clientHeight-32)/STAGE_H*100));
  requestAnimationFrame(centerSlide); }
/* 偏好選單：母版模式與貼上白底都是低頻設定，收進齒輪，不再佔工具列一整組。
   capture 階段關閉，才不會被其他 pointerdown 處理器攔在前面（畫布的選取邏輯就吃 capture）。 */
$('#btnPrefs').onclick=e=>{ e.stopPropagation();
  const p=$('#prefsPop');
  if(p.hidden){ const r=$('#btnPrefs').getBoundingClientRect();
    p.style.top=(r.bottom+6)+'px'; p.style.right=Math.max(8,innerWidth-r.right)+'px'; }
  p.hidden=!p.hidden; };
document.addEventListener('pointerdown',e=>{ const p=$('#prefsPop');
  if(p&&!p.hidden&&!(e.target.closest&&e.target.closest('.popwrap'))) p.hidden=true; },true);
/* 介面語言：存在這台瀏覽器，不隨簡報走。切換＝先把目前內容寫進自動存檔，再重載
   （為什麼不即時重繪見〈介面語言〉）。還沒存成檔的「●」也要帶過重載，
   否則切完語言看起來像已存檔——實際上只在自動存檔裡。 */
function syncUiLangBtns(){
  for(const b of document.querySelectorAll('#uiLangSeg button')) b.classList.toggle('on',b.dataset.lang===UI_LANG);
}
async function setUiLang(v){
  if(v===UI_LANG) return;
  if((asOff||!APP.ready)&&!confirm(_t('自動存檔目前無法使用，切換語言會重新載入頁面，還沒存成檔案的內容會不見。確定要切換嗎？'))) return;
  clearTimeout(asTimer);
  if(APP.ready&&!asOff) await asSaveNow();
  try{ if(APP.dirty) sessionStorage.setItem('deckjson.dirty','1'); }catch(e){}
  let stored=false;
  try{ localStorage.setItem(UI_LANG_KEY,v); stored=localStorage.getItem(UI_LANG_KEY)===v; }catch(e){}
  const u=new URL(location.href);
  if(stored) u.searchParams.delete('lang'); else u.searchParams.set('lang',v);
  /* 不可用 location.replace(新網址)：那是一般導覽，會直接拿 HTTP 快取。拿掉 ?lang= 後的網址
     可能還快取著改版前的頁面（伺服器沒送 Cache-Control 時 Chrome 用啟發式新鮮度），
     實際踩到：切完語言載入舊版，切換鈕整列不見。reload 一定向伺服器驗證主頁面。 */
  history.replaceState(history.state,'',u.href);
  location.reload();
}
for(const b of document.querySelectorAll('#uiLangSeg button')) b.onclick=()=>setUiLang(b.dataset.lang);
syncUiLangBtns();
$('#btnFitW').onclick=fitWidth;
$('#btnFitH').onclick=fitHeight;
/* 格線與吸附：純檢視狀態，不進 undo（撤銷應該只回退簡報內容，不該把使用者的檢視設定也一起翻掉） */
function syncGridBtns(){
  $('#btnGrid').classList.toggle('on',APP.grid.on);
  const sb=$('#btnGridSnap');
  sb.classList.toggle('on',APP.grid.on&&APP.grid.snap);
  sb.disabled=!APP.grid.on;   // 沒顯示格線卻吸得到看不見的線＝手感詭異，故連動停用
}
/* 格線設定的完整控件。原本擺在右欄「工具」頁，但格線的開關在畫布浮動列、
   設定卻要跑去右欄翻三層——同一件事分在兩個地方。整組搬進浮動列格線鈕旁的
   popover，開關與細部設定放在一起。控件外觀靠容器的 .ppctl 沿用右欄那套樣式。 */
const GRID_UNITS={mm:MM2PX,px:1,pt:96/72,cm:96/2.54};
function buildGridControls(c){
  c.appendChild(secTitle(_t('格線（本機檢視）')));
  const chks=checkRow([
    [_t('顯示格線'),()=>APP.grid.on,v=>setGrid({on:!!v}),_t('原點在投影片左上角；一格虛線、每 N 格細實線、每 M 格粗實線')],
    [_t('吸附格線'),()=>APP.grid.snap,v=>setGrid({snap:!!v}),_t('移動吸左緣與上緣；拖白點縮放吸四邊')],
  ]);
  ['on','snap'].forEach((k,i)=>{ const cb=chks.querySelectorAll('input[type=checkbox]')[i]; if(cb) cb.dataset.gkey=k; });
  c.appendChild(chks);
  gridSnapDisabled(c);   // 沒顯示格線卻能勾吸附＝和浮動列的吸附鈕不一致
  {
    const G=APP.grid;
    // 常用格距做成按鈕（mm 是製圖慣用刻度），非整數 mm 才落到「自訂」
    const mm=G.size/MM2PX, PRESET=[1,2,5,10];
    const near=PRESET.find(v=>Math.abs(mm-v)<1e-6);
    const pr=btnRow(PRESET.map(v=>[v+'mm',()=>setGrid({size:v*MM2PX}),_t('格距 {0}mm',v),near===v]));
    pr.style.gap='3px';
    PRESET.forEach((v,i)=>{ if(pr.children[i]) pr.children[i].dataset.gsize=v; });
    for(const b of pr.children) b.style.cssText='flex:1;padding:5px 2px';   // 四顆一列不折行
    c.appendChild(pr);
    // 自訂格距：值與單位分開，換單位只換顯示不動實際大小（內部一律 px）
    const cr=document.createElement('div'); cr.className='row';
    cr.appendChild(Object.assign(document.createElement('label'),{textContent:_t('格距')}));
    const gu=APP.gridUnit||'mm';
    const ci=document.createElement('input'); ci.type='number'; ci.min='0.1'; ci.step= gu==='px'?1:0.5;
    ci.value=+(G.size/GRID_UNITS[gu]).toFixed(3); ci.style.width='62px'; ci.dataset.gval='1';
    ci.onchange=()=>{ const v=parseFloat(ci.value);
      if(!(v>0)){ renderGridPop(); return; }
      setGrid({size:Math.max(1,Math.min(800,v*GRID_UNITS[gu]))}); renderGridPop(); };
    cr.appendChild(ci);
    const us=document.createElement('select'); us.style.width='auto';
    us.innerHTML=Object.keys(GRID_UNITS).map(u=>`<option value="${u}"${u===gu?' selected':''}>${u}</option>`).join('');
    us.onchange=()=>{ APP.gridUnit=us.value; renderGridPop(); };
    cr.appendChild(us); c.appendChild(cr);
    const nr=document.createElement('div'); nr.className='row'; nr.style.gap='3px';
    for(const [k,lab,tip] of [['sub',_t('細線'),_t('每幾格畫一條細實線')],['major',_t('粗線'),_t('每幾格畫一條粗實線')]]){
      const lb=document.createElement('label'); lb.textContent=lab; lb.style.minWidth='auto'; nr.appendChild(lb);
      const i=document.createElement('input'); i.type='number'; i.min=1; i.max=200; i.value=G[k]; i.style.width='44px'; i.title=tip;
      i.onchange=()=>setGrid({[k]:Math.max(1,Math.min(200,Math.round(+i.value)||G[k]))});
      nr.appendChild(i);
      nr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('格')}));
    }
    c.appendChild(nr);
    // 自寫色列而不用 colorRow：那個會 commitUndo＋renderStage，格線不是簡報內容，不該佔一步撤銷
    const clr=document.createElement('div'); clr.className='row';
    clr.appendChild(Object.assign(document.createElement('label'),{textContent:_t('顏色')}));
    const sw=document.createElement('button'); sw.className='swatchBtn'; sw.style.background='#'+G.color;
    sw.title=_t('選色（設計師精選／Open Color／全色域）');
    sw.onclick=()=>openPalette(sw,G.color,hex=>{ setGrid({color:hex}); sw.style.background='#'+hex; });
    clr.appendChild(sw);
    const rst=document.createElement('button'); rst.textContent=_t('重設'); rst.title=_t('回到預設（5mm／5／10／#ADB5BD）');
    rst.onclick=()=>{ setGrid({size:GRID_DEF.size,sub:GRID_DEF.sub,major:GRID_DEF.major,color:GRID_DEF.color}); renderGridPop(); };
    clr.appendChild(rst); c.appendChild(clr);
    const gn=document.createElement('div'); gn.className='row';
    gn.innerHTML='<span class="unit">'+_t('格線<b>只在畫布上</b>：不匯出、不進快照、不寫進 .deck 檔，'
      +'設定存在這台瀏覽器（換電腦要重設）。單位對照：1mm ≈ 3.78px。')+'</span>';
    c.appendChild(gn);
  }
}
/* 整個重建：換單位、重設這種會動到控件結構的才用它 */
function renderGridPop(){ const p=$('#gridPop'); if(!p||p.hidden) return; p.innerHTML=''; buildGridControls(p); }
/* 只回填值與選中態。setGrid 走這條而非 renderGridPop：整個重建會把使用者正在連點的
   spinner 換成新元素，第二下就點空了。 */
/* 吸附的可用狀態跟著「顯示格線」走，比照浮動列 syncGridBtns 裡對 #btnGridSnap 的處理：
   看不見的線吸得到，手感只會像是壞掉 */
function gridSnapDisabled(root){
  const sn=root.querySelector('input[data-gkey=snap]'); if(!sn) return;
  sn.disabled=!APP.grid.on;
  const lb=sn.closest('.chk'); if(lb) lb.style.opacity=APP.grid.on?'':'.45';
}
function syncGridPop(){
  const p=$('#gridPop'); if(!p||p.hidden) return;
  gridSnapDisabled(p);
  p.querySelectorAll('input[data-gkey]').forEach(i=>{ i.checked=!!APP.grid[i.dataset.gkey]; });
  const mm=APP.grid.size/MM2PX;
  p.querySelectorAll('button[data-gsize]').forEach(b=>b.classList.toggle('on',Math.abs(mm-+b.dataset.gsize)<1e-6));
  const gv=p.querySelector('input[data-gval]');
  if(gv&&document.activeElement!==gv) gv.value=+(APP.grid.size/GRID_UNITS[APP.gridUnit||'mm']).toFixed(3);
}
function setGrid(patch){ Object.assign(APP.grid,patch); saveGrid(); renderGrid(); syncGridBtns(); syncGridPop(); }
$('#btnGrid').onclick=()=>setGrid({on:!APP.grid.on});
$('#btnGridSnap').onclick=()=>setGrid({snap:!APP.grid.snap});
/* 格線設定 popover 的開關。往上開（浮動列本身貼著畫布底部），right 對齊按鈕右緣。
   ⚠ 用 bottom 不用 top：popover 高度隨內容變，用 top 定位會在內容變高時往下溢出視窗。 */
$('#btnGridMore').onclick=e=>{ e.stopPropagation();
  const p=$('#gridPop'), b=$('#btnGridMore');
  if(p.hidden){
    p.hidden=false; renderGridPop();          // 先取消 hidden，renderGridPop 才願意畫
    const r=b.getBoundingClientRect();
    p.style.bottom=(innerHeight-r.top+8)+'px';
    p.style.right=Math.max(8,innerWidth-r.right)+'px';
  }else p.hidden=true;
  $('#btnGridMore').classList.toggle('on',!p.hidden);
};
document.addEventListener('pointerdown',e=>{ const p=$('#gridPop');
  if(!p||p.hidden) return;
  const t=e.target;
  if(t.closest&&(t.closest('#gridPop')||t.closest('#btnGridMore')||t.closest('#palettePop'))) return;
  p.hidden=true; $('#btnGridMore').classList.remove('on'); },true);
syncGridBtns();
/* 母版元素的虛線標記。純檢視設定，和格線一樣存 localStorage、不寫進 deck。
   只有這份簡報真的有啟用母版時才擺出這顆鈕，否則它按了畫面毫無反應。 */
function syncMelBtn(){
  const b=$('#btnMelMark'); if(!b) return;
  b.hidden=!masterOn();
  b.classList.toggle('on',APP.melMark);
  document.body.classList.toggle('melMark',APP.melMark);
}
$('#btnMelMark').onclick=()=>{ APP.melMark=!APP.melMark; lsSet('deckjson.melmark',APP.melMark?'1':'0'); syncMelBtn(); };
syncMelBtn();
/* 貼上白底：同樣不進 undo（它影響的是「下一次貼上」，不是簡報現況；
   已經貼進來的表格要改底色請用右欄「儲存格 → 底色」，選全表一次套完）。*/
function syncPasteWhiteBtn(){
  const b=$('#btnPasteWhite');
  b.classList.toggle('on',APP.pasteWhite);
  // 用 innerHTML 而非 textContent：這顆按鈕帶 SVG 圖示，textContent 會把圖示一起洗掉
  b.innerHTML='<svg class="ic"><use href="#ic-white"/></svg> '+(APP.pasteWhite? _t('白底') : _t('透明'));
}
$('#btnPasteWhite').onclick=()=>{ APP.pasteWhite=!APP.pasteWhite; savePasteWhite(); syncPasteWhiteBtn(); };
syncPasteWhiteBtn();
window.addEventListener('resize',()=>setZoom(Math.round(APP.zoom*100)));   // 視窗改尺寸：重算置中邊距

/* ================= 標題／字體模式／undo 按鈕 ================= */
$('#deckTitle').addEventListener('change',e=>{ APP.deck.title=e.target.value||_t('未命名簡報'); scheduleAutosave(); });
$('#btnUndo').onclick=undo; $('#btnRedo').onclick=redo;
$('#btnMasterDone').onclick=()=>setMasterEdit(false);

