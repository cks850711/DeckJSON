'use strict';
/* ================= 欄位白名單 =================
   normalizeDeck 只管「認得的欄位合不合法」，不認得的一律原樣放行、存檔照留。這是刻意的：
   不丟使用者的資料，新舊版本也能互開。代價是**寫錯欄位名的人得不到任何回饋**——
   箭頭寫成 endArrow（正解是 shape:'arrow'）、把 valign 寫在 run 上，畫面上只是「沒效果」，
   要靠截圖才發現（2026-09-25 掃過幾份實際使用中的簡報，後者出現過 9 處）。
   這裡補上回饋：列出不認得的欄位，**只警告、不刪**。

   名單來源：normalizeDeck 與渲染／匯出實際讀取的欄位，加上**有記載但目前沒有程式讀的欄位**——
   例如 role（title／body／caption，範本庫會寫入，說明面板也告訴使用者它存在）。只看程式讀什麼會把
   這類欄位誤報成寫錯。再以驗收測試簿（見 tests/README.md）與 docs/user-manual.deck 掃過、不得誤報。
   新增資料欄位時要同步加在這裡，否則新欄位會被誤報為寫錯。誤報的護欄：用 tools/deck-lint.js 掃驗收測試簿
   與 docs/user-manual.deck，應為 0 條（2026-09-25 皆為 0）。

   命令列版是 tools/deck-lint.js：在 node 裡載入這個檔、呼叫同一個 schemaCheck()，
   其他語言的工具也轉呼叫它（例如 tests/README.md 所列的 check-deck.py），判定只有這一份，不會各寫一套而漂移。
   所以這個檔只能用到 JS 本身，不能引用 DOM 或其他檔的名稱。 */
const DECK_SCHEMA={
  "deck": ["format","version","title","fontMode","profileName","stage","zones","fonts","lang",
           "author","company","subject","pageNum","date","master","pages","maps","assetMode","generator"],
  "pageNum": ["pos","sizePt","color","skipFirst"],
  "date": ["pos","sizePt","color","skipFirst","fmt","text"],
  "master": ["on","flatten","elements"],
  "page": ["id","name","bg","bgImage","notes","section","skip","noMaster","transition","elements"],
  "transition": ["type","dur","option"],
  "element": {
    "common": ["id","type","x","y","w","h","rot","opacity","hidden","locked","groupId","alt","link","shadow","lineSpacing","role"],
    "text":  ["paras","text","sizePt","valign","inset","nowrap","vert","fill","grad","lineColor","linePt","dash"],
    "shape": ["shape","paras","valign","inset","nowrap","vert","fill","grad","lineColor","linePt","dash",
              "flipH","flipV","adjs","adj","adj2","dir","points","pathW","pathH"],
    "image": ["dataUrl","natW","natH","fit","round","crop","flipH","flipV"],
    "table": ["colW","rowH","cells","border"],
    "chart": ["option","native"],
    "video": ["mode","embed","cover","src"]
  },
  "tableNot": ["w","h","rot","link","shadow","alt"],
  "para": ["runs","md","align","bullet","spaceBefore","spaceAfter"],
  "run": ["text","bold","italic","underline","strike","sizePt","color","highlight","fontFace","charSpacing",
          "sub","sup","link","outline","glow"],
  "cell": ["text","runs","md","bold","italic","color","sizePt","fill","align","valign","lineSpacing",
           "colspan","rowspan","covered","border"],
  "bullet": ["type","level","startAt","code"],
  "elLink": ["url","slide","tooltip"],
  "runLink": ["url","slide"],
  "shadow": ["blur","offset","angle","color","opacity"],
  "grad": ["type","angle","stops"],
  "gradStop": ["pos","color"],
  "border": ["pt","color","dash"],
  "cellBorder": ["t","r","b","l"],
  "crop": ["l","t","r","b"],
  "outline": ["size","color"],
  "glow": ["size","color","opacity"],
  "videoSrc": ["name","durationSec","natW","natH"]
};

/* 各層的顯示名，用在警告訊息的「在哪一層才合法」提示 */
const SCHEMA_LEVEL_NAMES={deck:'the deck',page:'a page',para:'a paragraph',run:'a text run',cell:'a table cell',
  bullet:'bullet',transition:'transition'};
function schemaElKeys(type){
  const E=DECK_SCHEMA.element, own=E[type]||[];
  const common=type==='table'? E.common.filter(k=>!DECK_SCHEMA.tableNot.includes(k)) : E.common;
  return new Set(common.concat(own));
}
/* 把一個欄位名對到「它在哪些層才合法」：拿來回答「valign 寫在 run 上」這種放錯層的錯 */
function schemaWhereValid(key){
  const out=[];
  for(const lv of ['deck','page','para','run','cell']) if(DECK_SCHEMA[lv].includes(key)) out.push(SCHEMA_LEVEL_NAMES[lv]);
  const E=DECK_SCHEMA.element, types=Object.keys(E).filter(t=>t!=='common'&&(E[t].includes(key)||E.common.includes(key)));
  if(types.length) out.push(types.length===6? 'an element' : types.join('/')+' elements');
  return out;
}
function schemaNear(key,allowed){   // 拼錯的：編輯距離 ≤2 的最近合法名
  let best=null,bd=3;
  for(const k of allowed){
    const a=key.toLowerCase(), b=k.toLowerCase();
    if(a===b){ return k; }
    const dp=Array.from({length:a.length+1},(_,i)=>[i]);
    for(let j=1;j<=b.length;j++) dp[0][j]=j;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
      dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    const d=dp[a.length][b.length]; if(d<bd){ bd=d; best=k; }
  }
  return best;
}
/* 少數「猜得到意圖、但名字差很遠」的常見誤寫，直接給正解 */
const SCHEMA_HINTS={
  endArrow:"arrowheads are a line kind: use shape:'arrow' or 'doubleArrow' (or 'elbowArrow')",
  beginArrow:"arrowheads are a line kind: use shape:'doubleArrow'",
  startArrow:"arrowheads are a line kind: use shape:'doubleArrow'",
  fontSize:'use sizePt (points)', size:'use sizePt (points)', fontFamily:'use fontFace on a run',
  width:'use w', height:'use h', left:'use x', top:'use y', rotation:'use rot',
  src:'images carry their bytes in dataUrl (a data: URL)', url:'links go in link:{url}',
  bg:'use fill (bg is only for a page background)', background:'use fill', backgroundColor:'use fill',
};
/* 表格上寫了一般元素的欄位：多半是想設尺寸，直接講表格的尺寸從哪來 */
const SCHEMA_TABLE_HINTS={w:'a table is sized by colW (column widths)',h:'a table is sized by rowH (row heights)'};
/* 掃一個物件，回傳警告字串陣列。kind：'deck'｜'page'｜'element'｜'elements'。
   path 是訊息裡的位置前綴（例：'tx-1'）。只看欄位名，不驗值——值的合法性是 normalizeDeck 的事。 */
function schemaCheck(obj,kind,path){
  const out=[];
  const warn=(p,key,allowed,level)=>{
    let why= level==='table element'? (SCHEMA_TABLE_HINTS[key]||(DECK_SCHEMA.tableNot.includes(key)? 'not supported on tables' : null)) : null;
    why=why||SCHEMA_HINTS[key];
    if(!why){ const where=schemaWhereValid(key).filter(w=>w!==level);
      if(where.length) why='valid on '+where.join(', ')+', not on '+level; }
    if(!why){ const n=schemaNear(key,allowed); if(n) why='did you mean "'+n+'"?'; }
    out.push(p+'.'+key+': unknown field on '+level+(why? ' — '+why : ''));
  };
  const keys=(o,allowed,p,level)=>{ if(!o||typeof o!=='object'||Array.isArray(o)) return;
    const set=allowed instanceof Set? allowed : new Set(allowed);
    for(const k of Object.keys(o)) if(!set.has(k)) warn(p,k,[...set],level); };
  const S=DECK_SCHEMA;
  const run=(r,p,isCell)=>{ keys(r,S.run,p,'a text run');
    if(r&&typeof r==='object'){ if(r.link) keys(r.link,S.runLink,p+'.link','a run link');
      if(r.outline) keys(r.outline,S.outline,p+'.outline','outline'); if(r.glow) keys(r.glow,S.glow,p+'.glow','glow'); } };
  const para=(q,p)=>{ keys(q,S.para,p,'a paragraph'); if(!q||typeof q!=='object') return;
    if(q.bullet&&typeof q.bullet==='object') keys(q.bullet,S.bullet,p+'.bullet','bullet');
    (Array.isArray(q.runs)?q.runs:[]).forEach((r,i)=>run(r,p+'.runs['+i+']')); };
  const el=(e,p)=>{
    if(!e||typeof e!=='object') return;
    const lv=(e.type||'?')+' element';
    if(!DECK_SCHEMA.element[e.type]){ out.push(p+'.type: unknown element type "'+e.type+'" (text, shape, image, table, chart, video)'); return; }
    keys(e,schemaElKeys(e.type),p,lv);
    if(e.link&&typeof e.link==='object') keys(e.link,S.elLink,p+'.link','an element link');
    if(e.shadow&&typeof e.shadow==='object') keys(e.shadow,S.shadow,p+'.shadow','shadow');
    if(e.grad&&typeof e.grad==='object'){ keys(e.grad,S.grad,p+'.grad','gradient');
      (Array.isArray(e.grad.stops)?e.grad.stops:[]).forEach((s,i)=>keys(s,S.gradStop,p+'.grad.stops['+i+']','a gradient stop')); }
    if(e.crop&&typeof e.crop==='object') keys(e.crop,S.crop,p+'.crop','crop');
    if(e.type==='video'&&e.src&&typeof e.src==='object') keys(e.src,S.videoSrc,p+'.src','video src');
    if(e.type==='table'){
      if(e.border&&typeof e.border==='object') keys(e.border,S.border,p+'.border','a border');
      (Array.isArray(e.cells)?e.cells:[]).forEach((row,ri)=>(Array.isArray(row)?row:[]).forEach((c,ci)=>{
        const cp=p+'.cells['+ri+']['+ci+']'; keys(c,S.cell,cp,'a table cell'); if(!c||typeof c!=='object') return;
        if(c.border&&typeof c.border==='object'){ keys(c.border,S.cellBorder,cp+'.border','a cell border');
          for(const s of S.cellBorder) if(c.border[s]&&typeof c.border[s]==='object') keys(c.border[s],S.border,cp+'.border.'+s,'a border'); }
        (Array.isArray(c.runs)?c.runs:[]).forEach((r,i)=>run(r,cp+'.runs['+i+']',true)); }));
    }
    (Array.isArray(e.paras)?e.paras:[]).forEach((q,i)=>para(q,p+'.paras['+i+']'));
  };
  const elsOf=(list,p)=>(Array.isArray(list)?list:[]).forEach((e,i)=>el(e,e&&e.id? e.id : p+'['+i+']'));
  const page=(g,p)=>{ keys(g,S.page,p,'a page'); if(!g||typeof g!=='object') return;
    if(g.transition&&typeof g.transition==='object') keys(g.transition,S.transition,p+'.transition','transition');
    elsOf(g.elements,p+'.elements'); };
  if(kind==='element') el(obj,path);
  else if(kind==='elements') elsOf(obj,path);
  else if(kind==='page') page(obj,path);
  else if(kind==='deck'){
    keys(obj,S.deck,'deck','the deck'); if(!obj||typeof obj!=='object') return out;
    if(obj.pageNum&&typeof obj.pageNum==='object') keys(obj.pageNum,S.pageNum,'deck.pageNum','pageNum');
    if(obj.date&&typeof obj.date==='object') keys(obj.date,S.date,'deck.date','date');
    if(obj.master&&typeof obj.master==='object'){ keys(obj.master,S.master,'master','the master'); elsOf(obj.master.elements,'master.elements'); }
    (Array.isArray(obj.pages)?obj.pages:[]).forEach((g,i)=>page(g,g&&g.id? g.id : 'pages['+i+']'));
  }
  return out;
}
