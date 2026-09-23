'use strict';
/* ================= 檔案存檔（就地覆寫） =================
   瀏覽器預設碰不到硬碟。File System Access API 給的是「使用者在對話框裡親自挑過的那一個檔」
   的寫入權，回傳的 handle 就是那張門票——有票就直接覆寫，沒票才跳對話框。

   票只在 secure context 發，而 file:// 也算 secure context——2026-09-16 實測：雙擊開啟的頁面
   按 Cmd/Ctrl+S，Chrome 會跳「file:/// 將可編輯 xxx.deck」的授權提示，允許後就地覆寫成功
   （21,579 位元組落地驗證）。**本註解原本宣稱 file:// 拿不到寫入權，那是錯的，已更正。**
   拿不到票的是 Safari／Firefox（沒有選檔器 API），那時整條退回下載行為，並在提示列講明白：
   靜默降級成「以為覆寫了、其實掉進下載資料夾」比沒有這個功能更糟。
   專案根的 start-localhost.command 仍然有用，但理由是**固定 origin ＝ 固定儲存空間**
   （換 port 等於換一個 IndexedDB 與 localStorage），不是為了取得寫入權。

   權限不跨頁面重載：重整後 queryPermission 會回到 'prompt'，且 requestPermission 只能在
   user gesture 裡叫——所以底下每個要權限的動作都由按鍵／點擊直接觸發，不從計時器或還原流程呼叫。 */
const FS_OK = typeof window.showSaveFilePicker==='function' && typeof window.showOpenFilePicker==='function';
/* 「函式存在」不等於「用得出來」。Claude 桌面版的內建瀏覽器正好落在中間：選檔器會開、讀取權限給得出來，
   但 requestPermission({mode:'readwrite'}) 直接回 denied、不詢問，createWritable() 丟 NotAllowedError。
   於是 FS_OK 為 true → 走 FSA → 退到另存 → 選檔器又截斷一個檔，形成毀檔迴圈。
   在真正嘗試寫入之前無從得知會被拒（要查權限得先有 handle，要 handle 得先過選檔器，而選檔器已經截斷了），
   所以只能「撞過一次就記住」，把代價從每次一個檔壓到總共一個檔。 */
let fsaDenied=false; try{ fsaDenied=localStorage.getItem('dj.fsaDenied')==='1'; }catch(e){}
const fsUsable=()=>FS_OK&&!fsaDenied;
function fsaGiveUp(){
  fsaDenied=true; try{ localStorage.setItem('dj.fsaDenied','1'); }catch(e){}
  $('#btnSave').title=_t('存檔（Cmd/Ctrl+S）：此環境無法就地覆寫，會下載一份副本到下載資料夾');
  $('#btnSaveAs').title=_t('另存新檔：此環境無法就地覆寫，會下載一份副本到下載資料夾');
}
const DECK_TYPES=[{description:_t('DeckJSON 簡報'),accept:{'application/zip':['.deck','.deck.json']}}];
/* handle 跟著自動存檔寫在**同一筆記錄**裡，不另立鍵。
   理由是多分頁：IndexedDB 是整個 origin 共用的，分開存就會出現「內容來自這個分頁、
   handle 來自另一個分頁」的錯配——重載後按一次 Cmd/Ctrl+S，就把甲的內容寫進乙的檔案。
   綁成同一次寫入之後，還原時內容與檔案必然成對（頂多是整組被別的分頁蓋掉，那不會損毀資料）。 */

function fileHint(){
  const s=$('#fileHint'); if(!s) return;
  if(!APP.file){ s.textContent=''; s.className=''; return; }
  s.textContent=(APP.dirty?'● ':'')+APP.file.name+(APP.file.stale?_t('（需重新授權）'):'');
  s.className=APP.file.stale?'stale':(APP.dirty?'dirty':'');
  s.title=(APP.file.stale? _t('重整後權限要重新取得：按工具列的存檔鈕即可\n'):'')+_t('目前開啟：{0}',APP.file.name);
}
function setDeckFile(h,f){
  APP.file=h? {handle:h,name:h.name,stamp:f?f.lastModified:0,stale:false} : null;
  APP.dirty=false; fileHint();
  // 有檔案才排自動存檔；h 為 null 時不排，否則「📄 開新」剛清掉的自動存檔會被空白 deck 寫回去
  if(h&&APP.ready) scheduleAutosave();
}
async function ensureRW(h){
  const opt={mode:'readwrite'};
  if(await h.queryPermission(opt)==='granted') return true;
  return await h.requestPermission(opt)==='granted';
}
/* 寫入前比對 mtime：別的分頁、姊妹外掛或同步軟體可能動過同一個檔。
   沒有基準（剛從 IndexedDB 還原、還沒讀過檔）時不猜，直接放行——寧可少問，不要每次都問。 */
async function externallyChanged(){
  const f=APP.file; if(!f||f.stale||!f.stamp) return false;
  try{ return (await f.handle.getFile()).lastModified>f.stamp; }catch(e){ return false; }
}
/* 為什麼拆成兩半：「另存新檔」必須在**開選檔器之前**就把 blob 準備好。
   showSaveFilePicker() 在使用者按下確認的那一刻就把目標檔截成 0 位元組，早於網頁拿到 handle
   ——這是 Chromium 的通用行為（2026-09-16 於 Chrome 實測：1,048,576 → 0，程式一個位元組都沒寫）。
   所以「打包失敗就不會動到原檔」這個保護，只有在打包排在選檔器之前時才成立；
   排在後面的話，deckToBlob() 丟出例外時檔案早就空了。Cmd/Ctrl+S 沿用既有 handle、不經選檔器，
   不受這條影響，所以 writeDeckTo() 保留原本的一次到底。 */
async function writeDeckTo(h){ return writeBlobTo(h, await deckToBlob()); }
async function writeBlobTo(h,blob){
  const w=await h.createWritable();   // 寫進暫存檔，close() 才原子換掉原檔：寫到一半當掉不會留半截檔
  await w.write(blob);
  await w.close();
  /* 存檔後回讀驗證。2026-09-07 真的因此遺失過一次資料：createWritable() 開了暫存檔，close() 卻沒把
     資料帶完成，檔案變成 0 位元組——而且全程沒有任何徵兆，因為底下那三行照跑：APP.dirty 被清掉、
     自動存檔被那份「已存好」的狀態覆寫，兩層防線同時失效，殘留的 .crswap 是唯一線索。
     這裡不猜原因，只問一句「硬碟上的大小對不對」。getFile() 本來就要呼叫（取 lastModified），
     所以這條檢查幾乎不花成本。
     失敗時刻意什麼都不做：不清 APP.dirty（檔名前的 ● 留著）、不更新 APP.file（下次存檔不會沿用
     這次的時間戳去比對）、不呼叫 asSaveNow（自動存檔保留上一份完好的），再往外丟給
     saveDeck／saveDeckAs 的 catch 印紅字。alert 是刻意的——這是資料遺失，不該只留一行提示。 */
  let f=null; try{ f=await h.getFile(); }catch(e){}
  if(!f||f.size!==blob.size){
    const got=f? _t('{0} 位元組',f.size) : _t('讀不回來');
    alert(_t('⚠ 存檔沒有成功：「{0}」\n\n'+
          '寫完之後回讀，硬碟上是 {1}，應該是 {2} 位元組。\n'+
          '這個檔案可能已經損毀，請不要用它。\n\n'+
          '目前的內容還在，請改用「另存新檔」存到別的位置；\n'+
          '就算關掉頁面，自動存檔也還留著這一份（重新開啟時會問要不要還原）。',h.name,got,blob.size));
    throw new Error(_t('寫入後回讀對不上：{0}，應為 {1} 位元組',got,blob.size));
  }
  APP.file={handle:h,name:h.name,stamp:f.lastModified,stale:false}; APP.dirty=false; fileHint();
  await asSaveNow().catch(()=>{});   // 立刻落一筆「內容＋檔案」成對的記錄，不等 1.2 秒排程
  asHint(_t('已存檔 {0}　{1}',h.name,asStamp(Date.now())));   // 蓋掉 asSaveNow 的提示：這裡要講的是檔案存好了
}
async function saveDeck(){          // Cmd/Ctrl+S
  if(!fsUsable()) return saveDeckDownload();
  if(!APP.file) return saveDeckAs();
  try{
    /* 拿不到寫入權限時**不要退到另存**——另存會開選檔器，而選檔器一按確認就截斷目標檔，
       等於「因為存不進去，所以先把它毀掉」。下載一份副本是無損的退路。 */
    if(!await ensureRW(APP.file.handle)){ asHint(_t('⚠ 沒拿到寫入權限，改為下載一份副本'),true); return saveDeckDownload(); }
    if(await externallyChanged() &&
       !confirm(_t('「{0}」在硬碟上被改過（可能是別的分頁或其他程式）。\n\n繼續存檔會蓋掉那些變更。要繼續嗎？',APP.file.name))) return;
    await writeDeckTo(APP.file.handle);
  }catch(err){ if(err.name!=='AbortError') asHint(_t('⚠ 存檔失敗：{0}',err.message||err),true); }
}
async function saveDeckAs(){        // Cmd/Ctrl+Shift+S
  if(!fsUsable()) return saveDeckDownload();
  let blob;
  // 打包排在選檔器之前：失敗就連對話框都不開，使用者的檔案毫髮無傷。見 writeBlobTo 上方說明
  try{ blob=await deckToBlob(); }
  catch(err){ asHint(_t('⚠ 打包失敗，沒有動到任何檔案：{0}',err.message||err),true); return; }
  try{
    const h=await showSaveFilePicker({
      suggestedName: APP.file? APP.file.name : (APP.deck.title||'deckjson')+'.deck',
      types:DECK_TYPES});
    await writeBlobTo(h,blob);
  }catch(err){
    if(err.name==='AbortError') return;   // 按了取消，不是錯誤
    if(err.name==='NotAllowedError'){     // 平台不給寫。檔案已被選檔器清空，只能明講
      fsaGiveUp();
      alert(_t('⚠ 這個瀏覽器不允許網頁寫入磁碟檔案。\n\n'+
            '你剛才選的那個檔已經被選檔器清空（這發生在本程式收到它之前，擋不住），請自行刪除。\n\n'+
            '接下來會改為下載一份副本；之後的存檔也一律走下載，不會再開這個對話框。'));
      return saveDeckDownload();
    }
    asHint(_t('⚠ 另存失敗：{0}',err.message||err),true);
  }
}
async function saveDeckDownload(){  // 沒有 FSA 時的退路（Safari／Firefox／file:// 開啟）
  const url=URL.createObjectURL(await deckToBlob());
  const a=document.createElement('a');
  a.href=url;
  a.download=(APP.deck.title||'deckjson')+'.deck';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);   // 立刻 revoke 會讓下載中斷，給它一段時間

  APP.dirty=false; fileHint();
  asHint(_t('已下載一份副本到下載資料夾（此環境無法就地覆寫，見「?」說明）'));
}
async function openDeckPicker(){
  if(!FS_OK) return $('#jsonInput').click();
  try{
    const [h]=await showOpenFilePicker({types:DECK_TYPES,multiple:false});
    const f=await h.getFile();
    if(await openDeckFile(f,false,h)) $('#jsonModal').hidden=true;
  }catch(err){ if(err.name!=='AbortError') alert(_t('開啟失敗：{0}',err.message||err)); }
}

/* ---- 開新／開啟／另存 ---- */
/* 開啟簡報檔的唯一入口：📂 開啟與拖放共用同一條解析路徑，免得兩邊的驗證與錯誤處理日久分岔。
   ask=true（拖放）時，畫布上已有內容就先問一次——拖錯檔案不該直接蓋掉正在做的簡報。
   h＝這個檔的 FileSystemFileHandle（拖放與 showOpenFilePicker 拿得到，<input type=file> 拿不到）。
   沒有 h 時必須把 APP.file 清成 null：否則接下來的 Cmd/Ctrl+S 會覆寫到「上一個」檔案。 */
async function openDeckFile(f,ask,h){
  let obj;
  try{ obj=await deckFromFile(f); }   // 容器與舊的純 JSON 都吃，靠 magic byte 分流
  catch(err){ alert(_t('載入失敗：「{0}」讀不開\n\n{1}',f.name,err.message)); return false; }
  // 先輕量認一下是不是簡報檔，才不會為了一個不相干的 .json 也去問「要不要取代」
  if(!obj||typeof obj!=='object'||!Array.isArray(obj.pages)||!obj.pages.length){
    alert(_t('載入失敗：「{0}」不是 DeckJSON 簡報檔（缺 pages）',f.name)); return false; }
  const n=APP.deck.pages.reduce((s,p)=>s+p.elements.length,0);
  if(ask&&n&&!confirm(_t('載入「{0}」會取代目前的 {1} 頁／{2} 個元素。\n\n還留一步 Cmd/Ctrl+Z 後路。要繼續嗎？',f.name,APP.deck.pages.length,n))) return false;
  try{ loadDeck(obj); setDeckFile(h||null,f); if(APP.ready) scheduleAutosave(); return true; }
  catch(err){ alert(_t('載入失敗：{0}',err.message)); return false; }
}
$('#btnSave').onclick=saveDeck;
$('#btnSaveAs').onclick=saveDeckAs;
$('#btnOpen').onclick=openDeckPicker;
if(!fsUsable()){   // 講明白比靜默降級重要：按鈕上就要看得出這個環境存出去的是副本
  $('#btnSave').title=_t('存檔（Cmd/Ctrl+S）：此環境無法就地覆寫，會下載一份副本到下載資料夾');
  $('#btnSaveAs').title=_t('另存新檔：此環境無法就地覆寫，會下載一份副本到下載資料夾');
}
$('#btnNew').onclick=()=>{
  const n=APP.deck.pages.reduce((s,p)=>s+p.elements.length,0);
  // 二次確認：第一關講清楚會失去什麼，第二關擋住「順手按 Enter」
  if(!confirm(_t('開新簡報會清空目前的 {0} 頁／{1} 個元素，且自動存檔一併清除。\n\n未另存的內容將無法復原。要繼續嗎？',APP.deck.pages.length,n))) return;
  if(!confirm(_t('再確認一次：真的要放棄目前內容？'))) return;
  asClear();
  commitUndo();   // 仍留一步 Cmd+Z 後路（自動存檔已清，但本次工作階段還救得回來）
  APP.deck=newDeck(); APP.page=APP.deck.pages[0].id;
  setDeckFile(null);   // 新簡報還沒有對應的檔案，Cmd/Ctrl+S 要重新問存到哪
  APP.edit=null; APP.editing=null; setSel([]);
  renderAll(); syncPageJson(); asHint('');
};

/* ================= profile 檔案匯入／匯出 ================= */
function saveProfileFile(){
  const p=profileFromDeck(APP.deck);
  const a=document.createElement('a');
  a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(p,null,1));
  a.download=(p.name||'deckjson')+'.profile.json';
  a.click();
}
$('#profileInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const raw=JSON.parse(await f.text());
    if(raw&&raw.format&&raw.format!=='deckjson-profile') throw new Error(_t('這不是 profile 檔（format 應為 deckjson-profile）'));
    commitUndo();
    applyProfileToDeck(APP.deck,raw);
    renderAll(); syncPageJson(); checkFonts();
    const keep=confirm(_t('已套用設定檔「{0}」。\n要同時設為「新簡報預設」嗎？',APP.deck.profileName||''));
    if(keep&&!lsSet(PROFILE_KEY,JSON.stringify(profileFromDeck(APP.deck))))
      alert(_t('這個瀏覽器環境不允許寫入 localStorage，無法記住預設（本簡報仍已套用）。'));
  }catch(err){ alert(_t('載入設定檔失敗：{0}',err.message)); }
});

/* ================= Deck 合併（載入第二份 .json 附加為後續頁） ================= */
$('#mergeInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const inc=normalizeDeck(await deckFromFile(f));   // deckFromFile 已回傳新物件，不必再 clone
    commitUndo();
    const at=APP.deck.pages.indexOf(curPage())+1;
    inc.pages.forEach((pg,k)=>{ pg.id=uid('p'); APP.deck.pages.splice(at+k,0,pg); });  // 換新頁 id 免撞
    setPage(inc.pages[0].id); renderAll();
    alert(_t('已於本頁後附加 {0} 頁',inc.pages.length));
  }catch(err){ alert(_t('合併失敗：{0}',err.message)); }
});

