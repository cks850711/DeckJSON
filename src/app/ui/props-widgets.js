'use strict';
/* ================= 屬性面板：共用控件 =================
   各類型面板共用的列與按鈕：尺寸、顏色、數值、漸層、陰影、線型、超連結、勾選、不透明度。 */
// 座標尺寸單位換算（內部一律 px）：to＝px→顯示值、from＝顯示值→px、dp＝小數位、step＝輸入步進
const DIM_UNITS={
  px:{to:px=>Math.round(px), from:v=>v,        dp:0, step:1},
  pt:{to:px=>px*72/96,       from:v=>v*96/72,  dp:1, step:0.5},
  cm:{to:px=>px*PX2CM,       from:v=>v/PX2CM,  dp:2, step:0.05},
};
function dimRow(label,get,set){
  const u=DIM_UNITS[APP.dimUnit]||DIM_UNITS.px;
  const row=document.createElement('div'); row.className='row';
  const lb=document.createElement('label'); lb.textContent=label; row.appendChild(lb);
  const inp=document.createElement('input'); inp.type='number'; inp.step=u.step;
  inp.value=u.to(get()).toFixed(u.dp); row.appendChild(inp);
  const un=document.createElement('span'); un.className='unit'; un.textContent=APP.dimUnit; row.appendChild(un);
  inp.onchange=()=>{ commitUndo(); set(u.from(parseFloat(inp.value)||0)); renderStage(); renderProps(); };
  return row;
}
// 單位切換列（放在 X 上方）：px／pt／cm 三選一，切換即重繪面板
function dimUnitRow(){
  const row=document.createElement('div'); row.className='row';
  const lb=document.createElement('label'); lb.textContent=_t('單位'); row.appendChild(lb);
  for(const u of ['px','pt','cm']){
    const b=document.createElement('button'); b.textContent=u; if(APP.dimUnit===u) b.classList.add('on');
    b.onclick=()=>{ APP.dimUnit=u; renderProps(); };
    row.appendChild(b);
  }
  return row;
}
function colorRow(label,val,onSet,allowNone){
  const row=document.createElement('div'); row.className='row';
  const lb=document.createElement('label'); lb.textContent=label; row.appendChild(lb);
  const sw=document.createElement('button'); sw.className='swatchBtn'; sw.title=_t('選色（設計師精選／Open Color／全色域）');
  sw.style.background= val==null? 'repeating-conic-gradient(#999 0 25%, #ddd 0 50%) 0/12px 12px' : '#'+val;
  sw.onclick=()=>openPalette(sw, val||'CCCCCC', hex=>{ commitUndo(); onSet(hex); renderStage(); sw.style.background='#'+hex; });
  row.appendChild(sw);
  if(allowNone){
    const none=document.createElement('button'); none.textContent=_t('無');
    if(val==null) none.classList.add('on');
    none.onclick=()=>{ commitUndo(); onSet(null); renderStage(); renderProps(); };
    row.appendChild(none);
  }
  return row;
}
// 面板分組標題：細分隔線＋小型灰階字母（非底色色塊，避免窄欄多組時變斑馬紋）。first＝緊接 h4，不畫上緣線
function secTitle(text,first){ const d=document.createElement('div'); d.className='secTitle'+(first?' first':''); d.textContent=text; return d; }
// 組內次標題（如表格的「結構／儲存格樣式／框線」）：更輕量，無分隔線
function subTitle(text){ const d=document.createElement('div'); d.className='subTitle'; d.textContent=text; return d; }
/* label 可以是字串，或 {ic:'ic-image',txt:'背景圖'} —— 後者用工具列同一套 sprite。
   面板按鈕原本混用彩色 emoji（🖼🖌📋），在深色介面裡與描邊圖示格格不入。 */
function btnRow(defs){ // [[label,fn,title,on],...]
  const row=document.createElement('div'); row.className='row';
  for(const [label,fn,title,on] of defs){
    const b=document.createElement('button');
    if(label&&typeof label==='object'&&label.ic){
      b.className='icBtn';
      b.innerHTML='<svg class="ic"><use href="#'+label.ic+'"/></svg>';
      if(label.txt) b.appendChild(document.createTextNode(label.txt));
    }else b.textContent=label;
    if(title)b.title=title; if(on)b.classList.add('on');
    b.onclick=fn; row.appendChild(b);
  }
  return row;
}
function setAllRuns(el,fn){ for(const p of el.paras||[]) for(const r of p.runs||[]) fn(r,p); }
// 設定／清除 run 級選配樣式：undefined＝刪鍵（維持 JSON 精簡，未用到的功能不留空殼）
function setRunOpt(el,key,val){ runApply(el,r=>{ if(val===undefined) delete r[key]; else r[key]=val; }); }
// 數字輸入列：numRow('字距',cur,set,{min,max,step,unit,title})
function numRow(label,val,onSet,o){
  o=o||{};
  const row=document.createElement('div'); row.className='row';
  row.appendChild(Object.assign(document.createElement('label'),{textContent:label}));
  const inp=document.createElement('input'); inp.type='number';
  if(o.min!=null)inp.min=o.min; if(o.max!=null)inp.max=o.max; if(o.step!=null)inp.step=o.step;
  inp.value=val; if(o.title)inp.title=o.title;
  inp.onchange=()=>{ let v=parseFloat(inp.value); if(!isFinite(v))v=0;
    if(o.min!=null)v=Math.max(o.min,v); if(o.max!=null)v=Math.min(o.max,v);
    commitUndo(); onSet(v); renderStage(); renderProps(); };
  row.appendChild(inp);
  if(o.unit) row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:o.unit}));
  return row;
}
/* 漸層填色的屬性列。勾起來時「底色」自動退居為第一個色標的初值，
   兩者不並存——OOXML 的 spPr 也只能有一種填色。 */
function gradRows(el){
  const f=document.createDocumentFragment();
  f.appendChild(checkRow([[_t('漸層填色'),()=>!!el.grad,v=>{ commitUndo();
    if(v) el.grad={type:'linear',angle:90,stops:[{pos:0,color:el.fill||'4D9DE0'},{pos:100,color:'FFFFFF'}]};
    else delete el.grad;
    renderStage(); renderProps(); syncPageJson(); },
    _t('匯出為原生 <a:gradFill>（PPT 內可再調）。勾選後「底色」不生效')]]));
  const g=el.grad; if(!g) return f;
  f.appendChild(btnRow([
    [_t('線性'),()=>{ commitUndo(); g.type='linear'; renderStage(); renderProps(); },_t('沿一個方向漸變'),g.type==='linear'],
    [_t('放射狀'),()=>{ commitUndo(); g.type='radial'; renderStage(); renderProps(); },_t('由中心向外漸變'),g.type==='radial'],
  ]));
  if(g.type==='linear')
    // 標籤寫「漸層角度」：形狀本身的旋轉列也叫「角度」，同一面板兩個「角度」會分不清
    f.appendChild(numRow(_t('漸層角度'),g.angle,v=>{ g.angle=((Math.round(v)%360)+360)%360; },
      {min:0,max:359,step:15,unit:'°',title:_t('0°＝由左至右，順時針遞增（同 OOXML 定義）。這是漸變方向，不是形狀旋轉')}));
  g.stops.forEach((st,i)=>{
    const row=colorRow(_t('色標 {0}',i+1),st.color,v=>{ st.color=v||'FFFFFF'; },false);
    const pos=document.createElement('input'); pos.type='number'; pos.min=0; pos.max=100; pos.step=5;
    pos.value=st.pos; pos.style.width='58px'; pos.title=_t('位置（%）');
    pos.onchange=()=>{ commitUndo();
      st.pos=Math.max(0,Math.min(100,Math.round(+pos.value)||0));
      g.stops.sort((a,b)=>a.pos-b.pos);   // 立刻排序，面板順序與實際漸變順序永遠一致
      renderStage(); renderProps(); syncPageJson(); };
    row.appendChild(pos);
    row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'%'}));
    if(g.stops.length>2){
      const del=document.createElement('button'); del.textContent='×'; del.title=_t('刪除此色標');
      del.onclick=()=>{ commitUndo(); g.stops.splice(i,1); renderStage(); renderProps(); syncPageJson(); };
      row.appendChild(del);
    }
    f.appendChild(row);
  });
  if(g.stops.length<GRAD_MAX)
    f.appendChild(btnRow([[_t('＋ 加色標'),()=>{ commitUndo();
      // 插在「最寬的那個間隙」正中，新色標才不會疊在既有色標上（看起來像沒反應）
      let bi=0, bw=-1;
      for(let i=0;i<g.stops.length-1;i++){ const w=g.stops[i+1].pos-g.stops[i].pos; if(w>bw){ bw=w; bi=i; } }
      g.stops.splice(bi+1,0,{pos:Math.round((g.stops[bi].pos+g.stops[bi+1].pos)/2),color:g.stops[bi+1].color});
      renderStage(); renderProps(); syncPageJson(); },_t('最多 {0} 個色標',GRAD_MAX)]]));
  return f;
}
function shadowRows(el){
  const wrap=document.createDocumentFragment();
  wrap.appendChild(subTitle(_t('陰影')));
  const sh=el.shadow;
  wrap.appendChild(checkRow([[_t('原生投影'),()=>!!sh,v=>{ commitUndo();
    if(v) el.shadow={...SHADOW_DEF}; else delete el.shadow;
    renderStage(); renderProps(); },_t('匯出為 PPT 原生 outerShdw；快照 PNG 不呈現')]]));
  if(sh){
    const set=(k,v)=>{ el.shadow={...el.shadow,[k]:v}; };
    wrap.appendChild(colorRow(_t('陰影色'),sh.color||SHADOW_DEF.color,v=>set('color',v),false));
    wrap.appendChild(numRow(_t('模糊'),sh.blur??SHADOW_DEF.blur,v=>set('blur',v),{min:0,max:100,step:1,unit:'pt'}));
    wrap.appendChild(numRow(_t('位移'),sh.offset??SHADOW_DEF.offset,v=>set('offset',v),{min:0,max:100,step:1,unit:'pt'}));
    wrap.appendChild(numRow(_t('方向'),sh.angle??SHADOW_DEF.angle,v=>set('angle',Math.round(v)%360),{min:0,max:359,step:15,unit:'°',title:_t('0°＝向右，順時針；270°＝向上')}));
    wrap.appendChild(numRow(_t('濃度'),Math.round((sh.opacity??SHADOW_DEF.opacity)*100),v=>set('opacity',Math.max(0,Math.min(1,v/100))),{min:0,max:100,step:5,unit:'%'}));
  }
  return wrap;
}
// 線型下拉（形狀外框／線條／文字框框線）：匯出寫 line.dashType → <a:prstDash>
function dashRow(el){
  const row=document.createElement('div'); row.className='row';
  row.appendChild(Object.assign(document.createElement('label'),{textContent:_t('線型')}));
  const sel=document.createElement('select'); sel.style.flex='1'; sel.style.minWidth='72px';
  sel.title=_t('匯出為 PPT 原生 prstDash；畫布用 stroke-dasharray 預覽（隨線寬縮放）');
  sel.innerHTML=DASH_KINDS.map(d=>`<option value="${d.key}">${d.label}</option>`).join('');
  sel.value=dashKind(el).key;
  sel.onchange=()=>{ commitUndo();
    if(sel.value==='solid') delete el.dash; else el.dash=sel.value;
    renderStage(); renderProps(); };
  row.appendChild(sel); return row;
}
/* 物件層級超連結（整個形狀／圖片／圖表可點）：PptxGenJS 的 options.hyperlink 在 sp 與 pic 兩個分支
   都有 <a:hlinkClick> 實作，含 tooltip 與跳頁的 ppaction://hlinksldjump。
   文字框請用「文字樣式 → 超連結」（run 級），兩者不重疊：這裡設的是整個物件。 */
function linkRows(el,note){
  const wrap=document.createDocumentFragment();
  wrap.appendChild(subTitle(_t('超連結（整個物件）')));
  const r=document.createElement('div'); r.className='row';
  r.appendChild(Object.assign(document.createElement('label'),{textContent:_t('連結')}));
  const i=document.createElement('input'); i.type='text'; i.style.flex='1'; i.style.minWidth='80px';
  i.placeholder=_t('https://… 或 #3');
  i.value= el.link? (el.link.url||('#'+el.link.slide)) : '';
  i.title=_t('填網址；或填「#頁碼」跳到本簡報該頁。整個{0}變成可點擊。',note||_t('物件'));
  i.onchange=()=>{ commitUndo(); const v=i.value.trim();
    if(!v) delete el.link;
    else{ const tip=el.link&&el.link.tooltip;
      el.link= v[0]==='#'? {slide:Math.max(1,Math.round(+v.slice(1))||1)} : {url:v};
      if(tip) el.link.tooltip=tip; }
    renderStage(); renderProps(); };
  r.appendChild(i); wrap.appendChild(r);
  if(el.link){
    const tr=document.createElement('div'); tr.className='row';
    tr.appendChild(Object.assign(document.createElement('label'),{textContent:_t('提示')}));
    const ti=document.createElement('input'); ti.type='text'; ti.style.flex='1'; ti.style.minWidth='80px';
    ti.placeholder=_t('滑過時顯示（選填）'); ti.value=el.link.tooltip||'';
    ti.title=_t('PowerPoint 中滑鼠停在物件上顯示的提示文字（OOXML hlinkClick 的 tooltip）');
    ti.onchange=()=>{ commitUndo(); const v=ti.value.trim();
      if(v) el.link.tooltip=v; else delete el.link.tooltip; renderStage(); };
    tr.appendChild(ti); wrap.appendChild(tr);
  }
  return wrap;
}
// 行內勾選框列：items=[[label,get,set,title],...]
// 面板提示語用：訊息裡可能夾帶使用者 option 內的字串（如 series.type）
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function checkRow(items){
  const row=document.createElement('div'); row.className='row';
  for(const [label,get,set,title] of items){
    // 用 class 不用 inline style：inline 會壓過 #propPanel .chk 那組自訂核取樣式
    const lb=document.createElement('label'); lb.className='chk'; if(title)lb.title=title;
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=get();
    cb.onchange=()=>set(cb.checked);
    lb.appendChild(cb); lb.appendChild(document.createTextNode(label)); row.appendChild(lb);
  }
  return row;
}
// 設定單軸尺寸（px）：圖片或比例鎖定→等比（字級看 fontSync）；否則只改該軸
function applyDim(el,isWidth,newPx){
  const cur= isWidth? elSize(el).w : elSize(el).h;
  if(!(cur>0)||!(newPx>0)) return;
  const f=newPx/cur;
  if(imgLocked(el)||APP.ratioLock){
    groupScaleTo({anchor:{x:el.x,y:el.y},orig:[structuredClone(el)],scaleFont:!!APP.fontSync},f);
  }else if(el.type==='table'){
    if(isWidth) el.colW=el.colW.map(w=>Math.max(16,Math.round(w*f)));
    else el.rowH=el.rowH.map(h=>Math.max(12,Math.round(h*f)));
  }else{
    const ow=el.w, oh=el.h;
    const og=el.type==='chart'&&el.option&&el.option.graphic&&structuredClone(el.option.graphic);
    if(isWidth) el.w=Math.max(8,Math.round(newPx)); else el.h=Math.max(4,Math.round(newPx));
    if(og) applyGraphicScale(el,og,el.w/ow,el.h/oh);   // 單軸改尺寸也要帶著 graphic 走
  }
}
// 不透明度滑桿（0–100，預設 100=不透明）；拖曳一次只記一步 undo，即時更新畫布
function opacityRow(els){
  const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>不透明</label>');
  const cur=(els.length===1&&els[0].opacity!=null)?els[0].opacity:100;
  const inp=document.createElement('input'); inp.type='range'; inp.min=0; inp.max=100; inp.step=1; inp.value=cur;
  inp.style.flex='1'; inp.style.minWidth='70px';
  const val=Object.assign(document.createElement('span'),{className:'unit'}); val.textContent=cur+'%';
  let dirty=false;
  inp.addEventListener('pointerdown',()=>dirty=false);
  inp.oninput=()=>{ if(!dirty){ commitUndo(); dirty=true; }
    const v=+inp.value; val.textContent=v+'%';
    for(const el of els){ el.opacity=v>=100?undefined:v;
      const box=stage.querySelector(`.el[data-id="${el.id}"]`);
      if(box) box.style.opacity=(el.opacity!=null&&el.opacity<100)?el.opacity/100:''; }
  };
  row.appendChild(inp); row.appendChild(val);
  return row;
}
