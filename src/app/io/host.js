'use strict';
/* ================= 由 deckjson-server 提供時 =================
   伺服器送出本頁時在 <head> 注入 window.DJ_HOST；直接雙擊 deckjson.html 時沒有它，這個檔的一切都不啟動。
     {mode:'server', port, folder, open}   AI 用的 47111～47115：檔案在伺服器指定的資料夾，存檔走 POST /save
     {mode:'app', port}                    人類用的 DJ App（47121）：存檔仍走檔案把手，另分 5 個槽位
   開機時要做的事（?open= 載入、槽位選單、service worker）在 ui/host-boot.js；這裡只放存取。
   伺服器資料夾裡的檔，在 APP.file 記成 {server:true, name:<資料夾內的相對路徑>}，沒有 handle——
   存檔前「被別處改過」的檢查由伺服器做（它記得讀出時的修改時間）。 */
const HOST=(()=>{ const h=window.DJ_HOST;
  return h&&typeof h==='object'&&(h.mode==='server'||h.mode==='app')? h : null; })();
const hostServer=()=>!!HOST&&HOST.mode==='server';
let APP_SLOT=0;   // DJ App 目前用的槽位（1～5），0＝不是 App

const hostFileUrl=rel=>'/files/'+String(rel).split('/').map(encodeURIComponent).join('/');
function hostSetFile(rel){ APP.file={server:true,name:rel,stale:false}; }

/* 把 blob 存成伺服器資料夾內的 rel。伺服器拒絕時丟出它的說明，並帶上 code（changed＝被別處改過、
   exists＝已存在但不是從這裡開的），讓呼叫端決定要不要帶 force 再試 */
async function hostWrite(rel,blob,force){
  const r=await fetch('/save?n='+encodeURIComponent(rel)+(force?'&force=1':''),{method:'POST',body:blob});
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok) throw Object.assign(new Error(j&&j.error||('HTTP '+r.status)),{code:j&&j.code,status:r.status});
  // 同 writeBlobTo 的回讀驗證：伺服器回報寫了幾個位元組，對不上就不當作存好了
  if(!j||j.bytes!==blob.size) throw new Error(_t('寫入後大小對不上：{0}，應為 {1} 位元組',j&&j.bytes,blob.size));
  hostSetFile(j.saved); APP.dirty=false; fileHint();
  await asSaveNow().catch(()=>{});
  asHint(_t('已存檔 {0}　{1}',j.saved,asStamp(Date.now())));
  hostPing();   // 檔名可能剛換（save({as})），狀態頁立刻跟上
  return j;
}
async function hostSaveUI(){   // Cmd/Ctrl+S，檔案在伺服器資料夾裡時
  const rel=APP.file.name;
  try{ await hostWrite(rel,await deckToBlob(),false); }
  catch(err){
    if(err.code!=='changed'&&err.code!=='exists') return asHint(_t('⚠ 存檔失敗：{0}',err.message||err),true);
    if(!confirm(_t('「{0}」在硬碟上被改過（可能是別的分頁或其他程式）。\n\n繼續存檔會蓋掉那些變更。要繼續嗎？',rel))) return;
    try{ await hostWrite(rel,await deckToBlob(),true); }
    catch(e2){ asHint(_t('⚠ 存檔失敗：{0}',e2.message||e2),true); }
  }
}

/* 分頁回報：狀態頁靠它列出「現在開著哪些分頁、各是哪份簡報」，伺服器也靠它判斷還有沒有人在用 */
const HOST_TAB=(()=>{
  const mk=()=>Math.random().toString(36).slice(2,10);
  try{ let t=sessionStorage.getItem('deckjson.tab'); if(!t){ t=mk(); sessionStorage.setItem('deckjson.tab',t); } return t; }
  catch(e){ return mk(); }
})();
function hostPing(closed){
  const body=JSON.stringify({tab:HOST_TAB,title:APP.deck.title||'',file:APP.file? APP.file.name : '',closed:!!closed});
  if(closed&&navigator.sendBeacon) return navigator.sendBeacon('/__ping',new Blob([body],{type:'text/plain'}));
  fetch('/__ping',{method:'POST',body,keepalive:true}).catch(()=>{});
}
function hostPingStart(){
  hostPing(); setInterval(()=>hostPing(),20000);
  addEventListener('pagehide',()=>hostPing(true));
  addEventListener('pageshow',e=>{ if(e.persisted) hostPing(); });
}

/* 視窗標題：App 的每個視窗、AI 的每個分頁要分得出是哪份簡報、哪個槽位 */
function hostTitle(){
  if(!HOST) return;
  const name=APP.file? APP.file.name : (APP.deck.title||_t('未命名'));
  // App 視窗的標題列由 Chrome 自己加上 App 名稱（「DeckJSON - …」），這裡再加就重複了；瀏覽器分頁才需要
  document.title=(APP.dirty?'● ':'')+name+(APP_SLOT? ` [${APP_SLOT}]` : ' — DeckJSON');
}
