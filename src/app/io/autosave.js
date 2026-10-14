'use strict';
/* ================= 自動存檔（IndexedDB） =================
   單檔工具沒有存檔最違反直覺：重新整理／當機／誤關分頁 = 全沒了。
   為什麼是 IndexedDB 而不是 localStorage：一張 base64 圖片動輒數百 KB，
   localStorage 上限約 5MB 且只收字串，塞兩三張圖就爆；IndexedDB 可存結構化物件且額度大得多。
   失敗一律浮上檯面（頂端轉紅字），絕不靜默——「以為存了其實沒存」比沒有存檔更糟。 */
const AS_DB='deckjson', AS_STORE='autosave', AS_DELAY=1200;
/* 記錄的鍵。平常只有一筆 'current'；DJ App 開機選了槽位後改成 'slot1'～'slot5'（見 ui/host-boot.js） */
let AS_KEY='current';
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
/* asWarn：還原失敗的停用警告。之後的提示（已存檔…）都接在它前面一起顯示、整列維持警告色，
   否則手動存檔一次它就被蓋掉，使用者不再知道自動存檔是停的。只有 asDropFailed 會清掉它 */
let asWarn='';
function asHint(txt,bad){
  const s=$('#saveHint'); if(!s) return;
  s.textContent= asWarn&&txt!==asWarn? (txt? txt+' · '+asWarn : asWarn) : (txt||'');
  s.classList.toggle('bad',!!bad||!!asWarn);
}
const as2=n=>String(n).padStart(2,'0');
function asStamp(t){ const d=new Date(t); return as2(d.getHours())+':'+as2(d.getMinutes())+':'+as2(d.getSeconds()); }
function asSaveNow(){
  if(asOff) return Promise.resolve(false);
  let fh=null;
  // 先試複製：萬一這個環境的 handle 不能結構化複製，寧可不記檔案，也不要讓自動存檔整條掛掉
  if(APP.file&&APP.file.handle){ try{ structuredClone(APP.file.handle); fh=APP.file.handle; }catch(e){} }
  /* srv：檔案在 AI 伺服器的資料夾裡（沒有 handle），連同資料夾一起記，還原時只在同一個資料夾才接回去——
     port 會被下一個工作沿用，換了資料夾還接回去，Cmd/Ctrl+S 就會寫進別的資料夾裡的同名檔。
     dirty：DJ App 的槽位選單據此提醒「這格有還沒存檔的變更」 */
  const srv=APP.file&&APP.file.server&&HOST? {name:APP.file.name,folder:HOST.folder} : null;
  const rec={deck:structuredClone(APP.deck),page:APP.page,at:Date.now(),handle:fh,srv,dirty:!!APP.dirty};
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
/* 還原失敗後，使用者打出確認字放棄那筆記錄時（見 io/file.js 的「開新簡報」）：刪掉它並恢復自動存檔。
   asRestoreFailed 只在還原失敗時為真；瀏覽器擋 IndexedDB、容量已滿這類停用不走這裡，恢復了也存不進去 */
let asRestoreFailed=false;
function asDropFailed(){
  if(!asRestoreFailed) return;
  asClear();   // 之後的自動存檔排在這筆刪除之後（同一個 object store 的交易依建立順序執行）
  asRestoreFailed=false; asOff=false; asWarn=''; asHint('');
}
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
      /* 還原平常不跳視窗（圖表顏色之類的提示只進 console）。有型別不認得的元素時例外：
         它們畫布上看不到，不講使用者不會知道，所以跳 reportChartIssues，圖表的提示也一起帶出 */
      if(NORM_REPORT.unknown.length) reportChartIssues();
      /* 「上次開的是哪個檔」就在同一筆記錄裡，與剛還原的內容必然成對（見上方〈檔案存檔〉的說明）。
         權限不跨頁面重載，故標 stale，等使用者按存檔（那時才有 user gesture）再要權限。 */
      if(rec.handle){ APP.file={handle:rec.handle,name:rec.handle.name,stamp:0,stale:true}; fileHint(); }
      else if(rec.srv&&hostServer()&&rec.srv.folder===HOST.folder){ hostSetFile(rec.srv.name); fileHint(); }
      try{ if(sessionStorage.getItem('deckjson.dirty')){ sessionStorage.removeItem('deckjson.dirty'); APP.dirty=true; fileHint(); } }catch(e){}
    }catch(err){
      /* 還原失敗（任何原因）就停用自動存檔，原記錄留在原鍵不動。不停用的話畫面留在空白簡報，
         下一次編輯 1.2 秒後就把這筆記錄蓋成空白簡報，原本的內容永久消失（2026-10-14 實測）。
         選停用而不是把記錄搬到備份鍵：留在原鍵，換一個讀得懂它的版本重新整理就能照常還原，
         不需要另外做找回備份的介面；代價是這次工作階段的修改不會自動存檔，提示裡要講明。
         「開新簡報」平常會清除自動存檔；停用時不清，只在使用者另外打出確認字放棄這筆記錄時才刪（asDropFailed）。
         記錄若是真的壞了，任何版本都讀不回來，沒有這條路的話這個網址每次載入都會停用自動存檔。 */
      asOff=true; asRestoreFailed=true;
      asWarn=_t('⚠ 上次的自動存檔讀不回來，已停用自動存檔、原記錄保留不動。這次的修改請用「存檔」或「另存新檔」存成檔案。原因：{0}',err&&err.message||err);
      asHint(asWarn,true);
    }
  }
  APP.ready=true;   // 還原完才開始存，否則空白 deck 會覆蓋掉剛讀出來的東西
}
