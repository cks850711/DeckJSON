'use strict';
/* ================= 開機：依提供者決定怎麼開始 =================
   直接雙擊的 deckjson.html（沒有 window.DJ_HOST）→ 照舊還原自動存檔。
   AI 的伺服器（mode:'server'）→ 定時回報分頁；網址帶 ?open= 就載入那個檔，取代這個 port 的自動存檔。
   人類的 DJ App（mode:'app'）→ 選槽位：雙擊 .deck 開進來的檔、或從 Dock 開 App 時要接著做的那份。

   槽位為什麼存在：IndexedDB 是整個網站共用的，原本只有一筆 'current'，開兩個視窗就是後存的蓋掉先存的，
   重整後還原成另一份簡報。App 只有一個網址（一個網站），所以改成 5 個各自的鍵；
   每個槽位用 Web Locks 上鎖，鎖跟著視窗走——視窗關掉或當掉，鎖由瀏覽器自動放開，不會卡死。 */
const SLOT_N=5;
const slotKey=n=>'slot'+n, slotLockName=n=>'deckjson-slot-'+n;

/* ?open=<檔名>：從伺服器資料夾載入。檔案還不存在時開一份空白簡報並記住檔名，第一次存檔就建立它 */
async function hostOpen(rel){
  try{
    const r=await fetch(hostFileUrl(rel),{cache:'no-store'});
    if(r.status===404){
      APP.deck=newDeck(); APP.deck.title=rel.replace(/^.*\//,'').replace(/\.deck$/i,'');
      APP.page=APP.deck.pages[0].id; setSel([]); renderAll(); syncPageJson();
      hostSetFile(rel); APP.dirty=true;
      asHint(_t('新檔 {0}：存檔時建立',rel));
    }else if(!r.ok) throw new Error('HTTP '+r.status);
    else{
      loadDeck(await deckFromFile(await r.blob()));
      hostSetFile(rel); APP.dirty=false;
      asHint(_t('已開啟 {0}',rel));
    }
  }catch(err){ asHint(_t('⚠ 開不了「{0}」：{1}',rel,err.message||err),true); }
  UNDO.length=0; REDO.length=0; updateUndoBtns();   // 開檔＝重新開始，不留「復原到開檔前」
  fileHint();
}

/* ---------- 槽位 ---------- */
function slotTake(n){
  if(!navigator.locks) return Promise.resolve(true);   // 沒有 Web Locks 就不鎖（Chrome／Edge 都有）
  return new Promise(res=>{
    navigator.locks.request(slotLockName(n),{ifAvailable:true},lock=>{
      if(!lock){ res(false); return null; }
      res(true); return new Promise(()=>{});            // 不 resolve＝一直握著，直到視窗關閉
    }).catch(()=>res(false));
  });
}
async function slotInfo(){
  let held=new Set();
  try{ if(navigator.locks) held=new Set(((await navigator.locks.query()).held||[]).map(l=>l.name)); }catch(e){}
  const out=[];
  for(let n=1;n<=SLOT_N;n++){
    let rec=null; try{ rec=await asTx('readonly',st=>st.get(slotKey(n))); }catch(e){}
    const d=rec&&rec.deck;
    out.push({n, busy:held.has(slotLockName(n)), used:!!d, title:d? d.title||'' : '', pages:d&&d.pages? d.pages.length : 0,
      file:rec&&rec.handle? rec.handle.name : '', at:rec? rec.at : 0, dirty:!!(rec&&rec.dirty)});
  }
  return out;
}
function slotWhen(t){
  if(!t) return '';
  const d=new Date(t), now=new Date();
  return d.toDateString()===now.toDateString()? asStamp(t) : `${d.getMonth()+1}/${d.getDate()} ${asStamp(t).slice(0,5)}`;
}

/* 槽位選單。getFile() 回傳雙擊開進來的檔（可能在選單開著時才送到，所以每次重畫都重問）；
   回傳選定且已上鎖的槽位編號 */
function slotPick(getFile){
  return new Promise(resolve=>{
    const modal=$('#slotModal'), list=$('#slotList');
    let rows=[], busy=false;
    async function draw(){
      const h=getFile(), had=[...list.children].indexOf(document.activeElement);
      $('#slotTitle').textContent=h? _t('要把「{0}」開在哪個槽位？',h.name) : _t('選一個槽位');
      rows=await slotInfo();
      const free=rows.filter(r=>!r.busy);
      list.replaceChildren(...rows.map(r=>{
        const b=document.createElement('button');
        b.className='slotRow'+(r.used?'':' empty'); b.disabled=r.busy;
        const sub=[r.file, r.used? _t('{0} 頁',r.pages) : '', slotWhen(r.at)].filter(Boolean).join(' · ');
        b.innerHTML='<span class="sn"></span><span class="st"><span class="t1"></span><span class="t2"></span></span><span class="tag"></span>';
        b.querySelector('.sn').textContent=r.n;
        b.querySelector('.t1').textContent=r.used? (r.title||_t('未命名')) : _t('（空）');
        b.querySelector('.t2').textContent=sub;
        const tag=b.querySelector('.tag');
        if(r.busy) tag.textContent=_t('其他視窗使用中');
        else if(r.dirty){ tag.textContent=_t('有未存檔的變更'); tag.classList.add('warn'); }
        b.onclick=()=>choose(r);
        return b;
      }));
      if(!free.length){
        const p=document.createElement('div'); p.className='slotFull';
        p.textContent=_t('5 個槽位都有視窗在用。請先關掉一個 DeckJSON 視窗，再按重新整理。');
        list.append(p);
      }
      // 預設焦點：開檔時挑第一個空槽位，否則挑最近用過的；定時重畫時保留使用者已經移到的那一格
      const pref=h? (free.find(r=>!r.used)||free[0]) : (free.filter(r=>r.used).sort((a,b)=>b.at-a.at)[0]||free[0]);
      if(had>=0&&rows[had]&&!rows[had].busy) list.children[had].focus();
      else if(pref) list.children[pref.n-1].focus();
    }
    async function choose(r){
      if(busy||r.busy) return;
      const h=getFile();
      if(h&&r.used&&r.dirty&&!confirm(_t('槽位 {0} 有還沒存檔的變更（{1}）。\n\n開啟「{2}」會取代它，那些變更就沒了。要繼續嗎？',r.n,r.title||_t('未命名'),h.name))) return;
      busy=true;
      const ok=await slotTake(r.n);
      busy=false;
      if(!ok) return draw();          // 剛好被別的視窗搶走：重畫，讓它顯示「使用中」
      modal.hidden=true; document.removeEventListener('keydown',key,true); clearInterval(timer);
      resolve(r.n);
    }
    function key(e){
      const n=+e.key;
      if(n>=1&&n<=SLOT_N&&rows[n-1]){ e.preventDefault(); e.stopPropagation(); choose(rows[n-1]); }
      else if(e.key!=='Tab'&&e.key!=='Enter'&&e.key!==' ') e.stopPropagation();   // 選單開著時不讓快捷鍵動到畫布
    }
    document.addEventListener('keydown',key,true);
    slotPick.redraw=draw;
    const timer=setInterval(()=>{ if(!busy) draw(); },2000);   // 別的視窗關掉時，它的槽位要自己變回可選
    modal.hidden=false;
    draw();
  });
}

async function appBoot(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  let launched=null;
  if('launchQueue' in window) launchQueue.setConsumer(async p=>{
    const h=p.files&&p.files[0];
    if(!h) return;
    if(!APP_SLOT){ launched=h; if(slotPick.redraw) slotPick.redraw(); return; }
    // 已經有槽位（例如重新整理後瀏覽器再送一次同一個檔）：同一個檔就不理，別的檔照一般開檔流程問
    if(APP.file&&APP.file.handle&&await APP.file.handle.isSameEntry(h).catch(()=>false)) return;
    openDeckFile(await h.getFile(),true,h);
  });

  // 重新整理：沿用這個分頁原本的槽位。舊頁面的鎖在卸載時才放開，稍等幾次
  let n=0;
  try{ n=+sessionStorage.getItem('deckjson.slot')||0; }catch(e){}
  if(n){
    let ok=false;
    for(let i=0;i<10&&!(ok=await slotTake(n));i++) await new Promise(r=>setTimeout(r,100));
    if(!ok) n=0;
  }
  if(!n){
    await new Promise(r=>setTimeout(r,250));   // 雙擊開進來的檔通常在這段時間內送到，選單一開就是「開在哪個槽位」
    n=await slotPick(()=>launched);
  }
  APP_SLOT=n; AS_KEY=slotKey(n);
  try{ sessionStorage.setItem('deckjson.slot',String(n)); }catch(e){}
  if(launched){
    const h=launched; launched=null;
    try{
      const f=await h.getFile();
      if(await openDeckFile(f,false,h)){
        UNDO.length=0; REDO.length=0; updateUndoBtns();
        APP.ready=true; APP.dirty=false; fileHint();
        asSaveNow();   // 立刻把「這個檔」記進槽位，取代槽位裡原本的那份
        return;
      }
    }catch(err){ asHint(_t('⚠ 開不了「{0}」：{1}',h.name,err.message||err),true); }
  }
  await asRestore();
  fileHint();
}

async function hostBoot(){
  if(!HOST) return asRestore();
  if(HOST.mode==='app') return appBoot();
  const q=new URLSearchParams(location.search), rel=q.get('open');
  if(!rel){ await asRestore(); return hostPingStart(); }   // 還原完才回報，狀態頁才不會先看到空白簡報
  /* 從網址拿掉 ?open=：之後重新整理就是還原自動存檔，不會又從硬碟重載一次、把還沒存的修改丟掉 */
  q.delete('open');
  history.replaceState(null,'',location.pathname+(q.toString()? '?'+q : '')+location.hash);
  await hostOpen(rel);
  APP.ready=true;
  asSaveNow();   // 直接取代這個 port 的自動存檔
  hostPingStart();
}
