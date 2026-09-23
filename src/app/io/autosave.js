'use strict';
/* ================= 自動存檔（IndexedDB） =================
   單檔工具沒有存檔最違反直覺：重新整理／當機／誤關分頁 = 全沒了。
   為什麼是 IndexedDB 而不是 localStorage：一張 base64 圖片動輒數百 KB，
   localStorage 上限約 5MB 且只收字串，塞兩三張圖就爆；IndexedDB 可存結構化物件且額度大得多。
   失敗一律浮上檯面（頂端轉紅字），絕不靜默——「以為存了其實沒存」比沒有存檔更糟。 */
const AS_DB='deckjson', AS_STORE='autosave', AS_KEY='current', AS_DELAY=1200;
let asTimer=null, asDBP=null, asOff=false;   // asOff＝這個環境不支援／已失敗，停止再試
function asDB(){
  if(asDBP) return asDBP;
  asDBP=new Promise((res,rej)=>{
    if(!window.indexedDB) return rej(new Error(_t('此瀏覽器不支援 IndexedDB')));
    const rq=indexedDB.open(AS_DB,1);
    rq.onupgradeneeded=()=>{ const db=rq.result; if(!db.objectStoreNames.contains(AS_STORE)) db.createObjectStore(AS_STORE); };
    rq.onsuccess=()=>res(rq.result);
    rq.onerror=()=>rej(rq.error||new Error(_t('IndexedDB 開啟失敗')));
  });
  return asDBP;
}
function asTx(mode,fn){
  return asDB().then(db=>new Promise((res,rej)=>{
    const tx=db.transaction(AS_STORE,mode), st=tx.objectStore(AS_STORE);
    let rq; try{ rq=fn(st); }catch(e){ return rej(e); }
    // 用 instanceof 判斷，不能用「result 有沒有值」——查無此鍵時 result 正是 undefined，
    // 那樣會把 IDBRequest 物件本身當成結果傳出去（truthy 的空殼，讀 rec.deck 才發現不對）
    tx.oncomplete=()=>res(rq instanceof IDBRequest? rq.result : rq);
    tx.onerror=()=>rej(tx.error||new Error(_t('IndexedDB 交易失敗')));
    tx.onabort=()=>rej(tx.error||new Error(_t('IndexedDB 交易中止')));
  }));
}
function asHint(txt,bad){ const s=$('#saveHint'); if(!s) return; s.textContent=txt||''; s.classList.toggle('bad',!!bad); }
const as2=n=>String(n).padStart(2,'0');
function asStamp(t){ const d=new Date(t); return as2(d.getHours())+':'+as2(d.getMinutes())+':'+as2(d.getSeconds()); }
function asSaveNow(){
  if(asOff) return Promise.resolve(false);
  let fh=null;
  // 先試複製：萬一這個環境的 handle 不能結構化複製，寧可不記檔案，也不要讓自動存檔整條掛掉
  if(APP.file&&APP.file.handle){ try{ structuredClone(APP.file.handle); fh=APP.file.handle; }catch(e){} }
  const rec={deck:structuredClone(APP.deck),page:APP.page,at:Date.now(),handle:fh};
  return asTx('readwrite',st=>st.put(rec,AS_KEY))
    .then(()=>{ asHint(_t('已自動存檔 {0}',asStamp(rec.at))); return true; })
    .catch(err=>{
      asOff=true;   // 容量超限／私密模式擋存取：停止重試，但把原因寫在畫面上
      const q=/quota|exceed/i.test(String(err&&err.name)+String(err&&err.message));
      asHint(q? _t('⚠ 自動存檔失敗：瀏覽器容量已滿，請用工具列的「另存」存成檔案') : _t('⚠ 自動存檔停用：{0}',err&&err.message||err),true);
      return false;
    });
}
function scheduleAutosave(){
  if(APP.ready&&!APP.dirty){ APP.dirty=true; fileHint(); }   // 標在 early return 之前：自動存檔停用不代表檔案沒改
  if(asOff||!APP.ready) return;
  clearTimeout(asTimer);
  asHint(_t('存檔中…'));
  asTimer=setTimeout(asSaveNow,AS_DELAY);
}
function asClear(){ return asTx('readwrite',st=>st.delete(AS_KEY)).catch(()=>{}); }
async function asRestore(){
  let rec=null;
  try{ rec=await asTx('readonly',st=>st.get(AS_KEY)); }
  catch(err){ asOff=true; asHint(_t('⚠ 自動存檔停用：{0}',err&&err.message||err),true); return; }
  if(rec&&rec.deck){
    try{
      APP.deck=normalizeDeck(rec.deck);
      APP.page=(APP.deck.pages.find(p=>p.id===rec.page)||APP.deck.pages[0]).id;
      UNDO.length=0; REDO.length=0;   // 還原＝重新開始，不繼承上一場的復原堆疊
      setSel([]); renderAll(); syncPageJson();
      asHint(_t('已還原上次內容（{0}）',asStamp(rec.at)));
      /* 「上次開的是哪個檔」就在同一筆記錄裡，與剛還原的內容必然成對（見上方〈檔案存檔〉的說明）。
         權限不跨頁面重載，故標 stale，等使用者按存檔（那時才有 user gesture）再要權限。 */
      if(rec.handle){ APP.file={handle:rec.handle,name:rec.handle.name,stamp:0,stale:true}; fileHint(); }
      try{ if(sessionStorage.getItem('deckjson.dirty')){ sessionStorage.removeItem('deckjson.dirty'); APP.dirty=true; fileHint(); } }catch(e){}
    }catch(err){ asHint(_t('⚠ 上次的自動存檔讀不回來：{0}',err.message),true); }
  }
  APP.ready=true;   // 還原完才開始存，否則空白 deck 會覆蓋掉剛讀出來的東西
}
