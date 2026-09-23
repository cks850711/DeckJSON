'use strict';
/* ================= 說明 ================= */
/* ===== 說明配圖 =====
   一張圖 ＝ 縮小的真實舞台 ＋ 一層標註。舞台那半用 renderEl()——就是畫布本身
   那支渲染器，不是縮圖列的 drawThumb()。後者是另一套獨立實作（兩者共用 0 行），
   曾長期把圖表畫成半透明色塊；拿它配圖會讓手冊在兩套渲染器漂移的地方顯示錯的東西。

   標註用**舞台座標**書寫（跟元素的 x/y 同一個座標系，不必自己乘縮放比），
   線寬與字級則固定成裝置像素——換句話說，改縮放比時圖會整個縮小，但箭頭不會變細、
   字不會變小。這是刻意的：圖縮小是為了省版面，標註縮小只會看不清楚。 */
/* ===== 說明配圖 =====
   一張圖就是「一份簡報元素 ＋ 一個取景框」，用 renderEl() 畫——那是畫布本身
   那支渲染器，不是縮圖列的 drawThumb()（兩者共用 0 行程式，曾長期把圖表畫成
   色塊；拿它配圖會讓手冊在兩套渲染器漂移的地方顯示錯的東西）。

   箭頭、虛線框、把手、標註文字**全都是簡報元素**，不是另外畫的圖層——
   所以整份配圖可以在 DeckJSON 裡當一份簡報來編輯，人調位置比 AI 盲寫座標準得多。
   來源是 docs/user-manual.deck，用 tools/figdeck.js 進出；產物是各語言包的 figs（i18n/<語言>.figs.js）。 */
const HF_W=420;
function helpFig(o){
  const v=o.view||[0,0,STAGE_W,STAGE_H];
  const k=HF_W/v[2], W=HF_W, H=Math.round(v[3]*k);
  const fig=document.createElement('div'); fig.className='helpFig';
  fig.style.width=W+'px'; fig.style.height=H+'px';
  const st=document.createElement('div'); st.className='helpFigStage';
  st.style.width=STAGE_W+'px'; st.style.height=STAGE_H+'px';
  st.style.transform='translate('+(-v[0]*k)+'px,'+(-v[1]*k)+'px) scale('+k+')';
  st.style.background='#'+(o.bg||'FFFFFF');
  for(const el of (o.els||[])) st.appendChild(renderEl(el));
  fig.appendChild(st);
  const wrap=document.createElement('div');
  wrap.appendChild(fig);
  if(o.cap){ const c=document.createElement('div'); c.className='helpFigCap'; c.textContent=o.cap; wrap.appendChild(c); }
  return wrap;
}

/* 說明面板的分頁：內容是語言包裡的一長串 HTML（i18n/<語言>.help.js），開啟時才放進來、切成分頁。
   切法比照 applyPropTabs——掃過扁平的 DOM，遇到帶 data-tab 的 <h4> 就開新一頁，
   沒帶的 <h4> 屬於前一頁（所以「入門」能同時裝「這是什麼」與「存檔」兩個小節）。
   只做一次：內容是靜態的，重切只會把使用者的閱讀位置歸零。 */
function applyHelpTabs(){
  const hb=$('#helpBody');
  if(hb.dataset.tabbed) return;
  /* 說明本文不走字典——段落裡夾著 <b>／<code>／<kbd>，拆句翻只會讓語序錯亂——每個語言一份完整 HTML。
     沒有說明本文的語言整份退回中文，配圖也跟著用中文的：圖上的字要和本文同一種語言。 */
  const hp=UI_PACK.help? UI_PACK : I18N_PACKS.zh;
  hb.innerHTML=hp.help||'';
  const groups=[]; let cur=null;
  for(const n of [...hb.childNodes]){
    if(n.nodeType===1&&n.tagName==='H4'&&n.dataset.tab){ cur={name:n.dataset.tab,nodes:[]}; groups.push(cur); }
    if(cur) cur.nodes.push(n);
  }
  if(!groups.length) return;
  hb.innerHTML='';
  const bar=document.createElement('div'); bar.className='helpTabs'; hb.appendChild(bar);
  const panes=groups.map(g=>{
    const p=document.createElement('div'); p.className='helpPane';
    g.nodes.forEach(n=>p.appendChild(n)); hb.appendChild(p); return p;
  });
  const show=i=>{
    panes.forEach((p,j)=>p.hidden=j!==i);
    [...bar.children].forEach((b,j)=>b.classList.toggle('on',j===i));
    hb.scrollTop=0;
  };
  groups.forEach((g,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='propTab';
    b.textContent=g.name; b.onclick=()=>show(i); bar.appendChild(b);
  });
  show(0);
  for(const ph of hb.querySelectorAll('[data-fig]')){
    const f=(hp.figs||I18N_PACKS.zh.figs||{})[ph.dataset.fig];
    if(f) ph.replaceWith(helpFig(f));
    else ph.remove();                    // 沒對應的圖就整個拿掉，不留空盒子
  }
  hb.dataset.tabbed='1';
}
/* 版本號寫在標頭而非硬編在 HTML 裡：常數只有一份，改版時不會漏改這裡。 */
$('#verTag').textContent='v'+APP_VERSION;
$('#btnHelp').onclick=()=>{ $('#helpModal').hidden=false; applyHelpTabs(); };
$('#btnHelpClose').onclick=()=>{ $('#helpModal').hidden=true; };
$('#btnPendClose').onclick=()=>{ $('#pendModal').hidden=true; };
$('#btnPendCopy').onclick=async()=>{
  const t=$('#pendArea').value;
  try{ await navigator.clipboard.writeText(t); $('#btnPendCopy').textContent=_t('已複製 ✓'); }
  catch(err){ $('#pendArea').select(); document.execCommand('copy'); $('#btnPendCopy').textContent=_t('已複製 ✓'); }
  setTimeout(()=>$('#btnPendCopy').textContent=_t('複製清單'),1200);
};
/* ── 阻斷式彈窗的共用行為：點遮罩關閉、Esc 關閉、footer 新增的取消／確認鈕 ──
   `geomModal` 不在此列：它有未存的編輯內容，誤點遮罩或誤按 Esc 就丟掉太貴，
   它自己那組 keydown 已在 capture 階段處理 Esc（見 GEO.open 那段）。
   `chartModal` 也不在：它已改成無遮罩的工作面板，Esc 不該關掉正在編輯的面板。 */
const DISMISSABLE=['jsonModal','helpModal','shapeModal','tplModal','snapModal','videoModal','pendModal','deckModal'];
for(const id of DISMISSABLE)
  $('#'+id).addEventListener('click',e=>{ if(e.target.id===id) $('#'+id).hidden=true; });
// footer 上新增的關閉鈕，行為一律等同該彈窗原本的 ×
$('#btnDeck').onclick=()=>openDeckSettings();
for(const b of ['btnDeckClose','btnDeckOk']) $('#'+b).onclick=()=>closeDeckSettings();
for(const [btn,mod] of [['btnShapeCancel','shapeModal'],['btnTplCancel','tplModal'],
    ['btnVideoCancel','videoModal'],['btnPendOk','pendModal'],['btnHelpOk','helpModal']])
  $('#'+btn).onclick=()=>{ $('#'+mod).hidden=true; };
/* Esc 關掉最上層的彈窗。放 capture 階段並在命中時 stopPropagation，
   否則同一個 Esc 會繼續往下跑到全域快捷鍵，順手把畫布的選取也清掉。 */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const open=DISMISSABLE.filter(id=>!$('#'+id).hidden);
  if(!open.length) return;
  e.preventDefault(); e.stopPropagation();
  $('#'+open[open.length-1]).hidden=true;   // DOM 順序後者疊在上面
},true);

