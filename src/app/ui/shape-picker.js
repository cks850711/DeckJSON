'use strict';
/* 形狀圖庫 modal */
function shapeThumb(key,VB,MAX){
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',VB); svg.setAttribute('height',VB); svg.setAttribute('viewBox',`0 0 ${VB} ${VB}`);
  // 依形狀原始長寬比縮放置中——高瘦形狀不會被壓成一團
  let nw,nh;
  if(LINE_KINDS[key]){ nw=MAX; nh=key.startsWith('elbow')? MAX*0.72 : MAX*0.66; }
  else{ const sz=SHAPES[key].size, ar=Math.min(1.5,Math.max(1/1.5,sz[0]/sz[1]));
    // 長寬比夾在 1.5:1 內：太扁的縮圖會讓「短邊×16.7%」的圓角／切角小到看不出差別，
    // 九種矩形變體就會長得一模一樣
    if(ar>=1){ nw=MAX; nh=MAX/ar; } else { nh=MAX; nw=MAX*ar; } }
  const sc=MAX/Math.max(nw,nh), dw=nw*sc, dh=nh*sc, ox=(VB-dw)/2, oy=(VB-dh)/2;
  if(LINE_KINDS[key]){
    const k=LINE_KINDS[key];
    let node;
    if(k.pptx==='bentConnector3'){   // 肘形：橫→縱→橫，一眼看得出是直角轉折
      node=document.createElementNS(NS,'polyline');
      const bx=ox+dw*0.5;
      node.setAttribute('points',`${ox},${oy} ${bx},${oy} ${bx},${oy+dh} ${ox+dw},${oy+dh}`); node.setAttribute('fill','none');
    }else{                            // 直線類：左下→右上斜線
      node=document.createElementNS(NS,'line');
      node.setAttribute('x1',ox); node.setAttribute('y1',oy+dh); node.setAttribute('x2',ox+dw); node.setAttribute('y2',oy);
    }
    node.setAttribute('stroke','#d7dae0'); node.setAttribute('stroke-width',2); node.setAttribute('stroke-linejoin','round');
    if(k.end){ mkMarker(svg,'pe-'+key,'#d7dae0',false); node.setAttribute('marker-end',`url(#pe-${key})`); }
    if(k.begin){ mkMarker(svg,'pb-'+key,'#d7dae0',true); node.setAttribute('marker-start',`url(#pb-${key})`); }
    svg.appendChild(node);
  }else{
    // 縮圖與畫布走同一個 shapePaths()＋shapeNodes()，所以「挑的時候看到的」跟「插進去長的」不可能不一樣
    const paths= key==='custGeom'
      ? shapePaths({shape:'custGeom',points:CUST_SAMPLE(dw,dh),w:dw,h:dh,pathW:dw,pathH:dh})
      : presetPaths(key,dw,dh,null);
    for(const p of shapeNodes(paths,'d7dae0','8b9099',1,'')){
      p.setAttribute('transform',`translate(${ox},${oy})`);
      svg.appendChild(p);
    }
    svg.style.overflow='visible';   // 圖說框尾標伸出 bbox
  }
  return svg;
}
function buildShapeGrid(q){
  const g=$('#shapeGrid'); g.innerHTML='';
  const kw=(q||'').trim().toLowerCase();
  const match=key=>{ if(!kw) return true;
    const def=LINE_KINDS[key]||SHAPES[key];
    return def.label.toLowerCase().includes(kw)||key.toLowerCase().includes(kw); };
  let n=0;
  for(const [catName,keys] of SHAPE_CATS){
    const hit=keys.filter(match); if(!hit.length) continue;
    n+=hit.length;
    const h5=document.createElement('h5'); h5.textContent=catName+_t('（{0}）',hit.length); g.appendChild(h5);
    const row=document.createElement('div'); row.className='shapeCat';
    for(const key of hit){
      const def=LINE_KINDS[key]||SHAPES[key], hasAdj=adjCount(key)>0;
      const b=document.createElement('button'); b.className='shapeBtn'+(hasAdj?' hasAdj':'');
      b.title=def.label+(hasAdj?_t('（支援黃點微調）'):'');
      b.appendChild(shapeThumb(key,40,34));
      b.onclick=()=>{ $('#shapeModal').hidden=true; insertShape(key); };
      row.appendChild(b);
    }
    g.appendChild(row);
  }
  if(!n) g.innerHTML=_t('<div class="empty">找不到符合的形狀。</div>');
  $('#shapeCount').textContent=_t('{0} 個',n);
}
function insertShape(key){
  if(LINE_KINDS[key]){
    const conn=LINE_KINDS[key].pptx==='bentConnector3';
    addEl({id:uid('e'),type:'shape',shape:key,x:220,y:300,w:260,h:conn?120:0,
      flipH:false,flipV:false,lineColor:'333333',linePt:1.5});
  }else{
    const sz=SHAPES[key].size;
    // 有 fill="none" 子路徑的 preset（chartPlus、cornerTabs…），那幾條線本來就只靠外框色畫出來，
    // 不給 lineColor 會插進來像塊空白 → 這類形狀預設就帶外框
    const strokeOnly= key!=='custGeom'&&presetPaths(key,100,100,null).some(p=>p.fill==='none');
    const el={id:uid('e'),type:'shape',shape:key,x:220,y:240,w:sz[0],h:sz[1],
      fill:'4D9DE0',lineColor:strokeOnly?'2E6DA4':null,linePt:1,paras:null,valign:'middle'};
    if(key==='custGeom'){ el.pathW=sz[0]; el.pathH=sz[1]; el.points=CUST_SAMPLE(sz[0],sz[1]); }
    addEl(el);
    // 插進來就直接進畫布（空白起手，取消則保留範例骨架），不必先去翻 JSON
    if(key==='custGeom') openGeomEditor(el,true);
  }
}
$('#btnAddShape').onclick=()=>{ $('#shapeSearch').value=''; buildShapeGrid(); $('#shapeModal').hidden=false; };
$('#shapeSearch').oninput=e=>buildShapeGrid(e.target.value);
$('#btnShapeClose').onclick=()=>{ $('#shapeModal').hidden=true; };
$('#btnAddChart').onclick=()=>addEl({id:uid('e'),type:'chart',x:640,y:180,w:480,h:320,option:structuredClone(SAMPLE_CHART)});

