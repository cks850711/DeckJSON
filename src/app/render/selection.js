'use strict';
/* ================= 選取框與把手 ================= */
function updateSelBox(){
  if(!drag) renderLayers();   // 選取變動時同步圖層高亮；拖曳中跳過以免每幀重建
  if(APP.cellSel&&(selEl()||{}).id!==APP.cellSel.id) APP.cellSel=null;   // 選取已不是該表→清反白
  let sb=$('#selBox');
  stage.querySelectorAll('.el.multisel').forEach(b=>b.classList.remove('multisel'));
  // 多選：群組包圍盒＋四角比例縮放把手
  if(APP.selIds.length>1){
    if(!sb){ sb=document.createElement('div'); sb.id='selBox'; stage.appendChild(sb); }
    const els=selEls();
    for(const el of els){ const b=stage.querySelector(`.el[data-id="${el.id}"]`); if(b) b.classList.add('multisel'); }
    const bb=groupBBox(els);
    sb.style.left=bb.x+'px'; sb.style.top=bb.y+'px'; sb.style.width=bb.w+'px'; sb.style.height=bb.h+'px';
    sb.style.transform='';
    sb.style.outline='1.5px dashed var(--accent)'; sb.innerHTML='';
    for(const d of ['nw','ne','se','sw']){ const hd=document.createElement('div'); hd.className='rh'; hd.dataset.dir=d; hd.dataset.group='1'; sb.appendChild(hd); }
    return;
  }
  const el=selEl();
  if(!el){ if(sb) sb.remove(); return; }
  if(!sb){ sb=document.createElement('div'); sb.id='selBox'; stage.appendChild(sb); }
  const {w,h}=elSize(el);
  sb.style.left=el.x+'px'; sb.style.top=el.y+'px';
  sb.style.width=w+'px'; sb.style.height=h+'px';
  // 旋轉時選取框與把手跟著轉（顯示對齊；resize 已把螢幕位移換算回本地座標，故仍正確）
  sb.style.transform=(el.rot&&!isLineEl(el))? `rotate(${el.rot}deg)`:'';
  sb.style.transformOrigin='50% 50%';
  sb.innerHTML='';
  if(isLineEl(el)){   // 線條類：兩端點把手，不用包圍盒縮放
    sb.style.outline='1px dashed rgba(77,157,224,.4)';
    const E=lineEnds(el);
    for(const [px,py,end] of [[E.x1,E.y1,'1'],[E.x2,E.y2,'2']]){
      const hd=document.createElement('div'); hd.className='lh'; hd.dataset.end=end;
      hd.style.left=px+'px'; hd.style.top=py+'px';
      sb.appendChild(hd);
    }
    adjDots(el).forEach((ah,i)=>{   // 肘形：折點黃點（縱段中點），可左右拖動
      const [px]=ahPos(geomKey(el.shape),w,h,adjVals(el),ah);
      const hd=document.createElement('div'); hd.className='ah'; hd.dataset.i=i;
      hd.style.left=px+'px'; hd.style.top=(h/2)+'px'; hd.title=_t('拖曳調整折點（同 PPT 黃點）');
      sb.appendChild(hd);
    });
    return;
  }
  sb.style.outline='';
  const dirs= el.type==='image'? ['nw','ne','se','sw'] : ['nw','n','ne','e','se','s','sw','w'];
  for(const d of dirs){ const hd=document.createElement('div'); hd.className='rh'; hd.dataset.dir=d; sb.appendChild(hd); }
  if(el.type==='shape'){   // adj 黃點：位置直接由 preset 的 ahLst pos 求值（翻轉時跟著鏡射）
    const A=adjVals(el);
    adjDots(el).forEach((ah,i)=>{
      let [px,py]=ahPos(el.shape,w,h,A,ah);
      if(el.flipH) px=w-px;
      if(el.flipV) py=h-py;
      const hd=document.createElement('div'); hd.className='ah'; hd.dataset.i=i;
      hd.style.left=px+'px'; hd.style.top=py+'px'; hd.title=_t('拖曳調整形狀（同 PPT 黃點）');
      sb.appendChild(hd);
    });
  }
  if(el.type==='table'){
    let x=0;
    el.colW.forEach((cw,i)=>{
      // 欄刪除鈕：把手之間的灰色區段，hover 變紅（沿 xlsx2pptx 慣例，不用數編號）
      if(el.colW.length>1){
        const d=document.createElement('div'); d.className='tcd'; d.textContent='✕'; d.title=_t('刪除此欄（其他欄寬不變）');
        d.style.left=(x+6)+'px'; d.style.width=Math.max(8,cw-12)+'px'; d.dataset.i=i;
        d.onclick=ev=>{ ev.stopPropagation(); commitUndo(); tableDeleteCol(el,+d.dataset.i); renderStage(); renderProps(); };
        sb.appendChild(d);
      }
      x+=cw;
      const th=document.createElement('div'); th.className='tch'; th.dataset.i=i; th.style.left=x+'px'; sb.appendChild(th); });
    const trs=tableDom(el.id)?tableDom(el.id).querySelectorAll('tr'):[];
    trs.forEach((tr,i)=>{
      if(trs.length>1){
        const d=document.createElement('div'); d.className='trd'; d.textContent='✕'; d.title=_t('刪除此列（其他列高不變）');
        d.style.top=(tr.offsetTop+5)+'px'; d.style.height=Math.max(8,tr.offsetHeight-10)+'px'; d.dataset.i=i;
        d.onclick=ev=>{ ev.stopPropagation(); commitUndo(); tableDeleteRow(el,+d.dataset.i); renderStage(); renderProps(); };
        sb.appendChild(d);
      }
      const rh=document.createElement('div'); rh.className='trh'; rh.dataset.i=i;
      rh.style.top=(tr.offsetTop+tr.offsetHeight)+'px'; sb.appendChild(rh); });
    if(APP.cellSel&&APP.cellSel.id===el.id) paintCellSel(el,sb);
  }
}
// 反白矩形高亮＋就近的合併／取消合併鈕（沿 xlsx2pptx 慣例：操作放對象旁，不塞側欄）。sb＝selBox
function paintCellSel(el,sb){
  sb=sb||$('#selBox'); if(!sb) return;
  sb.querySelectorAll('.csel,.cselBtn').forEach(n=>n.remove());
  const s=APP.cellSel; if(!s||s.id!==el.id) return;
  const px=tableEdgePx(el,s.r0,s.c0,s.r1,s.c1);
  const hl=document.createElement('div'); hl.className='csel';
  hl.style.left=px.left+'px'; hl.style.top=px.top+'px'; hl.style.width=px.w+'px'; hl.style.height=px.h+'px';
  sb.appendChild(hl);
  const cs=s.c1-s.c0+1,rs=s.r1-s.r0+1;
  const a=el.cells[s.r0][s.c0];
  const isMerged=((a.colspan||1)>1||(a.rowspan||1)>1)&&(a.colspan||1)===cs&&(a.rowspan||1)===rs;
  if(cs<2&&rs<2&&!isMerged) return;   // 單一未合併格：不顯示按鈕
  const btn=document.createElement('button');
  if(isMerged){ btn.className='cselBtn unmerge'; btn.textContent=_t('⤢ 取消合併'); btn.onclick=ev=>{ ev.stopPropagation(); unmergeCellSel(el); }; }
  else{ btn.className='cselBtn'; setIcoBtn(btn,'ic-merge-cell',_t('合併儲存格')); btn.onclick=ev=>{ ev.stopPropagation(); mergeCellSel(el); }; }
  // 置於反白框右上外緣；貼頂時改放框內頂部，避免超出畫布看不到
  btn.style.left=px.left+'px';
  btn.style.top=(px.top>=22? px.top-22 : px.top+3)+'px';
  sb.appendChild(btn);
}

/* ================= 預留區檢查 ================= */
function rectHit(a,b){ return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y; }
function checkZones(){
  const zones=APP.deck.zones||[];
  const hit=zones.map(()=>false);
  let out=false;
  for(const el of curEls()){
    if(el.hidden) continue;
    const {w,h}=elSize(el); const b={x:el.x,y:el.y,w,h};
    zones.forEach((z,i)=>{ if(rectHit(b,z)) hit[i]=true; });
    if(b.x<0||b.y<0||b.x+b.w>STAGE_W||b.y+b.h>STAGE_H) out=true;
  }
  const nodes=[...stage.querySelectorAll('.safezone')];   // 與 renderZones 同序，索引即 zone 索引
  nodes.forEach((n,i)=>n.classList.toggle('hit',!!hit[i]));
  const names=zones.filter((z,i)=>hit[i]).map(z=>z.name);
  $('#warn').textContent= out?_t('⚠ 內容超出投影片'):names.length?_t('⚠ 內容侵入預留區：{0}',names.join(_t('、'))):'';
}

