'use strict';
/* ================= 投影片尺寸／字體／預留區（皆由 deck 資料驅動） ================= */
// 投影片尺寸：改寫 STAGE_W/H 並重畫畫布框與外圍遮罩。遮罩四塊在 JS 生成，跟著尺寸走
function applyStage(){
  const s=APP.deck.stage||{w:1280,h:720};
  STAGE_W=s.w; STAGE_H=s.h;
  stage.style.width=STAGE_W+'px'; stage.style.height=STAGE_H+'px';
  let masks=[...stage.querySelectorAll('.outmask')];
  while(masks.length<4){ const d=document.createElement('div'); d.className='outmask'; stage.appendChild(d); masks.push(d); }
  const P=2000, box=[   // 上／下／左／右四塊，蓋住投影片以外的工作區
    [-P,-P,STAGE_W+2*P,P],[-P,STAGE_H,STAGE_W+2*P,P],[-P,0,P,STAGE_H],[STAGE_W,0,P,STAGE_H]];
  masks.forEach((m,i)=>{ const [x,y,w,h]=box[i];
    m.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`; });
  renderGrid();   // 格線鋪滿整張投影片，尺寸一改就得重畫
}
// 三字體槽 → CSS 變數（畫布、頁碼、表格都吃這三個變數，故「改字體＝預覽即時跟著變」）
function applyFontVars(){
  const F=APP.deck.fonts||FONTS, r=document.documentElement.style;
  r.setProperty('--font-latin',`"${F.latin}"`);
  r.setProperty('--font-ea',`"${F.ea}"`);
  r.setProperty('--font-table',`"${F.tableLatin}"`);
}
/* 格線：三條 path（虛線／細實線／粗實線）畫完整張，不用 <line> 逐條建節點——
   1mm 格距在 16:9 上是 530 條線，三個節點與五百多個節點的差別在拖曳時看得出來。
   插在 stage 的最前面：格線該在所有內容之下（含母版元素，那是 z-index:0），
   同一層級靠 DOM 順序決定先後，所以位置不能只靠 z-index。
   stroke 用 non-scaling-stroke：畫布本身被 CSS transform 縮放，不這樣做的話
   65% 檢視下 0.5px 的線會細到看不見，放大到 200% 又粗得像內容。*/
function renderGrid(){
  const G=APP.grid, NS='http://www.w3.org/2000/svg';
  let svg=$('#gridLayer');
  if(!G.on){ if(svg) svg.remove(); return; }
  if(!svg){ svg=document.createElementNS(NS,'svg'); svg.id='gridLayer'; }
  if(svg.parentNode!==stage||svg.previousSibling) stage.insertBefore(svg,stage.firstChild);
  svg.setAttribute('width',STAGE_W); svg.setAttribute('height',STAGE_H);
  svg.setAttribute('viewBox',`0 0 ${STAGE_W} ${STAGE_H}`);
  const step=Math.max(1,G.size), n=v=>Math.round(v*100)/100;
  const d=['','',''];   // 0 虛線／1 細實線／2 粗實線
  const kind=i=> i%G.major===0? 2 : (i%G.sub===0? 1:0);   // 先判 major：major 常是 sub 的倍數
  for(let i=0;i*step<=STAGE_W+.01;i++) d[kind(i)]+=`M${n(i*step)} 0V${STAGE_H}`;
  for(let i=0;i*step<=STAGE_H+.01;i++) d[kind(i)]+=`M0 ${n(i*step)}H${STAGE_W}`;
  const style=[['.5','2 3','.6'],['.5','','.85'],['1.1','','1']];
  svg.innerHTML=d.map((path,i)=> path? `<path d="${path}" fill="none" stroke="#${G.color}"`
    +` stroke-width="${style[i][0]}"${style[i][1]?` stroke-dasharray="${style[i][1]}"`:''}`
    +` opacity="${style[i][2]}" vector-effect="non-scaling-stroke"/>` : '').join('');
}
// 預留區：deck.zones 陣列 → 畫布上的虛線提示框（純輔助，不寫入任何 OOXML）
function renderZones(){
  stage.querySelectorAll('.safezone').forEach(n=>n.remove());
  for(const z of APP.deck.zones||[]){
    const d=document.createElement('div'); d.className='safezone'; d.dataset.zone=z.name;
    d.style.cssText=`left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px`;
    d.textContent=z.name;
    stage.appendChild(d);
  }
}

/* ================= 渲染：畫布 ================= */
/* 一個 run → 一個 <span>。段落與表格儲存格共用同一份實作，免得兩邊的預覽慢慢走鐘。
   defSizePt 是「run 沒寫字級時的底」——文字框 18、儲存格 12，故由呼叫端給。 */
function runSpan(r,defSizePt){
  const sp=document.createElement('span');
  sp.textContent=String(r.text);
  sp.style.fontSize=pt2px((r.sizePt||defSizePt)*((r.sup||r.sub)?0.7:1))+'px';
  sp.style.color='#'+(r.color||'1A1A1A');
  if(r.bold)sp.style.fontWeight=700;
  if(r.italic)sp.style.fontStyle='italic';
  if(r.sup)sp.style.verticalAlign='super';
  if(r.sub)sp.style.verticalAlign='sub';
  // 底線／刪除線可疊加；有超連結時 PptxGenJS 會自動補 u="sng"，預覽同步畫底線（預覽＝輸出）
  const dec=[]; if(r.underline||r.link) dec.push('underline'); if(r.strike) dec.push('line-through');
  if(dec.length) sp.style.textDecoration=dec.join(' ');
  if(r.highlight) sp.style.background='#'+r.highlight;
  if(r.charSpacing) sp.style.letterSpacing=pt2px(r.charSpacing)+'px';
  if(r.fontFace) sp.style.fontFamily=`"${r.fontFace}"`;
  if(r.outline) sp.style.webkitTextStroke=`${pt2px(r.outline.size||0.75)}px #${r.outline.color||'FFFFFF'}`;
  if(r.glow) sp.style.textShadow=`0 0 ${pt2px(r.glow.size||8)}px #${r.glow.color||'FFFF00'}`;
  if(r.link) sp.title=_t('超連結：{0}',linkLabel(r.link));
  return sp;
}
function paraDiv(p,el,seq){
  const div=document.createElement('div');
  div.style.textAlign={left:'left',center:'center',right:'right',justify:'justify'}[p.align||'left'];
  // 不換行要下在段落 div 上：CSS 的 `:is(.el,.mel) .txt>div{white-space:pre-wrap}` 比 .txt 更具體，會蓋掉上層設定
  if(el&&el.nowrap) div.style.whiteSpace='pre';
  if(p.spaceBefore>0) div.style.marginTop=pt2px(p.spaceBefore)+'px';
  if(p.spaceAfter>0) div.style.marginBottom=pt2px(p.spaceAfter)+'px';
  const runs=p.runs||[];
  if(!runs.length||runs.every(r=>!String(r.text))){
    const br=document.createElement('br'); br.dataset.mk='1';   // 空段落佔位，非硬斷行（編輯器據此不誤判為分段）
    div.appendChild(br); return div;
  }
  if(p.bullet){   // marL＝(level+1)×indent、懸掛 −indent，符號佔一個 indent 寬（同 PPT）
    const ind=pt2px(BULLET_INDENT), lv=(p.bullet.level||0)+1;
    div.style.paddingLeft=(ind*lv)+'px'; div.style.textIndent=(-ind)+'px';
    const mk=document.createElement('span');
    mk.dataset.mk='1';   // 編輯器據此略過：符號是渲染產物，不屬於任何 run 的文字
    mk.textContent=bulletMark(p,seq);
    mk.style.cssText=`display:inline-block;width:${ind}px;text-indent:0`;
    mk.style.fontSize=pt2px(runs[0].sizePt||18)+'px';
    mk.style.color='#'+(runs[0].color||'1A1A1A');
    div.appendChild(mk);
  }
  for(let ri=0;ri<runs.length;ri++){
    const sp=runSpan(runs[ri],18);
    sp.dataset.r=ri;   // 編輯器用 (段索引, run 索引) 反查樣式
    div.appendChild(sp);
  }
  return div;
}
function txtBlock(el){
  const t=document.createElement('div'); t.className='txt';
  t.style.justifyContent={top:'flex-start',middle:'center',bottom:'flex-end'}[el.valign||'top'];
  t.style.lineHeight=el.lineSpacing||1.2;
  if(el.inset>0) t.style.padding=pt2px(el.inset)+'px';   // 文字框內距（匯出為 bodyPr 的 lIns/tIns/rIns/bIns）
  if(el.nowrap) t.style.whiteSpace='pre';                // 不自動換行（匯出 bodyPr wrap="none"）
  // 直書：writing-mode 一改，.txt 的 flex-direction:column 自然沿著新的區塊軸堆疊段落，不必另外調
  if(VERT_MODES[el.vert]) Object.assign(t.style,VERT_MODES[el.vert].css);
  let seq=0;   // 編號清單流水號：連續 number 段落累加，遇非 number 段落歸零（同 PPT）
  const ps=el.paras||[];
  for(let pi=0;pi<ps.length;pi++){
    const p=ps[pi];
    const num=!!(p.bullet&&p.bullet.type==='number');
    seq= !num? 0 : (seq? seq+1 : Math.max(1,Math.round(p.bullet.startAt)||1));
    const d=paraDiv(p,el,seq);
    d.dataset.p=pi;
    // data-r 升級成「段:run」絕對鍵：瀏覽器把 span 搬到別段（例如退格併段）後仍查得回原樣式
    for(const sp of d.querySelectorAll('[data-r]')) sp.dataset.r=pi+':'+sp.dataset.r;
    t.appendChild(d);
  }
  return t;
}
function renderTableInto(box,el){
  box.innerHTML='';
  const tbl=document.createElement('table');
  const cg=document.createElement('colgroup');
  for(const w of el.colW){ const c=document.createElement('col'); c.style.width=w+'px'; cg.appendChild(c); }
  tbl.appendChild(cg);
  tbl.style.width=el.colW.reduce((a,b)=>a+b,0)+'px';   // table-layout:fixed 需明確寬度
  const tb=document.createElement('tbody');
  for(let r=0;r<el.cells.length;r++){
    const tr=document.createElement('tr'); tr.style.height=el.rowH[r]+'px';
    for(let c=0;c<el.cells[r].length;c++){
      const cell=el.cells[r][c];
      if(cell.covered) continue;
      const td=document.createElement('td');
      if(cell.colspan>1) td.colSpan=cell.colspan;
      if(cell.rowspan>1) td.rowSpan=cell.rowspan;
      td.dataset.r=r; td.dataset.c=c;
      if(cell.fill) td.style.background='#'+cell.fill;
      td.style.textAlign=cell.align||'left';
      td.style.verticalAlign={top:'top',middle:'middle',bottom:'bottom'}[cell.valign||'middle'];
      td.style.fontSize=pt2px(cell.sizePt||12)+'px';
      td.style.lineHeight=cell.lineSpacing||1.2;
      td.style.color='#'+(cell.color||'1A1A1A');
      if(cell.bold)td.style.fontWeight=700;
      if(cell.italic)td.style.fontStyle='italic';
      for(const [side,key] of [['Top','t'],['Right','r'],['Bottom','b'],['Left','l']]){
        const s=cellSide(el,cell,key);
        td.style['border'+side]= s? `${Math.max(1,pt2px(s.pt))}px ${s.dash?'dashed':'solid'} #${s.color}` : 'none';
      }
      td.style.whiteSpace='pre-wrap';   // 保留格內換行（Shift+Enter）與空白
      /* 格內混排：有 runs 才逐 run 建 span，否則維持單一 textNode。
         差別不只是效率——就地編輯是以 DOM 為真相，扁平格保持 textNode 才能沿用原本那條純文字路徑。 */
      if(Array.isArray(cell.runs)&&cell.runs.length){
        const rs=cellRuns(cell);
        for(let ri=0;ri<rs.length;ri++){ const sp=runSpan(rs[ri],12); sp.dataset.r=ri; td.appendChild(sp); }
      }else td.textContent=String(cell.text||'');
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  box.appendChild(tbl);
}
/* ================= 漸層填色 =================
   PptxGenJS 3.12 沒有原生 API（ShapeFillProps.type 只有 'none'｜'solid'），
   故匯出時先寫一個「第一個色標」的 solidFill 當錨點，再於後製把它換成 <a:gradFill>——
   與 avLst、字體補丁同一套手法：PptxGenJS 表達不了的，一律先寫一個結構合法的錨點，再於匯出後製用字串替換補上。
   角度沿用 OOXML 定義：0°＝由左至右，順時針遞增。 */
const gradCssStops=g=>g.stops.map(s=>`#${s.color} ${s.pos}%`).join(',');
const gradCss=g=>g.type==='radial'
  ? `radial-gradient(circle at 50% 50%,${gradCssStops(g)})`
  // CSS 的 0deg＝朝上、90deg＝朝右，OOXML 的 0°＝朝右 → 差 90°
  : `linear-gradient(${(g.angle+90)%360}deg,${gradCssStops(g)})`;
// 陰影的 CSS 預覽：PPT 角度 0°＝向右、順時針（與 CSS 座標同向，y 軸向下）
function shadowCss(el){
  const s=el&&el.shadow; if(!s) return '';
  const a=((s.angle??SHADOW_DEF.angle))*Math.PI/180, d=pt2px(s.offset??SHADOW_DEF.offset);
  const al=Math.round((s.opacity??SHADOW_DEF.opacity)*255).toString(16).padStart(2,'0');
  return `drop-shadow(${(Math.cos(a)*d).toFixed(1)}px ${(Math.sin(a)*d).toFixed(1)}px ${(pt2px(s.blur??SHADOW_DEF.blur)/2).toFixed(1)}px #${s.color||SHADOW_DEF.color}${al})`;
}
// SVG 漸層定義：objectBoundingBox 座標，故不必知道形狀實際尺寸
function gradPaint(svg,id,g){
  const defs=document.createElementNS(NS,'defs');
  let n;
  if(g.type==='radial'){
    n=document.createElementNS(NS,'radialGradient');
    n.setAttribute('cx','50%'); n.setAttribute('cy','50%'); n.setAttribute('r','70.7%');   // 到角落的距離
  }else{
    n=document.createElementNS(NS,'linearGradient');
    const a=g.angle*Math.PI/180, dx=Math.cos(a)/2, dy=Math.sin(a)/2;
    n.setAttribute('x1',0.5-dx); n.setAttribute('y1',0.5-dy);
    n.setAttribute('x2',0.5+dx); n.setAttribute('y2',0.5+dy);
  }
  n.setAttribute('id',id);
  for(const s of g.stops){
    const st=document.createElementNS(NS,'stop');
    st.setAttribute('offset',s.pos+'%'); st.setAttribute('stop-color','#'+s.color);
    n.appendChild(st);
  }
  defs.appendChild(n); svg.appendChild(defs);
  return `url(#${id})`;
}
function mkMarker(svg,id,color,start){
  const mk=document.createElementNS(NS,'marker');
  mk.setAttribute('id',id); mk.setAttribute('markerWidth',9); mk.setAttribute('markerHeight',7);
  mk.setAttribute('refX',start?1:8); mk.setAttribute('refY',3.5); mk.setAttribute('orient','auto');
  const pl=document.createElementNS(NS,'polygon');
  pl.setAttribute('points',start?'9 0, 0 3.5, 9 7':'0 0, 9 3.5, 0 7');
  pl.setAttribute('fill',color); mk.appendChild(pl);
  let defs=svg.querySelector('defs');
  if(!defs){ defs=document.createElementNS(NS,'defs'); svg.appendChild(defs); }
  defs.appendChild(mk);
}
/* preset 定義的文字區（<a:rect>）：187 份裡有 137 份不是整個外框。
   ⚠ 這純粹是畫布預覽的修正——匯出的 XML 從來沒有自寫 <a:rect>，
   PowerPoint 一直是照 preset 定義擺文字。也就是說在此之前畫布是錯的，pptx 一直是對的。 */
function textRect(el){
  if(!el||el.type!=='shape') return null;
  const def=PRESET_GEOM[el.shape], r=def&&def[4];
  if(!r) return null;
  const V=geomEnv(el.shape,el.w,el.h,adjVals(el));
  const L=gv(r[0],V), T=gv(r[1],V), R=gv(r[2],V), B=gv(r[3],V);
  // 退化矩形（pie 的預設起訖角就會產出反向的）→ 退回整個外框，不要畫出零寬或負寬的文字區
  if(!(R>L)||!(B>T)) return null;
  return {x:L,y:T,w:R-L,h:B-T};
}
function renderShapeInto(box,el){
  box.innerHTML='';
  const kind=LINE_KINDS[el.shape];
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',Math.max(el.w,1)); svg.setAttribute('height',Math.max(el.h,1));
  if(kind){
    const {x1,y1,x2,y2}=lineEnds(el);
    const col='#'+(el.lineColor||'333333'), sw=Math.max(1,pt2px(el.linePt||1.5));
    let node;
    if(kind.pptx==='bentConnector3'){  // 肘形：水平→垂直→水平，折點 x＝adj×寬（黃點可調，同 PPT）
      node=document.createElementNS(NS,'polyline');
      const mx=adjVals(el)[0]/OOX_PCT*el.w;   // bentConnector3 的 adj1＝折點沿橫向的千分比
      node.setAttribute('points',`${x1},${y1} ${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      node.setAttribute('fill','none');
    }else{
      node=document.createElementNS(NS,'line');
      node.setAttribute('x1',x1); node.setAttribute('y1',y1);
      node.setAttribute('x2',x2); node.setAttribute('y2',y2);
    }
    node.setAttribute('stroke',col); node.setAttribute('stroke-width',sw);
    {const da=dashArray(el,sw); if(da) node.setAttribute('stroke-dasharray',da); }
    if(kind.end){ mkMarker(svg,'ae-'+el.id,col,false); node.setAttribute('marker-end',`url(#ae-${el.id})`); }
    if(kind.begin){ mkMarker(svg,'ab-'+el.id,col,true); node.setAttribute('marker-start',`url(#ab-${el.id})`); }
    svg.appendChild(node); box.appendChild(svg);
    return;
  }
  svg.style.overflow='visible';   // 圖說框尾標會伸出 bbox（同 PPT）
  // 翻轉只鏡射幾何（svg），文字不鏡射——同 PPT flip 行為
  const fl=[]; if(el.flipH) fl.push('scaleX(-1)'); if(el.flipV) fl.push('scaleY(-1)');
  if(fl.length){ svg.style.transform=fl.join(' '); svg.style.transformOrigin='50% 50%'; }
  const sw=Math.max(1,pt2px(el.linePt||1)), da=dashArray(el,sw);
  const paint=el.grad? gradPaint(svg,'gr-'+el.id,el.grad) : null;
  for(const p of shapeNodes(shapePaths(el),el.fill,el.lineColor,sw,da,paint)) svg.appendChild(p);
  box.appendChild(svg);
  if(el.paras){
    const t=txtBlock(el);
    t.style.position='absolute';
    const tr=textRect(el);
    if(tr){ t.style.left=tr.x+'px'; t.style.top=tr.y+'px';
            t.style.width=tr.w+'px'; t.style.height=tr.h+'px'; }
    else t.style.inset='0';
    box.appendChild(t);
  }
}
function renderChartInto(box,el){
  box.innerHTML='';
  const cd=document.createElement('div');
  cd.style.cssText=`width:${el.w}px;height:${el.h}px;`;
  box.appendChild(cd);
  const cover=document.createElement('div'); cover.className='chartCover'; box.appendChild(cover);
  // 原生模式的角標：畫布仍是 ECharts 畫的，但 PPT 內的外觀由 PowerPoint 決定，要講明白。
  // 比照 .vtag／.pgnum，只存在畫布，快照與匯出都不含。
  if(el.native&&nativeMap(el.option).ok){
    const tg=document.createElement('div'); tg.className='ctag';
    tg.textContent=_t('原生圖表'); tg.title=_t('匯出為 PowerPoint 原生圖表，PPT 內可改資料；實際外觀由 PowerPoint 排版');
    box.appendChild(tg);
  }
  let inst=CHARTS.get(el.id);
  if(inst){ inst.dispose(); }
  inst=echarts.init(cd,null,{renderer:'canvas'});
  try{ inst.setOption(structuredClone(el.option),true); }catch(e){ cd.textContent=_t('option 錯誤：{0}',e.message); }
  CHARTS.set(el.id,inst);
}
// 旋轉套在整個 box（文字隨形狀轉，同 PPT）；圖片翻轉也在 box。
// 形狀翻轉只套在 svg（PPT flip 只鏡射幾何、文字不鏡射），見 renderShapeInto。
function applyBoxTransform(box,el){
  if(isLineEl(el)){ box.style.transform=''; return; }
  const t=[];
  if(el.rot) t.push(`rotate(${el.rot}deg)`);
  if(el.type==='image'){ if(el.flipH) t.push('scaleX(-1)'); if(el.flipV) t.push('scaleY(-1)'); }
  box.style.transform=t.join(' ');
  box.style.transformOrigin='50% 50%';
}
function renderEl(el){
  const box=document.createElement('div');
  box.className='el'; box.dataset.id=el.id; box.dataset.type=el.type;
  box.style.left=el.x+'px'; box.style.top=el.y+'px';
  if(el.type!=='table'){ box.style.width=el.w+'px'; box.style.height=el.h+'px'; }
  applyBoxTransform(box,el);
  box.style.opacity=(el.opacity!=null&&el.opacity<100)? el.opacity/100 : '';
  if(el.shadow) box.style.filter=shadowCss(el);
  if(el.locked) box.classList.add('locked');
  if(el.type==='text'){
    if(el.grad) box.style.background=gradCss(el.grad);
    else if(el.fill) box.style.background='#'+el.fill;
    if(el.lineColor!=null) box.style.border=`${Math.max(1,pt2px(el.linePt||1))}px ${dashKind(el).css} #${el.lineColor}`;
    box.appendChild(txtBlock(el));
  }
  else if(el.type==='table') renderTableInto(box,el);
  else if(el.type==='shape') renderShapeInto(box,el);
  else if(el.type==='image'){ if(APP.cropping===el.id) box.classList.add('cropping'); box.appendChild(imageInner(el)); }
  else if(el.type==='chart') renderChartInto(box,el);
  else if(el.type==='video') renderVideoInto(box,el);
  if(el.link) box.title=(box.title?box.title+'\n':'')+_t('超連結：{0}',linkLabel(el.link))
    +(el.link.tooltip?_t('（提示：{0}）',el.link.tooltip):'');
  return box;
}
function linkLabel(l){ return l? (l.url||_t('本簡報第 {0} 頁',l.slide)) : ''; }
/* 影片元素：畫布上只是「封面圖 ＋ 播放徽章 ＋ 角標」。
   mode:'online'＝YouTube 連結（匯出走 addMedia type:'online'，pptx 只存外部連結）；
   mode:'local' ＝本機影片（位元組一律不進 JSON，匯出只放封面圖＋待插入提示）。 */
function renderVideoInto(box,el){
  box.innerHTML='';
  if(el.cover){
    const im=document.createElement('img'); im.className='vcover'; im.src=el.cover;
    im.alt=el.alt||''; box.appendChild(im);
    // 播放徽章只在「有封面圖」時疊上去；沒封面時佔位圖本身已有播放符號，再疊會糊成一團
    const bd=document.createElement('div'); bd.className='vbadge';
    bd.appendChild(Object.assign(document.createElement('span'),{textContent:'▶'}));
    box.appendChild(bd);
  }else{
    const ph=document.createElement('div'); ph.className='vph';
    ph.innerHTML=_t('<div style="font-size:20px">▶</div><div>未設封面圖</div>');
    box.appendChild(ph);
  }
  const tag=document.createElement('div'); tag.className='vtag';
  tag.textContent= el.mode==='online'? _t('YouTube 連結影片') : _t('待插入：{0}',((el.src&&el.src.name)||_t('影片'))+durText(el));
  box.appendChild(tag);
}
function durText(el){ const s=el&&el.src&&+el.src.durationSec;
  if(!(s>0)) return '';
  return _t('（{0}）',Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0')); }
function renderStage(){
  // 清掉舊元素與選取框
  stage.querySelectorAll('.el,.mel,#selBox,.pgnum').forEach(e=>e.remove());
  const pg=curPage();
  stage.style.background='#'+(pg.bg||'FFFFFF');
  // 頁面背景圖：滿版拉伸（同匯出的 <p:bg> blipFill stretch），壓在所有元素之下
  stage.style.backgroundImage= pg.bgImage? `url("${pg.bgImage}")` : '';
  stage.style.backgroundSize='100% 100%'; stage.style.backgroundRepeat='no-repeat';
  stage.classList.toggle('masterEdit',!!APP.masterEdit);
  // 母版空的時候畫布全白，補一句引導；順便同步母版標記鈕（啟用母版與否會變）
  stage.classList.toggle('melEmpty',!!APP.masterEdit&&!curEls().length);
  if(typeof syncMelBtn==='function') syncMelBtn();
  const liveIds=new Set();
  /* 母版元素墊在最底下，且刻意不給 .el（不可選、不可拖、不進圖層、不算超界）——
     它們不屬於這一頁，要改請按「編輯母版」，否則在某頁改動會無聲影響全部頁面。 */
  for(const el of pageMasterEls(pg)){
    if(el.hidden) continue;
    liveIds.add(el.id);
    const b=renderEl(el); b.classList.remove('el'); b.classList.add('mel'); stage.appendChild(b);
  }
  for(const el of curEls()){ if(el.hidden) continue; liveIds.add(el.id); stage.appendChild(renderEl(el)); }
  for(const [id,inst] of CHARTS) if(!liveIds.has(id)){ inst.dispose(); CHARTS.delete(id); }
  renderPageNum(pg);
  markOverflow();
  updateSelBox();
  checkZones();
  if(APP.edit) editOpen();   // 編輯中：接管剛渲染好的 .txt 並還原選取，重繪不中斷編輯
}
/* 頁碼／日期預覽：非元素（不可選、不進圖層、不算超界警告），純粹讓使用者看到匯出後會長在哪。
   ⚠ 母版繼承模式下這只是「這個檔自己打開時」的樣子——貼進別人的簡報後，位置與字級會改由
   目的端母版的頁尾佔位符決定（那正是繼承模式的目的）。與字體同一個道理，同一個開關。 */
function renderPageNum(pg){
  const idx=APP.deck.pages.indexOf(pg);
  const put=(cfg,box,txt)=>{
    if(!cfg||(cfg.skipFirst&&idx===0)) return;
    const b=box();
    const d=document.createElement('div'); d.className='pgnum';
    d.style.cssText=`left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;`
      +`font-size:${pt2px(b.sizePt)}px;color:#${b.color};text-align:${b.align};`;
    d.textContent=txt;
    stage.appendChild(d);
  };
  put(APP.deck.pageNum,pageNumBox,String(idx+1));
  put(APP.deck.date,dateBox,dateText());
}
function markOverflow(){
  for(const el of curEls()){
    if(el.type!=='text') continue;
    const box=stage.querySelector(`.el[data-id="${el.id}"]`);
    const t=box&&box.querySelector('.txt');
    // 直書時文字往水平方向長，只看 scrollHeight 會漏判
    if(t) box.classList.toggle('overflow',
      VERT_MODES[el.vert]? t.scrollWidth>el.w+2 : t.scrollHeight>el.h+2);
  }
}
/* 文字框「剛好裝下內容」的尺寸：橫書量高（寬不動），直書量寬（高不動）。
   markOverflow 只答得出「有沒有溢出」：.txt 撐滿容器，不溢出時 scrollHeight 恰好等於框高，量不到真實需求。
   所以另外 renderEl 一份，把框的那一維改成 auto 再讀。三個要點，都是實際量錯過才定下來的：
   - 要 append 進 #stage，不能掛 document.body：字體變數與 :is(.el,.mel) .txt 的規則都掛在畫布底下，
     掛到外面會退回預設字級（2026-09-17 實測：只 clone .txt 到 body，行高 21px 變 15px；2026-09-25 以 278 個文字框
     比對，9 個少算超過 2px，最差只量到三分之一，其餘相符——不是每個都錯，所以抽查不容易發現）
   - 量整個框（含框線）而不是 .txt：box-sizing 是 border-box，框線吃的是框自己的高度
   - 拿掉 data-id：否則 markOverflow／選取之類「用 id 找 DOM」的程式會先找到這份替身
   不依賴目前顯示哪一頁：任何一頁的元素都能量（字體設定是整份簡報共用的）。 */
function textFitSize(el){
  if(!el||el.type!=='text') return null;
  const vert=!!VERT_MODES[el.vert];
  const box=renderEl(el);
  box.removeAttribute('data-id');
  box.style.visibility='hidden'; box.style.pointerEvents='none';
  const t=box.querySelector('.txt');
  if(vert){ box.style.width='auto'; t.style.width='auto'; }
  else{ box.style.height='auto'; t.style.height='auto'; }
  stage.appendChild(box);
  const w=vert? Math.ceil(box.offsetWidth) : el.w, h=vert? el.h : Math.ceil(box.offsetHeight);
  box.remove();
  return {w:Math.max(4,w), h:Math.max(4,h)};
}
function updateElStyle(el){  // 拖曳中僅更新位置尺寸（不重建 DOM）
  const box=stage.querySelector(`.el[data-id="${el.id}"]`);
  if(!box) return;
  box.style.left=el.x+'px'; box.style.top=el.y+'px';
  if(el.type==='table'){ /* 表格尺寸由 colW/rowH 決定，另行重繪 */ }
  else{ box.style.width=el.w+'px'; box.style.height=el.h+'px'; }
  applyBoxTransform(box,el);
  box.style.opacity=(el.opacity!=null&&el.opacity<100)? el.opacity/100 : '';
  if(el.type==='shape') renderShapeInto(box,el);
  if(el.type==='chart'){
    const cd=box.firstChild; cd.style.width=el.w+'px'; cd.style.height=el.h+'px';
    const inst=CHARTS.get(el.id); if(inst) inst.resize();
  }
  updateSelBox(); checkZones();
}

