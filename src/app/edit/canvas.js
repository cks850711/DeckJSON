'use strict';
/* ================= 畫布互動 ================= */
let drag=null,pendingUndo=null;
let DBL={id:null,t:0,x:0,y:0};   // 手動雙擊偵測：pointerdown 的 preventDefault 會吃掉原生 dblclick
function openEditor(el,targetNode){
  if(APP.editing) return;
  if(el.type==='image'){ startCrop(el); return; }   // 雙擊圖片＝進裁切（PowerPoint／Keynote 同款手勢）
  if(el.type==='chart'){ openChartModal(el); return; }
  if(el.type==='table'){
    const td=targetNode&&targetNode.closest? targetNode.closest('td'):null;
    if(td) startCellEdit(el,td);
    return;
  }
  if(el.type==='text'||(el.type==='shape'&&!isLineEl(el)))
    startTextEdit(el,stage.querySelector(`.el[data-id="${el.id}"]`));
}
stage.addEventListener('pointerdown',e=>{
  if(APP.editing) return;
  /* 裁切模式優先：在該圖上按下＝平移裁切窗（不是搬移元素），點到別處＝收工。
     擋在最前面是因為 .el 本身 cursor:move、一般路徑會把它當搬移。 */
  if(APP.cropping&&!e.target.closest('.rh,.lh,.ah')){
    /* 把手要放行給下面的 resize 路徑——它們是 #selBox 的子節點、不在 .el 裡，
       若照「點到 .el 以外就收工」處理會先 endCrop()，裁切模式當場關掉，
       imgFix 也就建立不起來（圖片於是又跟著框一起縮放）。 */
    const cb=e.target.closest('.el');
    const cel=cb&&cb.dataset.id===APP.cropping? curEls().find(x=>x.id===APP.cropping) : null;
    if(cel){
      drag={type:'crop',el:cel,sx:e.clientX,sy:e.clientY,n:cropNorm(cel)};
      e.preventDefault(); pendingUndo=snapshot();
      try{ stage.setPointerCapture(e.pointerId); }catch(err){}
      return;
    }
    endCrop();
  }
  // 格式刷武裝中：點元素套用樣式（可連續），點空白處取消
  if(APP.painter){
    const b=e.target.closest('.el');
    const t=b&&curEls().find(x=>x.id===b.dataset.id);
    if(t){ e.preventDefault(); applyPainterTo(t); }
    else { APP.painter=null; updatePainterHint(); }
    return;
  }
  if(e.target.closest('.tcd,.trd,.cselBtn')) return;   // 表格刪欄列鈕／合併鈕：交給 click 處理，不啟動拖曳
  const rh=e.target.closest('.rh'), tch=e.target.closest('.tch'), trh=e.target.closest('.trh'), lh=e.target.closest('.lh'), ah=e.target.closest('.ah');
  const el=selEl();
  if(ah&&el&&el.type==='shape'&&adjDots(el).length){
    drag={type:'adj',el,i:+ah.dataset.i,sx:e.clientX,sy:e.clientY};
    e.preventDefault(); pendingUndo=snapshot();
    try{ stage.setPointerCapture(e.pointerId); }catch(err){}
    return;
  }
  // 群組比例縮放把手（多選）
  if(rh&&rh.dataset.group&&APP.selIds.length>1){
    const bb=groupBBox(selEls()), dir=rh.dataset.dir;
    drag={type:'gresize',sx:e.clientX,sy:e.clientY,   // sx/sy 必填：pointermove 靠它算 dx/dy（漏掉會 NaN 全部歸零）
      anchor:{x:dir.includes('w')?bb.x+bb.w:bb.x, y:dir.includes('n')?bb.y+bb.h:bb.y},
      ox:dir.includes('w')?bb.x:bb.x+bb.w, oy:dir.includes('n')?bb.y:bb.y+bb.h,
      orig:selEls().map(el=>structuredClone(el))};
  }
  else if(lh&&el&&isLineEl(el)){
    const E=lineEnds(el);
    const movingStart=lh.dataset.end==='1';
    drag={type:'lineEnd',el,movingStart,sx:e.clientX,sy:e.clientY,
      fixed:{x:el.x+(movingStart?E.x2:E.x1),y:el.y+(movingStart?E.y2:E.y1)},
      mx:el.x+(movingStart?E.x1:E.x2),my:el.y+(movingStart?E.y1:E.y2)};
  }else if(rh&&el){
    drag={type:'resize',dir:rh.dataset.dir,el,sx:e.clientX,sy:e.clientY,
      x:el.x,y:el.y,w:elSize(el).w,h:elSize(el).h,
      colW:el.colW&&[...el.colW],rowH:el.rowH&&[...el.rowH],
      origParas:el.paras&&structuredClone(el.paras),origCells:el.cells&&structuredClone(el.cells),   // 字級同步用
      origGraphic:el.type==='chart'&&el.option&&el.option.graphic&&structuredClone(el.option.graphic),
      free:e.altKey,   // 按住 Alt＝這一次拖曳強制解除等比鎖（要故意把圖拉扁時用）
      // 裁切模式：記下圖片此刻在畫布上的位置與尺寸，整段拖曳期間都以它為錨點
      imgFix:(APP.cropping===el.id)? (()=>{ const g=imgGeom(el,cropOf(el));
        return {ix:el.x+g.left,iy:el.y+g.top,dw:g.dw,dh:g.dh}; })() : null};
  /* 按下就先報現值，不必等拖動——欄寬列高是右側面板唯一查不到的尺寸，
     「先看到原本多少再決定要不要調」是這兩支把手獨有的需求（元素寬高在面板上一直看得到）。 */
  }else if(tch&&el){ drag={type:'tcol',el,i:+tch.dataset.i,sx:e.clientX,w:el.colW[+tch.dataset.i]};
    showDragTip(e,_t('欄 {0} 寬',drag.i+1),drag.w); }
  else if(trh&&el){ drag={type:'trow',el,i:+trh.dataset.i,sy:e.clientY,h:el.rowH[+trh.dataset.i]};
    showDragTip(e,_t('列 {0} 高',drag.i+1),drag.h); }
  else{
    let box=e.target.closest('.el');
    if(box){ const t0=curEls().find(x=>x.id===box.dataset.id); if(t0&&t0.locked) box=null; }  // 鎖定：畫布不可選拖，當作點空白
    if(box){
      const tel=curEls().find(x=>x.id===box.dataset.id);
      // Shift/Cmd 點擊：加入／移出多選（群組成員一起加減）
      if(e.shiftKey||e.metaKey||e.ctrlKey){
        const s=new Set(APP.selIds);
        const ids=groupMembers(tel).map(m=>m.id), has=s.has(tel.id);
        for(const id of ids){ has? s.delete(id) : s.add(id); }
        setSel([...s]); updateSelBox(); renderProps(); syncPageJson();
        return;
      }
      // 雙擊：編輯單一元素（群組／多選內也可進入編輯該成員）
      const now=performance.now();
      if(DBL.id===tel.id&&now-DBL.t<450&&Math.hypot(e.clientX-DBL.x,e.clientY-DBL.y)<8){
        DBL={id:null,t:0,x:0,y:0};
        e.preventDefault();   // 不擋的話，預設 mousedown 會把焦點搶去 body，編輯器開了就被 blur
        setSel([tel.id]); updateSelBox(); renderProps();
        openEditor(tel,e.target);
        return;
      }
      DBL={id:tel.id,t:now,x:e.clientX,y:e.clientY};
      // 已選取的表格：格內拖曳＝反白選格（PPT 式）；邊框帶（放寬 16px）＝移動整張表，落下走後面的 move
      if(tel.type==='table'&&APP.sel===tel.id&&!nearTableEdge(box,e.clientX,e.clientY)){
        const rc=cellRC(tel,e.clientX,e.clientY);
        if(rc){
          drag={type:'cellsel',el:tel,r0:rc.r,c0:rc.c};
          APP.cellSel=normalizeCellSel(tel,rc.r,rc.c,rc.r,rc.c);
          updateSelBox(); syncProps();   // 逐格設定（底色／字級／對齊）要跟著選到的格子走
          e.preventDefault();
          try{ stage.setPointerCapture(e.pointerId); }catch(err){}
          return;
        }
      }
      // 軟群組成員 → 選全組並整組移動
      if(tel.groupId){
        const ids=groupMembers(tel).map(m=>m.id);
        const same=APP.selIds.length===ids.length&&ids.every(id=>APP.selIds.includes(id));
        if(!same){ setSel(ids); updateSelBox(); renderProps(); syncPageJson(); }
        drag={type:'gmove',sx:e.clientX,sy:e.clientY,bb:groupBBox(selEls()),orig:selEls().map(el=>({id:el.id,x:el.x,y:el.y}))};
        e.preventDefault(); pendingUndo=snapshot();
        try{ stage.setPointerCapture(e.pointerId); }catch(err){}
        return;
      }
      // 已在多選內且直接拖 → 整組移動
      if(APP.selIds.length>1&&APP.selIds.includes(tel.id)){
        drag={type:'gmove',sx:e.clientX,sy:e.clientY,bb:groupBBox(selEls()),orig:selEls().map(el=>({id:el.id,x:el.x,y:el.y}))};
        e.preventDefault(); pendingUndo=snapshot();
        try{ stage.setPointerCapture(e.pointerId); }catch(err){}
        return;
      }
      if(APP.sel!==tel.id){ setSel([tel.id]); updateSelBox(); renderProps(); syncPageJson(); }
      drag={type:'move',el:tel,sx:e.clientX,sy:e.clientY,x:tel.x,y:tel.y};
    }else{
      // 空白區：框選（marquee）
      const r=stage.getBoundingClientRect();
      drag={type:'marquee',ox:(e.clientX-r.left)/APP.zoom,oy:(e.clientY-r.top)/APP.zoom,add:e.shiftKey,base:[...APP.selIds]};
      if(!e.shiftKey&&APP.selIds.length){ setSel([]); updateSelBox(); renderProps(); syncPageJson(); }
      e.preventDefault();
      try{ stage.setPointerCapture(e.pointerId); }catch(err){}
      return;
    }
  }
  e.preventDefault();
  pendingUndo=snapshot();
  try{ stage.setPointerCapture(e.pointerId); }catch(err){}
});
// 拖欄/列尺寸的懸浮數值（px 為內部單位；cm/pt 換算供對照，1px=1/96in）
let dragTip=null;
function showDragTipText(e,text){
  if(!dragTip){
    dragTip=document.createElement('div');
    dragTip.style.cssText='position:fixed;z-index:999;background:rgba(30,32,38,.92);color:#fff;font-size:11px;'
      +'padding:3px 7px;border-radius:4px;pointer-events:none;white-space:pre;'
      +'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.4;';
    document.body.appendChild(dragTip);
  }
  dragTip.textContent=text;
  dragTip.style.left=(e.clientX+14)+'px'; dragTip.style.top=(e.clientY+18)+'px';
  dragTip.style.display='block';
}
// 尺寸懸浮：多行時各欄右對齊、位數不足補空白（等寬字型），順序 px→pt→cm
function fmtDims(rows){   // rows: [[label,px],...]
  const cells=rows.map(([lab,px])=>{ const inch=px/96;
    return [String(lab), String(Math.round(px)), (inch*72).toFixed(1), (inch*2.54).toFixed(2)]; });
  const lw=Math.max(...cells.map(c=>[...c[0]].length));      // 標籤欄寬（以字數計）
  const w=[0,0,0]; cells.forEach(c=>{ for(let i=0;i<3;i++) w[i]=Math.max(w[i],c[i+1].length); });
  const padLab=s=>s+' '.repeat(Math.max(0,lw-[...s].length));
  return cells.map(c=>`${padLab(c[0])} ${c[1].padStart(w[0])}px ${c[2].padStart(w[1])}pt ${c[3].padStart(w[2])}cm`).join('\n');
}
function showDragTip(e,label,px){ showDragTipText(e,fmtDims([[label,px]])); }
function hideDragTip(){ if(dragTip) dragTip.style.display='none'; }
/* ================= 吸附 =================
   兩種來源：**輔助線**（投影片中線／邊界／預留區四邊，一直都在）與**格線**（要開才有）。
   容差用螢幕像素換算回畫布：不然縮到 30% 檢視時 6px 的容差在畫面上只有 2px，根本吸不到。 */
const SNAP_TOL=6;
function gridStep(){ const G=APP.grid; return (G.on&&G.snap&&G.size>0)? G.size : 0; }
/* 輔助線**優先於**格線：格線密到幾乎處處可吸（5mm 格在 65% 檢視下，容差已接近半格），
   若一視同仁比距離，離中線只差幾 px 的格線就會把「置中」整個吃掉，反而變成永遠對不到中線。
   輔助線只有寥寥數條且都有語意（中線／邊界／預留區），在容差內就該它贏。 */
function snapPick(v,cands,step){
  const tol=Math.min(12,SNAP_TOL/Math.max(APP.zoom,.05));   // 容差以螢幕像素為準（縮到 30% 時 6 畫布 px 在畫面上只有 2px，吸不到）
  let best=null, bd=tol;
  for(const c of cands){ const d=Math.abs(v-c); if(d<bd){ bd=d; best=c; } }
  if(best!=null) return best;
  if(step){ const g=Math.round(v/step)*step; if(Math.abs(v-g)<tol) return g; }
  return v;
}
/* 移動：候選值都是「元素左上角該落在哪」——含中線對中、貼邊、以及貼齊預留區外緣。
   格線刻意**只吸左緣與上緣**：四邊都吸的話，寬度不是格距整數倍的元素會在左右兩組
   吸附點之間反覆被拉走，拖起來像卡住（使用者原話：會很卡手）。 */
function snapMove(nx,ny,w,h){
  const zs=APP.deck.zones||[], step=gridStep();
  return {
    x:snapPick(nx,[(STAGE_W-w)/2,0,STAGE_W-w,...zs.flatMap(z=>[z.x-w,z.x+z.w])],step),
    y:snapPick(ny,[(STAGE_H-h)/2,0,STAGE_H-h,...zs.flatMap(z=>[z.y-h,z.y+z.h])],step),
  };
}
// 縮放：吸的是「邊本身的座標」，四邊都吸（拖把手時只有一兩條邊在動，不會互相拉扯）
function snapEdgeX(x){ const zs=APP.deck.zones||[];
  return snapPick(x,[0,STAGE_W/2,STAGE_W,...zs.flatMap(z=>[z.x,z.x+z.w])],gridStep()); }
function snapEdgeY(y){ const zs=APP.deck.zones||[];
  return snapPick(y,[0,STAGE_H/2,STAGE_H,...zs.flatMap(z=>[z.y,z.y+z.h])],gridStep()); }
/* 裁切模式的滾輪＝縮放（改可見區大小，中心不動）。passive:false 才擋得掉頁面捲動。
   1.08 每格：太大會跳過想要的構圖，太小則要滾很久。 */
stage.addEventListener('wheel',e=>{
  if(!APP.cropping) return;
  const el=curEls().find(x=>x.id===APP.cropping); if(!el) return;
  e.preventDefault();
  const n=cropNorm(el), [vw,vh]=cropScale(el,e.deltaY>0? 1.08 : 1/1.08);
  cropWrite(el,vw,vh,n.cx,n.cy);
  updateCropVisual(el);
},{passive:false});

stage.addEventListener('pointermove',e=>{
  if(!drag) return;
  if(pendingUndo){ commitUndo(pendingUndo); pendingUndo=null; }
  const dz=1/APP.zoom;
  const dx=(e.clientX-drag.sx)*dz, dy=(e.clientY-drag.sy)*dz;
  const el=drag.el;
  if(drag.type==='crop'){
    /* 平移裁切窗：拖曳距離要換成「佔原圖的比例」，除的是圖片在畫布上的完整顯示尺寸
       （el.w/vw），不是框寬——否則放大倍率愈高、手感愈飄。拖右＝看更左邊，故取負號。 */
    const n=drag.n, dw=el.w/n.vw, dh=el.h/n.vh;
    cropWrite(el,n.vw,n.vh,n.cx-dx/dw,n.cy-dy/dh);
    updateCropVisual(el);
  }else if(drag.type==='move'){
    const {w,h}=elSize(el), p=snapMove(drag.x+dx,drag.y+dy,w,h);
    el.x=Math.round(p.x); el.y=Math.round(p.y);
    updateElStyle(el);
  }else if(drag.type==='adj'){
    const {w,h}=elSize(el);
    // 指標 → 元素本地座標（含旋轉逆轉換：繞中心反轉 rot，黃點在旋轉後的形狀上仍拖得準）
    const r=stage.getBoundingClientRect();
    let lx=(e.clientX-r.left)/APP.zoom-el.x, ly=(e.clientY-r.top)/APP.zoom-el.y;
    if(el.rot){ const a=-el.rot*Math.PI/180, cx=lx-w/2, cy=ly-h/2;
      lx=w/2+cx*Math.cos(a)-cy*Math.sin(a); ly=h/2+cx*Math.sin(a)+cy*Math.cos(a); }
    // 翻轉：填色形狀的 SVG 是 CSS 鏡射、選取框沒鏡射，故 adj 要鏡射回未翻轉幾何；
    // 線條類的 flip 已烙進 lineEnds（無 CSS 鏡射），折點與座標直接對應，不鏡射
    if(!isLineEl(el)){ if(el.flipH) lx=w-lx; if(el.flipV) ly=h-ly; }
    applyAdjDot(el,adjDots(el)[drag.i],lx,ly,w,h);
    const box=stage.querySelector(`.el[data-id="${el.id}"]`); if(box) renderShapeInto(box,el);
    updateSelBox();
    {const bd=adjBounds(el.shape,w,h), A=adjVals(el);
     showDragTipText(e,A.map((v,i)=>bd[i].fixed?null:`${adjLabel(el.shape,i)} ${(v/1000).toFixed(1)}%`)
       .filter(Boolean).join(_t('｜')));}
  }else if(drag.type==='lineEnd'){
    let px=snapEdgeX(drag.mx+dx), py=snapEdgeY(drag.my+dy);   // 端點也吸格線，否則線條是全場唯一吸不到的東西
    if(Math.abs(px-drag.fixed.x)<8) px=drag.fixed.x;   // 貼齊垂直（優先於格線：拉水平／垂直線比對格更常用）
    if(Math.abs(py-drag.fixed.y)<8) py=drag.fixed.y;   // 貼齊水平
    const p1=drag.movingStart? {x:px,y:py}:drag.fixed;
    const p2=drag.movingStart? drag.fixed:{x:px,y:py};
    el.x=Math.round(Math.min(p1.x,p2.x)); el.y=Math.round(Math.min(p1.y,p2.y));
    el.w=Math.round(Math.abs(p2.x-p1.x)); el.h=Math.round(Math.abs(p2.y-p1.y));
    el.flipH=p1.x>p2.x; el.flipV=p1.y>p2.y;
    updateElStyle(el);
  }else if(drag.type==='gmove'){
    /* 整組移動也吸附，吸的是**群組包圍盒**的左上角，再把修正量平均分回每個成員——
       逐個成員各吸各的會把相對位置拆散，那就不叫「整組」移動了。
       bb 在 pointerdown 就算好並存進 drag：拖曳中重算會拿到已被自己移動過的位置，愈拖愈偏。 */
    const bb=drag.bb, p=snapMove(bb.x+dx,bb.y+dy,bb.w,bb.h);
    const ax=p.x-bb.x, ay=p.y-bb.y;
    for(const o of drag.orig){ const t=curEls().find(x=>x.id===o.id); if(!t)continue; t.x=Math.round(o.x+ax); t.y=Math.round(o.y+ay); updateElStyle(t); }
    updateSelBox(); checkZones();
  }else if(drag.type==='gresize'){
    /* 群組把手是等比縮放，只有一個比例，兩軸不可能同時落在格線上。
       改取「指標移動較多的那一軸」為準（原本是兩軸平均），那一邊才真的吸得到格線；
       另一邊由群組原本的長寬比決定。平均法會讓兩邊都落在格線之間，等於吸了個寂寞。 */
    const nx=snapEdgeX(drag.ox+dx), ny=snapEdgeY(drag.oy+dy);
    const sx=Math.abs(nx-drag.anchor.x)/(Math.abs(drag.ox-drag.anchor.x)||1);
    const sy=Math.abs(ny-drag.anchor.y)/(Math.abs(drag.oy-drag.anchor.y)||1);
    groupScaleTo(drag,Math.max(.05, Math.abs(dx)>=Math.abs(dy)? sx : sy));
    const bb=groupBBox(selEls());
    showDragTipText(e,fmtDims([[_t('寬'),bb.w],[_t('高'),bb.h]]));
  }else if(drag.type==='marquee'){
    const r=stage.getBoundingClientRect();
    const cx=(e.clientX-r.left)/APP.zoom, cy=(e.clientY-r.top)/APP.zoom;
    let m=$('#marquee'); if(!m){ m=document.createElement('div'); m.id='marquee'; stage.appendChild(m); }
    const x=Math.min(drag.ox,cx),y=Math.min(drag.oy,cy),w=Math.abs(cx-drag.ox),h=Math.abs(cy-drag.oy);
    m.style.left=x+'px'; m.style.top=y+'px'; m.style.width=w+'px'; m.style.height=h+'px';
    drag.rect={x,y,w,h};
  }else if(drag.type==='resize'){
    resizeBy(el,drag,dx,dy);
    // 裁切模式下拉框＝只動窗口，圖片釘在原地（PowerPoint 的裁切手感）
    if(drag.imgFix){ cropFromFixedImage(el,drag.imgFix); updateElStyle(el); updateCropVisual(el); }
    const {w,h}=elSize(el);
    showDragTipText(e,fmtDims([[_t('寬'),w],[_t('高'),h]]));
  }else if(drag.type==='tcol'){
    // 吸的是這一欄的右邊界在畫布上的絕對位置（欄寬本身跟格線無關，對齊的是那條分隔線）
    const left=el.x+el.colW.slice(0,drag.i).reduce((a,b)=>a+b,0);
    el.colW[drag.i]=Math.max(16,Math.round(snapEdgeX(left+drag.w+dx)-left));
    const box=stage.querySelector(`.el[data-id="${el.id}"]`);
    renderTableInto(box,el); updateSelBox(); checkZones();
    showDragTip(e,_t('欄 {0} 寬',drag.i+1),el.colW[drag.i]);
  }else if(drag.type==='trow'){
    const top=el.y+el.rowH.slice(0,drag.i).reduce((a,b)=>a+b,0);
    el.rowH[drag.i]=Math.max(12,Math.round(snapEdgeY(top+drag.h+dy)-top));
    const box=stage.querySelector(`.el[data-id="${el.id}"]`);
    renderTableInto(box,el); updateSelBox(); checkZones();
    showDragTip(e,_t('列 {0} 高',drag.i+1),el.rowH[drag.i]);
  }else if(drag.type==='cellsel'){
    const rc=cellRC(el,e.clientX,e.clientY);
    if(rc){ APP.cellSel=normalizeCellSel(el,drag.r0,drag.c0,rc.r,rc.c); paintCellSel(el); syncProps(); }
  }
});
stage.addEventListener('pointerup',()=>{
  hideDragTip();
  if(!drag) return;
  if(drag.type==='marquee'){
    const m=$('#marquee'); if(m) m.remove();
    if(drag.rect&&(drag.rect.w>3||drag.rect.h>3)){
      const hit=curEls().filter(el=>{ const {w,h}=elSize(el); return rectHit({x:el.x,y:el.y,w,h},drag.rect); }).map(el=>el.id);
      setSel(drag.add? [...drag.base,...hit] : hit);
      updateSelBox(); renderProps(); syncPageJson();
    }
    drag=null; return;
  }
  drag=null; pendingUndo=null; renderAll();
});
/* ---- 縮放時的儲存格字級 ----
   儲存格的字級有**兩層**：格層級 `cell.sizePt`，以及格內混排時 run 自帶的 `sizePt`。
   `cellRuns()` 的取值規則是「run 有寫就用 run 的，沒寫就用格的」——跟 CSS 繼承一樣，
   **有寫的 run 對格層級的改動免疫**。所以只乘格層級的話，寫了字級的那幾個字會卡在原大小，
   其他字縮小後它相對就變大（12pt 正文縮成 6pt 而 8pt 註記不動）。兩層同乘一個倍率才守得住比例。

   `sub`/`sup` 的 0.7 不在此列：那是渲染時才乘的（見 runSpan），資料層仍只有一個字級數字。
   段落那條路（`o.paras`／`d.origParas`）本來就是逐 run 乘的，這裡是補齊表格漏掉的同一件事。

   順帶解掉淺複製的隱患：`{...c}` 會讓新 cells 與 undo 快照共用同一個 runs 陣列與 run 物件，
   往後誰要就地改 run 就會改到快照。這裡 runs 一律產生新物件。
   （`cell.border` 仍與快照共用——縮放不動它，但**不要原地改它**。） */
function scaleCellPt(c,f){
  const pt=v=> v? Math.max(4,round1(v*f)) : v;
  const o={...c,sizePt:pt(c.sizePt)};
  if(Array.isArray(c.runs)) o.runs=c.runs.map(r=> r.sizePt!=null? {...r,sizePt:pt(r.sizePt)} : {...r});
  return o;
}
/* ---- 圖表 option.graphic 的座標縮放 ----
   graphic 用的是圖表容器的像素座標（grid／series 是百分比，只有它不是），
   所以圖表元素改尺寸時，畫在上面的自由圖層不會跟著動——先前只能靠「改尺寸就重新產生」的紀律。
   一律從原始快照重算（與字級同步同一套作法），連續拖曳才不會累積浮點誤差。 */
const GFX_X=new Set(['x','x1','x2','cx','cpx1','cpx2','width','left','right']);
const GFX_Y=new Set(['y','y1','y2','cy','cpy1','cpy2','height','top','bottom']);
// 半徑、線寬、字級沒有「兩個軸」可言——ECharts 的 text 也無法非等比拉伸，取小的那個比例
const GFX_ISO=new Set(['r','r0','lineWidth','fontSize','borderWidth']);
function scaleGraphic(node,sx,sy,st){
  st=st||{n:0};
  if(Array.isArray(node)){ node.forEach(c=>scaleGraphic(c,sx,sy,st)); return st; }
  if(!node||typeof node!=='object') return st;
  const iso=Math.min(sx,sy);
  for(const k in node){
    const v=node[k];
    if(k==='points'&&Array.isArray(v)){
      for(const p of v) if(Array.isArray(p)&&p.length>=2&&isFinite(p[0])&&isFinite(p[1])){ p[0]*=sx; p[1]*=sy; st.n++; }
      continue;
    }
    if(typeof v==='number'&&isFinite(v)){
      // left:'center'／top:'10%' 這種字串定位不在這裡處理，typeof 已經濾掉
      if(GFX_X.has(k)){ node[k]=v*sx; st.n++; }
      else if(GFX_Y.has(k)){ node[k]=v*sy; st.n++; }
      else if(GFX_ISO.has(k)){ node[k]=v*iso; st.n++; }
      continue;
    }
    if(v&&typeof v==='object') scaleGraphic(v,sx,sy,st);
  }
  return st;
}
// 從快照重算某個圖表元素的 graphic。orig 是縮放前的 option.graphic
function applyGraphicScale(el,origGraphic,sx,sy){
  if(el.type!=='chart'||!origGraphic||!(sx>0)||!(sy>0)) return;
  el.option=el.option||{};
  el.option.graphic=structuredClone(origGraphic);
  scaleGraphic(el.option.graphic,sx,sy);
}
// 群組比例縮放：從原始快照重算，避免累積誤差。d.scaleFont===false 時字級/欄列僅縮幾何、字級不動
function groupScaleTo(d,s){ groupScaleXY(d,s,s); }   // 等比是不等比的特例，實作只留一份
/* 群組縮放：以 anchor 為不動點，x/w 乘 sx、y/h 乘 sy。
   字級與線寬沒有「兩個軸」可言，用面積開根當單一比例——與單一元素 resizeBy 的 factor 同一套算法，
   兩條路徑縮同一個東西才會得到同樣的字級。*/
function groupScaleXY(d,sx,sy){
  const a=d.anchor, sf=d.scaleFont!==false, s=Math.sqrt(Math.abs(sx*sy))||1;
  const fpt=v=>v?Math.max(4,round1(v*s)):v;   // 字級縮放（sf 才用）
  for(const o of d.orig){
    const el=curEls().find(e=>e.id===o.id); if(!el) continue;
    el.x=Math.round(a.x+(o.x-a.x)*sx);
    el.y=Math.round(a.y+(o.y-a.y)*sy);
    if(o.type==='table'){
      el.colW=o.colW.map(w=>Math.max(8,Math.round(w*sx)));
      el.rowH=o.rowH.map(h=>Math.max(8,Math.round(h*sy)));
      el.cells=o.cells.map(r=>r.map(c=> sf? scaleCellPt(c,s) : {...c}));
    }else{
      el.w=Math.max(4,Math.round(o.w*sx)); el.h=Math.max(0,Math.round(o.h*sy));
      if(o.type==='chart'&&o.option&&o.option.graphic)
        applyGraphicScale(el,o.option.graphic,el.w/o.w,el.h/o.h);
    }
    if(o.paras) el.paras=o.paras.map(p=>({...p,runs:p.runs.map(r=>({...r,sizePt:sf?fpt(r.sizePt):r.sizePt}))}));
    if(o.linePt!=null) el.linePt=round1(o.linePt*s);
  }
  renderStage();
}
function resizeBy(el,d,dx,dy){
  const dir=d.dir;
  const rot=(el.rot||0)*Math.PI/180;   // 表格不旋轉→rot=0，公式自動退化為原行為
  // 螢幕位移 → 元素本地座標（未旋轉框）
  let ldx= dx*Math.cos(rot)+dy*Math.sin(rot);
  let ldy=-dx*Math.sin(rot)+dy*Math.cos(rot);
  /* 吸附：把「正在移動的那條邊」吸到格線／輔助線，再回推成位移量。
     只在未旋轉時做——旋轉後元素的邊不再與格線平行，吸了也對不齊，反而讓手感失準。
     等比鎖定時同樣跳過：吸完 x 再由長寬比推 y，兩邊都不會落在格線上，等於白吸一場。 */
  // 圖片一律鎖；其餘看 APP.ratioLock（線條除外）。裁切模式拉的是窗口、Alt 是明示要自由變形，兩者都放開
  const lockAR= !d.free && APP.cropping!==el.id
    && (imgLocked(el) || (APP.ratioLock && !isLineEl(el)));
  if(!rot&&!lockAR){
    if(dir.includes('e')) ldx=snapEdgeX(d.x+d.w+ldx)-(d.x+d.w);
    if(dir.includes('w')) ldx=snapEdgeX(d.x+ldx)-d.x;
    if(dir.includes('s')) ldy=snapEdgeY(d.y+d.h+ldy)-(d.y+d.h);
    if(dir.includes('n')) ldy=snapEdgeY(d.y+ldy)-d.y;
  }
  let w=d.w,h=d.h,signX=0,signY=0;     // signX/Y：固定角相對中心的方向
  if(dir.includes('e')){ w=d.w+ldx; signX=-1; }
  if(dir.includes('w')){ w=d.w-ldx; signX=+1; }
  if(dir.includes('s')){ h=d.h+ldy; signY=-1; }
  if(dir.includes('n')){ h=d.h-ldy; signY=+1; }
  if(lockAR && d.w>0 && d.h>0){ const ar=d.w/d.h; if(Math.abs(ldx)>=Math.abs(ldy)) h=w/ar; else w=h*ar; }
  const MINW=16,MINH= isLineEl(el)? 0:12;
  w=Math.max(MINW,w); h=Math.max(MINH,h);
  // 字級同步（resize 用 APP.fontSync；面積開根當統一比例，從 orig 重算避免累積誤差）
  const factor=(d.w>0&&d.h>0)? Math.sqrt((w*h)/(d.w*d.h)) : 1;
  const syncFont=APP.fontSync;
  // 依旋轉把「固定角」鎖在螢幕原位，回推未旋轉左上角（rot=0 時等同原本的邊鎖定）
  const cx0=d.x+d.w/2, cy0=d.y+d.h/2;
  const R=(vx,vy)=>({x:vx*Math.cos(rot)-vy*Math.sin(rot), y:vx*Math.sin(rot)+vy*Math.cos(rot)});
  const foOld=R(signX*d.w/2, signY*d.h/2), foNew=R(signX*w/2, signY*h/2);
  const nx=(cx0+foOld.x)-foNew.x - w/2, ny=(cy0+foOld.y)-foNew.y - h/2;
  if(el.type==='table'){
    const fw=w/d.w, fh=h/d.h;
    el.colW=d.colW.map(v=>Math.max(16,Math.round(v*fw)));
    el.rowH=d.rowH.map(v=>Math.max(12,Math.round(v*fh)));
    if(syncFont&&d.origCells) el.cells=d.origCells.map(r=>r.map(c=>scaleCellPt(c,factor)));
    el.x=Math.round(nx); el.y=Math.round(ny);
    const box=stage.querySelector(`.el[data-id="${el.id}"]`);
    box.style.left=el.x+'px'; box.style.top=el.y+'px';
    renderTableInto(box,el); updateSelBox(); checkZones();
    return;
  }
  if(syncFont&&d.origParas) el.paras=d.origParas.map(p=>({...p,runs:p.runs.map(r=>({...r,sizePt:r.sizePt?Math.max(4,round1(r.sizePt*factor)):r.sizePt}))}));
  el.x=Math.round(nx); el.y=Math.round(ny); el.w=Math.round(w); el.h=Math.round(h);
  if(d.origGraphic) applyGraphicScale(el,d.origGraphic,el.w/d.w,el.h/d.h);
  updateElStyle(el);
}

/* 雙擊編輯（備援路徑；主要靠 pointerdown 的手動偵測，原生 dblclick 會被 preventDefault 吃掉） */
stage.addEventListener('dblclick',e=>{
  const box=e.target.closest('.el');
  if(!box||APP.editing||APP.painter) return;
  const el=curEls().find(x=>x.id===box.dataset.id);
  if(!el||el.locked) return;
  setSel([el.id]);
  openEditor(el,e.target);
});
function editableDiv(){
  const ed=document.createElement('div');
  try{ ed.contentEditable='plaintext-only'; }catch(err){}
  if(ed.contentEditable!=='plaintext-only') ed.contentEditable='true';
  return ed;
}
