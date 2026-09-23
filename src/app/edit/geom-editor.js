'use strict';
/* ================= 圖形編輯器（自訂幾何） =================
   custGeom 的 points 是「資料」，這一節是它的「畫法」。編輯器內部不直接改 points，
   改用節點模型：一個錨點 {x,y,hIn,hOut}，兩支控制柄各自可為 null（該側是直線）。
   原因是 points 把曲線資訊掛在「終點」上（x1,y1 其實是前一點的出柄），拖一個點要同時
   改前後兩筆，容易寫錯；節點模型一個點就是一個物件，拖曳／增刪／直曲互換都只動一處。
   ⚠ 轉入時 quadratic 折成 cubic（數學上完全等價），arc 折成每 90° 一段的 cubic
   （標準 α=4/3·tan(Δ/4) 近似）。折了就回不去圓弧，所以開啟前會先問過使用者。 */
const GEO={open:false,el:null,subs:[],cur:null,tool:'pen',sel:null,drag:null,
           W:100,H:100,S:1,PAD:16,undo:[],redo:[],svg:null,rubber:null};
const gR=v=>Math.round(v*100)/100;      // 座標存到小數兩位（路徑空間單位≈px）
const gX=v=>GEO.PAD+v*GEO.S, gY=v=>GEO.PAD+v*GEO.S;   // 路徑座標 → 編輯器螢幕座標
const gXY=n=>[n.x,n.y];
// 二次貝茲 → 三次貝茲（等價轉換，非近似）
const q2c=(p0,q,p1)=>[[p0[0]+2/3*(q[0]-p0[0]),p0[1]+2/3*(q[1]-p0[1])],
                      [p1[0]+2/3*(q[0]-p1[0]),p1[1]+2/3*(q[1]-p1[1])]];
// 圓弧 → 三次貝茲段。角度慣例與 arcSeg 完全相同（真實幾何角，非橢圓參數角），
// 一段最多 90°；α 用參數角空間的差值算，90° 段的最大半徑誤差約萬分之三
function arcToCubics(cur,wR,hR,st,sw,out){
  const par=a=>Math.atan2(wR*Math.sin(a*D2R),hR*Math.cos(a*D2R));
  let ph=par(st);
  const cx=cur[0]-wR*Math.cos(ph), cy=cur[1]-hR*Math.sin(ph);
  const P=p=>[cx+wR*Math.cos(p),cy+hR*Math.sin(p)];
  const T=p=>[-wR*Math.sin(p),hR*Math.cos(p)];
  let rest=sw, a=st, guard=0;
  while(Math.abs(rest)>1e-6&&guard++<64){
    const step=(rest>0?1:-1)*Math.min(Math.abs(rest),90*OOX_DEG);
    a+=step; rest-=step;
    let p2=par(a);
    // atan2 的值域是 (−π,π]，跨象限會跳；沿掃掠方向展開回連續值
    if(step>0){ while(p2<=ph) p2+=2*Math.PI; } else { while(p2>=ph) p2-=2*Math.PI; }
    const al=4/3*Math.tan((p2-ph)/4), A=P(ph), B=P(p2), TA=T(ph), TB=T(p2);
    out.push({x:B[0],y:B[1],h1:[A[0]+al*TA[0],A[1]+al*TA[1]],h2:[B[0]-al*TB[0],B[1]-al*TB[1]]});
    cur[0]=B[0]; cur[1]=B[1]; ph=p2;
  }
}
// points 陣列 → 節點模型。回傳 lossy＝有圓弧被折成貝茲（要提示使用者）
function pointsToSubs(pts){
  const subs=[]; let sub=null, cur=[0,0], lossy=false;
  for(const pt of (pts||[])){
    if(pt.close){ if(sub) sub.closed=true; sub=null; continue; }
    const x=+pt.x||0, y=+pt.y||0, c=pt.curve;
    if(!sub||pt.moveTo){ sub={nodes:[{x,y,hIn:null,hOut:null}],closed:false}; subs.push(sub); cur=[x,y]; continue; }
    const prev=sub.nodes[sub.nodes.length-1];
    if(c&&c.type==='cubic'){
      prev.hOut=[+c.x1||0,+c.y1||0];
      sub.nodes.push({x,y,hIn:[+c.x2||0,+c.y2||0],hOut:null}); cur=[x,y];
    }else if(c&&c.type==='quadratic'){
      const hh=q2c(cur,[+c.x1||0,+c.y1||0],[x,y]);
      prev.hOut=hh[0]; sub.nodes.push({x,y,hIn:hh[1],hOut:null}); cur=[x,y];
    }else if(c&&c.type==='arc'){
      const segs=[]; arcToCubics(cur,+c.wR||0,+c.hR||0,+c.stAng||0,+c.swAng||0,segs);
      if(segs.length) lossy=true;
      let p=prev;
      for(const s of segs){ p.hOut=s.h1; const n={x:s.x,y:s.y,hIn:s.h2,hOut:null}; sub.nodes.push(n); p=n; }
      // cur 已由 arcToCubics 就地更新成弧的終點（pt.x/pt.y 對 arc 段無意義）
    }else{ sub.nodes.push({x,y,hIn:null,hOut:null}); cur=[x,y]; }
  }
  // 閉合子路徑裡「繞回起點」的那個重合節點，吸收成起點的 hIn，讓閉合段也能是曲線
  for(const s of subs){
    if(!s.closed||s.nodes.length<3) continue;
    const f=s.nodes[0], l=s.nodes[s.nodes.length-1];
    if(Math.abs(l.x-f.x)<0.01&&Math.abs(l.y-f.y)<0.01&&!l.hOut){ f.hIn=l.hIn; s.nodes.pop(); }
  }
  return {subs,lossy};
}
// 節點模型 → points 陣列（只產出 moveTo／直線／cubic／close 四種）
const gPt=(a,b)=>{ const p={x:gR(b.x),y:gR(b.y)};
  if(a.hOut||b.hIn){ const o=a.hOut||gXY(a), i=b.hIn||gXY(b);
    p.curve={type:'cubic',x1:gR(o[0]),y1:gR(o[1]),x2:gR(i[0]),y2:gR(i[1])}; }
  return p; };
function subsToPoints(subs){
  const out=[];
  for(const s of subs){
    const n=s.nodes; if(n.length<2) continue;
    out.push({x:gR(n[0].x),y:gR(n[0].y),moveTo:true});
    for(let i=1;i<n.length;i++) out.push(gPt(n[i-1],n[i]));
    if(s.closed){
      const last=n[n.length-1];
      if(last.hOut||n[0].hIn) out.push(gPt(last,n[0]));   // 閉合段是曲線才需明寫，直線交給 Z
      out.push({close:true});
    }
  }
  return out;
}
// 節點模型 → SVG d。X/Y 省略時輸出路徑座標，帶入 gX/gY 則是編輯器螢幕座標
const gSegD=(a,b,X,Y)=>{ X=X||(v=>v); Y=Y||(v=>v);
  if(a.hOut||b.hIn){ const o=a.hOut||gXY(a), i=b.hIn||gXY(b);
    return 'C'+[X(o[0]),Y(o[1]),X(i[0]),Y(i[1]),X(b.x),Y(b.y)].map(N3).join(','); }
  return `L${N3(X(b.x))},${N3(Y(b.y))}`; };
function subsD(subs,X,Y){
  X=X||(v=>v); Y=Y||(v=>v);
  const d=[];
  for(const s of subs){
    const n=s.nodes; if(!n.length) continue;
    d.push(`M${N3(X(n[0].x))},${N3(Y(n[0].y))}`);
    for(let i=1;i<n.length;i++) d.push(gSegD(n[i-1],n[i],X,Y));
    if(s.closed&&n.length>1){ d.push(gSegD(n[n.length-1],n[0],X,Y)); d.push('Z'); }
  }
  return d.join('');
}
/* ---- 編輯器 undo（與主程式的 UNDO 各自獨立：編輯器裡按 Cmd+Z 是回上一個點，
       不是回上一個投影片操作；整段編輯在按下「確定」時才成為主程式的一步） ---- */
const gClone=()=>GEO.subs.map(s=>({closed:s.closed,
  nodes:s.nodes.map(n=>({x:n.x,y:n.y,hIn:n.hIn?n.hIn.slice():null,hOut:n.hOut?n.hOut.slice():null}))}));
function gPush(){ GEO.undo.push(gClone()); if(GEO.undo.length>80) GEO.undo.shift(); GEO.redo.length=0; }
function gStep(from,to){ const s=from.pop(); if(!s) return; to.push(gClone());
  GEO.subs=s; GEO.cur=null; GEO.sel=null; gRender(); }
const gUndoStep=()=>gStep(GEO.undo,GEO.redo), gRedoStep=()=>gStep(GEO.redo,GEO.undo);

/* ---- 座標與拖曳 ---- */
function gLocal(e){ const r=GEO.svg.getBoundingClientRect();
  return [(e.clientX-r.left-GEO.PAD)/GEO.S,(e.clientY-r.top-GEO.PAD)/GEO.S]; }
function gSnapPt(p){
  if($('#gSnap').checked){ const g=Math.max(1,+$('#gGrid').value||10);
    p=[Math.round(p[0]/g)*g,Math.round(p[1]/g)*g]; }
  // 夾在路徑框內：normPoints 存檔時也會夾，這裡先夾住才不會「畫得到、存不進去」
  return [Math.max(0,Math.min(GEO.W,p[0])),Math.max(0,Math.min(GEO.H,p[1]))];
}
function gStartDrag(o){ GEO.drag=o;
  document.addEventListener('pointermove',gMove);
  document.addEventListener('pointerup',gUp); }
function gUp(){ document.removeEventListener('pointermove',gMove);
  document.removeEventListener('pointerup',gUp); GEO.drag=null; gRender(); }
function gMove(e){
  const d=GEO.drag; if(!d) return;
  const raw=gLocal(e), p=gSnapPt(raw), n=d.node;
  if(d.mode==='pen'){
    if(!d.moved&&Math.hypot((raw[0]-n.x)*GEO.S,(raw[1]-n.y)*GEO.S)<4) return;
    d.moved=true; n.hOut=[p[0],p[1]]; n.hIn=[2*n.x-p[0],2*n.y-p[1]];
  }else if(d.mode==='node'){
    const dx=p[0]-n.x, dy=p[1]-n.y; n.x=p[0]; n.y=p[1];
    if(n.hIn){ n.hIn[0]+=dx; n.hIn[1]+=dy; }
    if(n.hOut){ n.hOut[0]+=dx; n.hOut[1]+=dy; }
  }else if(d.mode==='handle'){
    const other=d.side==='hIn'?'hOut':'hIn';
    n[d.side]=[p[0],p[1]];
    // 預設對稱（保留對側長度、只鏡射方向）；按住 Alt 拖＝拆開成折角
    if(!e.altKey&&n[other]){
      const len=Math.hypot(n[other][0]-n.x,n[other][1]-n.y);
      const vx=n.x-p[0], vy=n.y-p[1], m=Math.hypot(vx,vy)||1;
      n[other]=[n.x+vx/m*len,n.y+vy/m*len];
    }
  }
  gRender();
}
/* ---- 結構操作 ---- */
// 控制柄與錨點重合＝等同沒有控制柄（直線）
const gDegen=(h,n)=>!h||(Math.abs(h[0]-n.x)<1e-9&&Math.abs(h[1]-n.y)<1e-9);
function gSplit(si,ni){   // 在第 ni 段（nodes[ni] → 下一節點）正中插入一點，用 de Casteljau 對半切，形狀不變
  gPush();
  const n=GEO.subs[si].nodes, a=n[ni], b=n[(ni+1)%n.length];
  if(!a.hOut&&!b.hIn){
    n.splice(ni+1,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,hIn:null,hOut:null});
  }else{
    const mid=(u,v)=>[(u[0]+v[0])/2,(u[1]+v[1])/2];
    const p0=gXY(a), p1=a.hOut||gXY(a), p2=b.hIn||gXY(b), p3=gXY(b);
    const q0=mid(p0,p1), q1=mid(p1,p2), q2=mid(p2,p3);
    const r0=mid(q0,q1), r1=mid(q1,q2), m=mid(r0,r1);
    // 原本沒有控制柄的那一側，切完算出來的柄會與錨點重合——留著它會讓直線被當成曲線
    // （UI 上變平滑點、匯出多寫一條 cubicBezTo），一律收回 null
    const nn={x:m[0],y:m[1],hIn:null,hOut:null};
    a.hOut=gDegen(q0,a)? null : q0;
    b.hIn =gDegen(q2,b)? null : q2;
    nn.hIn=gDegen(r0,nn)? null : r0;
    nn.hOut=gDegen(r1,nn)? null : r1;
    n.splice(ni+1,0,nn);
  }
  GEO.sel=[si,ni+1]; gRender();
}
function gToggleNode(si,ni){   // 角點 ↔ 平滑點
  gPush();
  const s=GEO.subs[si], n=s.nodes, nd=n[ni];
  if(nd.hIn||nd.hOut){ nd.hIn=null; nd.hOut=null; }
  else{
    const prev=n[ni-1]||(s.closed?n[n.length-1]:nd), next=n[ni+1]||(s.closed?n[0]:nd);
    const dx=(next.x-prev.x)/4, dy=(next.y-prev.y)/4;
    nd.hIn=[nd.x-dx,nd.y-dy]; nd.hOut=[nd.x+dx,nd.y+dy];
  }
  gRender();
}
/* 反轉子路徑繞行方向。⚠ 填充規則實測是 even-odd，繞行方向「不」影響挖不挖洞，
   所以這個按鈕不是挖洞的必要步驟。留著的理由：OOXML 的官方 preset（donut／frame／
   noSmoking）內圈都反向繞行，跟進這個慣例可讓匯出的路徑與原生形狀長得一樣，
   也保留給日後真的需要指定方向的用途（例如描邊起點）。 */
function gFlipSub(si){
  const s=GEO.subs[si]; if(!s) return;
  gPush();
  s.nodes.reverse();
  for(const n of s.nodes){ const t=n.hIn; n.hIn=n.hOut; n.hOut=t; }
  // reverse 後起點換人，把「原起點」轉回第 0 位，閉合段的形狀才不會位移
  if(s.closed&&s.nodes.length>1) s.nodes.unshift(s.nodes.pop());
  if(GEO.sel&&GEO.sel[0]===si) GEO.sel=null;
  gRender();
}
function gDelNode(){
  if(!GEO.sel) return;
  const [si,ni]=GEO.sel; gPush();
  const s=GEO.subs[si]; s.nodes.splice(ni,1);
  if(s.nodes.length<2) GEO.subs.splice(si,1);
  GEO.sel=null; gRender();
}
/* ---- 繪製 ---- */
function gRender(){
  const svg=GEO.svg; if(!svg) return;
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  const W=GEO.W,H=GEO.H,S=GEO.S;
  const mk=(t,a)=>{ const el=document.createElementNS(NS,t); for(const k in a) el.setAttribute(k,a[k]); return el; };
  svg.classList.toggle('editMode',GEO.tool==='edit');
  // 格線與路徑框
  const g=Math.max(1,+$('#gGrid').value||10), gl=[];
  for(let x=0;x<=W+1e-6;x+=g) gl.push(`M${N3(gX(x))},${N3(gY(0))}V${N3(gY(H))}`);
  for(let y=0;y<=H+1e-6;y+=g) gl.push(`M${N3(gX(0))},${N3(gY(y))}H${N3(gX(W))}`);
  svg.appendChild(mk('path',{d:gl.join(''),stroke:'#2b2f36','stroke-width':1,fill:'none'}));
  svg.appendChild(mk('rect',{x:gX(0),y:gY(0),width:W*S,height:H*S,fill:'none',
    stroke:'#575d68','stroke-dasharray':'5 4'}));
  // 圖形本身。fill-rule 跟畫布 shapeNodes 同樣用 even-odd（＝PowerPoint 實測的規則），
  // 所以「編輯器裡看到有沒有挖洞」＝「PPT 裡有沒有挖洞」，不會兩套結果
  const d=subsD(GEO.subs,gX,gY);
  if(d) svg.appendChild(mk('path',{d,fill:'rgba(77,157,224,.32)',stroke:'#4D9DE0','stroke-width':2,
    'fill-rule':'evenodd','stroke-linejoin':'round','pointer-events':'none'}));
  // 編輯模式：每段一條透明粗線當命中區，點一下即在該段正中插點
  if(GEO.tool==='edit') GEO.subs.forEach((s,si)=>{
    const n=s.nodes, last=s.closed? n.length-1 : n.length-2;
    for(let i=0;i<=last;i++){
      const a=n[i], b=n[(i+1)%n.length]; if(!a||!b) continue;
      const hit=mk('path',{class:'gSegHit',d:`M${N3(gX(a.x))},${N3(gY(a.y))}`+gSegD(a,b,gX,gY)});
      hit.onpointerdown=ev=>{ ev.stopPropagation(); gSplit(si,i); };
      hit.appendChild(mk('title',{})).textContent=_t('點一下在此插入節點');
      svg.appendChild(hit);
    }
  });
  // 控制柄：只畫選取節點的（全部畫出來會糊成一團）
  if(GEO.tool==='edit'&&GEO.sel){
    const nd=(GEO.subs[GEO.sel[0]]||{nodes:[]}).nodes[GEO.sel[1]];
    if(nd) for(const side of ['hIn','hOut']){
      const h=nd[side]; if(!h) continue;
      svg.appendChild(mk('line',{class:'gHStem',x1:gX(nd.x),y1:gY(nd.y),x2:gX(h[0]),y2:gY(h[1])}));
      const dot=mk('circle',{class:'gHandle',cx:gX(h[0]),cy:gY(h[1]),r:4.5});
      dot.onpointerdown=ev=>{ ev.stopPropagation(); gPush(); gStartDrag({mode:'handle',node:nd,side}); };
      dot.appendChild(mk('title',{})).textContent=_t('拖曳調整曲度（按住 Alt 拖＝兩側拆開）');
      svg.appendChild(dot);
    }
  }
  // 錨點：平滑點畫圓、角點畫方；鋼筆模式中未閉合子路徑的起點標黃（點它即閉合）
  GEO.subs.forEach((s,si)=>s.nodes.forEach((nd,ni)=>{
    const smooth=!!(nd.hIn||nd.hOut), on=GEO.sel&&GEO.sel[0]===si&&GEO.sel[1]===ni;
    const isStart=GEO.tool==='pen'&&s===GEO.cur&&ni===0&&s.nodes.length>1;
    const cls='gAnchor'+(on?' on':'')+(isStart?' first':'');
    const a=smooth? mk('circle',{class:cls,cx:gX(nd.x),cy:gY(nd.y),r:4.5})
                  : mk('rect',{class:cls,x:gX(nd.x)-4,y:gY(nd.y)-4,width:8,height:8});
    a.onpointerdown=ev=>{
      ev.stopPropagation();
      if(GEO.tool==='pen'){
        if(isStart){ gPush(); s.closed=true; GEO.cur=null; gRender(); }   // 點回起點＝閉合並收工
        return;
      }
      GEO.sel=[si,ni]; gPush(); gStartDrag({mode:'node',node:nd}); gRender();
    };
    a.ondblclick=ev=>{ ev.stopPropagation(); if(GEO.tool==='edit'){ GEO.sel=[si,ni]; gToggleNode(si,ni); } };
    a.appendChild(mk('title',{})).textContent=GEO.tool==='pen'
      ? (isStart?_t('點一下閉合這條路徑'):'') : _t('拖曳移動；雙擊切換直線／曲線；Delete 刪除');
    svg.appendChild(a);
  }));
  // 鋼筆的橡皮筋預覽線
  GEO.rubber=null;
  if(GEO.tool==='pen'&&GEO.cur&&GEO.cur.nodes.length){
    GEO.rubber=mk('path',{d:'',stroke:'#ffd23f','stroke-width':1.5,'stroke-dasharray':'4 3',
      fill:'none','pointer-events':'none'});
    svg.appendChild(GEO.rubber);
  }
  // 狀態列
  const nPts=GEO.subs.reduce((a,s)=>a+s.nodes.length,0);
  $('#gInfo').textContent=_t('{0} 點 · {1} 條子路徑 · 座標空間 {2}',nPts,GEO.subs.length,W+'×'+H);
  $('#gtPen').classList.toggle('on',GEO.tool==='pen');
  $('#gtEdit').classList.toggle('on',GEO.tool==='edit');
}
/* ---- 開關與存檔 ---- */
/* 內建形狀轉 custGeom。轉完直接開編輯器——這個動作的唯一目的就是要改端點。 */
function toCustGeom(el){
  const r=presetPoints(el.shape,el.w,el.h,adjVals(el));
  if(!r||!r.points.length){ alert(_t('這個形狀沒有可轉換的幾何定義。')); return; }
  const warn=[_t('把「{0}」轉成自訂幾何後：',(SHAPES[el.shape]||{}).label||el.shape),
    _t('• 黃色調整點會消失（自訂幾何在 PowerPoint 內沒有黃點）'),
    _t('• 換不回內建形狀（同 PowerPoint 的「編輯端點」，單向）')];
  // 子路徑原本各有填色／描邊差異的形狀（動作按鈕、圖說外框…），轉換後只剩一種填色
  if(r.mixed) warn.push(_t('• 這個形狀的各部分原本填色／外框設定不同，轉換後會變成同一種填色（外觀會變）'));
  /* 填充規則會換一套：preset 由 PowerPoint 用內建幾何畫（本工具照 nonzero 重現），
     custGeom 則由我們給的路徑畫，PowerPoint 對它用的是 even-odd（2026-08-03 實測）。
     187 個 preset 裡有 9 條路徑在兩種規則下結果不同，轉完會多出洞——先講，不要讓人事後才發現。 */
  if(ruleChangesLook(el)) warn.push(_t('• 這個形狀轉換後中間會多出鏤空'
    +'（內建形狀與自訂幾何的填充規則不同，PowerPoint 上也會是鏤空的）'));
  warn.push('',_t('要繼續嗎？'));
  if(!confirm(warn.join('\n'))) return;
  commitUndo();
  el.shape='custGeom';
  el.pathW=Math.max(1,Math.round(el.w)); el.pathH=Math.max(1,Math.round(el.h));
  el.points=normPoints(r.points,el.pathW,el.pathH);
  delete el.adjs; delete el.adj; delete el.adj2;   // 不再有 preset 可套用調整值
  renderAll(); syncPageJson();
  openGeomEditor(el);
}
function openGeomEditor(el,fresh){
  if(!el||el.shape!=='custGeom') return;
  // 開啟時把路徑空間重新對齊元素當下尺寸：編輯器裡的框＝畫布上看到的框，不會有兩套座標
  const s=custScale(el);
  const pts=(el.points||[]).map(pt=>{
    if(pt.close) return {close:true};
    const q={x:pt.x*s[0],y:pt.y*s[1]}; if(pt.moveTo) q.moveTo=true;
    if(pt.curve){ const c=pt.curve, k={type:c.type};
      if(c.type==='arc'){ k.wR=c.wR*s[0]; k.hR=c.hR*s[1]; k.stAng=c.stAng; k.swAng=c.swAng; }
      else{ k.x1=c.x1*s[0]; k.y1=c.y1*s[1]; if(c.type==='cubic'){ k.x2=c.x2*s[0]; k.y2=c.y2*s[1]; } }
      q.curve=k; }
    return q;
  });
  const r=fresh? {subs:[],lossy:false} : pointsToSubs(pts);
  if(r.lossy&&!confirm(_t('這個圖形含圓弧段。編輯器會把圓弧折成貝茲曲線（外觀幾乎相同，但按下「確定」後就換不回圓弧了）。要繼續嗎？'))) return;
  GEO.el=el; GEO.subs=r.subs; GEO.cur=null; GEO.sel=null; GEO.drag=null;
  GEO.undo=[]; GEO.redo=[];
  GEO.tool=r.subs.length? 'edit' : 'pen';
  GEO.W=Math.max(1,Math.round(el.w)); GEO.H=Math.max(1,Math.round(el.h));
  // 畫布縮放：塞得進視窗就塞（上限 4×，避免小形狀被放到糊），視窗太小才讓 #geomWrap 出捲軸
  // 改成浮動面板後，可用寬度不再是「視窗扣掉邊距」——面板自己只有 640px
  const availW=Math.max(280,Math.min(560,window.innerWidth-260));
  const availH=Math.max(220,Math.min(420,window.innerHeight-330));
  GEO.S=Math.max(0.5,Math.min(availW/GEO.W,availH/GEO.H,4));
  GEO.open=true; $('#geomModal').hidden=false;
  const wrap=$('#geomWrap'); wrap.innerHTML='';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',GEO.W*GEO.S+GEO.PAD*2);
  svg.setAttribute('height',GEO.H*GEO.S+GEO.PAD*2);
  svg.addEventListener('pointerdown',gCanvasDown);
  svg.addEventListener('pointermove',gCanvasMove);
  svg.addEventListener('dblclick',()=>{ if(GEO.tool==='pen'&&GEO.cur){ GEO.cur=null; gRender(); } });
  wrap.appendChild(svg); GEO.svg=svg;
  gRender();
}
function gCanvasDown(e){
  if(GEO.tool!=='pen'){ GEO.sel=null; gRender(); return; }
  const p=gSnapPt(gLocal(e));
  gPush();
  if(!GEO.cur){ GEO.cur={nodes:[],closed:false}; GEO.subs.push(GEO.cur); }   // 收工後再點＝開新子路徑（挖洞靠這個）
  const node={x:p[0],y:p[1],hIn:null,hOut:null};
  GEO.cur.nodes.push(node);
  gStartDrag({mode:'pen',node});   // 按著拖＝這一點帶曲度，放開不拖＝角點
  gRender();
}
function gCanvasMove(e){
  if(GEO.drag||GEO.tool!=='pen'||!GEO.cur||!GEO.rubber) return;
  const n=GEO.cur.nodes[GEO.cur.nodes.length-1]; if(!n) return;
  const p=gSnapPt(gLocal(e));
  GEO.rubber.setAttribute('d',`M${N3(gX(n.x))},${N3(gY(n.y))}`+gSegD(n,{x:p[0],y:p[1],hIn:null,hOut:null},gX,gY));
}
function gCloseEditor(){ GEO.open=false; GEO.el=null; GEO.drag=null; GEO.svg=null;
  $('#geomWrap').innerHTML=''; $('#geomModal').hidden=true; }
function gSave(){
  const el=GEO.el; if(!el) return;
  const pts=subsToPoints(GEO.subs.filter(s=>s.nodes.length>1));
  if(pts.length>CUST_MAX_PTS&&!confirm(_t('共 {0} 個點，超過上限 {1}，多的會被截掉。仍要套用嗎？',pts.length,CUST_MAX_PTS))) return;
  commitUndo();
  el.pathW=GEO.W; el.pathH=GEO.H;               // 路徑空間＝編輯當下的元素尺寸，之後縮放等比跟著走
  el.points=normPoints(pts,GEO.W,GEO.H);
  gCloseEditor(); renderAll();
}
$('#gtPen').onclick=()=>{ GEO.tool='pen'; GEO.sel=null; gRender(); };
$('#gtEdit').onclick=()=>{ GEO.tool='edit'; GEO.cur=null; gRender(); };
$('#gUndo').onclick=gUndoStep;
$('#gRedo').onclick=gRedoStep;
$('#gFlip').onclick=()=>{   // 沒選點時預設反轉最後一條（通常就是剛畫完的那條內圈）
  const si=GEO.sel? GEO.sel[0] : (GEO.cur? GEO.subs.indexOf(GEO.cur) : GEO.subs.length-1);
  if(si>=0) gFlipSub(si);
};
$('#gClear').onclick=()=>{ if(!GEO.subs.length) return; gPush(); GEO.subs=[]; GEO.cur=null; GEO.sel=null; gRender(); };
$('#gGrid').onchange=gRender;
$('#gSnap').onchange=gRender;
$('#gOK').onclick=gSave;
$('#gCancel').onclick=gCloseEditor;
$('#btnGeomClose').onclick=gCloseEditor;
$('#gNote').innerHTML=_t('<b>鋼筆</b>：點一下＝角點，<b>按住拖曳</b>＝帶曲度的平滑點；點回<b>黃色起點</b>閉合；'+
  'Esc／雙擊＝結束這條路徑，之後再點就是<b>新的子路徑</b>。<b>挖洞</b>：在外圈裡面再畫一條子路徑就會空心，'+
  '<b>繞行方向不影響</b>（PowerPoint 用 even-odd 規則，2026-08-03 實測）——編輯器裡看到的空心＝PPT 裡的空心。'+
  '<b>編輯點</b>：拖錨點移動，拖<b>藍色控制柄</b>調曲度（按住 Alt 拖＝兩側拆開成折角），'+
  '點<b>線段</b>在正中插入節點，雙擊錨點切換直線／曲線，Delete 刪除。Cmd/Ctrl+Z 在編輯器內獨立復原。'+
  '座標活在下方虛線框（＝形狀當下尺寸）內，之後拉大拉小圖案會<b>等比跟著變</b>。'+
  '圓弧段在開啟時會折成貝茲曲線。');
// 編輯器開著時吃掉全域快捷鍵（capture 階段先攔，避免 Delete 刪到投影片上的元素）
document.addEventListener('keydown',e=>{
  if(!GEO.open) return;
  if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)&&e.key!=='Escape') return;
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation();
    if(GEO.cur){ GEO.cur=null; gRender(); } else gCloseEditor(); return; }
  if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation();
    if(GEO.cur){ GEO.cur=null; gRender(); } else gSave(); return; }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); e.stopPropagation();
    e.shiftKey? gRedoStep():gUndoStep(); return; }
  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); e.stopPropagation();
    if(GEO.tool==='pen'&&GEO.cur&&GEO.cur.nodes.length){
      gPush(); GEO.cur.nodes.pop();
      if(!GEO.cur.nodes.length){ GEO.subs.splice(GEO.subs.indexOf(GEO.cur),1); GEO.cur=null; }
      gRender();
    }else gDelNode();
  }
},true);

