'use strict';
/* ================= 屬性面板 ================= */
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
/* ================= 色票系統（三頁籤：設計師精選／Open Color／全色域） ================= */
// Open Color（14 色相 × 10 明度，沿用 md-table-converter）
const OPEN_COLOR={
  gray:['#f8f9fa','#f1f3f5','#e9ecef','#dee2e6','#ced4da','#adb5bd','#868e96','#495057','#343a40','#212529'],
  red:['#fff5f5','#ffe3e3','#ffc9c9','#ffa8a8','#ff8787','#ff6b6b','#fa5252','#f03e3e','#e03131','#c92a2a'],
  pink:['#fff0f6','#ffdeeb','#fcc2d7','#faa2c1','#f783ac','#f06595','#e64980','#d6336c','#c2255c','#a61e4d'],
  grape:['#f8f0fc','#f3d9fa','#eebefa','#e599f7','#da77f2','#cc5de8','#be4bdb','#ae3ec9','#9c36b5','#862e9c'],
  violet:['#f3f0ff','#e5dbff','#d0bfff','#b197fc','#9775fa','#845ef7','#7950f2','#7048e8','#6741d9','#5f3dc4'],
  indigo:['#edf2ff','#dbe4ff','#bac8ff','#91a7ff','#748ffc','#5c7cfa','#4c6ef5','#4263eb','#3b5bdb','#364fc7'],
  blue:['#e7f5ff','#d0ebff','#a5d8ff','#74c0fc','#4dabf7','#339af0','#228be6','#1c7ed6','#1971c2','#1864ab'],
  cyan:['#e3fafc','#c5f6fa','#99e9f2','#66d9e8','#3bc9db','#22b8cf','#15aabf','#1098ad','#0c8599','#0b7285'],
  teal:['#e6fcf5','#c3fae8','#96f2d7','#63e6be','#38d9a9','#20c997','#12b886','#0ca678','#099268','#087f5b'],
  green:['#ebfbee','#d3f9d8','#b2f2bb','#8ce99a','#69db7c','#51cf66','#40c057','#37b24d','#2f9e44','#2b8a3e'],
  lime:['#f4fce3','#e9fac8','#d8f5a2','#c0eb75','#a9e34b','#94d82d','#82c91e','#74b816','#66a80f','#5c940d'],
  yellow:['#fff9db','#fff3bf','#ffec99','#ffe066','#ffd43b','#fcc419','#fab005','#f59f00','#f08c00','#e67700'],
  orange:['#fff4e6','#ffe8cc','#ffd8a8','#ffc078','#ffa94d','#ff922b','#fd7e14','#f76707','#e8590c','#d9480f'],
};
// 設計師精選（每組 5 色，順序＝主／輔／強調／背景／文字）
const DESIGNER_PALETTES=[
  {name:_t('商務藍金'),colors:['1F3A5F','3E6DA3','C9A227','F5F7FA','1A1A1A']},
  {name:_t('莫蘭迪'),colors:['8E9AAF','CBC0D3','EFD3D7','FBF6F4','4A4A4A']},
  {name:_t('森林綠'),colors:['1B4332','2D6A4F','95D5B2','F1FAEE','1B1B1B']},
  {name:_t('珊瑚暖陽'),colors:['E76F51','F4A261','E9C46A','FDF6EC','264653']},
  {name:_t('靛藍科技'),colors:['22223B','4A4E69','9A8C98','F2E9E4','22223B']},
  {name:_t('海洋'),colors:['05668D','028090','00A896','F0F3BD','02343F']},
  {name:_t('極簡黑白'),colors:['111111','444444','E63946','FFFFFF','111111']},
  {name:_t('紫調優雅'),colors:['3D315B','6247AA','B79CED','F6F4FB','2B2140']},
];
let palTab='designer', palTarget=null;
function buildPalBody(){
  const body=$('#palBody'); body.innerHTML='';
  if(palTab==='designer'){
    for(const p of DESIGNER_PALETTES){
      const row=document.createElement('div'); row.className='palRow';
      const nm=document.createElement('span'); nm.className='palName'; nm.textContent=p.name; nm.title=p.name; row.appendChild(nm);
      for(const c of p.colors){ const s=document.createElement('div'); s.className='palSw'; s.style.background='#'+c; s.title='#'+c; s.onclick=()=>pickPal(c); row.appendChild(s); }
      body.appendChild(row);
    }
  }else if(palTab==='open'){
    for(const hue of Object.keys(OPEN_COLOR)){
      const g=document.createElement('div'); g.className='ocGrid';
      for(const c of OPEN_COLOR[hue]){ const s=document.createElement('div'); s.className='palSw'; s.style.background=c; s.title=c; s.onclick=()=>pickPal(c); g.appendChild(s); }
      body.appendChild(g);
    }
  }else{
    const wrap=document.createElement('div'); wrap.className='pfull';
    const ci=document.createElement('input'); ci.type='color'; ci.value='#'+(palTarget.hex||'CCCCCC');
    const tx=document.createElement('input'); tx.type='text'; tx.value=palTarget.hex||''; tx.style.width='84px'; tx.maxLength=7;
    ci.oninput=()=>{ tx.value=ci.value.slice(1).toUpperCase(); };
    const ok=document.createElement('button'); ok.textContent=_t('套用'); ok.className='primary';
    ok.onclick=()=>{ const h=(tx.value||ci.value.slice(1)).replace('#','').toUpperCase(); if(/^[0-9A-F]{6}$/.test(h)) pickPal(h); else alert(_t('請輸入 6 位十六進位色碼')); };
    wrap.appendChild(ci); wrap.appendChild(tx); wrap.appendChild(ok);
    body.appendChild(wrap);
  }
}
function pickPal(hex){ hex=String(hex).replace('#','').toUpperCase(); const t=palTarget; closePalette(); if(t&&t.onPick) t.onPick(hex); }
function openPalette(anchor,hex,onPick){
  palTarget={hex:String(hex).replace('#','').toUpperCase(),onPick};
  buildPalBody();
  const pop=$('#palettePop'); pop.hidden=false;
  const r=anchor.getBoundingClientRect(), pw=288, ph=340;
  let left=Math.min(r.left, window.innerWidth-pw-8), top=r.bottom+6;
  if(top+ph>window.innerHeight-8) top=Math.max(8,r.top-ph-6);
  pop.style.left=Math.max(8,left)+'px'; pop.style.top=top+'px';
}
function closePalette(){ $('#palettePop').hidden=true; palTarget=null; }
document.querySelectorAll('#palettePop .ptab').forEach(t=>t.onclick=()=>{ palTab=t.dataset.tab;
  document.querySelectorAll('#palettePop .ptab').forEach(x=>x.classList.toggle('on',x===t)); buildPalBody(); });
document.addEventListener('pointerdown',e=>{ if(!$('#palettePop').hidden && !e.target.closest('#palettePop') && !e.target.closest('.swatchBtn')) closePalette(); },true);

/* ===== JSON 模式色票欄 =====
   「本頁 JSON」面板的右半邊，隨面板開關與拖曳連動（DOM 上就掛在 .pjBody 內，不是獨立浮窗）。
   點色塊是「複製色碼」不是套用——貼到左邊 JSON 裡用。
   任何選取狀態都在（含沒選取，因為頁面層的 bg 也要調），不再限定表格/圖表：
   手改 JSON 這件事本來就不分元素型別。

   ⚠ 複製出來的格式**隨選中的元素而變**，因為 deck 內有兩套互斥的顏色慣例：
     表格等元素層 → 不帶 # 的 6 位碼 "4D9DE0"（畫布渲染時程式自己補 '#'，匯出走 srgbClr 也只認 6 位）
     圖表 option  → 合法 CSS 色 "#4D9DE0"（option 原封不動交給 ECharts，最終落到 ctx.fillStyle）
   少了 # 時 canvas 會**靜默忽略**該次賦值（不報錯、不進 console），線條變黑、文字整段不畫；
   而匯出 pptx 走 nvHex() 兩種都吃，所以只有畫布壞掉，症狀分裂特別難察覺。
   先前這裡一律複製裸碼並在註解裡寫「JSON 用不帶 # 的 6 位碼」，對圖表是錯的，已修正。 */
let copyPalTab='designer';
function buildCopyPalWin(){
  let w=$('#palCopyWin');
  if(!w){
    w=document.createElement('div'); w.id='palCopyWin';
    $('#pageJsonPanel').querySelector('.pjBody').appendChild(w);
  }
  w.innerHTML='';
  // 圖表的 option 是 raw ECharts，複製時要帶 #；表格等元素層一律裸碼。見本區塊開頭註解。
  const forChart=((selEl()||{}).type==='chart');
  w.dataset.fc=forChart?'1':'0';
  const head=document.createElement('div'); head.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:6px;';
  const title=document.createElement('span');
  title.textContent=forChart? _t('色票 → 複製 #色碼（圖表）') : _t('色票 → 複製色碼');
  title.title=forChart? _t('chart.option 是 raw ECharts，顏色必須帶 #，與 deck 其餘欄位相反')
                      : _t('元素層用不帶 # 的 6 位碼，畫布渲染時程式自己補');
  title.style.cssText='font-size:11px;color:var(--fg-dim);margin-right:auto;';
  const toast=document.createElement('span'); toast.style.cssText='font-size:11px;color:#69db7c;';
  head.appendChild(title); head.appendChild(toast); w.appendChild(head);
  const fmt=c=>(forChart?'#':'')+String(c).replace('#','').toUpperCase();
  const copy=async c=>{ const hex=fmt(c);
    try{ await navigator.clipboard.writeText(hex); }catch(e){}
    toast.textContent=_t('已複製 {0}',hex);
    setTimeout(()=>{ if(toast.textContent===_t('已複製 {0}',hex)) toast.textContent=''; },1600); };
  const tabs=document.createElement('div'); tabs.style.cssText='display:flex;gap:4px;margin-bottom:6px;';
  for(const [k,label] of [['designer',_t('精選')],['open','Open Color'],['full',_t('全色域')]]){
    const b=document.createElement('button'); b.textContent=label;
    b.style.cssText='font-size:11px;padding:2px 8px;'+(copyPalTab===k?'outline:1px solid var(--accent);':'');
    b.onclick=()=>{ copyPalTab=k; buildCopyPalWin(); };
    tabs.appendChild(b);
  }
  w.appendChild(tabs);
  const sw=c=>{ const s=document.createElement('div'); s.className='palSw'; s.style.background=(String(c)[0]==='#'?c:'#'+c); s.title=fmt(c); s.style.cursor='copy'; s.onclick=()=>copy(c); return s; };
  if(copyPalTab==='designer'){
    for(const p of DESIGNER_PALETTES){
      const row=document.createElement('div'); row.className='palRow';
      const nm=document.createElement('span'); nm.className='palName'; nm.textContent=p.name; nm.title=p.name; row.appendChild(nm);
      for(const c of p.colors) row.appendChild(sw(c));
      w.appendChild(row);
    }
  }else if(copyPalTab==='open'){
    for(const hue of Object.keys(OPEN_COLOR)){
      const g=document.createElement('div'); g.className='ocGrid';
      for(const c of OPEN_COLOR[hue]) g.appendChild(sw(c));
      w.appendChild(g);
    }
  }else{
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 2px;';
    const ci=document.createElement('input'); ci.type='color'; ci.value='#4D9DE0';
    const tx=document.createElement('input'); tx.type='text'; tx.value='4D9DE0'; tx.style.width='84px'; tx.maxLength=7;
    ci.oninput=()=>{ tx.value=ci.value.slice(1).toUpperCase(); };
    const ok=document.createElement('button'); ok.textContent=_t('複製'); ok.className='primary';
    ok.onclick=()=>{ const h=(tx.value||'').replace('#','').toUpperCase(); if(/^[0-9A-F]{6}$/.test(h)) copy(h); else alert(_t('請輸入 6 位十六進位色碼')); };
    wrap.appendChild(ci); wrap.appendChild(tx); wrap.appendChild(ok);
    w.appendChild(wrap);
  }
}
function updateCopyPalWin(){
  const w=$('#palCopyWin');
  if(!pageJsonOpen()){ if(w) w.hidden=true; return; }
  /* 只在「複製格式會變」時重建。這函式每次改選取都會跑，無條件重建會把使用者
     正在捲動的色票清單彈回頂端——選元素跟挑顏色是同時進行的兩件事。 */
  const fc=((selEl()||{}).type==='chart')?'1':'0';
  if(!w||w.dataset.fc!==fc) buildCopyPalWin();
  $('#palCopyWin').hidden=false;
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
/* 把 sprite 塞進任何按鈕：btnRow 走 {ic,txt}，手工建的按鈕走這支。 */
function setIcoBtn(b,ic,txt,title){
  b.className=(b.className? b.className+' ':'')+'icBtn';
  b.innerHTML='<svg class="ic"><use href="#'+ic+'"/></svg>';
  if(txt) b.appendChild(document.createTextNode(txt));
  if(title) b.title=title;
  return b;
}
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
// 陰影的 CSS 預覽：PPT 角度 0°＝向右、順時針（與 CSS 座標同向，y 軸向下）
function shadowCss(el){
  const s=el&&el.shadow; if(!s) return '';
  const a=((s.angle??SHADOW_DEF.angle))*Math.PI/180, d=pt2px(s.offset??SHADOW_DEF.offset);
  const al=Math.round((s.opacity??SHADOW_DEF.opacity)*255).toString(16).padStart(2,'0');
  return `drop-shadow(${(Math.cos(a)*d).toFixed(1)}px ${(Math.sin(a)*d).toFixed(1)}px ${(pt2px(s.blur??SHADOW_DEF.blur)/2).toFixed(1)}px #${s.color||SHADOW_DEF.color}${al})`;
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
function renderMultiProps(pp){
  const els=selEls();
  const gid=els[0]&&els[0].groupId;
  const isGroup=!!gid&&els.every(el=>el.groupId===gid)&&groupMembers(els[0]).length===els.length;
  pp.innerHTML=`<h4>${isGroup?_t('軟群組 {0} 個物件',els.length):_t('多選 {0} 個物件',els.length)}`
    +(isGroup?` <span class="unit" style="font-weight:400">${gid}</span>`:'')+`</h4>`;
  /* 位置尺寸：軟群組沒有自己的 x/y/w/h（成員各自獨立，匯出時攤平），這裡顯示的是**包圍盒**。
     改 X／Y＝整組平移；改寬／高＝以包圍盒左上角為不動點縮放整組，與拖四角把手同一個模型。 */
  pp.appendChild(secTitle(_t('位置尺寸（包圍盒）'),true));
  pp.appendChild(dimUnitRow());
  const moveAll=(ax,ay)=>{ for(const el of selEls()){ el.x=Math.round(el.x+ax); el.y=Math.round(el.y+ay); } };
  pp.appendChild(dimRow('X',()=>groupBBox(selEls()).x,v=>moveAll(v-groupBBox(selEls()).x,0)));
  pp.appendChild(dimRow('Y',()=>groupBBox(selEls()).y,v=>moveAll(0,v-groupBBox(selEls()).y)));
  const scaleBB=(fx,fy)=>{
    const list=selEls(), bb=groupBBox(list);
    if(!(bb.w>0)||!(bb.h>0)) return;
    if(APP.ratioLock){ const f=(fx!==1)?fx:fy; fx=f; fy=f; }   // 比例鎖定：改一邊另一邊跟著等比
    groupScaleXY({anchor:{x:bb.x,y:bb.y},orig:list.map(el=>structuredClone(el)),scaleFont:APP.fontSync},fx,fy);
  };
  pp.appendChild(dimRow(_t('寬'),()=>groupBBox(selEls()).w,v=>{ const bb=groupBBox(selEls()); if(v>0&&bb.w>0) scaleBB(v/bb.w,1); }));
  pp.appendChild(dimRow(_t('高'),()=>groupBBox(selEls()).h,v=>{ const bb=groupBBox(selEls()); if(v>0&&bb.h>0) scaleBB(1,v/bb.h); }));
  pp.appendChild(checkRow([
    [_t('比例鎖定'),()=>APP.ratioLock,v=>APP.ratioLock=v,_t('鎖包圍盒寬高比：改一邊另一邊等比跟著變')],
    [_t('字級同步'),()=>APP.fontSync,v=>APP.fontSync=v,_t('改包圍盒尺寸時，組內文字的字級一起放大縮小')],
  ]));
  pp.appendChild(secTitle(_t('變形')));
  pp.appendChild(btnRow([
    [_t('橫中'),()=>{ commitUndo(); const bb=groupBBox(selEls()); moveAll(Math.round((STAGE_W-bb.w)/2)-bb.x,0); renderStage(); renderProps(); },_t('整組在投影片水平置中（組內相對位置不變）')],
    [_t('縱中'),()=>{ commitUndo(); const bb=groupBBox(selEls()); moveAll(0,Math.round((STAGE_H-bb.h)/2)-bb.y); renderStage(); renderProps(); },_t('整組在投影片垂直置中')],
  ]));
  const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>縮放</label>');
  const inp=document.createElement('input'); inp.type='number'; inp.min=5; inp.max=1000; inp.value=100; inp.step=5;
  inp.onchange=()=>{ const s=(+inp.value)/100; if(!(s>0))return; commitUndo();
    const bb=groupBBox(selEls()); groupScaleTo({anchor:{x:bb.x+bb.w/2,y:bb.y+bb.h/2},orig:selEls().map(el=>structuredClone(el))},s);
    inp.value=100; updateSelBox(); };
  row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('%（比例）')}));
  pp.appendChild(row);
  pp.appendChild(opacityRow(els));
  pp.appendChild(secTitle(_t('對齊與分佈')));
  const alignH=(mode)=>{ commitUndo(); const bb=groupBBox(selEls());
    for(const el of selEls()){ const {w}=elSize(el);
      el.x=Math.round(mode==='l'?bb.x: mode==='c'?bb.x+(bb.w-w)/2 : bb.x+bb.w-w); }
    renderStage(); };
  const alignV=(mode)=>{ commitUndo(); const bb=groupBBox(selEls());
    for(const el of selEls()){ const {h}=elSize(el);
      el.y=Math.round(mode==='t'?bb.y: mode==='m'?bb.y+(bb.h-h)/2 : bb.y+bb.h-h); }
    renderStage(); };
  pp.appendChild(btnRow([[_t('左'),()=>alignH('l'),_t('左對齊')],[_t('中'),()=>alignH('c'),_t('水平置中')],[_t('右'),()=>alignH('r'),_t('右對齊')]]));
  pp.appendChild(btnRow([[_t('上'),()=>alignV('t'),_t('上對齊')],[_t('中'),()=>alignV('m'),_t('垂直置中')],[_t('下'),()=>alignV('b'),_t('下對齊')]]));
  // 等距分佈：首尾固定、中間平均間隙（需≥3）
  const distribute=(axis)=>{
    const list=selEls(); if(list.length<3) return; commitUndo();
    const m=list.map(el=>{ const {w,h}=elSize(el); return {el,w,h}; });
    m.sort((a,b)=> axis==='h'? a.el.x-b.el.x : a.el.y-b.el.y);
    const total=m.reduce((s,o)=> s+(axis==='h'?o.w:o.h),0);
    const span= axis==='h'? (m[m.length-1].el.x+m[m.length-1].w)-m[0].el.x
                          : (m[m.length-1].el.y+m[m.length-1].h)-m[0].el.y;
    const gap=(span-total)/(m.length-1);
    let cur= axis==='h'? m[0].el.x : m[0].el.y;
    for(const o of m){ if(axis==='h'){ o.el.x=Math.round(cur); cur+=o.w+gap; } else { o.el.y=Math.round(cur); cur+=o.h+gap; } }
    renderStage();
  };
  pp.appendChild(btnRow([[{ic:'ic-dist-h',txt:_t('水平等距')},()=>distribute('h'),_t('水平方向等間距（需 ≥3 個）')],[{ic:'ic-dist-v',txt:_t('垂直等距')},()=>distribute('v'),_t('垂直方向等間距（需 ≥3 個）')]]));
  pp.appendChild(secTitle(_t('群組與動作')));
  // 軟群組
  pp.appendChild(btnRow([
    [_t('群組'),()=>{ commitUndo(); const gid=uid('g'); for(const el of selEls()) el.groupId=gid; renderStage(); renderProps(); },_t('綁為軟群組：日後點任一即選全組')],
    ...(els.some(el=>el.groupId)? [[_t('解散'),()=>{ commitUndo(); for(const el of selEls()) delete el.groupId; renderStage(); renderProps(); },_t('解除群組')]] : []),
  ]));
  pp.appendChild(btnRow([[_t('複製'),()=>duplicateSelected(),'Cmd/Ctrl+D'],[_t('刪除'),()=>deleteSelected(),'Delete']]));
  const note=document.createElement('div'); note.className='row';
  note.innerHTML='<span class="unit">'+_t('拖四角是整組等比縮放，拖本體是整組搬移，吸附作用在包圍盒上。'
    +'上面的 X／Y／寬／高講的也是<b>包圍盒</b>——群組本身沒有座標，成員各自獨立，匯出時會攤平成獨立元素。'
    +'要改其中一個成員，雙擊進去。')+'</span>';
  pp.appendChild(note);
}
/* ---- 面板跟著游標／選取走 ----
   游標移動或反白範圍改變時，原本只更新 APP.edit.sel／APP.cellSel，面板不重繪，
   於是面板一直停在上一次的狀態——非得隨便按一個設定（那個 handler 順手呼叫了 renderProps）
   才會突然更新，看起來就是「每項調整都慢半拍」。
   但也不能無條件重繪：拖曳反白時 selectionchange 每一像素都會觸發，而 renderProps 是整個
   重建 #propPanel，會把使用者正在操作的控制項抽掉。故設三道閘。*/
/* ══ 右欄分頁 ══
   renderProps 產生的是**扁平**節點（H4／secTitle／subTitle／row…全在同一層），所以分頁
   做成事後處理：切群組 → 依標題歸頁 → 搬進 pane。renderProps 那 799 行一行都不用改，
   新增的區塊最差也只是落到預設頁，不會消失。

   為什麼要切到 subTitle 而不只是 secTitle：實測選中表格時「表格」這一個 secTitle 區塊
   自己就 1026px（全欄 1538px），只按 secTitle 分頁的話那一頁照樣要捲。切到 subTitle 後
   三頁分別是 670／480／546px，都在可見高度內。 */
/* 分頁的語意（2026-09-05 重整）：
   第一頁＝與內容無關的操作（位置、變形、層級、對齊、複製刪除）
   中間頁＝這個型別特有的內容與樣式，頁名就是型別名
   最後一頁＝所有型別都有的效果（超連結、陰影）
   舊分法是固定的「排列／樣式／型別名」三頁，名字對不上內容：「形狀」頁裡
   沒有形狀（形狀樣式被『樣式』頁認領走，只剩超連結與陰影），而圖表與影片
   因為沒有區塊落進『樣式』，分頁列會從三顆掉成兩顆。 */
const TAB_SEL_ARRANGE=[_t('位置尺寸'),_t('位置尺寸（包圍盒）'),_t('變形'),_t('排列'),_t('對齊與分佈')];
const TAB_SEL_ACT=[_t('動作'),_t('群組與動作')];   // 不進分頁，釘在面板底部
const TAB_SEL_FX=[_t('超連結'),_t('超連結（整個物件）'),_t('陰影')];
const TAB_SEL_CELL=[_t('儲存格樣式'),_t('框線'),_t('格內文字（反白處）')];
const TAB_SEL_PARA=[_t('字元進階'),_t('段落')];
const TAB_NONE_PAGE=[_t('頁面樣式'),_t('章節'),_t('備忘稿'),_t('範本與合併')];
/* 無選取時有 15 個區塊、共 2072px，三頁分不平（「簡報」那頁實測仍要捲 136px），故拆四頁。
   四個兩字頁籤在 220px 欄寬下各佔約 53px，剛好放得下。
   三個壓縮區塊歸「工具」而非「輸出」：它們是對簡報動手術（不可逆地重編碼位元組），
   不是匯出時的設定；擺在一起也方便比較「本頁／整份／背景圖」三者的現況。
   ⚠ 量分頁高度時不能用 pane.scrollHeight：.propPane 是 flex:1，內容再短也被拉滿，
   量到的永遠等於可用高度。要量「首子元素 top → 末子元素 bottom」，且一次只開一個 pane。
   照這個量法，四頁實際是 367／601／455／289px（可用 668px），都不必捲。 */
const TAB_NONE_TOOL=[_t('圖片壓縮（本頁）'),_t('圖片壓縮（整份簡報）'),_t('背景圖壓縮（整份簡報）')];
const TAB_CONTENT_NAME={text:_t('文字'),shape:_t('形狀'),table:_t('表格'),image:_t('圖片'),chart:_t('圖表'),video:_t('影片')};
const propTabMem={sel:0,none:0};   // 分頁選擇要撐過重繪——renderProps 每次改動都全量重建
function applyPropTabs(){
  const pp=$('#propPanel');
  const kids=[...pp.childNodes];
  if(!kids.length) return;
  const head=(kids[0].nodeType===1&&kids[0].tagName==='H4')? kids.shift() : null;
  // 切群組：secTitle／subTitle 各開一段，之後的節點都歸該段
  const groups=[]; let cur=null;
  for(const n of kids){
    const c=n.nodeType===1&&n.classList;
    if(c&&(c.contains('secTitle')||c.contains('subTitle'))){ cur={t:n.textContent.trim(),nodes:[]}; groups.push(cur); }
    if(!cur){ cur={t:'',nodes:[]}; groups.push(cur); }
    cur.nodes.push(n);
  }
  // 動作段抽出來釘底部，不參與分頁裝箱
  const actGroups=groups.filter(g=>TAB_SEL_ACT.includes(g.t));
  if(actGroups.length){
    const keep=new Set(actGroups);
    for(let i=groups.length-1;i>=0;i--) if(keep.has(groups[i])) groups.splice(i,1);
  }
  const mode=APP.selIds.length? 'sel' : 'none';
  const el=APP.selIds.length===1? selEl() : null;
  // null ＝這一頁收容所有沒被前面認領的區塊
  // 型別名：形狀若是線條類，內容區塊叫「線條樣式」，頁名跟著叫「線條」
  const typeName= el? (isLineEl(el)? _t('線條') : (TAB_CONTENT_NAME[el.type]||_t('內容'))) : _t('內容');
  const hasText= el&&(el.type==='text'||(el.type==='shape'&&el.paras));
  const defs= mode==='sel'
    ? (el&&el.type==='table'
        // 表格區塊多且高（單「表格」一段就 1026px），拆成結構與儲存格兩頁
        ? [[_t('版面'),TAB_SEL_ARRANGE],[_t('表格'),null],[_t('儲存格'),TAB_SEL_CELL],[_t('效果'),TAB_SEL_FX]]
      : hasText
        // 文字樣式＋字元進階＋段落合起來 774px，矮一點的視窗就要捲，故段落另立一頁
        ? [[_t('版面'),TAB_SEL_ARRANGE],[typeName,null],[_t('段落'),TAB_SEL_PARA],[_t('效果'),TAB_SEL_FX]]
        : [[_t('版面'),TAB_SEL_ARRANGE],[typeName,null],[_t('效果'),TAB_SEL_FX]])
    // 「簡報」「輸出」兩頁的內容 2026-09-05 搬進「全簡報設定」面板，右欄只留每天在用的
    : [[_t('頁面'),null],[_t('工具'),TAB_NONE_TOOL]];
  const fb=defs.findIndex(d=>d[1]===null);
  const buckets=defs.map(()=>[]);
  for(const g of groups){
    let i=g.t? defs.findIndex(d=>d[1]&&d[1].includes(g.t)) : 0;
    buckets[i<0? fb : i].push(g);
  }
  pp.innerHTML='';
  const addFoot=()=>{ if(!actGroups.length) return;
    const foot=document.createElement('div'); foot.id='propFoot';
    actGroups.forEach(g=>g.nodes.forEach(n=>foot.appendChild(n)));
    const s0=foot.querySelector('.secTitle'); if(s0) s0.classList.add('first');
    pp.appendChild(foot); };
  if(head){ const hd=document.createElement('div'); hd.id='propHead'; hd.appendChild(head); pp.appendChild(hd); }
  const fill=(pane,gs)=>{ gs.forEach(g=>g.nodes.forEach(n=>pane.appendChild(n)));
    // 每頁的第一個 secTitle 都要是 .first（沒有上邊框），否則每頁開頭都多一條線
    const secs=[...pane.querySelectorAll('.secTitle')];
    secs.forEach((n,i)=>n.classList.toggle('first',i===0)); };
  const live=defs.map((d,i)=>[d[0],buckets[i]]).filter(x=>x[1].length);
  if(live.length<=1){   // 只有一頁（如多選）就不擺分頁列，省一行高度
    const pane=document.createElement('div'); pane.className='propPane';
    live.forEach(([,gs])=>fill(pane,gs)); pp.appendChild(pane); addFoot(); return;
  }
  const bar=document.createElement('div'); bar.id='propTabs';
  const panes=[];
  const sync=()=>{ const k=Math.min(propTabMem[mode]||0,panes.length-1);
    panes.forEach(([b,pn],j)=>{ b.classList.toggle('on',j===k); pn.hidden=j!==k; }); };
  live.forEach(([name,gs],i)=>{
    const b=document.createElement('button'); b.className='propTab'; b.textContent=name;
    b.onclick=()=>{ propTabMem[mode]=i; sync(); };
    const pane=document.createElement('div'); pane.className='propPane'; fill(pane,gs);
    bar.appendChild(b); panes.push([b,pane]);
  });
  pp.appendChild(bar); panes.forEach(([,pn])=>pp.appendChild(pn)); addFoot();
  sync();
}
function renderProps(){ renderPropsBody(); applyPropTabs(); }
function propsSig(){
  const el=selEl();
  if(!el) return 'none';
  const ce=APP.cellEdit;
  return el.id+'|'+JSON.stringify(APP.cellSel||null)
    +'|'+(ce? ce.r+','+ce.c+','+JSON.stringify(ce.sel||null) : '')   // 格內反白改變→面板要跟著換範圍提示與樣式
    +'|'+(el.paras? JSON.stringify(panelRun(el)) : '');
}
let _propsSig='', _propsRaf=0;
function syncProps(){
  if(_propsRaf) return;                                   // 閘三：同一幀只做一次
  _propsRaf=requestAnimationFrame(()=>{
    _propsRaf=0;
    if($('#propPanel').contains(document.activeElement)) return;   // 閘一：正在操作面板
    if(!$('#palettePop').hidden) return;                           // 色票開著時重建會失去對象
    if(propsSig()===_propsSig) return;                             // 閘二：顯示內容沒變
    renderProps();
  });
}
function renderPropsBody(){
  _propsSig=propsSig();
  const pp=$('#propPanel'); pp.innerHTML='';
  if(APP.selIds.length>1){ renderMultiProps(pp); updateCopyPalWin(); return; }
  const el=selEl();
  if(!el&&APP.masterEdit){
    /* 母版編輯中沒選東西時，右欄不該顯示頁面屬性——那些控件（底色、背景圖、備忘稿、
       章節、不放映此頁）全都作用在**離開母版後會回去的那一頁**，不是母版。畫面上正在
       編輯母版卻擺著一排會改到別處的控件，是會讓人改錯東西的誤導。 */
    pp.innerHTML=_t('<h4>母版</h4>');
    pp.appendChild(secTitle(_t('母版'),true));
    const mi=document.createElement('div'); mi.className='row';
    mi.innerHTML='<span class="unit">'+_t('正在編輯母版。這裡放的元素會出現在<b>每一頁</b>，一般工具全部照用，'
      +'<b>點任何一個母版元素</b>就能在這裡改它的屬性。<br><br>'
      +'底色、背景圖、備忘稿、章節這些屬於個別頁面，母版模式下改不到。'
      +'整份簡報的設定請按工具列的<b>全簡報設定</b>。')+'</span>';
    pp.appendChild(mi);
    pp.appendChild(btnRow([[{ic:'ic-master',txt:_t('完成，回到頁面')},()=>setMasterEdit(false),_t('離開母版編輯')]]));
    updateCopyPalWin();
    return;
  }
  if(!el){
    pp.innerHTML=_t('<h4>頁面</h4>');
    pp.appendChild(secTitle(_t('頁面樣式'),true));
    pp.appendChild(colorRow(_t('底色'),curPage().bg,v=>{curPage().bg=v||'FFFFFF';},false));
    // 頁面背景圖（滿版拉伸，匯出為原生 <p:bg> blipFill；蓋在底色之上、所有元素之下）
    pp.appendChild(btnRow([
      [{ic:'ic-image',txt:_t('背景圖')},()=>$('#bgInput').click(),_t('選一張圖當本頁滿版背景（匯出為原生頁面背景）')],
      ...(curPage().bgImage? [[_t('清除'),()=>{ commitUndo(); delete curPage().bgImage; renderAll(); syncPageJson(); },_t('移除背景圖')]]:[]),
    ]));
    if(curPage().bgImage){
      const bn=document.createElement('div'); bn.className='row';
      bn.innerHTML=_t('<span class="unit">背景圖已設定（滿版拉伸，不隨元素選取）。想要精確裁切／局部露出，請改用一般圖片元素鋪滿整頁。</span>');
      pp.appendChild(bn);
      /* 背景圖的單獨壓縮入口：它不是元素、選不到，沒有這條路就只能連同其他圖一起批次壓。
         目標像素按滿版畫布算（STAGE_W×STAGE_H×倍率），與下方批次用的是同一套換算。 */
      pp.appendChild(batchCompressRows('pagebg'));
    }
    // 轉場（進入此頁時播放；Morph 依元素 id 跨頁配對，複製頁改版面即可平滑補間）
    const trRow=document.createElement('div'); trRow.className='row'; trRow.innerHTML=_t('<label>轉場</label>');
    const trSel=document.createElement('select');
    trSel.innerHTML='<option value="">'+_t('無')+'</option>'+Object.entries(TRANSITIONS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
    trSel.value=(curPage().transition&&curPage().transition.type)||'';
    trSel.onchange=()=>{ commitUndo();
      curPage().transition= trSel.value? (trSel.value==='morph'? {type:'morph',dur:600}:{type:trSel.value}) : null;
      renderProps(); syncPageJson(); };
    trRow.appendChild(trSel); pp.appendChild(trRow);
    if(curPage().transition&&curPage().transition.type==='morph'){
      const dr=document.createElement('div'); dr.className='row'; dr.innerHTML=_t('<label>時長</label>');
      const di=document.createElement('input'); di.type='number'; di.min=100; di.max=10000; di.step=100; di.value=curPage().transition.dur||600;
      di.onchange=()=>{ commitUndo(); curPage().transition.dur=Math.max(100,Math.min(10000,Math.round(+di.value)||600)); syncPageJson(); };
      dr.appendChild(di); dr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'ms'}));
      pp.appendChild(dr);
      const mn=document.createElement('div'); mn.className='row';
      mn.innerHTML='<span class="unit">'+_t('Morph 是看元素 id 去配對前一頁的同名元素，所以「複製此頁」會保留 id，'
        +'就是為了讓它配得到。太舊的 PowerPoint 不支援 Morph，會自動退成淡出。')+'</span>';
      pp.appendChild(mn);
    }
    // 本頁圖片批次壓縮：含元素圖與本頁背景圖，每張各自依自己的顯示尺寸換算目標像素
    // 「本頁不套母版」是逐頁設定，留在頁面屬性；母版本身的開關與匯出方式在「全簡報」面板
    if(masterOn()&&!APP.masterEdit)
      pp.appendChild(checkRow([[_t('本頁不套母版'),()=>!!curPage().noMaster,v=>{ commitUndo();
        if(v) curPage().noMaster=true; else delete curPage().noMaster;
        renderAll(); syncPageJson(); },_t('封面／全出血圖片頁常用')]]));
    // 隱藏投影片：仍在檔案裡、放映時跳過（匯出為 <p:sld show="0">）
    pp.appendChild(checkRow([[_t('不放映此頁'),()=>!!curPage().skip,v=>{ commitUndo();
      if(v) curPage().skip=true; else delete curPage().skip;
      renderAll(); syncPageJson(); },_t('頁仍在檔案內，但放映與「從頭開始」會跳過（PPT 的「隱藏投影片」）')]]));
    // 沒有圖片就整段不長：留一行「沒有圖片」只是佔位，想壓縮的人才會來看這一區
    if(collectImageTargets('page').length){
      pp.appendChild(secTitle(_t('圖片壓縮（本頁）')));
      pp.appendChild(batchCompressRows('page'));
    }
    /* 章節：PowerPoint 縮圖窗格的可摺疊分組，只影響編輯時的導覽，放映與版面完全不變。
       語意掛在「頁」上但作用是「從這頁起的一段」，故標籤寫成「從本頁開始」。 */
    pp.appendChild(secTitle(_t('章節')));
    const hasSec=curPage().section!=null;
    pp.appendChild(checkRow([[_t('從本頁開始新章節'),()=>hasSec,v=>{ commitUndo();
      if(v){ const idx=APP.deck.pages.indexOf(curPage());
             curPage().section=curPage().name||_t('章節 {0}',idx+1); }
      else delete curPage().section;
      normalizeDeck(APP.deck); renderAll(); syncPageJson(); },
      _t('PowerPoint 縮圖窗格的可摺疊分組：可整段收合／搬動／隱藏。不影響投影片內容，放映時看不到')]]));
    if(hasSec){
      const sr=document.createElement('div'); sr.className='row'; sr.innerHTML=_t('<label>章節名</label>');
      const si=document.createElement('input'); si.type='text'; si.value=curPage().section; si.maxLength=60;
      si.onchange=()=>{ commitUndo();
        curPage().section=si.value.trim()||curPage().name||_t('章節');
        normalizeDeck(APP.deck);        // 撞名時會自動補 (2)，馬上回寫欄位讓使用者看得到
        renderAll(); syncPageJson(); };
      sr.appendChild(si); pp.appendChild(sr);
      const sn=document.createElement('div'); sn.className='row';
      sn.innerHTML=_t('<span class="unit">本頁到下一個章節起點之間的頁面同屬此章。章節名<b>必須唯一</b>，撞名會自動補「(2)」——PowerPoint 是靠名稱認章節的。</span>');
      pp.appendChild(sn);
    }
    pp.appendChild(secTitle(_t('備忘稿')));
    const nl=document.createElement('div'); nl.className='row'; nl.innerHTML=_t('<label style="min-width:auto">講者備忘稿</label>');
    pp.appendChild(nl);
    const nt=document.createElement('textarea'); nt.rows=4; nt.placeholder=_t('此頁備忘稿（匯出寫入 pptx 備忘稿）'); nt.value=curPage().notes||'';
    nt.onchange=()=>{ commitUndo(); curPage().notes=nt.value; };
    pp.appendChild(nt);
    // ── 以下三區為「整份簡報」層級（不只本頁），標題已標明，避免與頁面屬性混淆 ──
    // 整份簡報的圖片壓縮：所有頁的元素圖＋母版圖片（背景圖另立一區，見下）
    if(collectImageTargets('deck').length){
      pp.appendChild(secTitle(_t('圖片壓縮（整份簡報）')));
      pp.appendChild(batchCompressRows('deck'));
    }
    // 背景圖獨立成區：滿版、通常最大、觀眾整場都在看，該不該壓要讓使用者單獨決定
    if(APP.deck.pages.some(p=>p.bgImage)){
      pp.appendChild(secTitle(_t('背景圖壓縮（整份簡報）')));
      pp.appendChild(batchCompressRows('deckbg'));
    }
    pp.appendChild(secTitle(_t('範本與合併')));
    pp.appendChild(btnRow([[{ic:'ic-template',txt:_t('套範本')},()=>openTemplateModal(),_t('插入版型頁')],[{ic:'ic-merge',txt:_t('合併簡報')},()=>$('#mergeInput').click(),_t('把另一份 .deck 的頁附加進來')]]));
    /* 「本頁 JSON」不屬於「範本與合併」，改放底部動作列——與選取元素時同一個位置。
       這一段是無選取時唯一的動作，標題仍用「動作」才會被 applyPropTabs 抽到 propFoot。 */
    pp.appendChild(secTitle(_t('動作')));
    pp.appendChild(btnRow([[{ic:'ic-code',txt:_t('本頁 JSON')},()=>openPageJson(),
      _t('開啟本頁 JSON 面板（點畫布元素會聚焦其 JSON）')]]));
    updateCopyPalWin();
    return;
  }
  const names={text:_t('文字框'),table:_t('表格'),image:_t('圖片'),shape:_t('形狀'),chart:_t('圖表'),video:_t('影片')};
  pp.innerHTML=`<h4>${names[el.type]||el.type} <span class="unit" style="font-weight:400">${el.id}</span></h4>`;
  const sz=elSize(el);
  pp.appendChild(secTitle(_t('位置尺寸'),true));
  pp.appendChild(dimUnitRow());
  pp.appendChild(dimRow('X',()=>el.x,v=>el.x=Math.round(v)));
  pp.appendChild(dimRow('Y',()=>el.y,v=>el.y=Math.round(v)));
  pp.appendChild(dimRow(_t('寬'),()=>elSize(el).w,v=>applyDim(el,true,v)));
  pp.appendChild(dimRow(_t('高'),()=>elSize(el).h,v=>applyDim(el,false,v)));
  if(el.type!=='image'&&!isLineEl(el)) pp.appendChild(checkRow([
    [_t('比例鎖定'),()=>APP.ratioLock,v=>APP.ratioLock=v,_t('鎖寬高比：改一邊或拖曳 resize 時另一邊等比放大')],
    [_t('字級同步'),()=>APP.fontSync,v=>APP.fontSync=v,_t('改尺寸／拖曳 resize 時字級一起放大')],
  ]));
  // 縮放滑桿（0.1–2.0×，停頓於 0.5/0.8/1.0/1.2/1.5）＋含字級（預設開）；放開歸回 1.0×
  pp.appendChild(secTitle(_t('變形')));
  const scWrap=document.createElement('div'); scWrap.className='row'; scWrap.style.flexWrap='wrap'; scWrap.innerHTML=_t('<label>縮放</label>');
  const sl=document.createElement('input'); sl.type='range'; sl.min='0.1'; sl.max='2'; sl.step='0.01'; sl.value='1'; sl.style.flex='1'; sl.style.minWidth='90px'; sl.setAttribute('list','scaleTicks');
  const scVal=Object.assign(document.createElement('span'),{className:'unit'}); scVal.textContent='1.00×';
  const DET=[0.5,0.8,1,1.2,1.5]; let scOrig=null;
  sl.addEventListener('pointerdown',()=>{ scOrig=structuredClone(el); });
  sl.oninput=()=>{ let v=parseFloat(sl.value);
    for(const d of DET){ if(Math.abs(v-d)<0.03){ v=d; sl.value=d; break; } }   // 停頓感
    if(!scOrig) scOrig=structuredClone(el);
    scVal.textContent=v.toFixed(2)+'×';
    groupScaleTo({anchor:{x:scOrig.x,y:scOrig.y},orig:[structuredClone(scOrig)],scaleFont:APP.scaleFont},v);
    updateSelBox();
  };
  sl.onchange=()=>{ const v=parseFloat(sl.value);
    if(scOrig&&Math.abs(v-1)>1e-6){   // 還原→commit→重套，確保 undo 一步回原尺寸
      const cur=curEls().find(e=>e.id===el.id);
      if(cur){ Object.keys(cur).forEach(k=>delete cur[k]); Object.assign(cur,structuredClone(scOrig)); }
      commitUndo();
      groupScaleTo({anchor:{x:scOrig.x,y:scOrig.y},orig:[structuredClone(scOrig)],scaleFont:APP.scaleFont},v);
    }
    scOrig=null; sl.value=1; renderProps();
  };
  const scChk=document.createElement('label'); scChk.style.cssText='display:flex;align-items:center;gap:3px;min-width:auto;cursor:pointer'; scChk.title=_t('縮放時字級一起放大');
  const scCb=document.createElement('input'); scCb.type='checkbox'; scCb.checked=APP.scaleFont; scCb.style.width='auto'; scCb.onchange=()=>APP.scaleFont=scCb.checked;
  scChk.appendChild(scCb); scChk.appendChild(document.createTextNode(_t('含字級')));
  scWrap.appendChild(sl); scWrap.appendChild(scVal); scWrap.appendChild(scChk);
  pp.appendChild(scWrap);
  pp.appendChild(opacityRow([el]));
  pp.appendChild(btnRow([
    [_t('橫中'),()=>{ commitUndo(); el.x=Math.round((STAGE_W-elSize(el).w)/2); renderStage(); renderProps(); },_t('水平置中')],
    [_t('縱中'),()=>{ commitUndo(); el.y=Math.round((STAGE_H-elSize(el).h)/2); renderStage(); renderProps(); },_t('垂直置中')],
  ]));
  // 旋轉／翻轉（圖片與面狀形狀；線條類方向由端點控制）
  if(el.type==='image'||(el.type==='shape'&&!isLineEl(el))){
    const rr=document.createElement('div'); rr.className='row'; rr.innerHTML=_t('<label>角度</label>');
    const ri=document.createElement('input'); ri.type='number'; ri.step='0.1'; ri.value=el.rot||0;
    ri.onchange=()=>{ commitUndo(); el.rot=((parseFloat(ri.value)||0)%360+360)%360; renderStage(); renderProps(); };
    rr.appendChild(ri); rr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'°'}));
    rr.appendChild(setIcoBtn(Object.assign(document.createElement('button'),{
      onclick:()=>{ commitUndo(); el.rot=(((el.rot||0)+90)%360); renderStage(); renderProps(); }}),'ic-rotate','90°',_t('順時針轉 90°')));
    pp.appendChild(rr);
    pp.appendChild(btnRow([
      [{ic:'ic-flip-h',txt:''},()=>{ commitUndo(); el.flipH=!el.flipH; renderStage(); renderProps(); },_t('水平翻轉'),!!el.flipH],
      [{ic:'ic-flip-v',txt:''},()=>{ commitUndo(); el.flipV=!el.flipV; renderStage(); renderProps(); },_t('垂直翻轉'),!!el.flipV],
    ]));
  }
  /* 幾何：編輯端點／圖形編輯器／adj 黃點微調。自成一段才不會被歸進上面的「變形」，
     那會讓它們跟著跑到「版面」分頁，而它們明明是形狀本身的事。 */
  if(el.type==='shape'&&((el.shape!=='custGeom'&&!LINE_KINDS[el.shape]&&PRESET_GEOM[el.shape])
      ||el.shape==='custGeom'||adjCount(el.shape)))
    pp.appendChild(subTitle(_t('幾何')));
  /* 內建形狀 → custGeom（等同 PowerPoint 的「編輯端點」）。
     單向不可逆，且會失去黃點與子路徑各自的填色／描邊差異，故先問清楚才做。 */
  if(el.type==='shape'&&el.shape!=='custGeom'&&!LINE_KINDS[el.shape]&&PRESET_GEOM[el.shape]){
    const r=document.createElement('div'); r.className='row';
    r.innerHTML=_t('<label>編輯端點</label>');
    const b=setIcoBtn(document.createElement('button'),'ic-pencil',_t('轉成可編輯端點'));
    b.style.flex='1';
    b.title=_t('把這個內建形狀拆成端點後進圖形編輯器（同 PowerPoint 的「編輯端點」）。單向不可逆');
    b.onclick=()=>toCustGeom(el);
    r.appendChild(b); pp.appendChild(r);
  }
  // 自訂幾何：進圖形編輯器（畫布上直接畫，不必手改 points）
  if(el.type==='shape'&&el.shape==='custGeom'){
    const r=document.createElement('div'); r.className='row';
    r.innerHTML=_t('<label>自訂幾何</label>');
    const b=setIcoBtn(document.createElement('button'),'ic-pencil',_t('開啟圖形編輯器'));
    b.style.flex='1'; b.onclick=()=>openGeomEditor(el);
    r.appendChild(b); pp.appendChild(r);
  }
  // 形狀 adj 控點（黃點微調）：圓角/斜度/箭深/桿寬/尾標等，每參數一條滑桿，即時預覽、匯出注入原生 avLst
  if(el.type==='shape'&&adjCount(el.shape)){
    const bd=adjBounds(el.shape,el.w,el.h||1);
    bd.forEach((b,mi)=>{
      if(b.fixed) return;   // 沒有黃點引用的 adj＝preset 的固定補齊值，不給使用者調
      const cur=()=>adjVals(el)[mi];
      const pct=v=>(v/1000).toFixed(1)+'%';   // adj 是 OOXML 千分比，面板顯示成百分比才讀得懂
      const ar=document.createElement('div'); ar.className='row'; ar.innerHTML=`<label>${adjLabel(el.shape,mi)}</label>`;
      const ai=document.createElement('input'); ai.type='range';
      ai.min=Math.round(b.lo); ai.max=Math.round(b.hi); ai.step=Math.max(1,Math.round((b.hi-b.lo)/400));
      ai.value=cur(); ai.style.flex='1'; ai.style.minWidth='70px';
      const av=Object.assign(document.createElement('span'),{className:'unit'}); av.textContent=pct(cur());
      let adjDirty=false;
      ai.addEventListener('pointerdown',()=>adjDirty=false);
      ai.oninput=()=>{ if(!adjDirty){ commitUndo(); adjDirty=true; } setAdj(el,mi,parseFloat(ai.value)); av.textContent=pct(cur());
        const box=stage.querySelector(`.el[data-id="${el.id}"]`); if(box) renderShapeInto(box,el); updateSelBox(); };
      ar.appendChild(ai); ar.appendChild(av);
      pp.appendChild(ar);
    });
  }
  const contentTitle= el.type==='text' ? _t('文字樣式')
    : (el.type==='shape'&&el.paras&&!isLineEl(el)) ? _t('形狀與文字樣式')   // 這段底下同時有底色／漸層／框線與字級行距
    : isLineEl(el) ? _t('線條樣式')
    : el.type==='shape' ? _t('形狀樣式')
    : el.type==='table' ? _t('表格')
    : el.type==='image' ? _t('圖片')
    : el.type==='chart' ? _t('圖表')
    : el.type==='video' ? _t('影片') : null;
  if(contentTitle) pp.appendChild(secTitle(contentTitle));

  if(el.type==='text'||(el.type==='shape'&&el.paras)){
    const b=panelRun(el);   // 編輯中有選取時＝選取起點那個 run 的樣式，否則＝元素第一個 run
    const ta=document.createElement('textarea'); ta.rows=3;
    ta.title=_t('純文字覆寫整個文字框（會清掉格內混排格式）。要只改幾個字的格式，請在畫布上雙擊、反白後用下面的按鈕。');
    ta.value=plainText(el);
    ta.onchange=()=>{
      // 這條路一定會攤平（純文字沒有格式資訊），所以混排時先問過再做
      const mixed=(el.paras||[]).some(p=>(p.runs||[]).some(r=>!sameStyle(r,el.paras[0].runs[0])));
      if(mixed&&!confirm(_t('純文字覆寫會清掉這個文字框的混排格式（粗體、顏色、連結…），確定要覆寫嗎？'))){ ta.value=plainText(el); return; }
      commitUndo(); el.paras=mkParas(ta.value,baseRun(el)); renderStage(); renderProps();
    };
    pp.appendChild(ta);
    const row=document.createElement('div'); row.className='row';
    row.innerHTML=_t('<label>字級</label>');
    const inp=document.createElement('input'); inp.type='number'; inp.min=6; inp.max=96; inp.value=b.sizePt;
    inp.onchange=()=>{ commitUndo(); runApply(el,r=>r.sizePt=+inp.value); renderStage(); };
    row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
    pp.appendChild(row);
    const lsr=document.createElement('div'); lsr.className='row'; lsr.innerHTML=_t('<label>行距</label>');
    const lsi=document.createElement('input'); lsi.type='number'; lsi.step='0.05'; lsi.min='0.5'; lsi.max='5'; lsi.value=el.lineSpacing||1.2;
    lsi.onchange=()=>{ commitUndo(); const v=parseFloat(lsi.value); el.lineSpacing=(v&&Math.abs(v-1.2)>1e-6)?v:undefined; if(el.lineSpacing===undefined)delete el.lineSpacing; renderStage(); };
    lsr.appendChild(lsi); lsr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('×字級')}));
    pp.appendChild(lsr);
    pp.appendChild(btnRow([
      ['B',()=>{ commitUndo(); const on=!b.bold; runApply(el,r=>r.bold=on); renderStage(); renderProps(); },_t('粗體（畫布上反白幾個字，就只套那幾個字）'),b.bold],
      ['I',()=>{ commitUndo(); const on=!b.italic; runApply(el,r=>r.italic=on); renderStage(); renderProps(); },_t('斜體（同上，可只套選取範圍）'),b.italic],
      ['U',()=>{ commitUndo(); const on=!b.underline; setRunOpt(el,'underline',on||undefined); renderStage(); renderProps(); },_t('底線'),!!b.underline],
      ['S',()=>{ commitUndo(); const on=!b.strike; setRunOpt(el,'strike',on||undefined); renderStage(); renderProps(); },_t('刪除線'),!!b.strike],
    ]));
    pp.appendChild(colorRow(_t('文字'),b.color,v=>runApply(el,r=>r.color=v),false));
    pp.appendChild(colorRow(_t('高亮'),b.highlight||null,v=>setRunOpt(el,'highlight',v||undefined),true));
    pp.appendChild(btnRow([[_t('左'),()=>{commitUndo();runApply(el,(r,p)=>p.align='left');renderStage();renderProps();},'',b.align==='left'],
      [_t('中'),()=>{commitUndo();runApply(el,(r,p)=>p.align='center');renderStage();renderProps();},'',b.align==='center'],
      [_t('右'),()=>{commitUndo();runApply(el,(r,p)=>p.align='right');renderStage();renderProps();},'',b.align==='right']]));
    pp.appendChild(btnRow([[_t('上'),()=>{commitUndo();el.valign='top';renderStage();renderProps();},'',(el.valign||'top')==='top'],
      [_t('中'),()=>{commitUndo();el.valign='middle';renderStage();renderProps();},'',el.valign==='middle'],
      [_t('下'),()=>{commitUndo();el.valign='bottom';renderStage();renderProps();},'',el.valign==='bottom']]));
    pp.appendChild(colorRow(_t('底色'),el.fill,v=>el.fill=v,true));
    pp.appendChild(gradRows(el));
    pp.appendChild(colorRow(_t('框線'),el.lineColor,v=>el.lineColor=v,true));
    if(el.lineColor!=null) pp.appendChild(dashRow(el));
    // 文字框內距與換行：目前預設 0 內距、自動換行（與舊版行為一致），有需要才調
    pp.appendChild(numRow(_t('內距'),el.inset||0,v=>{ if(v>0) el.inset=v; else delete el.inset; },
      {min:0,max:72,step:1,unit:'pt',title:_t('文字與框邊的距離（匯出為 bodyPr 的 lIns/tIns/rIns/bIns）。有填色的卡片式文字框很有感')}));
    pp.appendChild(checkRow([[_t('不自動換行'),()=>!!el.nowrap,v=>{ commitUndo();
      if(v) el.nowrap=true; else delete el.nowrap; renderStage(); renderProps(); },
      _t('文字超出框寬不折行（匯出 bodyPr wrap="none"）；適合單行標籤')]]));
    // 文字方向（直書／旋轉）：匯出為原生 bodyPr vert，不是把文字框整個轉角度
    {const vr=document.createElement('div'); vr.className='row'; vr.innerHTML=_t('<label>文字方向</label>');
     const vs=document.createElement('select'); vs.style.flex='1';
     vs.innerHTML='<option value="">'+_t('橫書')+'</option>'+Object.entries(VERT_MODES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
     vs.value=el.vert||'';
     vs.title=_t('匯出為原生 <a:bodyPr vert>：文字在框內轉向，框本身不轉（要轉整個框請用「旋轉」）');
     vs.onchange=()=>{ commitUndo();
       if(VERT_MODES[vs.value]) el.vert=vs.value; else delete el.vert;
       renderStage(); renderProps(); syncPageJson(); };
     vr.appendChild(vs); pp.appendChild(vr);}
    // ── 字元進階：字距／自訂字型／描邊／輝光（皆 run 級，套用到本元素全部 run）──
    pp.appendChild(subTitle(_t('字元進階')));
    pp.appendChild(numRow(_t('字距'),b.charSpacing||0,v=>setRunOpt(el,'charSpacing',v||undefined),
      {min:-5,max:30,step:0.5,unit:'pt',title:_t('字元間距（正值拉寬、負值收緊）')}));
    const ffr=document.createElement('div'); ffr.className='row'; ffr.innerHTML=_t('<label>字型</label>');
    const ffi=document.createElement('input'); ffi.type='text'; ffi.style.flex='1'; ffi.style.minWidth='80px';
    ffi.placeholder=_t('沿用全域'); ffi.value=b.fontFace||'';
    ffi.title=_t('只覆寫此元素的字型（留空＝沿用頂端「字體」模式設定）。匯出時 latin/ea/cs 三槽都用此字型。');
    ffi.onchange=()=>{ commitUndo(); setRunOpt(el,'fontFace',ffi.value.trim()||undefined); renderStage(); renderProps(); };
    ffr.appendChild(ffi); pp.appendChild(ffr);
    pp.appendChild(checkRow([
      [_t('描邊'),()=>!!b.outline,v=>{ commitUndo(); setRunOpt(el,'outline', v?{size:1,color:'FFFFFF'}:undefined); renderStage(); renderProps(); },_t('文字外框描邊（海報式大字）')],
      [_t('輝光'),()=>!!b.glow,v=>{ commitUndo(); setRunOpt(el,'glow', v?{size:8,color:'FFFF00',opacity:0.6}:undefined); renderStage(); renderProps(); },_t('文字外緣輝光')],
    ]));
    if(b.outline){
      pp.appendChild(colorRow(_t('描邊色'),b.outline.color||'FFFFFF',v=>setRunOpt(el,'outline',{...b.outline,color:v}),false));
      pp.appendChild(numRow(_t('描邊寬'),b.outline.size||1,v=>setRunOpt(el,'outline',{...b.outline,size:Math.max(0.25,v)}),{min:0.25,max:8,step:0.25,unit:'pt'}));
    }
    if(b.glow){
      pp.appendChild(colorRow(_t('輝光色'),b.glow.color||'FFFF00',v=>setRunOpt(el,'glow',{...b.glow,color:v}),false));
      pp.appendChild(numRow(_t('輝光徑'),b.glow.size||8,v=>setRunOpt(el,'glow',{...b.glow,size:Math.max(1,v)}),{min:1,max:50,step:1,unit:'pt'}));
    }
    // ── 段落：項目符號／編號、縮排層級、段前後間距 ──
    pp.appendChild(subTitle(_t('段落')));
    const buType=(b.bullet&&b.bullet.type)||null;
    const setBullet=v=>{ commitUndo(); runApply(el,(r,p)=>{ if(v) p.bullet=v; else delete p.bullet; }); renderStage(); renderProps(); };
    pp.appendChild(btnRow([
      [_t('無'),()=>setBullet(null),_t('不使用清單'),!buType],
      [_t('• 符號'),()=>setBullet({type:'bullet',level:(b.bullet&&b.bullet.level)||0}),_t('項目符號清單'),buType==='bullet'],
      [_t('1. 編號'),()=>setBullet({type:'number',level:(b.bullet&&b.bullet.level)||0,startAt:1}),_t('編號清單'),buType==='number'],
    ]));
    if(buType){
      const lv=(b.bullet.level|0);
      const lvRow=btnRow([
        ['−',()=>setBullet({...b.bullet,level:Math.max(0,lv-1)}),_t('減少縮排層級')],
        [_t('＋'),()=>setBullet({...b.bullet,level:Math.min(8,lv+1)}),_t('增加縮排層級')],
      ]);
      lvRow.insertBefore(Object.assign(document.createElement('label'),{textContent:_t('縮排')}),lvRow.firstChild);
      lvRow.appendChild(Object.assign(document.createElement('span'),{className:'unit',
        textContent:_t('層級 {0}（每層 {1}pt）',lv+1,BULLET_INDENT)}));
      pp.appendChild(lvRow);
    }
    pp.appendChild(numRow(_t('段前'),(b.spaceBefore)||0,v=>runApply(el,(r,p)=>{ if(v>0)p.spaceBefore=v; else delete p.spaceBefore; }),{min:0,max:72,step:1,unit:'pt',title:_t('段落上方額外間距')}));
    pp.appendChild(numRow(_t('段後'),(b.spaceAfter)||0,v=>runApply(el,(r,p)=>{ if(v>0)p.spaceAfter=v; else delete p.spaceAfter; }),{min:0,max:72,step:1,unit:'pt',title:_t('段落下方額外間距')}));
    // ── 超連結：外部網址或跳到本簡報某頁 ──
    pp.appendChild(subTitle(_t('超連結')));
    const lkr=document.createElement('div'); lkr.className='row'; lkr.innerHTML=_t('<label>連結</label>');
    const lki=document.createElement('input'); lki.type='text'; lki.style.flex='1'; lki.style.minWidth='80px';
    lki.placeholder=_t('https://… 或 #3');
    lki.value= b.link? (b.link.url||('#'+b.link.slide)) : '';
    lki.title=_t('填網址；或填「#頁碼」跳到本簡報該頁。PptxGenJS 會自動補底線（預覽同步顯示）。');
    lki.onchange=()=>{ commitUndo(); const v=lki.value.trim();
      setRunOpt(el,'link', !v? undefined : (v[0]==='#'? {slide:Math.max(1,Math.round(+v.slice(1))||1)} : {url:v}));
      renderStage(); renderProps(); };
    lkr.appendChild(lki); pp.appendChild(lkr);
    if(el.type==='shape') pp.appendChild(linkRows(el,_t('形狀')));   // 有文字的形狀：整塊也可設連結
    pp.appendChild(shadowRows(el));
  }
  if(isLineEl(el)){
    pp.appendChild(colorRow(_t('線色'),el.lineColor,v=>el.lineColor=v,false));
    const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>線寬</label>');
    const inp=document.createElement('input'); inp.type='number'; inp.step=0.25; inp.min=0.25; inp.value=el.linePt||1.5;
    inp.onchange=()=>{ commitUndo(); el.linePt=+inp.value; renderStage(); };
    row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
    pp.appendChild(row);
    pp.appendChild(dashRow(el));
    const note=document.createElement('div'); note.className='row';
    note.innerHTML=_t('<span class="unit">拖兩端的圓點可以改方向，快接近水平或垂直時會自動貼齊。</span>');
    pp.appendChild(note);
    pp.appendChild(linkRows(el,_t('線條')));
  }
  if(el.type==='shape'&&!isLineEl(el)&&!el.paras){
    pp.appendChild(colorRow(_t('底色'),el.fill,v=>el.fill=v,true));
    pp.appendChild(gradRows(el));
    pp.appendChild(colorRow(_t('框線'),el.lineColor,v=>el.lineColor=v,true));
    if(el.lineColor!=null) pp.appendChild(dashRow(el));
    pp.appendChild(btnRow([[_t('加入文字'),()=>{ commitUndo(); el.paras=mkParas(_t('文字'),{sizePt:14,color:'FFFFFF',align:'center'}); el.valign='middle'; renderStage(); renderProps(); }]]));
    pp.appendChild(linkRows(el,_t('形狀')));
    pp.appendChild(shadowRows(el));
  }
  if(el.type==='image'){
    // 完整＝無 crop、框鎖原圖比例；裁切＝進入互動模式，構圖存進 el.crop 四邊比例
    const cropped=!cropIsEmpty(cropOf(el)), inCrop=APP.cropping===el.id;
    pp.appendChild(btnRow([
      [_t('完整'),()=>{ commitUndo(); delete el.crop; delete el.fit; APP.cropping=null;
        if(el.natW&&el.natH) el.h=Math.max(4,Math.round(el.w*el.natH/el.natW));   // 回到原始比例
        renderStage(); renderProps(); syncPageJson(); },_t('清除裁切，整張塞進框並回到原圖比例'),!cropped],
      [inCrop?_t('完成裁切'):_t('裁切…'),()=>{ inCrop? endCrop() : startCrop(el); },
        _t('雙擊圖片也可進入。裁切中：拖曳移動構圖、滾輪縮放、Enter 或 Esc 完成'),cropped||inCrop],
    ]));
    if(inCrop){
      const hint=document.createElement('div'); hint.className='row';
      hint.innerHTML=_t('<span class="unit" style="color:var(--accent)">裁切中：框內<b>拖曳</b>移動構圖 · <b>滾輪</b>縮放 · 拉<b>外框把手</b>改裁切範圍（圖片不動，寬高可各自調）· <b>Enter</b> 完成。可把圖拖出框外裁出留白。改動即時生效，反悔用 Undo。</span>');
      pp.appendChild(hint);
    }
    pp.appendChild(checkRow([[_t('圓形裁切'),()=>!!el.round,v=>{ commitUndo();
      if(v) el.round=true; else delete el.round; renderStage(); renderProps(); },_t('裁成圓／橢圓（匯出為 PPT prstGeom ellipse）')]]));
    const alr=document.createElement('div'); alr.className='row'; alr.innerHTML=_t('<label>替代文字</label>');
    const ali=document.createElement('input'); ali.type='text'; ali.style.flex='1'; ali.style.minWidth='80px';
    ali.placeholder=_t('無障礙說明'); ali.value=el.alt||''; ali.title=_t('寫入 pptx 的圖片說明（descr），螢幕閱讀器與「替代文字」窗格會讀到');
    ali.onchange=()=>{ commitUndo(); const v=ali.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
    alr.appendChild(ali); pp.appendChild(alr);
    if(!inCrop){
      const cn=document.createElement('div'); cn.className='row';
      cn.innerHTML='<span class="unit">'+_t('拉外框是<b>等比縮放</b>，圖不會變形。想讓寬高各自調，'
        +'進「裁切…」拉外框（圖本身釘住不動），或按住 <b>Alt</b> 拖把手強制拉成不等比。')
        +(cropped?_t('這張已經裁過了，匯出時是 PowerPoint 原生的裁切（<code>srcRect</code>）。'):'')+'</span>';
      pp.appendChild(cn);
    }
    pp.appendChild(imageCompressRows(el));
    pp.appendChild(linkRows(el,_t('圖片')));
    pp.appendChild(shadowRows(el));
  }
  if(el.type==='video'){
    // 兩種模式共用一個元素；模式在插入時決定，這裡只做微調（換封面、改網址、補替代文字）
    const isOn=el.mode==='online';
    const mr=document.createElement('div'); mr.className='row';
    mr.innerHTML=`<span class="unit">${_t('模式：<b>{0}</b>',isOn?_t('YouTube 連結影片'):_t('本機影片（封面佔位）'))}</span>`;
    pp.appendChild(mr);
    if(isOn){
      const ur=document.createElement('div'); ur.className='row';
      ur.appendChild(Object.assign(document.createElement('label'),{textContent:_t('網址')}));
      const ui=document.createElement('input'); ui.type='text'; ui.style.flex='1'; ui.style.minWidth='80px';
      ui.value=el.embed||''; ui.title=_t('PowerPoint 需要 embed 形式；貼 watch／youtu.be 也會自動轉換');
      ui.onchange=()=>{ const e2=ytEmbed(ui.value);
        if(!e2){ ui.value=el.embed||''; alert(_t('無法解析成 YouTube 影片網址。可貼 watch?v=、youtu.be/ 或 embed/ 形式。')); return; }
        commitUndo(); el.embed=e2; renderStage(); renderProps(); };
      ur.appendChild(ui); pp.appendChild(ur);
      const un=document.createElement('div'); un.className='row';
      un.innerHTML=_t('<span class="unit">匯出為原生線上影片：pptx 內<b>只有封面圖</b>，影片走外部連結，<b>播放需要網路</b>。</span>');
      pp.appendChild(un);
    }else{
      const sn=document.createElement('div'); sn.className='row';
      sn.innerHTML='<span class="unit">'+_t('檔案：<b>{0}</b>',String((el.src&&el.src.name)||'—').replace(/</g,'&lt;'))+durText(el)
        +(el.src&&el.src.natW?_t('，原始 {0}×{1}',el.src.natW,el.src.natH):'')
        +_t('。<b>影片本身不在這份簡報裡</b>——匯出後請在 PowerPoint 該頁把封面換成真影片（匯出時會列清單提醒）。')+'</span>';
      pp.appendChild(sn);
    }
    pp.appendChild(btnRow([
      [{ic:'ic-image',txt:_t('換封面圖')},()=>{ COVER_TARGET=el.id; $('#coverInput').click(); },_t('選一張圖當封面（PNG／JPG）')],
      ...(el.mode==='local'? [[{ic:'ic-refresh',txt:_t('重抓封面')},()=>{ VID_RECOVER=el.id; $('#vidInput').click(); },_t('重新選同一個影片檔並抓一格畫面')]]:[]),
    ]));
    const alr=document.createElement('div'); alr.className='row'; alr.innerHTML=_t('<label>替代文字</label>');
    const ali=document.createElement('input'); ali.type='text'; ali.style.flex='1'; ali.style.minWidth='80px';
    ali.placeholder=_t('無障礙說明'); ali.value=el.alt||'';
    ali.onchange=()=>{ commitUndo(); const v=ali.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
    alr.appendChild(ali); pp.appendChild(alr);
    if(!isOn) pp.appendChild(shadowRows(el));
  }
  if(el.type==='table'){
    pp.appendChild(subTitle(_t('結構')));
    const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>新增</label>');
    for(const [t,fn] of [[_t('＋欄'),()=>{ el.colW.push(el.colW[el.colW.length-1]||100);
        el.cells.forEach(r=>r.push(defCell())); }],
      [_t('＋列'),()=>{ el.rowH.push(el.rowH[el.rowH.length-1]||26); el.cells.push(el.colW.map(()=>defCell())); }]]){
      const bt=document.createElement('button'); bt.textContent=t;
      bt.onclick=()=>{ commitUndo(); fn(); renderStage(); renderProps(); };
      row.appendChild(bt);
    }
    pp.appendChild(row);
    const dnote=document.createElement('div'); dnote.className='row';
    dnote.innerHTML=_t('<span class="unit">要刪掉整欄或整列：滑到表格上緣（欄）或左緣（列）的灰色區段，變紅之後點一下。</span>');
    pp.appendChild(dnote);
    // ── 樣式套用範圍：畫布有反白選格→只套選中（非 covered）格；否則套全表 ──
    const cs=APP.cellSel&&APP.cellSel.id===el.id? APP.cellSel : null;
    const scopedCells=()=>{
      if(cs){ const a=[];
        for(let r=cs.r0;r<=cs.r1;r++) for(let c=cs.c0;c<=cs.c1;c++){ const cc=el.cells[r]&&el.cells[r][c]; if(cc&&!cc.covered) a.push(cc); }
        if(a.length) return a; }
      return el.cells.flat().filter(c=>!c.covered);
    };
    const c0=cs? el.cells[cs.r0][cs.c0] : (el.cells.flat().find(c=>!c.covered)||el.cells[0][0]);
    const applyCells=fn=>{ commitUndo(); scopedCells().forEach(fn); renderStage(); renderProps(); };
    /* ── 格內反白（run 級）優先 ──
       正在編輯某一格、而且格內有反白文字時，樣式只套那幾個字；沒反白才退回上面的「格／全表」範圍。
       與文字框的 runApply 同一條規則（見該函式），使用者不必記兩套。 */
    const ce=(APP.cellEdit&&APP.cellEdit.id===el.id)? APP.cellEdit : null;
    const ceCell=ce? (el.cells[ce.r]||[])[ce.c] : null;
    const probe=ceCell? cellProbeRun(ceCell) : null;   // 有格內反白時，面板反映反白處的樣式
    const runOn=!!probe;
    const styleAt=(key,def)=>probe? (probe[key]!=null? probe[key] : def) : def;
    // 一律先試 run 級；回 false 代表沒有格內反白，才做格層級（setCellStyle 會順手清掉 run 覆寫）
    const applyStyle=(key,val)=>{ if(!cellRunApply(el,key,val)) applyCells(c=>setCellStyle(c,key,val)); };
    pp.appendChild(subTitle(_t('儲存格樣式')));
    // 範圍提示（反白後樣式只作用選取格）
    const scope=document.createElement('div'); scope.className='row';
    scope.innerHTML= runOn
      ? `<span class="unit">${_t('現在改的是<b>格子裡反白的那幾個字</b>（第 {0} 列第 {1} 欄）。字級、粗體、斜體、文字色，還有下面那排「格內文字」，都只套在它們身上；取消反白就回到整格。',ce.r+1,ce.c+1)}</span>`
      : cs
      ? `<span class="unit">${_t('現在改的是<b>反白的 {0} 格</b>（{1}）。點畫布別的地方取消反白，就回到整張表。',scopedCells().length,
          `R${cs.r0+1}C${cs.c0+1}`+((cs.r1!==cs.r0||cs.c1!==cs.c0)?_t(' 到 {0}',`R${cs.r1+1}C${cs.c1+1}`):''))}</span>`
      : `<span class="unit">${_t('現在改的是<b>整張表</b>。在表格裡拖曳反白幾格，下面的字級、行距、粗斜體、文字色、對齊、底色與框線就只套那幾格；雙擊進某一格、再反白幾個字，就只套那幾個字。')}</span>`;
    pp.appendChild(scope);
    const fr=document.createElement('div'); fr.className='row'; fr.innerHTML=_t('<label>字級</label>');
    const inp=document.createElement('input'); inp.type='number'; inp.min=6; inp.max=48; inp.value=styleAt('sizePt',c0.sizePt||12);
    inp.onchange=()=>{ if(!cellRunApply(el,'sizePt',+inp.value)){ commitUndo(); scopedCells().forEach(c=>setCellStyle(c,'sizePt',+inp.value)); renderStage(); } };
    fr.appendChild(inp); fr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
    pp.appendChild(fr);
    const tls=document.createElement('div'); tls.className='row'; tls.innerHTML=_t('<label>行距</label>');
    const tli=document.createElement('input'); tli.type='number'; tli.step='0.05'; tli.min='0.5'; tli.max='5'; tli.value=c0.lineSpacing||1.2;
    tli.onchange=()=>{ commitUndo(); const v=parseFloat(tli.value); scopedCells().forEach(c=>{ if(v&&Math.abs(v-1.2)>1e-6)c.lineSpacing=v; else delete c.lineSpacing; }); renderStage(); };
    tls.appendChild(tli); tls.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('×字級')}));
    pp.appendChild(tls);
    pp.appendChild(btnRow([
      ['B',()=>applyStyle('bold',!styleAt('bold',c0.bold)),_t('粗體'),styleAt('bold',c0.bold)],
      ['I',()=>applyStyle('italic',!styleAt('italic',c0.italic)),_t('斜體'),styleAt('italic',c0.italic)],
    ]));
    pp.appendChild(colorRow(_t('文字'),styleAt('color',c0.color||'1A1A1A'),
      v=>{ if(!cellRunApply(el,'color',v)) scopedCells().forEach(c=>setCellStyle(c,'color',v)); },false));
    /* 格內文字（run 級專屬）：上下標是 Excel 化學式／科學記號要能無損進來的關鍵，
       而格層級沒有這些鍵——不開這一排，JSON 以外就沒有任何路徑設得到它們。 */
    if(runOn){
      const tog=(key,label,title)=>[label,()=>cellRunApply(el,key,probe[key]?undefined:true),title,!!probe[key]];
      pp.appendChild(subTitle(_t('格內文字（反白處）')));
      pp.appendChild(btnRow([
        tog('sup','x²',_t('上標')),tog('sub','x₂',_t('下標')),
        tog('underline','U',_t('底線')),tog('strike','S',_t('刪除線')),
      ]));
      pp.appendChild(btnRow([
        [_t('高亮'),()=>cellRunApply(el,'highlight',probe.highlight?undefined:'FFFF00'),_t('黃色高亮'),!!probe.highlight],
        [_t('清除格式'),()=>cellRunApply(el,Object.fromEntries(
            ['sup','sub','underline','strike','highlight','charSpacing','fontFace','outline','glow','bold','italic','color','sizePt']
              .map(k=>[k,undefined]))),_t('把反白處退回整格的樣式')],
      ]));
    }
    pp.appendChild(btnRow([[_t('左'),()=>applyCells(c=>c.align='left'),'',(c0.align||'left')==='left'],
      [_t('中'),()=>applyCells(c=>c.align='center'),'',c0.align==='center'],
      [_t('右'),()=>applyCells(c=>c.align='right'),'',c0.align==='right']]));
    pp.appendChild(btnRow([[_t('上'),()=>applyCells(c=>c.valign='top'),'',c0.valign==='top'],
      [_t('中'),()=>applyCells(c=>c.valign='middle'),'',(c0.valign||'middle')==='middle'],
      [_t('下'),()=>applyCells(c=>c.valign='bottom'),'',c0.valign==='bottom']]));
    pp.appendChild(colorRow(_t('底色'),c0.fill,v=>scopedCells().forEach(c=>c.fill=v),true));
    // ── 框線：逐格四邊，反白＝只套選取範圍，未反白＝全表；筆＝線寬＋顏色 ──
    pp.appendChild(subTitle(_t('框線')));
    const brRange=()=> cs? {r0:cs.r0,c0:cs.c0,r1:cs.r1,c1:cs.c1} : null;
    const pen=APP.tblPen;
    const penRow=document.createElement('div'); penRow.className='row'; penRow.innerHTML=_t('<label>框線筆</label>');
    const pw=document.createElement('input'); pw.type='number'; pw.step='0.25'; pw.min='0.25'; pw.max='6'; pw.value=pen.pt; pw.title=_t('線寬（pt）');
    pw.onchange=()=>{ pen.pt=Math.max(0.25,parseFloat(pw.value)||0.75); };
    penRow.appendChild(pw); penRow.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
    const psw=document.createElement('button'); psw.className='swatchBtn'; psw.title=_t('框線顏色'); psw.style.background='#'+pen.color;
    psw.onclick=()=>openPalette(psw,pen.color,hex=>{ pen.color=hex; psw.style.background='#'+hex; });
    penRow.appendChild(psw);
    penRow.appendChild(checkRow([[_t('虛線'),()=>pen.dash,v=>{ pen.dash=v; },_t('虛線框線（匯出 prstDash sysDash）')]]).firstChild);
    pp.appendChild(penRow);
    const bBtn=(label,mode,title)=>[label,()=>applyBorder(el,brRange(),mode, mode==='none'?null:{pt:pen.pt,color:pen.color,dash:pen.dash}),title];
    pp.appendChild(btnRow([bBtn(_t('全部'),'all',_t('所有格線')),bBtn(_t('外框'),'outer',_t('範圍外周')),bBtn(_t('內部'),'inner',_t('範圍內部格線'))]));
    pp.appendChild(btnRow([bBtn(_t('上'),'top'),bBtn(_t('下'),'bottom'),bBtn(_t('左'),'left'),bBtn(_t('右'),'right'),bBtn(_t('無'),'none',_t('清除框線'))]));
    const brNote=document.createElement('div'); brNote.className='row';
    brNote.innerHTML='<span class="unit">'+_t('每一格的四邊各自獨立，線寬與顏色也是；現在<b>{0}</b>。相鄰兩格的共用邊會自動同步，所以畫布上看到的就是匯出結果。',
      cs?_t('套在反白的 {0} 格',scopedCells().length):_t('套在整張表'))+'</span>';
    pp.appendChild(brNote);
    // 合併儲存格：改用畫布拖曳反白＋就近按鈕（見下方提示），不再用側欄數字框
    pp.appendChild(subTitle(_t('合併')));
    const mh=document.createElement('div'); mh.className='row';
    mh.innerHTML=_t('<span class="unit">在表格裡拖曳，反白要合併的那幾格，按反白框旁浮出來的<b>「合併儲存格」</b>。反白單一一個已經合併的格子，那顆鈕會變成<b>「取消合併」</b>。搬動整張表請抓最外圈的邊框。</span>');
    pp.appendChild(mh);
    const note=document.createElement('div'); note.className='row';
    note.innerHTML=_t('<span class="unit">更細的東西（例如同一格裡混用好幾種樣式）也可以直接寫 JSON。</span>');
    pp.appendChild(note);
  }
  if(el.type==='chart'){
    pp.appendChild(btnRow([[_t('編輯圖表'),()=>openChartModal(el)]]));
    // 原生圖表：同一個 chart 元素上的旗標，不是第二種元素。option 不動，切換零損失。
    const nm=nativeMap(el.option);
    const nrow=checkRow([[_t('匯出為原生圖表'),()=>!!el.native,v=>{ commitUndo();
      if(v) el.native=true; else delete el.native;
      renderStage(); renderProps(); syncPageJson(); },
      _t('在 PPT 內可「編輯資料」、跟隨目標母版；外觀由 PowerPoint 排版，與畫布不會完全一致')]]);
    const ncb=nrow.querySelector('input');
    if(!nm.ok){ ncb.checked=false; ncb.disabled=true; nrow.querySelector('label').style.opacity='.5'; }
    pp.appendChild(nrow);
    const nn=document.createElement('div'); nn.className='row';
    nn.innerHTML='<span class="unit">'+(!nm.ok
      ? _t('這張圖走 PNG，因為<b>{0}</b>。',esc(nm.reason))
      : el.native
        ? _t('匯出為 <b>{0}</b> 原生圖表，在 PowerPoint 裡可以改資料。顏色、字體與繪圖區已經鎖定，'
          +'但<b>圖例要不要換行、太長的軸標籤怎麼截字，是 PowerPoint 自己決定的</b>，鎖不住。'
          +'原生圖表也不支援陰影與超連結。',nm.type)
          +(nm.drop.length? _t('<br>將不保留：{0}',esc(nm.drop.join(_t('、')))) : '')
        : _t('目前以 3 倍解析度 PNG 匯出（外觀與畫布一致，PPT 內不可改資料）。可勾選改為原生 <b>{0}</b>。',nm.type))
      +'</span>';
    pp.appendChild(nn);
    const car=document.createElement('div'); car.className='row'; car.innerHTML=_t('<label>替代文字</label>');
    const cai=document.createElement('input'); cai.type='text'; cai.style.flex='1'; cai.style.minWidth='80px';
    cai.placeholder=_t('無障礙說明'); cai.value=el.alt||''; cai.title=_t('寫入無障礙說明：PNG 走圖片 descr，原生圖表走 graphicFrame 的 descr');
    cai.onchange=()=>{ commitUndo(); const v=cai.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
    car.appendChild(cai); pp.appendChild(car);
    pp.appendChild(linkRows(el,_t('圖表')));
    pp.appendChild(shadowRows(el));
  }
  pp.appendChild(secTitle(_t('排列')));
  const pg=curPage(); const idx=pg.elements.indexOf(el);
  pp.appendChild(btnRow([
    [{ic:'ic-front',txt:''},()=>{ commitUndo(); pg.elements.splice(idx,1); pg.elements.push(el); renderStage(); renderProps(); },_t('置頂')],
    [{ic:'ic-forward',txt:''},()=>{ if(idx>=pg.elements.length-1)return; commitUndo(); pg.elements.splice(idx,1); pg.elements.splice(idx+1,0,el); renderStage(); },_t('上移一層')],
    [{ic:'ic-backward',txt:''},()=>{ if(idx<=0)return; commitUndo(); pg.elements.splice(idx,1); pg.elements.splice(idx-1,0,el); renderStage(); },_t('下移一層')],
    [{ic:'ic-back',txt:''},()=>{ commitUndo(); pg.elements.splice(idx,1); pg.elements.unshift(el); renderStage(); },_t('置底')],
  ]));
  /* 動作列釘在面板底部（見 applyPropTabs 的 propFoot），所以壓成單列圖示：
     它每一頁都在，多佔一列高度就等於每一頁都少一列。 */
  pp.appendChild(secTitle(_t('動作')));
  const act=btnRow([
    [{ic:'ic-brush',txt:''},()=>armPainter(el),_t('複製樣式（格式刷）：武裝後點其他元素套用其字體/顏色/填色/框線')],
    [{ic:'ic-copy',txt:''},()=>duplicateEl(el),_t('複製（Cmd/Ctrl+D）')],
    [{ic:'ic-code',txt:''},()=>openPageJson(),_t('開啟本頁 JSON 面板（點畫布元素會聚焦其 JSON）')],
    ...(el.groupId? [[{ic:'ic-merge',txt:''},()=>{ commitUndo(); for(const m of groupMembers(el)) delete m.groupId; setSel([el.id]); renderStage(); renderProps(); },_t('解散群組')]] : []),
    [{ic:'ic-trash',txt:''},()=>deleteEl(el),_t('刪除（Delete）')],
  ]);
  act.lastChild.classList.add('danger');   // 刪除排最後並描紅，與其他動作拉開距離
  pp.appendChild(act);
  updateCopyPalWin();
}
