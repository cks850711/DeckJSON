'use strict';
/* 浮動面板的拖曳。四個面板（本頁 JSON／圖層／圖表／圖形編輯器）共用這一套。
   `skipSel` 是標題列上不該觸發拖曳的東西（關閉鈕）。
   ⚠ 位置一律夾在視窗內：拖到視窗外就再也抓不回來，只能重開面板。 */
function makeDraggable(pnl,head,skipSel){
  let d=null;
  head.addEventListener('pointerdown',e=>{
    if(skipSel&&e.target.closest&&e.target.closest(skipSel)) return;
    const r=pnl.getBoundingClientRect(); d={dx:e.clientX-r.left,dy:e.clientY-r.top};
    // 先把 right/bottom 定位換算成 left/top，之後才能單靠這兩個值移動
    pnl.style.right='auto'; pnl.style.bottom='auto';
    pnl.style.left=r.left+'px'; pnl.style.top=r.top+'px';
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove',e=>{ if(!d)return;
    const w=pnl.offsetWidth,h=pnl.offsetHeight;
    pnl.style.left=Math.max(0,Math.min(innerWidth-w,e.clientX-d.dx))+'px';
    pnl.style.top=Math.max(0,Math.min(innerHeight-h,e.clientY-d.dy))+'px'; });
  head.addEventListener('pointerup',()=>d=null);
}
makeDraggable($('#pageJsonPanel'),$('#pageJsonHead'),'#btnPageJsonClose');
// ================= 圖層面板 =================
let LAYER_DRAG=null;
const L_ICON={text:'ic-text',table:'ic-table',image:'ic-image',shape:'ic-shape',chart:'ic-chart',video:'ic-video'};
const licon=id=>`<svg class="ic"><use href="#${id}"/></svg>`;
const L_NAME={text:_t('文字'),table:_t('表格'),image:_t('圖片'),shape:_t('形狀'),chart:_t('圖表'),video:_t('影片')};
function layersOpen(){ return !$('#layerPanel').hidden; }
function layerLabel(el){
  if(el.type==='text'||(el.type==='shape'&&el.paras)){ const t=plainText(el).replace(/\s+/g,' ').trim(); if(t) return t.slice(0,18); }
  if(el.type==='shape') return (LINE_KINDS[el.shape]||SHAPES[el.shape]||{}).label||_t('形狀');
  return L_NAME[el.type]||el.type;
}
function renderLayers(){
  if(typeof $!=='function'||!layersOpen()) return;
  const list=$('#layerList'); list.innerHTML='';
  const els=curEls();
  for(let i=els.length-1;i>=0;i--){        // 頂層（陣列末端）顯示在最上面
    const el=els[i];
    const row=document.createElement('div'); row.className='layerRow'; row.dataset.id=el.id;
    if(APP.selIds.includes(el.id)) row.classList.add('sel');
    if(el.hidden) row.classList.add('hid');
    const eye=document.createElement('button'); eye.className='ltog eyeTog'+(el.hidden?'':' on'); eye.innerHTML=licon(el.hidden?'ic-eye-off':'ic-eye'); eye.title=_t('顯示／隱藏');
    eye.onclick=ev=>{ ev.stopPropagation(); commitUndo(); if(el.hidden) delete el.hidden; else el.hidden=true; renderStage(); renderProps(); };
    const lock=document.createElement('button'); lock.className='ltog'+(el.locked?' on':''); lock.innerHTML=licon(el.locked?'ic-lock':'ic-unlock'); lock.title=_t('鎖定（畫布不可選拖）');
    lock.onclick=ev=>{ ev.stopPropagation(); commitUndo(); if(el.locked){ delete el.locked; } else { el.locked=true; if(APP.selIds.includes(el.id)) setSel(APP.selIds.filter(id=>id!==el.id)); } renderStage(); renderProps(); };
    const icon=document.createElement('span'); icon.className='licon'; icon.innerHTML=licon(L_ICON[el.type]||'ic-shape');
    const nm=document.createElement('span'); nm.className='lname'; nm.textContent=(el.groupId?'⧉ ':'')+layerLabel(el); nm.title=el.id;
    row.append(eye,lock,icon,nm);
    row.onclick=()=>{ setSel(el.groupId?groupMembers(el).map(m=>m.id):[el.id]); updateSelBox(); renderProps(); syncPageJson(); renderLayers(); };
    row.draggable=true;
    row.addEventListener('dragstart',ev=>{ LAYER_DRAG=el.id; ev.dataTransfer.effectAllowed='move'; });
    row.addEventListener('dragover',ev=>{ ev.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave',()=>row.classList.remove('dragover'));
    row.addEventListener('drop',ev=>{ ev.preventDefault(); row.classList.remove('dragover'); layerReorder(LAYER_DRAG,el.id,ev); });
    list.appendChild(row);
  }
}
function layerReorder(dragId,targetId,ev){
  if(!dragId||dragId===targetId) return;
  const els=curEls();
  const from=els.findIndex(e=>e.id===dragId); if(from<0) return;
  commitUndo();
  const [moved]=els.splice(from,1);
  let to=els.findIndex(e=>e.id===targetId); if(to<0) to=els.length;
  const r=ev.currentTarget.getBoundingClientRect();
  if(ev.clientY < r.top+r.height/2) to+=1;   // 拖到 target 上半＝放到它上層（陣列 index 較大）
  els.splice(to,0,moved);
  renderStage(); renderProps();
}
$('#btnLayers').onclick=()=>{ const p=$('#layerPanel'); p.hidden=!p.hidden; if(!p.hidden) renderLayers(); };
$('#btnLayerClose').onclick=()=>$('#layerPanel').hidden=true;
makeDraggable($('#layerPanel'),$('#layerHead'),'#btnLayerClose');

$('#btnJsonSave').onclick=()=>saveDeck();
$('#btnJsonLoad').onclick=()=>openDeckPicker();   // 包一層：openDeckPicker 在後面的檔才宣告，載入當下還取不到
$('#jsonInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  if(await openDeckFile(f)) $('#jsonModal').hidden=true;
});

