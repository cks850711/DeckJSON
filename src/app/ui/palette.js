'use strict';
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

