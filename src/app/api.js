'use strict';
/* ================= 腳本介面 window.DJ =================
   給外部腳本（瀏覽器自動化、測試、AI 代理）驅動 DeckJSON 的**唯一穩定入口**。
   內部函式名會隨重構改變，外部一律只呼叫這裡；改內部時由這一層吸收差異。
   用法與每個動詞的說明見 docs/scripting-api.md（對外文件）。

   這層存在的理由不只是「名字穩定」，更是把外部呼叫內部函式時踩過的坑收進程式碼：
   - applyPageJson() 寫的是「畫面上目前那一頁」，不是 JSON 裡 id 指的那一頁——外部照 id 呼叫，
     曾經整頁蓋掉另一頁（2026-09-17 實際發生，一頁 28 個元素全失）。這裡一律用 id 定位，不看游標。
   - 量文字需求高度的正確量法不直觀（見 textFitSize）。這裡直接給 measure／fit／overflow。
   - 讀狀態時把整頁 JSON 倒出來很貴。這裡預設回摘要（outline），要全貌才用 get。

   約定：
   - 用 id 指定頁與元素；'master' 指母版。**除了 show()，沒有動詞會改變使用者正在看的頁**
   - 寫入先在副本上做完、過 normalizeDeck，成功才換上並 commitUndo（使用者按 Cmd/Ctrl+Z 可撤銷）；
     任何一步出錯就拋例外，簡報原封不動，不會留下半套
   - 會重繪的動詞是 async，等排版穩定才回傳
   - 寫入類動詞的回傳值帶 warnings：這次傳進來的 JSON 裡不認得的欄位（見 model/schema.js）。
     只警告、照樣寫入——寫錯欄位名在畫面上只是「沒效果」，不回報的話呼叫端無從得知
   - version 只在不相容的改動時 +1；新增動詞不算 */
const DJ_VERSION=1;

function djErr(msg){ return new Error('DJ: '+msg); }
function djPage(deck,pid){
  const p=deck.pages.find(p=>p.id===pid);
  if(!p) throw djErr(`no page "${pid}"`+(pid===undefined? ' (pageId is required)' : ''));
  return p;
}
function djEls(deck,pid){
  if(pid==='master'){
    if(!deck.master) deck.master={on:false,flatten:false,elements:[]};
    return deck.master.elements||(deck.master.elements=[]);
  }
  return djPage(deck,pid).elements;
}
/* 元素一律「頁 ＋ id」定位：跨頁同 id 是合法的，而且正是 Morph 的配對依據，只給 id 會找錯頁 */
function djEl(deck,pid,id){
  const el=djEls(deck,pid).find(e=>e.id===id);
  if(!el) throw djErr(`no element "${id}" on page "${pid}"`);
  return el;
}
/* 讀入一份簡報：Blob／File／ArrayBuffer（.deck 容器或純 JSON）、JSON 字串或物件 → 物件（資產已還原） */
async function djReadDeck(src){
  if(src instanceof Blob) return await deckFromFile(src);
  if(src instanceof ArrayBuffer) return await deckFromFile(new Blob([src]));
  if(typeof src==='string') return JSON.parse(src);
  if(src&&typeof src==='object') return structuredClone(src);
  throw djErr('expected a Blob, File, ArrayBuffer, JSON string or deck object');
}
/* 換文字、留樣式：md 以換行分段，第 k 段沿用原本第 k 段（超出的沿用最後一段）的段落設定
   與第一個 run 的字元樣式。直接 set:{paras:[{md}]} 會把字級、顏色、粗細一起換成預設
   ——從模板套字時實際踩到：44pt 紫色標題變成 18pt 黑字。 */
const DJ_PARA_KEEP=['align','bullet','spaceBefore','spaceAfter'];
function djRestyle(old,md){
  const ps=Array.isArray(old)&&old.length? old : [{}];
  return String(md).split('\n').map((line,k)=>{
    const op=ps[Math.min(k,ps.length-1)]||{}, base=Object.assign({},(op.runs||[])[0]||{});
    delete base.text; delete base.link;   // 連結屬於那幾個字，不該跟著換掉的文字走
    const p={};
    for(const key of DJ_PARA_KEEP) if(op[key]!=null) p[key]=structuredClone(op[key]);
    p.runs=[Object.assign(base,{text:''})]; p.md=line;
    return p;
  });
}
const DJ_CHANGE_KEYS=['id','set','unset','remove','md'];
function djIds(ids){ return ids==null? null : (Array.isArray(ids)? ids : [ids]); }
/* 等排版穩定。刻意不用 requestAnimationFrame：分頁或面板不在前景時 rAF 會暫停（規格行為），
   外部腳本等不到回呼就整個卡住（2026-09-17 實際遇過：瀏覽器面板不在前景時，等 rAF 的呼叫一直沒有回來）。字體載完才量得準，所以也等 fonts.ready（上限 1.5 秒）。 */
async function djSettle(){
  try{ await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]); }catch(e){}
  await new Promise(r=>setTimeout(r,0));
}
/* 換上新的 deck。保留使用者目前的頁（還在的話）與選取，只收掉進行中的文字編輯——
   它指向的 DOM 在重繪後已不存在。 */
function djCommit(d,undoSnap){
  commitUndo(undoSnap);
  APP.edit=null; APP.editing=null;
  APP.deck=d;
  if(!d.pages.some(p=>p.id===APP.page)) APP.page=d.pages[0].id;
  setSel(APP.selIds);
  renderAll(); syncPageJson(); reportChartIssues();
}
function djOver(el){
  if(el.type!=='text'||el.hidden) return false;
  const f=textFitSize(el);
  return VERT_MODES[el.vert]? f.w>el.w+2 : f.h>el.h+2;   // 容差同 markOverflow
}
function djOverIds(pid){ return djEls(APP.deck,pid).filter(djOver).map(el=>el.id); }
const DJ_PAGE_KEYS=['name','bg','bgImage','notes','section','skip','transition','noMaster'];

const DJ=Object.freeze({
  version:DJ_VERSION,

  /* ---------- 讀：回摘要，不回整份 ---------- */
  info(){
    return {version:DJ_VERSION, app:APP_VERSION, title:APP.deck.title, pages:APP.deck.pages.length,
      page:APP.page, stage:{w:APP.deck.stage.w,h:APP.deck.stage.h}, master:masterOn(),
      file:APP.file? APP.file.name : null, dirty:!!APP.dirty};
  },
  list(){
    return APP.deck.pages.map((p,i)=>{
      const o={n:i+1,id:p.id,name:p.name||'',els:p.elements.length};
      if(p.section) o.section=p.section;
      if(p.skip) o.skip=true;
      if(p.id===APP.page) o.current=true;
      return o;
    });
  },
  outline(pid){
    return djEls(APP.deck,pid).map(el=>{
      const o={id:el.id,type:el.type,x:Math.round(el.x),y:Math.round(el.y)};
      if(el.type==='table'){ o.w=el.colW.reduce((a,b)=>a+b,0); o.h=el.rowH.reduce((a,b)=>a+b,0);
        o.grid=el.rowH.length+'x'+el.colW.length; }
      else{ o.w=Math.round(el.w); o.h=Math.round(el.h); }
      if(el.type==='shape') o.shape=el.shape;
      if(el.paras){ const t=plainText(el).replace(/\s+/g,' ').trim(); if(t) o.text=t.length>40? t.slice(0,40)+'…' : t; }
      if(el.hidden) o.hidden=true;
      if(el.locked) o.locked=true;
      if(el.groupId) o.group=el.groupId;
      if(djOver(el)) o.overflow=true;
      return o;
    });
  },
  /* 完整 JSON（圖片以 @asset: 佔位、地圖以 @map: 佔位）。給 elId 只回那個元素 */
  get(pid,elId){
    const els=djEls(APP.deck,pid);
    if(elId!=null){
      const el=djEl(APP.deck,pid,elId);
      return JSON.parse(maskedJson({elements:[el]})).elements[0];
    }
    return JSON.parse(maskedJson(pid==='master'? {elements:els} : djPage(APP.deck,pid)));
  },
  /* 簡報裡的圖片資產（圖片、背景圖、影片封面），按內容去重。asset 就是 get() 裡的佔位；
     要重用某張圖，元素寫 dataUrl: asset 即可，natW／natH 可省（從用同一張圖的元素抄） */
  assets(){
    return [...assetIndex().byKey].map(([k,a])=>{
      const o={asset:'@asset:'+k, type:(a.url.match(/^data:([^;,]+)/)||[])[1]||'', kb:Math.round(a.url.length*3/4/1024)};
      if(a.natW){ o.natW=a.natW; o.natH=a.natH; }
      o.usedBy=a.uses;
      return o;
    });
  },

  /* ---------- 寫：用 id 定位，先驗證再換上 ---------- */
  /* changes：[{id, set:{…}, unset:[鍵], remove:true, md:'新文字'}]。set 是淺層合併（改 paras 就整個換掉、
     樣式一起換掉）；只想換字就用 md，每段沿用原本的樣式（見 djRestyle）。
     id 等於頁 id 時改的是頁面屬性（name／notes／skip…），不能 remove。回傳本頁溢出清單 */
  async patch(pid,changes){
    const s=snapshot(), t=structuredClone(APP.deck), els=djEls(t,pid);
    const pg=pid==='master'? null : djPage(t,pid);
    let n=0; const warnings=[];
    for(const c of (Array.isArray(changes)? changes : [changes])){
      if(!c||typeof c!=='object'||!c.id) throw djErr('each change needs an id');
      for(const k of Object.keys(c)) if(!DJ_CHANGE_KEYS.includes(k))
        throw djErr(`unknown key "${k}" in a change (allowed: ${DJ_CHANGE_KEYS.join(', ')}); element fields go inside set`);
      if(pg&&c.id===pg.id){
        if(c.remove) throw djErr('use removePage() to delete a page');
        for(const k of Object.keys(c.set||{}).concat(c.unset||[]))
          if(!DJ_PAGE_KEYS.includes(k)) throw djErr(`page field "${k}" cannot be patched (allowed: ${DJ_PAGE_KEYS.join(', ')})`);
        Object.assign(pg,c.set||{}); for(const k of c.unset||[]) delete pg[k];
        n++; continue;
      }
      const i=els.findIndex(e=>e.id===c.id);
      if(i<0) throw djErr(`no element "${c.id}" on page "${pid}"`);
      if(c.remove){ els.splice(i,1); n++; continue; }
      if(c.md!=null){
        if(!(els[i].type==='text'||(els[i].type==='shape'&&!LINE_KINDS[els[i].shape])))
          throw djErr(`"${c.id}" is a ${els[i].type}; md only replaces the text of a text box or shape`);
        if(c.set&&'paras' in c.set) throw djErr('give either md or set.paras, not both');
        els[i].paras=djRestyle(els[i].paras,c.md);
      }
      if(c.set&&('id' in c.set||'type' in c.set)) throw djErr('id and type cannot be changed; remove and add instead');
      if(c.set) warnings.push(...schemaCheck(Object.assign({type:els[i].type},c.set),'element',c.id));
      Object.assign(els[i],c.set||{}); for(const k of c.unset||[]) delete els[i][k];
      n++;
    }
    const d=normalizeDeck(resolveAssets(t));
    djCommit(d,s); await djSettle();
    return {page:pid,changed:n,overflow:djOverIds(pid),warnings};
  },
  /* 加元素到該頁最上層。沒給 id 或與本頁（含母版）撞號的自動配，回傳實際的 id（順序同輸入）。
     與**別頁**同 id 是刻意允許的：那是 Morph 配對的方式 */
  async add(pid,elements){
    const s=snapshot(), t=structuredClone(APP.deck), els=djEls(t,pid);
    const list=(Array.isArray(elements)? elements : [elements]).map(e=>structuredClone(e));
    const warnings=schemaCheck(list,'elements','added');
    const taken=new Set(els.map(e=>e.id));
    for(const e of (t.master&&t.master.elements)||[]) taken.add(e.id);
    for(const e of list){
      if(!e||typeof e!=='object'||!e.type) throw djErr('each element needs a type');
      if(!e.id||taken.has(e.id)) e.id=uid('e');
      taken.add(e.id); els.push(e);
    }
    const d=normalizeDeck(resolveAssets(t));
    djCommit(d,s); await djSettle();
    return {page:pid,ids:list.map(e=>e.id),overflow:djOverIds(pid),warnings};
  },
  /* 整頁替換（elements 與列出的頁面屬性）。沒列出的頁面屬性沿用原頁，頁 id 不變 */
  async replacePage(pid,json){
    if(Array.isArray(json)) json={elements:json};
    if(!json||!Array.isArray(json.elements)) throw djErr('page JSON needs an elements array');
    const warnings=schemaCheck(json,'page',pid);
    const s=snapshot(), t=structuredClone(APP.deck), i=t.pages.indexOf(djPage(t,pid));
    const next={id:pid,elements:structuredClone(json.elements)};
    for(const k of DJ_PAGE_KEYS) next[k]=(k in json)? structuredClone(json[k]) : t.pages[i][k];
    t.pages[i]=next;
    const d=normalizeDeck(resolveAssets(t));
    djCommit(d,s); await djSettle();
    return {page:pid,overflow:djOverIds(pid),warnings};
  },
  /* 新增一頁，插在 after 那頁之後（省略＝最後）。回傳新頁 id */
  async addPage(json,after){
    const warnings=schemaCheck(json||{},'page','new page');
    const s=snapshot(), t=structuredClone(APP.deck);
    const pg=Object.assign(newPage(),structuredClone(json||{}));
    if(!Array.isArray(pg.elements)) pg.elements=[];
    if(t.pages.some(p=>p.id===pg.id)) pg.id=uid('p');
    const at=after==null? t.pages.length : t.pages.indexOf(djPage(t,after))+1;
    t.pages.splice(at,0,pg);
    const d=normalizeDeck(resolveAssets(t));
    djCommit(d,s); await djSettle();
    return {page:pg.id,n:at+1,overflow:djOverIds(pg.id),warnings};
  },
  async removePage(pid){
    const s=snapshot(), t=structuredClone(APP.deck), i=t.pages.indexOf(djPage(t,pid));
    if(t.pages.length===1) throw djErr('cannot remove the only page');
    t.pages.splice(i,1);
    djCommit(normalizeDeck(t),s); await djSettle();
    return {removed:pid,pages:t.pages.length};
  },

  /* ---------- 版面 ---------- */
  /* 文字框剛好裝下內容需要的尺寸（不改任何東西）。橫書看 h，直書看 w */
  measure(pid,elId){
    const el=djEl(APP.deck,pid,elId);
    if(el.type!=='text') throw djErr(`"${elId}" is a ${el.type}; only text boxes can be measured`);
    const f=textFitSize(el);
    return {id:elId,w:el.w,h:el.h,needW:f.w,needH:f.h};
  },
  /* 把文字框縮放到剛好裝下內容（同畫布上的「貼合內容」）。橫書固定上緣、直書固定左緣。
     ids 必填：整頁一起貼合會把刻意留高的卡片也收掉 */
  async fit(pid,ids){
    ids=djIds(ids); if(!ids||!ids.length) throw djErr('fit() needs element ids');
    const s=snapshot(), t=structuredClone(APP.deck), els=djEls(t,pid), out=[];
    for(const id of ids){
      const el=djEl(t,pid,id);
      if(el.type!=='text') throw djErr(`"${id}" is a ${el.type}; only text boxes can be fitted`);
      const r=fitTextBox(el); if(r) out.push({id,...r});
    }
    if(out.length){ djCommit(t,s); await djSettle(); }
    return {page:pid,fitted:out,overflow:djOverIds(pid)};
  },
  /* 溢出的文字框。給 pid 回該頁的 id 陣列；省略則掃整份，只列有溢出的頁 */
  overflow(pid){
    if(pid!=null) return djOverIds(pid);
    const out={};
    for(const p of APP.deck.pages){ const ids=djOverIds(p.id); if(ids.length) out[p.id]=ids; }
    return out;
  },

  /* 掃既有內容裡不認得的欄位（寫入類動詞只檢查這次傳進來的東西）。給 pid 只掃那一頁，省略掃整份 */
  lint(pid){
    if(pid==='master') return schemaCheck(djEls(APP.deck,'master'),'elements','master');
    if(pid!=null) return schemaCheck(djPage(APP.deck,pid),'page',pid);
    return schemaCheck(APP.deck,'deck');
  },

  /* ---------- 進出 ---------- */
  /* 載入：Blob／File／ArrayBuffer（.deck 容器或純 JSON）、JSON 字串或物件。
     會清掉「目前開啟的檔案」：否則之後按 Cmd/Ctrl+S 會把這份寫進原本那個檔 */
  async load(src){
    const obj=await djReadDeck(src);
    const warnings=schemaCheck(obj,'deck');
    loadDeck(obj); setDeckFile(null);
    await djSettle();
    return {pages:APP.deck.pages.length,page:APP.page,warnings};
  },
  /* 從模板開新簡報：沿用模板的整份設定（尺寸、預留區、字體、樣式模式、母版、頁碼日期…），只篩頁面。
     pages：'shown'（預設）＝只留會放映的頁——模板的規格頁、說明頁、元件頁慣例上設為不放映，正好濾掉；
     'all'＝全留；或頁 id／頁名的陣列（依陣列順序）。標題不沿用模板的，除非給 title。
     同 load：一步可復原，並清掉目前開啟的檔案，免得存檔寫回模板本身 */
  async fromTemplate(src,opt){
    const o=opt||{}, obj=await djReadDeck(src);
    const pages=Array.isArray(obj.pages)? obj.pages : [];
    const want=o.pages==null? 'shown' : o.pages;
    let keep;
    if(want==='all') keep=pages.slice();
    else if(want==='shown') keep=pages.filter(p=>!p.skip);
    else if(Array.isArray(want)){
      keep=want.map(ref=>{ const p=pages.find(p=>p.id===ref)||pages.find(p=>p.name===ref);
        if(!p) throw djErr(`template has no page "${ref}" (pages: ${pages.map(p=>p.name||p.id).join(', ')})`); return p; });
      if(new Set(keep).size!==keep.length) throw djErr('the same template page is listed twice; copy it later with addPage(get(id))');
    }
    else throw djErr("pages must be 'shown', 'all', or an array of page ids/names");
    const dropped=pages.filter(p=>!keep.includes(p)).map(p=>({id:p.id,name:p.name||''}));
    const d=Object.assign({},obj,{pages:keep.length? keep : [newPage()]});
    if(o.title!=null&&String(o.title).trim()) d.title=String(o.title).trim(); else delete d.title;
    const warnings=schemaCheck(d,'deck');
    loadDeck(d); setDeckFile(null);
    await djSettle();
    return {pages:DJ.list().map(({n,id,name})=>({n,id,name})),dropped,warnings};
  },
  toBlob(){ return deckToBlob(); },
  async snapshot(pid,opt){
    const o=opt||{}, fmt=o.format==='jpeg'? 'jpeg' : 'png';
    const url=await snapshotDataUrl(djPage(APP.deck,pid),fmt,o.scale||1);
    return await (await fetch(url)).blob();
  },
  async exportPptx(){
    await exportPptx(false);
    return await (await fetch('data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,'
      +window.__lastPptxB64)).blob();
  },
  /* 唯一會改變使用者畫面的動詞：切到那一頁給人看 */
  show(pid){ djPage(APP.deck,pid); setPage(pid); return {page:pid}; },
});
window.DJ=DJ;
