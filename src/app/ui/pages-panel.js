'use strict';
/* ================= 頁面面板 ================= */
const PANEL_DRAG={item:null,order:null};
const THUMB_BG=new Map();   // 背景圖 dataUrl → Image（縮圖非同步繪製用，載完重畫一次）
// 圖表縮圖：el.id → {sig, cv}。sig 含尺寸與 option，任一改動即失效重畫。
// 快取是必要的而非最佳化——drawThumb 每次 renderAll 都會對每一頁跑一遍，
// 沒快取就等於每次重繪都 init 一次 ECharts。
const THUMB_CHART=new Map();
function chartThumbCanvas(el){
  const sig=el.w+'|'+el.h+'|'+JSON.stringify(el.option);
  const hit=THUMB_CHART.get(el.id);
  if(hit&&hit.sig===sig) return hit.cv;
  // 以元素原尺寸離屏渲染再由 drawImage 縮小，視覺才與畫布等比一致。
  // 直接用縮圖尺寸渲染的話，option 內的 fontSize 是絕對值，小圖上會佔滿整張。
  const div=document.createElement('div');
  div.style.cssText=`position:fixed;left:-10000px;top:0;width:${el.w}px;height:${el.h}px;`;
  document.body.appendChild(div);
  let out=null;
  try{
    const inst=echarts.init(div,null,{renderer:'canvas'});
    inst.setOption(Object.assign(structuredClone(el.option),{animation:false}),true);
    // 取 ECharts 自己的 canvas 拷一份：dispose() 會把 DOM 連同 canvas 清掉，
    // 而 getDataURL() 回傳的字串要再經 Image 非同步解碼，縮圖就得等一輪。
    const src=div.querySelector('canvas');
    if(src&&src.width&&src.height){
      out=document.createElement('canvas'); out.width=src.width; out.height=src.height;
      out.getContext('2d').drawImage(src,0,0);
    }
    inst.dispose();
  }catch(e){ out=null; }   // option 壞掉時退回色塊，不讓縮圖列整個掛掉
  div.remove();
  THUMB_CHART.set(el.id,{sig,cv:out});
  return out;
}
function drawThumb(cv,pg){
  const ctx=cv.getContext('2d'); const s=cv.width/STAGE_W;
  ctx.fillStyle='#'+(pg.bg||'FFFFFF'); ctx.fillRect(0,0,cv.width,cv.height);
  if(pg.bgImage){
    let im=THUMB_BG.get(pg.bgImage);
    if(!im){ im=new Image(); im.src=pg.bgImage; THUMB_BG.set(pg.bgImage,im);
      im.onload=()=>{ if(cv.isConnected) drawThumb(cv,pg); }; }
    if(im.complete&&im.naturalWidth) ctx.drawImage(im,0,0,cv.width,cv.height);
  }
  // 縮圖也要墊母版，否則縮圖與畫布長得不一樣
  for(const el of [...((masterOn()&&!pg.noMaster)? masterEls():[]), ...pg.elements]){
    if(el.hidden) continue;
    const {w,h}= el.type==='table'? {w:el.colW.reduce((a,b)=>a+b,0),h:el.rowH.reduce((a,b)=>a+b,0)} : el;
    const x=el.x*s,y=el.y*s,ww=Math.max(2,w*s),hh=Math.max(2,h*s);
    // 縮圖的漸層：只有線性有意義（放射狀在幾十像素內看不出差別，退回第一個色標）
    const thumbFill=()=>{ const g=el.grad;
      if(!g) return null;
      if(g.type==='radial') return '#'+g.stops[0].color;
      const a=g.angle*Math.PI/180, dx=Math.cos(a)*ww/2, dy=Math.sin(a)*hh/2;
      const lg=ctx.createLinearGradient(x+ww/2-dx,y+hh/2-dy,x+ww/2+dx,y+hh/2+dy);
      for(const st of g.stops) lg.addColorStop(Math.max(0,Math.min(1,st.pos/100)),'#'+st.color);
      return lg; };
    if(el.type==='text'){
      const g=thumbFill();
      if(g){ ctx.fillStyle=g; ctx.fillRect(x,y,ww,hh); }
      ctx.fillStyle='rgba(60,70,90,.55)'; ctx.fillRect(x,y+hh*.2,ww*.8,Math.max(1.5,hh*.18)); }
    else if(el.type==='table'){
      ctx.strokeStyle='rgba(60,60,60,.5)'; ctx.lineWidth=.5; ctx.strokeRect(x,y,ww,hh);
      let ax=x; ctx.beginPath();
      for(const cw of el.colW){ ax+=cw*s; ctx.moveTo(ax,y); ctx.lineTo(ax,y+hh); }
      let ay=y; for(const rh of el.rowH){ ay+=rh*s; ctx.moveTo(x,ay); ctx.lineTo(x+ww,ay); }
      ctx.stroke();
    }
    else if(el.type==='image'){ ctx.fillStyle='rgba(150,150,150,.5)'; ctx.fillRect(x,y,ww,hh); }
    else if(el.type==='chart'){
      const cc=chartThumbCanvas(el);
      if(cc) ctx.drawImage(cc,x,y,ww,hh);
      else { ctx.fillStyle='rgba(77,157,224,.35)'; ctx.fillRect(x,y,ww,hh); }
    }
    else if(el.type==='video'){ ctx.fillStyle='rgba(40,44,52,.75)'; ctx.fillRect(x,y,ww,hh);
      ctx.fillStyle='rgba(255,255,255,.8)'; ctx.beginPath();
      const cx=x+ww/2,cy=y+hh/2,r=Math.min(ww,hh)*.22;
      ctx.moveTo(cx-r*.5,cy-r); ctx.lineTo(cx+r*.7,cy); ctx.lineTo(cx-r*.5,cy+r); ctx.fill(); }
    else if(el.type==='shape'){
      ctx.fillStyle=thumbFill()||(el.fill?'#'+el.fill:'rgba(120,120,120,.3)');
      if(LINE_KINDS[el.shape]){ ctx.strokeStyle='#'+(el.lineColor||'333'); ctx.beginPath();
        const fx=el.flipH?1:0, fy=el.flipV?1:0;
        ctx.moveTo(x+fx*ww,y+fy*hh); ctx.lineTo(x+(1-fx)*ww,y+(1-fy)*hh); ctx.stroke(); }
      else if(el.shape==='ellipse'){ ctx.beginPath(); ctx.ellipse(x+ww/2,y+hh/2,ww/2,hh/2,0,0,7); ctx.fill(); }
      else ctx.fillRect(x,y,ww,hh);
    }
  }
}
function renderPanel(){
  const panel=$('#pagePanel'); panel.innerHTML='';
  // 圖表縮圖快取的回收：刪頁或刪元素之後，那些 canvas 不該永久留著
  if(THUMB_CHART.size){
    const live=new Set();
    for(const el of [...APP.deck.pages.flatMap(p=>p.elements), ...((APP.deck.master&&APP.deck.master.elements)||[])])
      if(el.type==='chart') live.add(el.id);
    for(const k of [...THUMB_CHART.keys()]) if(!live.has(k)) THUMB_CHART.delete(k);
  }
  APP.deck.pages.forEach((pg,idx)=>{
    // 章節起點：在該頁縮圖上方插一條標題列（比照 PowerPoint 縮圖窗格的章節分隔）
    if(pg.section){
      const sb=document.createElement('div'); sb.className='secBar';
      sb.textContent='▸ '+pg.section;
      sb.title=_t('章節「{0}」從第 {1} 頁開始（匯出為 PowerPoint 章節）',pg.section,idx+1);
      panel.appendChild(sb);
    }
    const item=document.createElement('div'); item.className='pageItem'; item.dataset.pid=pg.id;
    if(pg.id===APP.page) item.classList.add('active');
    if(pg.skip) item.classList.add('skip');
    const cv=document.createElement('canvas'); cv.width=132; cv.height=Math.max(24,Math.round(132*STAGE_H/STAGE_W));
    drawThumb(cv,pg);
    const meta=document.createElement('div'); meta.className='pageMeta';
    const nm=document.createElement('div'); nm.className='pageName'; nm.textContent=pg.name||_t('頁 {0}',idx+1);
    const num=document.createElement('span'); num.className='pageNum'; num.textContent=idx+1;
    meta.appendChild(nm); meta.appendChild(num);
    item.appendChild(cv); item.appendChild(meta);
    const dup=document.createElement('div'); dup.className='pageDup'; dup.textContent='⧉'; dup.title=_t('複製此頁（元素 id 保留，供日後 Morph 配對）');
    dup.onclick=e=>{ e.stopPropagation(); commitUndo();
      const cp=structuredClone(pg); cp.id=uid('p');   // 頁 id 換新；元素 id 刻意保留
      APP.deck.pages.splice(idx+1,0,cp); setPage(cp.id); };
    item.appendChild(dup);
    const del=document.createElement('div'); del.className='pageDel'; del.textContent='×'; del.title=_t('刪除此頁（可復原）');
    del.onclick=e=>{ e.stopPropagation();
      if(APP.deck.pages.length<=1) return;
      commitUndo();
      APP.deck.pages.splice(idx,1);
      if(APP.page===pg.id) APP.page=APP.deck.pages[Math.max(0,idx-1)].id;
      setSel([]); renderAll(); };
    item.appendChild(del);
    item.onclick=()=>{ if(APP.masterEdit) setMasterEdit(false);   // 點頁面就是要回去看頁面，不必先按「完成」
      if(pg.id!==APP.page) setPage(pg.id); };
    item.draggable=true;
    item.addEventListener('dragstart',e=>{ PANEL_DRAG.item=item; PANEL_DRAG.order=APP.deck.pages.map(p=>p.id); e.dataTransfer.effectAllowed='move'; });
    item.addEventListener('dragover',e=>{
      e.preventDefault();
      if(!PANEL_DRAG.item||PANEL_DRAG.item===item) return;
      const r=item.getBoundingClientRect();
      panel.insertBefore(PANEL_DRAG.item, e.clientY<r.top+r.height/2? item : item.nextSibling);
    });
    item.addEventListener('dragend',()=>{
      if(!PANEL_DRAG.item) return;
      const now=[...panel.querySelectorAll('.pageItem')].map(d=>d.dataset.pid);
      if(JSON.stringify(now)!==JSON.stringify(PANEL_DRAG.order)){
        commitUndo();
        APP.deck.pages.sort((a,b)=>now.indexOf(a.id)-now.indexOf(b.id));
      }
      PANEL_DRAG.item=null; renderAll();
    });
    panel.appendChild(item);
  });
  const add=document.createElement('button'); add.id='btnAddPage'; add.textContent=_t('＋ 新頁');
  add.onclick=()=>{ commitUndo(); const pg=newPage(); APP.deck.pages.push(pg); setPage(pg.id); };
  panel.appendChild(add);
  renderMasterSlot();
}
/* 母版入口（頁面欄底部，比照 PowerPoint 的投影片母版擺在檢視層級）。
   三種狀態共用一個按鈕：沒啟用→一按同時啟用並進去；啟用了→進去編輯；正在編輯→按了出來。
   舊版把入口埋在「右欄 → 頁面 → 母版 → 啟用 → 編輯」五層底下，等於沒有入口。 */
function renderMasterSlot(){
  const slot=$('#masterSlot'); if(!slot) return;
  slot.innerHTML='';
  const on=masterOn(), editing=!!APP.masterEdit;
  const b=document.createElement('button'); b.type='button'; b.className='masterItem';
  if(editing) b.classList.add('on');
  if(!on) b.classList.add('off');
  if(on){
    const cv=document.createElement('canvas');
    cv.width=132; cv.height=Math.max(24,Math.round(132*STAGE_H/STAGE_W));
    // noMaster:true 是必要的——drawThumb 會替一般頁墊母版，母版自己再墊一次就畫兩遍
    drawThumb(cv,{elements:masterEls(),noMaster:true});
    b.appendChild(cv);
    if(!masterEls().length) b.classList.add('empty');
  }
  const lb=document.createElement('div'); lb.className='mtLabel';
  lb.innerHTML='<svg class="ic"><use href="#ic-master"/></svg><span>'
    +(editing?_t('完成編輯'):(on?_t('母版'):_t('＋ 母版')))+'</span>';   // 欄寬只有 158px，長標題會頂到邊；完整說法在畫布下方的母版列
  b.appendChild(lb);
  b.title= editing? _t('離開母版編輯，回到原本那一頁')
    : on? _t('編輯母版：畫布只顯示母版元素，一般工具全部照用')
        : _t('啟用母版並開始編輯：把 Logo／頁尾等每頁都要的東西放在一份「信紙」上，改一次全部頁面跟著變');
  b.onclick=()=>{
    if(editing){ setMasterEdit(false); return; }
    if(!on){ commitUndo(); masterEls(); APP.deck.master.on=true; }   // 未啟用時一按到底，不讓人再去右欄找開關
    setMasterEdit(true);
    syncMelBtn();
  };
  slot.appendChild(b);
}
function setPage(pid){
  if(!$('#chartModal').hidden) closeChartModal();   // 面板編輯的是原頁的圖表，換頁就失去意義
  APP.page=pid; setSel([]); APP.editing=null; APP.edit=null; renderAll(); syncPageJson(); }
// 進出「編輯母版」。清乾淨編輯狀態再切，否則文字編輯游標會殘留在已經不在畫布上的元素
function setMasterEdit(on){
  APP.masterEdit=!!on;
  if(APP.masterEdit) masterEls();   // 首次進入時把 deck.master 建起來
  APP.edit=null; APP.editing=null; APP.cellSel=null; APP.cellEdit=null; setSel([]);
  document.body.classList.toggle('masterEdit',APP.masterEdit);
  renderAll(); syncPageJson();
}

