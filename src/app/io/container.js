'use strict';
/* ================= .deck 容器（zip） =================
   磁碟上的 .deck 是 zip：deck.json ＋ assets/<雜湊>.<副檔名>。
   **記憶體模型完全不變**——el.dataUrl 在執行期仍是 data URL，所以畫布渲染、圖片
   壓縮、匯出檢查那些讀取點一行都不用改。轉換只發生在存檔／載入這條邊界上。

   舊的純 JSON 照開：deck.assetMode 缺鍵＝inline＝位元組內嵌，原樣放行。
   xlsx2pptx 至今輸出的 .deck.json 也走這條，不必改它。 */
const ASSET_DIR='assets/';
const MIME2EXT={'image/png':'png','image/jpeg':'jpg','image/gif':'gif',
                'image/webp':'webp','image/svg+xml':'svg','image/bmp':'bmp'};
const EXT2MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',
                webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp'};

/* 內容定址的雜湊刻意不用 crypto.subtle：那個 API 只在安全上下文存在，而本工具的
   核心情境正是 file:// 雙擊開啟。內容定址不需要密碼學強度——同一份簡報幾十張圖，
   64 位的碰撞機率可忽略，而且 dehydrate 真的撞到時會逐位元比對再換名，不覆蓋。 */
function assetHash(b){
  let h1=0x811c9dc5>>>0, h2=0x9e3779b9>>>0;
  for(let i=0;i<b.length;i++){
    h1=((h1^b[i])>>>0)*0x01000193>>>0;
    h2=((h2+b[i])>>>0)*0x85ebca6b>>>0; h2=(h2^(h2>>>13))>>>0;
  }
  return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}
function sameBytes(a,b){ if(a.length!==b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false; return true; }

/* 帶位元組的欄位只有三個（圖片 dataUrl／頁面 bgImage／影片 cover），但**母版元素
   不在 deck.pages 底下**——只走 pages 的話會把母版上的 Logo 整個弄丟，而且無聲。 */
function assetSlots(deck){
  const out=[], take=(o,k)=>{ if(typeof o[k]==='string'&&o[k]) out.push({o,k}); };
  for(const p of deck.pages||[]){
    take(p,'bgImage');
    for(const el of p.elements||[]){ take(el,'dataUrl'); take(el,'cover'); }
  }
  for(const el of (deck.master&&deck.master.elements)||[]){ take(el,'dataUrl'); take(el,'cover'); }
  return out;
}
function dataUrlDecode(u){
  const i=u.indexOf(',');
  const mime=(u.slice(0,i).match(/^data:([^;,]+)/)||[])[1]||'application/octet-stream';
  const bin=atob(u.slice(i+1)), a=new Uint8Array(bin.length);
  for(let k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k);
  return {bytes:a, ext:MIME2EXT[mime]||'bin'};
}
/* 位元組抽出來 → 欄位換成檔名。只收被引用到的資產，刪掉的元素不留孤兒檔。 */
function dehydrate(deck){
  const d=structuredClone(deck), assets=new Map();
  for(const s of assetSlots(d)){
    const v=s.o[s.k];
    if(!v.startsWith('data:')) continue;   // 已是引用，或不是位元組
    const {bytes,ext}=dataUrlDecode(v);
    const base=assetHash(bytes);
    let name=base+'.'+ext, n=1, prev;
    while((prev=assets.get(name))&&!sameBytes(prev,bytes)) name=base+'-'+(n++)+'.'+ext;
    assets.set(name,bytes); s.o[s.k]=name;
  }
  d.assetMode='ref';
  return {deck:d, assets};
}
/* 檔名 → 還原成 data URL。缺檔一律拋錯：無聲少一張圖比開不了檔更糟。 */
async function hydrate(deck,zip){
  if(deck.assetMode!=='ref') return deck;   // 舊檔，位元組已內嵌
  const cache=new Map();
  for(const s of assetSlots(deck)){
    const name=s.o[s.k];
    if(!name||name.startsWith('data:')) continue;
    if(!cache.has(name)){
      const f=zip.file(ASSET_DIR+name);
      if(!f) throw new Error(_t('容器內缺少資產檔：{0}',ASSET_DIR+name));
      const ext=(name.split('.').pop()||'').toLowerCase();
      cache.set(name,'data:'+(EXT2MIME[ext]||'application/octet-stream')+';base64,'+await f.async('base64'));
    }
    s.o[s.k]=cache.get(name);
  }
  delete deck.assetMode;
  return deck;
}
/* deck.json 用 DEFLATE（文字壓得掉六七成）；資產用 STORE——PNG／JPEG 本來就是
   壓縮格式，再 deflate 是燒 CPU 換不到 1%。 */
async function deckToBlob(){
  const {deck,assets}=dehydrate(APP.deck);   // structuredClone 過，改它不動 APP.deck
  /* 產生器戳記。存檔路徑改過好幾輪（就地覆寫、另存退路、回讀驗證），日後拿到一個
     打不開的檔，這一行直接回答「哪一版寫的」，不必從行為反推。 */
  deck.generator='DeckJSON '+APP_VERSION;
  const zip=new JSZip();
  /* mimetype 必須是第一個 entry 且不壓縮——JSZip 依加入順序寫檔，所以這行要排在最前面。
     STORE 之下，內容就躺在 local file header 之後的固定位移，解壓前用 magic byte 就讀得到。 */
  zip.file('mimetype',DECK_MIME,{compression:'STORE'});
  zip.file('deck.json',JSON.stringify(deck,null,1),{compression:'DEFLATE'});
  for(const [name,bytes] of assets) zip.file(ASSET_DIR+name,bytes,{compression:'STORE'});
  return await zip.generateAsync({type:'blob',mimeType:DECK_MIME});
}
/* 開檔的唯一解析點：靠 magic byte 分流，不靠副檔名——.deck 與 .deck.json 兩種
   命名都發過，副檔名不可靠。 */
async function deckFromFile(f){
  const buf=await f.arrayBuffer(), head=new Uint8Array(buf,0,Math.min(4,buf.byteLength));
  if(!(head[0]===0x50&&head[1]===0x4b))           // 不是 PK＝舊的純 JSON
    return JSON.parse(new TextDecoder().decode(buf));
  const zip=await JSZip.loadAsync(buf);
  /* 別家的 .deck 要當場講清楚，不能讓它一路走到「缺 pages」——那句話會讓人以為自己的檔壞了，
     實際上是拿錯工具開對的檔。共用這個副檔名的另兩套格式見 README〈檔案格式〉。 */
  const mt=zip.file('mimetype');
  if(mt){
    const s=(await mt.async('string')).trim();
    if(s&&s!==DECK_MIME) throw new Error(
      _t('這是「{0}」格式的 .deck，不是 DeckJSON 的。\n'
      +'副檔名相同但內容規格不同，請用產生它的工具開啟。',s));
  }
  const dj=zip.file('deck.json');
  if(!dj) throw new Error(zip.file('manifest.json')
    ? _t('這個 .deck 的 manifest 叫 manifest.json，不是 DeckJSON 的格式（DeckJSON 讀 deck.json）。')
    : _t('這是一個 zip，但不是 DeckJSON 容器（缺 deck.json）'));
  const obj=JSON.parse(await dj.async('string'));
  /* OpenDeck 的 manifest 也叫 deck.json，但它只有 entry 指向一份 index.html，沒有 pages。
     不擋的話會落到 normalizeDeck 的「缺 pages」，訊息對不上真正的原因。 */
  if(!Array.isArray(obj.pages)&&typeof obj.entry==='string') throw new Error(
    _t('這是 OpenDeck 格式的 .deck（manifest 只有 entry，指向 {0}）。\n'
    +'DeckJSON 讀的是 pages 陣列，兩者不相容。',obj.entry));
  return await hydrate(obj,zip);
}
function deckJson(){ return JSON.stringify(APP.deck,null,1); }
/* ---- JSON 顯示層圖片佔位：base64 太長會塞爆協作視窗 ----
   顯示時 dataUrl 換成 "@asset:<雜湊> (大小)"；套用時從現有簡報按雜湊還原位元組。
   存 .json 檔仍寫完整 base64（檔案自足可攜）。

   佔位的鍵是**位元組的內容雜湊**（與容器裡 assets/<雜湊>.<副檔名> 同一個名字），不是元素 id。
   不同頁可以有同 id 的元素（Morph 配對、複製範例頁都會產生），按 id 還原會拿到別頁的圖：
   2026-09-25 實測兩頁同 id 各放一張圖，取出第一頁再原樣寫回，第一頁的圖就被換成第二頁的，
   沒有任何錯誤。按內容定址就沒有這個問題，也讓「重用簡報裡已有的圖」只要寫佔位、不必搬位元組。
   舊的 @asset:<元素id> 佔位照樣還原，但只在那個 id 全簡報只對應一張圖時；對應多張就擋下。 */
const kb=s=>Math.round(s.length*3/4/1024)+'KB';
let ASSET_KEYS=new Map();   // dataUrl → 雜湊。同一份位元組只解一次 base64；assetIndex() 重建時順手清掉已不在簡報裡的
function assetKey(u){
  let k=ASSET_KEYS.get(u);
  if(!k){
    const i=u.indexOf(','), head=u.slice(0,i);
    // 非 base64 的 data URL（例：data:image/svg+xml;utf8,…）不能 atob，改雜湊文字本身
    k=assetHash(/;base64$/i.test(head)? dataUrlDecode(u).bytes : new TextEncoder().encode(u));
    ASSET_KEYS.set(u,k);
  }
  return k;
}
const maskable=v=>typeof v==='string'&&v.startsWith('data:')&&v.length>80;
const assetPlaceholder=v=>'@asset:'+assetKey(v)+' ('+kb(v)+')';
function maskedJson(root){
  const o=structuredClone(root);
  const walk=els=>(els||[]).forEach(el=>{
    if(el&&el.type==='image'&&maskable(el.dataUrl)) el.dataUrl=assetPlaceholder(el.dataUrl);
    if(el&&el.type==='video'&&maskable(el.cover)) el.cover=assetPlaceholder(el.cover);   // 影片封面圖同樣遮罩（影片本體從來就不在 JSON 裡）
  });
  // 頁面背景圖同樣遮罩，否則單一頁面 JSON 就被 base64 塞爆
  const maskPg=p=>{ if(maskable(p.bgImage)) p.bgImage=assetPlaceholder(p.bgImage); walk(p.elements); };
  if(o.pages){ o.pages.forEach(maskPg); if(o.master) walk(o.master.elements); }
  else if(o.id||o.elements) maskPg(o); else walk(o.elements||(Array.isArray(o)?o:[]));
  // 地圖 GeoJSON 動輒數十 KB，比照圖片遮罩，否則整份 JSON 一開就被幾何座標塞爆
  if(o.maps) for(const k in o.maps){
    const g=o.maps[k];
    if(g&&typeof g==='object') o.maps[k]='@map:'+k+' ('+Math.round(JSON.stringify(g).length/1024)+'KB)';
  }
  return JSON.stringify(o,null,1);
}
/* 目前簡報的所有資產：byKey 是 雜湊 → {url, natW, natH, uses:[{page, id}|{page, field}]}；
   byId 是舊佔位用的 元素／頁 id → 它帶過的 dataUrl 集合 */
function assetIndex(){
  const byKey=new Map(), byId=new Map(), fresh=new Map();
  const add=(url,use,holder,el)=>{
    if(typeof url!=='string'||!url.startsWith('data:')) return;
    const k=assetKey(url); fresh.set(url,k);
    let a=byKey.get(k);
    if(!a) byKey.set(k,a={url,natW:0,natH:0,uses:[]});
    if(el&&el.type==='image'&&el.natW>0&&el.natH>0&&!a.natW){ a.natW=el.natW; a.natH=el.natH; }
    a.uses.push(use);
    if(!byId.has(holder)) byId.set(holder,new Set());
    byId.get(holder).add(url);
  };
  const els=(list,page)=>{ for(const el of list||[]){
    if(el.type==='image') add(el.dataUrl,{page,id:el.id},el.id,el);
    if(el.type==='video') add(el.cover,{page,id:el.id,field:'cover'},el.id);
  } };
  els(APP.deck.master&&APP.deck.master.elements,'master');
  for(const p of APP.deck.pages){ add(p.bgImage,{page:p.id,field:'bgImage'},p.id); els(p.elements,p.id); }
  ASSET_KEYS=fresh;
  return {byKey,byId};
}
function resolveAssets(obj){
  let idx=null;
  const back=(v,what)=>{
    idx=idx||assetIndex();
    const key=v.slice(7).split(' ')[0].trim();
    const a=idx.byKey.get(key);
    if(a) return a;
    const urls=idx.byId.get(key);
    if(urls&&urls.size===1) return {url:[...urls][0]};
    if(urls) throw new Error(_t('{0}佔位 @asset:{1} 是舊式的元素 id 佔位，而這個 id 在不同頁對應到 {2} 張不同的圖，無法判斷是哪一張。請重新取一次 JSON（新的佔位按圖片內容標記）',what,key,urls.size));
    throw new Error(_t('{0}佔位 @asset:{1} 在目前簡報找不到來源位元組',what,key));
  };
  const walk=els=>(els||[]).forEach(el=>{
    if(el&&el.type==='image'&&typeof el.dataUrl==='string'&&el.dataUrl.startsWith('@asset:')){
      const a=back(el.dataUrl,_t('圖片')); el.dataUrl=a.url;
      // 重用已有的圖時可以不寫原始尺寸：從簡報裡用同一張圖的元素抄過來
      if(!(el.natW>0&&el.natH>0)&&a.natW){ el.natW=a.natW; el.natH=a.natH; }
    }
    if(el&&el.type==='video'&&typeof el.cover==='string'&&el.cover.startsWith('@asset:'))
      el.cover=back(el.cover,_t('影片封面')).url;
  });
  const pg=p=>{ if(typeof p.bgImage==='string'&&p.bgImage.startsWith('@asset:')) p.bgImage=back(p.bgImage,_t('背景圖')).url; walk(p.elements); };
  if(obj&&obj.pages){ obj.pages.forEach(pg); if(obj.master) walk(obj.master.elements); }
  else if(obj&&(obj.id||obj.elements)) pg(obj);
  else if(obj) walk(Array.isArray(obj)?obj:[]);
  // @map: 佔位還原（來源是目前簡報的 deck.maps，與圖片的 @asset: 同一套機制）
  if(obj&&obj.maps) for(const k in obj.maps){
    const v=obj.maps[k];
    if(typeof v!=='string'||!v.startsWith('@map:')) continue;
    const cur=(APP.deck.maps||{})[k];
    if(!cur) throw new Error(_t('地圖佔位 @map:{0} 在目前簡報找不到幾何資料',k));
    obj.maps[k]=structuredClone(cur);
  }
  return obj;
}
function loadDeck(obj){
  const c=resolveAssets(structuredClone(obj));
  const d=normalizeDeck(c);
  commitUndo();
  APP.edit=null; APP.editing=null;   // 換一份簡報：舊的編輯狀態指向已不存在的元素，必須先收掉
  APP.masterEdit=false; document.body.classList.remove('masterEdit');   // 新簡報的母版是別份，不能停在編輯狀態
  APP.deck=d; APP.page=d.pages[0].id; setSel([]);
  renderAll(); syncPageJson();
  reportChartIssues();
}
