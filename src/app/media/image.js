'use strict';
/* ================= 圖片裁切 =================
   資料模型是 el.crop={l,t,r,b}＝從原圖各邊裁掉的比例（0~1），與 OOXML 的 srcRect 同語義：
   裁切後的區域 stretch 填滿整個框。畫布與 pptx 因此共用同一組數字，不必各算一套
   （舊做法是把框比例交給 PptxGenJS 的 sizing 去反算 srcRect，控制權不在自己手上，
    而且畫布端 object-fit:cover 只能露中央，兩邊語義還不完全一致）。 */
function cropOf(el){
  if(el.crop){ const c=el.crop; return {l:+c.l||0,t:+c.t||0,r:+c.r||0,b:+c.b||0}; }
  /* 舊檔的 fit:'cover' 沒有 crop 欄位，依它當年「露出中央」的語義即時換算。
     不在載入時寫回檔案——使用者沒碰過裁切的圖不該因為開過一次就長出新欄位。 */
  if(el.fit==='cover'&&el.natW>0&&el.natH>0&&el.w>0&&el.h>0){
    const s=Math.max(el.w/el.natW,el.h/el.natH);
    const l=Math.max(0,(el.natW-el.w/s)/2/el.natW), t=Math.max(0,(el.natH-el.h/s)/2/el.natH);
    return {l,t,r:l,b:t};
  }
  return {l:0,t:0,r:0,b:0};
}
function cropIsEmpty(c){ return !(c.l>1e-6||c.t>1e-6||c.r>1e-6||c.b>1e-6); }
/* 裁切後可見區恰好等於框：dw*(1-l-r)=w → dw=w/(1-l-r)，img 左緣退到 -dw*l。
   下限 .02 是防呆——四邊加起來逼近 1 時 dw 會爆到無限大，UI 端另有 MIN_CROP_WIN 擋住。 */
function imgGeom(el,c){
  const kw=Math.max(.02,1-c.l-c.r), kh=Math.max(.02,1-c.t-c.b);
  const dw=el.w/kw, dh=el.h/kh;
  return {dw,dh,left:-dw*c.l,top:-dh*c.t};
}
function imageInner(el){
  const c=cropOf(el), g=imgGeom(el,c);
  const wrap=document.createElement('div'); wrap.className='imgc';
  const mkImg=()=>{ const im=document.createElement('img'); im.src=el.dataUrl;
    im.style.cssText=`width:${g.dw}px;height:${g.dh}px;left:${g.left}px;top:${g.top}px`; return im; };
  const im=mkImg(); if(el.alt) im.alt=el.alt;
  wrap.appendChild(im);
  if(el.round) wrap.style.borderRadius='50%';
  /* 裁切模式：整張圖以 35% 不透明度露出（.imgc 放開 overflow），框內再疊一份同座標的
     亮圖與三分格線。使用者因此看得到「自己正在捨棄什麼」——舊做法直接把裁掉的部分
     藏起來，等於閉著眼睛調。 */
  if(APP.cropping===el.id){
    const win=document.createElement('div'); win.className='cropwin'; win.appendChild(mkImg());
    const frm=document.createElement('div'); frm.className='cropfrm';
    wrap.appendChild(win); wrap.appendChild(frm);
  }
  return wrap;
}

/* 裁切的操作模型是 (vw,vh,cx,cy)＝可見區佔原圖的比例與中心，比直接動 l/t/r/b 好推理，
   寫回時才轉成四邊。**不變形約束**：可見區在原圖像素下的長寬比必須等於框的長寬比，
   所以 vh 由 vw 決定，縮放只有一個自由度——這正是舊做法做不到「放大再裁」的原因，
   它把縮放綁在框的寬高上，一改就變形。 */
/* 可見區可以大於原圖、也可以移出圖片外——那是刻意的「裁出留白」，四邊值因此允許為負
   （OOXML 的 srcRect 本來就是有號百分比）。只保留一條底線：至少 10% 的可見區要與圖片
   重疊，否則畫面整片空白、使用者會找不到圖片跑到哪去。 */
const CROP_MAX=3;      // 可見區最多放到原圖的 3 倍（再大就只是無盡留白）
const CROP_KEEP=.1;    // 至少這個比例的可見區必須壓在圖片上
function cropNorm(el){ const c=cropOf(el); const vw=1-c.l-c.r, vh=1-c.t-c.b; return {vw,vh,cx:c.l+vw/2,cy:c.t+vh/2}; }
/* 縮放時 vw 與 vh **同乘一個係數**：圖片顯示尺寸 dw=w/vw、dh=h/vh 因此同除該係數，
   dw/dh 的比例不動，圖片永遠不會在縮放過程中被拉扁。
   舊版改用 k=原圖比例/框比例 反推 vh，等於每次縮放都把構圖硬夾回「不變形」的那一組解——
   框曾被自由拉伸過的話，一進裁切模式尺寸就整個跳掉。 */
function cropScale(el,s){
  const n=cropNorm(el);
  let k=Math.min(s, CROP_MAX/n.vw, CROP_MAX/n.vh);
  k=Math.max(k, .05/n.vw, .05/n.vh);
  return [n.vw*k, n.vh*k];
}
function cropClampEdge(v,span){ return Math.min(1-span*CROP_KEEP, Math.max(span*CROP_KEEP-span, v)); }
// 四邊全為 0 才算「沒有裁切」，此時不留空殼鍵（維持 JSON 精簡）；否則原樣寫入
function cropStore(el,l,t,r,b){
  const r5=n=>+n.toFixed(5);
  if(Math.abs(l)<1e-4&&Math.abs(t)<1e-4&&Math.abs(r)<1e-4&&Math.abs(b)<1e-4) delete el.crop;
  else el.crop={l:r5(l),t:r5(t),r:r5(r),b:r5(b)};
  delete el.fit;                                   // 舊欄位就地退場，之後一律看 crop
}
function cropWrite(el,vw,vh,cx,cy){
  vw=Math.min(CROP_MAX,Math.max(.05,vw)); vh=Math.min(CROP_MAX,Math.max(.05,vh));
  const l=cropClampEdge(cx-vw/2,vw), t=cropClampEdge(cy-vh/2,vh), r5=n=>+n.toFixed(5);
  /* 「沒有裁切」必須四邊都是 0，不能只看 vw/vh——可見區剛好等於原圖但整體偏移
     （l=-0.9、r=0.9）也會讓 vw=1，那是留白構圖，刪掉就整個丟失。 */
  cropStore(el,l,t,1-l-vw,1-t-vh);
}
function startCrop(el){
  if(el.type!=='image') return;
  commitUndo();
  /* 進場**不動構圖**，只夾掉非法值。舊版在這裡強制正規化成「不變形」的那組解，
     使用者按第二次裁切時整張圖就會忽然跳位——進裁切模式不該改變任何看得見的東西。 */
  normCrop(el);
  APP.cropping=el.id; renderStage(); renderProps();
}
function endCrop(){ if(!APP.cropping) return; APP.cropping=null; renderStage(); renderProps(); syncPageJson(); }

/* 只改 img 的幾何，不重建 DOM。拖曳／滾輪每一步都跑 renderStage() 會整頁重繪，
   畫面跳動且看不清自己正在裁什麼——這是「無法即時看到裁切樣子」的直接原因。 */
function updateCropVisual(el){
  const box=stage.querySelector(`.el[data-id="${el.id}"]`); if(!box) return;
  const g=imgGeom(el,cropOf(el));
  for(const im of box.querySelectorAll('.imgc img'))
    im.style.cssText=`width:${g.dw}px;height:${g.dh}px;left:${g.left}px;top:${g.top}px`;
}
/* 裁切模式下拉外框：PowerPoint 的行為是**圖片釘住不動，只有裁切窗變大變小**。
   舊行為（框一動就依 w/(1-l-r) 重算 dw）等於連圖片一起縮放，使用者以為在拉裁切線，
   看到的卻是整張圖在跑。這裡以拖曳起始時的圖片幾何 f 為錨點反推四邊，
   並把窗口夾在圖片範圍內——超出的部分會露出空白，PowerPoint 也不允許。 */
function cropFromFixedImage(el,f){
  // 窗口可以拉得比圖片大（＝四周留白），只夾住 CROP_MAX 與「至少壓住 10%」這兩條底線
  const vw=Math.min(CROP_MAX,Math.max(.05,el.w/f.dw)), vh=Math.min(CROP_MAX,Math.max(.05,el.h/f.dh));
  const l=cropClampEdge((el.x-f.ix)/f.dw,vw), t=cropClampEdge((el.y-f.iy)/f.dh,vh);
  // 夾過之後把框回寫成夾住的結果，畫面才不會與資料脫節（拉到底就是停住）
  el.w=Math.max(4,Math.round(vw*f.dw)); el.h=Math.max(4,Math.round(vh*f.dh));
  el.x=Math.round(f.ix+l*f.dw);         el.y=Math.round(f.iy+t*f.dh);
  cropStore(el,l,t,1-l-vw,1-t-vh);
}
/* AI 或手改 JSON 很可能塞進負值、四邊加起來超過 1、或非數字——這些會讓 imgGeom 算出
   無限大的 dw、以及 PowerPoint 開檔就要求修復（srcRect 的 l+r 必須 <100%）。
   一律夾成合法值而不是丟掉整個 crop：使用者的構圖意圖盡量保住。 */
function normCrop(el){
  const c=el.crop; if(!c||typeof c!=='object'){ delete el.crop; return; }
  // 負值合法（留白），但要夾在 [-CROP_MAX, .95]；非數字一律歸零
  const g=k=>{ const n=+c[k]; return isFinite(n)? Math.max(-CROP_MAX,Math.min(.95,n)) : 0; };
  let l=g('l'),t=g('t'),r=g('r'),b=g('b');
  /* 同軸兩邊要讓可見區 span=1-a-z 落在 [.05, CROP_MAX]：
     太窄會讓 imgGeom 算出爆量的 dw，太寬則是無盡留白。按比例縮放兩邊，保住構圖的偏向。 */
  const fix=(a,z)=>{
    const sum=a+z; if(Math.abs(sum)<1e-9) return [a,z];
    const span=1-sum;
    if(span<.05) { const s=.95/sum; return [a*s,z*s]; }
    if(span>CROP_MAX){ const s=(1-CROP_MAX)/sum; return [a*s,z*s]; }
    return [a,z];
  };
  [l,r]=fix(l,r); [t,b]=fix(t,b);
  const r5=n=>+n.toFixed(5);
  if(Math.abs(l)+Math.abs(t)+Math.abs(r)+Math.abs(b)<1e-6) delete el.crop;
  else el.crop={l:r5(l),t:r5(t),r:r5(r),b:r5(b)};
}

/* ================= 圖片重編碼（降解析度壓縮） =================
   base64 只是編碼不是壓縮，省不了體積（實測 gzip 反而能把那 +33% 幾乎全壓回來，
   所以「檔案太大」不該靠換容器格式解）。真正有效的是重新編碼：把圖片縮到「實際顯示
   尺寸的 N 倍」再存。實測 4032×3024 的照片放在 400px 寬的框裡，縮到 2× 後 3.9MB → 53KB。

   格式刻意只用 JPEG／PNG：輸出目標是 pptx，WebP 要 Microsoft 365 較新版才認得、
   AVIF 完全不認，用了等於賭收件人的 Office 版本。降取樣已經拿走 98%，剩下靠格式
   再省的絕對量很小，不值得賠上相容性。

   ⚠ 這是全檔唯一會毀掉原始位元組的操作，一律走明確的使用者動作，不在存檔時偷跑。 */
const IMG_PPI_BASE=96;                       // 畫布 1280px ＝ 13.333in，故 1px 恰為 96 PPI
const IMG_QUALITY=0.82;                      // JPEG 品質：再往下畫質開始看得出來，省的量卻有限
const RECODE_PRESETS=[                       // mul＝目標像素／顯示尺寸；PPI 供對照 PowerPoint 的壓縮選項
  {key:'web',  mul:1.5, label:_t('投影用'),   ppi:144},
  {key:'std',  mul:2,   label:_t('標準'),     ppi:192},
  {key:'print',mul:3,   label:_t('列印用'),   ppi:288},
];

/* PNG 有 alpha 通道不代表真的用到——螢幕截圖幾乎都是全不透明的 PNG，轉 JPEG 可以省很多。
   抽樣掃描而非全掃：真正去背的圖在邊緣一定有成片的半透明像素，64×64 的取樣格漏掉的機率極低，
   而全掃 4000×3000 要讀 48MB 的 ImageData。 */
function imgHasAlpha(img){
  const cv=document.createElement('canvas');
  cv.width=Math.min(64,img.naturalWidth); cv.height=Math.min(64,img.naturalHeight);
  const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.drawImage(img,0,0,cv.width,cv.height);
  const d=cx.getImageData(0,0,cv.width,cv.height).data;
  for(let i=3;i<d.length;i+=4) if(d[i]<250) return true;
  return false;
}

/* 分段降取樣：一次 drawImage 從 4032 直接縮到 800 會有明顯鋸齒——瀏覽器只做雙線性取樣，
   縮超過 2 倍就取樣不足，細線與文字最先崩。每次最多減半、逼近目標再收尾，
   多跑幾次 drawImage 的成本可以忽略，畫質差別在螢幕截圖類的圖上很明顯。 */
function downscaleCanvas(img,w,h){
  let cv=document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
  let cx=cv.getContext('2d'); cx.imageSmoothingQuality='high'; cx.drawImage(img,0,0);
  while(cv.width>w*2){
    const nw=Math.max(w,Math.round(cv.width/2)), nh=Math.max(h,Math.round(cv.height/2));
    const t=document.createElement('canvas'); t.width=nw; t.height=nh;
    const tx=t.getContext('2d'); tx.imageSmoothingQuality='high'; tx.drawImage(cv,0,0,nw,nh);
    cv=t;
  }
  if(cv.width!==w||cv.height!==h){
    const t=document.createElement('canvas'); t.width=w; t.height=h;
    const tx=t.getContext('2d'); tx.imageSmoothingQuality='high'; tx.drawImage(cv,0,0,w,h);
    cv=t;
  }
  return cv;
}

/* 只縮不放：目標比原圖大時直接回傳 null（放大不會變清楚，只會讓檔案變大又失真）。
   回傳 natW/natH 是重編碼後的實際像素，呼叫端必須一起寫回元素——匯出 srcRect 依賴它。 */
async function recodeImage(dataUrl,maxW,maxH,q){
  const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=dataUrl; });
  /* 取 max 而非 min：這裡要的是「兩軸都不低於需求」，不是「整張塞進 maxW×maxH」。
     框被 Alt 非等比拉伸過時 maxW/maxH 的比例與原圖不同，取 min 會讓較緊的那一軸
     決定係數，另一軸就被縮到不夠、放大後糊掉。等比未變形時兩者相等，行為不變。 */
  const s=Math.min(1,Math.max(maxW/img.naturalWidth,maxH/img.naturalHeight));
  if(s>=1) return null;
  const w=Math.max(1,Math.round(img.naturalWidth*s)), h=Math.max(1,Math.round(img.naturalHeight*s));
  const cv=downscaleCanvas(img,w,h);
  const alpha=imgHasAlpha(img);
  const out=alpha? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg',q||IMG_QUALITY);
  // 極少數情況重編碼後反而更大（原圖已是高度優化的小 PNG），那就別換
  if(out.length>=dataUrl.length) return null;
  return {dataUrl:out,natW:w,natH:h,alpha};
}
function dataUrlBytes(u){ return u? Math.round((u.length-(u.indexOf(',')+1))*3/4) : 0; }
function fmtBytes(n){ return n<1024? n+' B' : n<1048576? Math.round(n/1024)+' KB' : (n/1048576).toFixed(1)+' MB'; }
let lastRecode=null;   // {id,before,after} — 只為了在屬性面板回報一次壓縮成果，不進資料模型

/* 元素的「該有像素」：倍率乘的是它在畫布上的顯示尺寸，不是固定值——同一份簡報裡
   滿版背景圖與角落小 logo 該有的像素差十倍，用固定值會兩頭不討好。
   fit:'cover' 下框只露出局部，原圖要比框更大才填得滿，故用長邊比例回推。 */
function targetPixels(el,mul){
  /* 框只露出原圖的 vw×vh 那一塊，所以「原圖該有多少像素」要除以可見比例——
     裁掉一半就得留兩倍解析度，否則放大的那塊會糊。反過來，留白（vw>1）時
     可見區比原圖還大，需要的像素反而更少。
     ⚠ 早期版本用 `el.fit==='cover'` 判斷，改成 el.crop 後那個分支永遠不成立，
       裁切過的圖會被壓到只夠框的大小、放大後糊掉。 */
  const c=cropOf(el);
  const vw=Math.max(.02,1-c.l-c.r), vh=Math.max(.02,1-c.t-c.b);
  return [Math.round(el.w/vw*mul),Math.round(el.h/vh*mul)];
}
/* 圖片壓縮 UI：顯示現況＋三個倍率一鍵重編碼。刻意做成明確按鈕而不是存檔時自動跑，
   因為這是全檔唯一不可逆的操作（見 recodeImage 的註解）。 */
/* 壓縮 UI 的原則：按下去之前就要看得到結果。按鈕上直接寫「會變成幾×幾」，
   壓不出效益的檔位（目標大於原圖）事先 disable 並說明原因，不讓使用者點了才知道。
   體積預估要真的跑一次編碼才準，成本不低，故延後到面板穩定後才背景算，並以
   dataUrl 長度為鍵快取——renderProps 在選取／搬移時會頻繁重跑，不快取會一直重算。 */
const recodeEst=new Map();
function imageCompressRows(el){
  const wrap=document.createElement('div');
  const info=document.createElement('div'); info.className='row';
  const over=(el.natW&&el.w)? el.natW/targetPixels(el,1)[0] : 0;
  const done=(lastRecode&&lastRecode.id===el.id)
    ? ' · <b style="color:#69db7c">'+_t('已省 {0}%',Math.round((1-lastRecode.after/lastRecode.before)*100))+'</b>' : '';
  info.innerHTML='<span class="unit">'+_t('原圖 <b>{0}</b>',(el.natW||'?')+'×'+(el.natH||'?'))+' · '
    +fmtBytes(dataUrlBytes(el.dataUrl))
    +' · '+_t('框內只用到 <b>{0}</b>',targetPixels(el,1)[0]+'×'+targetPixels(el,1)[1])
    +(over>1.6? _t('，<b>可省空間</b>') : _t('，已相稱'))+done+'</span>';
  wrap.appendChild(info);

  /* 垂直堆疊而非並排：側欄只有 ~130px 寬，三顆並排會把「1000×562」這種字截掉，
     使用者又看不到自己按的是什麼。一行一顆，解析度與預估體積左右對齊。 */
  const row=document.createElement('div'); row.className='row';
  row.style.cssText='flex-direction:column;align-items:stretch;gap:3px';
  for(const p of RECODE_PRESETS){
    const [tw,th]=targetPixels(el,p.mul);
    const b=document.createElement('button');
    b.style.cssText='width:100%;line-height:1.3;padding:3px 6px;text-align:left;display:flex;justify-content:space-between;align-items:baseline;gap:6px';
    // 與 recodeImage 的 s>=1 同條件：任一軸已達需求就壓不出效益（漏看高的話按鈕會亮著卻壓不動）
    const tooBig=!(el.natW>0)||!(el.natH>0)||tw>=el.natW||th>=el.natH;
    b.innerHTML=`<span><b>${tw}×${th}</b> <span style="opacity:.55;font-size:10px">${p.mul}× · ${p.label}</span></span>`;
    if(tooBig){
      b.disabled=true;
      b.title=_t('原圖只有 {0}，已經小於這個檔位——再壓只會失真不會變小',(el.natW||'?')+'×'+(el.natH||'?'));
    }else{
      b.title=_t('縮成 {0}（顯示尺寸的 {1} 倍，約 {2} PPI）。不可逆，但可以 Undo 還原',tw+'×'+th,p.mul,p.ppi);
      b.dataset.est=`${el.dataUrl.length}|${tw}x${th}`;
      b.onclick=async ev=>{
        const btn=ev.currentTarget, html=btn.innerHTML;
        btn.innerHTML=_t('處理中…'); btn.disabled=true;
        try{
          const r=await recodeImage(el.dataUrl,tw,th,IMG_QUALITY);
          if(!r){ btn.innerHTML=html; btn.disabled=false;
            alert(_t('這張圖壓不出效益（原圖 {0}，目標 {1}），因此未變更。',el.natW+'×'+el.natH,tw+'×'+th)); return; }
          const before=dataUrlBytes(el.dataUrl);
          commitUndo();
          el.dataUrl=r.dataUrl; el.natW=r.natW; el.natH=r.natH;
          lastRecode={id:el.id,before,after:dataUrlBytes(r.dataUrl)};
          renderStage(); renderProps(); syncPageJson();
        }catch(err){ btn.innerHTML=html; btn.disabled=false; alert(_t('壓縮失敗：{0}',err.message)); }
      };
    }
    row.appendChild(b);
  }
  wrap.appendChild(row);

  // 背景補上「→ 實際會變成幾 KB」：算完才填，算不出來就維持只有解析度的樣子
  setTimeout(()=>{
    for(const b of row.querySelectorAll('button[data-est]')){
      const key=el.id+'|'+b.dataset.est;
      const put=v=>{ if(b.isConnected&&!b.querySelector('.estv'))
        b.insertAdjacentHTML('beforeend',`<span class="estv" style="opacity:.75;font-size:10px;white-space:nowrap">→ ${fmtBytes(v)}</span>`); };
      if(recodeEst.has(key)){ put(recodeEst.get(key)); continue; }
      const [w,h]=b.dataset.est.split('|')[1].split('x').map(Number);
      recodeImage(el.dataUrl,w,h,IMG_QUALITY).then(r=>{
        if(!r) return;
        const v=dataUrlBytes(r.dataUrl); recodeEst.set(key,v); put(v);
      }).catch(()=>{});
    }
  },250);
  return wrap;
}

/* ================= 批次圖片壓縮（本頁／整份簡報） =================
   圖片散在三個地方，呼叫端不該去分辨是哪一種，所以每個目標自帶 get／set／target 三個閉包：
     · 元素圖片   pages[].elements[] 裡 type==='image'（表格格內圖走「浮動圖片＋軟群組」，也是這一類）
     · 頁面背景圖 pages[].bgImage——滿版拉伸，該有的像素固定是畫布尺寸×倍率
     · 母版圖片   deck.master.elements[]，只在整份簡報的範圍納入
   影片封面 el.cover 刻意不納入：它是抓幀自動產生的，插入時就已限制在 1280 寬。 */
/* 四個範圍，**背景圖與元素圖完全分開**：兩者的性質差太多——背景圖滿版、通常是整份
   最大的一張、且觀眾整場都盯著它，該不該壓、壓到哪一檔，使用者往往有不同判斷。
   混在同一顆按鈕裡會讓「壓一下元素圖」順手動到背景圖，那是不可逆的。 */
const BATCH_SCOPES={page:_t('本頁圖片'),deck:_t('整份簡報圖片'),pagebg:_t('本頁背景圖'),deckbg:_t('整份簡報背景圖')};
function collectImageTargets(scope){
  const out=[];
  const pushEl=el=>{ if(el&&el.type==='image'&&el.dataUrl) out.push({
    kind:_t('圖片'), get:()=>el.dataUrl,
    set:(u,w,h)=>{ el.dataUrl=u; el.natW=w; el.natH=h; },
    target:mul=>targetPixels(el,mul) }); };
  const pushBg=pg=>{ if(pg&&pg.bgImage) out.push({
    kind:_t('背景圖'), get:()=>pg.bgImage,
    set:u=>{ pg.bgImage=u; },
    target:mul=>[Math.round(STAGE_W*mul),Math.round(STAGE_H*mul)] }); };
  // 背景圖：不是元素、選不到，屬性面板那套單張壓縮碰不到它，只能靠這兩條路
  if(scope==='pagebg'){ pushBg(curPage()); return out; }
  if(scope==='deckbg'){ APP.deck.pages.forEach(pushBg); return out; }
  // 元素圖：page／deck 兩個範圍都**不含背景圖**
  for(const pg of (scope==='deck'? APP.deck.pages : [curPage()])) (pg.elements||[]).forEach(pushEl);
  if(scope==='deck'&&APP.deck.master&&Array.isArray(APP.deck.master.elements))
    APP.deck.master.elements.forEach(pushEl);
  return out;
}
/* 先全部試算再問，不要壓到一半才讓使用者看到結果——這是不可逆操作，
   「N 張圖、X→Y」必須在按下確認之前就攤開。試算結果直接留著套用，不重跑第二次編碼。 */
async function batchCompress(scope,p,btn){
  const items=collectImageTargets(scope);
  const where=BATCH_SCOPES[scope]||_t('本頁');
  if(!items.length){ alert(_t('{0}沒有可壓縮的圖片。',where)); return; }
  const html=btn.innerHTML; btn.disabled=true;
  const plans=[]; let before=0,after=0,skipped=0;
  try{
    for(let i=0;i<items.length;i++){
      btn.innerHTML=_t('估算中 {0}/{1}…',i+1,items.length);
      const it=items[i], url=it.get(), b=dataUrlBytes(url);
      before+=b;
      const [tw,th]=it.target(p.mul);
      const r=await recodeImage(url,tw,th,IMG_QUALITY);
      if(r){ plans.push({it,r}); after+=dataUrlBytes(r.dataUrl); }
      else { after+=b; skipped++; }
    }
  }finally{ btn.innerHTML=html; btn.disabled=false; }
  if(!plans.length){
    alert(_t('{0}的 {1} 張圖都已經小於「{2}×（{3} PPI）」這個檔位，沒有壓縮空間。',where,items.length,p.mul,p.ppi));
    return;
  }
  const msg=_t('{0}：將壓縮 {1} 張圖片',where,plans.length)
    +(skipped?_t('（另 {0} 張已夠小，維持原狀）',skipped):'')
    +'\n\n'+_t('{0} → {1}　省 {2}%',fmtBytes(before),fmtBytes(after),Math.round((1-after/before)*100))
    +'\n'+_t('檔位：{0}',`${p.mul}× · ${p.ppi} PPI · ${p.label}`)
    +'\n\n'+_t('這個操作不可逆（但可以用 Undo 還原）。要繼續嗎？');
  if(!confirm(msg)) return;
  commitUndo();
  for(const q of plans) q.it.set(q.r.dataUrl,q.r.natW,q.r.natH);
  lastRecode=null;                       // 單張的「已省 N%」標記會對不上，清掉
  renderAll(); renderProps(); syncPageJson();
}
function batchCompressRows(scope){
  const wrap=document.createElement('div');
  const items=collectImageTargets(scope);
  const total=items.reduce((a,it)=>a+dataUrlBytes(it.get()),0);
  const isBg=scope==='pagebg'||scope==='deckbg';
  const info=document.createElement('div'); info.className='row';
  info.innerHTML=`<span class="unit">${items.length
    ? (isBg? _t('<b>{0}</b> 張背景圖，合計 <b>{1}</b>',items.length,fmtBytes(total))
           : _t('<b>{0}</b> 張圖片，合計 <b>{1}</b>',items.length,fmtBytes(total)))
    : (isBg?_t('沒有背景圖'):_t('沒有圖片（背景圖另計）'))}</span>`;
  wrap.appendChild(info);
  if(!items.length) return wrap;
  const row=document.createElement('div'); row.className='row';
  row.style.cssText='flex-direction:column;align-items:stretch;gap:3px';
  for(const p of RECODE_PRESETS){
    const b=document.createElement('button');
    b.style.cssText='width:100%;line-height:1.3;padding:3px 6px;text-align:left';
    b.innerHTML=`<b>${p.mul}×</b> <span style="opacity:.55;font-size:10px">${p.ppi} PPI · ${p.label}</span>`;
    b.title=_t('每張圖各自縮到自己顯示尺寸的 {0} 倍（約 {1} PPI）。會先估算並列出總量再要你確認',p.mul,p.ppi);
    b.onclick=ev=>batchCompress(scope,p,ev.currentTarget);
    row.appendChild(b);
  }
  wrap.appendChild(row);
  return wrap;
}

