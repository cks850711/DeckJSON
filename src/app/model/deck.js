'use strict';
/* ================= 簡報模型 ================= */
function newPage(){ return {id:uid('p'),name:'',bg:'FFFFFF',transition:null,elements:[]}; }
/* 章節標題去重：PptxGenJS 用標題字串比對 section，同名的第二個章節收不到任何投影片
   （全部併進第一個）。所以「同名」在這裡不是美觀問題，是會實際錯位的。 */
function uniqTitle(t,seen){ let o=t, n=2; while(seen.has(o)) o=t+' ('+(n++)+')'; seen.add(o); return o; }
// 有人從第 N 頁才開始分章時，前面幾頁要有個歸屬，否則 PptxGenJS 會自動塞進英文的 "Default-1"
function secLead(d){ return uniqTitle((d.title||'').trim()||_t('開頭'), new Set(d.pages.map(p=>p.section).filter(Boolean))); }
function newDeck(){
  const p=startupProfile();
  return {format:'deckjson',version:1,title:_t('未命名簡報'),fontMode:'locked',
    profileName:p.name,stage:{...p.stage},zones:structuredClone(p.zones),
    fonts:{...p.fonts},lang:p.lang,
    ...(p.pageNum?{pageNum:structuredClone(p.pageNum)}:{}),
    ...(p.date?{date:structuredClone(p.date)}:{}),
    ...(p.docProps||{}),
    pages:[newPage()]};
}
// run 級選配樣式（底線／刪除線／高亮／字距／字型／描邊／輝光／超連結）與段落級選配樣式（項目符號／段距）：
// 有值才寫進 JSON，維持既有簡報的 JSON 不變胖；純文字編輯（textarea）時由 baseRun→mkParas 原樣帶過去
/* 直書／縱向文字：el.vert → <a:bodyPr vert="…">。
   PptxGenJS 對這個值不做任何檢查（原樣寫進屬性），塞錯字串就是一份 PowerPoint 打不開的檔，
   所以白名單由這裡把關。畫布用 CSS writing-mode 對上預覽：
   vert270 沒有跨瀏覽器可用的 writing-mode（sideways-lr 僅 Firefox），改用「vertical-rl ＋ 整塊轉 180°」等效模擬。 */
const VERT_MODES={
  // mixed＝東亞字直立、拉丁字旋轉躺下，正是 PowerPoint eaVert 的行為（upright 會把 ABC 也一個個立起來，不對）
  eaVert:       {label:_t('直書（中日韓）'),   css:{writingMode:'vertical-rl',textOrientation:'mixed'}},
  vert:         {label:_t('旋轉 90°（順時針）'),css:{writingMode:'vertical-rl',textOrientation:'sideways'}},
  vert270:      {label:_t('旋轉 270°（逆時針）'),css:{writingMode:'vertical-rl',textOrientation:'sideways',transform:'rotate(180deg)'}},
  mongolianVert:{label:_t('蒙文直書'),        css:{writingMode:'vertical-lr',textOrientation:'mixed'}},
};
const RUN_OPT_KEYS=['underline','strike','highlight','charSpacing','fontFace','link','glow','outline','sup','sub'];
const PARA_OPT_KEYS=['bullet','spaceBefore','spaceAfter'];
function mkParas(str,style){ // 純文字 → 段落結構
  const S=style||{};
  return String(str).split('\n').map(t=>{
    const p={align:S.align||'left',
      runs:[{text:t,bold:!!S.bold,italic:!!S.italic,color:S.color||'1A1A1A',sizePt:S.sizePt||18}]};
    for(const k of RUN_OPT_KEYS) if(S[k]!=null) p.runs[0][k]=structuredClone(S[k]);
    for(const k of PARA_OPT_KEYS) if(S[k]!=null) p[k]=structuredClone(S[k]);
    return p;
  });
}
function plainText(el){ return (el.paras||[]).map(p=>(p.runs||[]).map(r=>r.text).join('')).join('\n'); }
function baseRun(el){ // 元素第一個 run 的樣式（作為畫布純文字編輯後的統一樣式）
  const p0=(el.paras||[])[0]||{}, r=(p0.runs||[])[0]||{};
  const o={bold:!!r.bold,italic:!!r.italic,color:r.color||'1A1A1A',sizePt:r.sizePt||18,align:p0.align||'left'};
  for(const k of RUN_OPT_KEYS) if(r[k]!=null) o[k]=r[k];
  for(const k of PARA_OPT_KEYS) if(p0[k]!=null) o[k]=p0[k];
  return o;
}
/* ---- run 級編輯的資料工具 ----
   切開（splitAt）、範圍套用（applyRange）、相鄰同樣式合併（mergeRuns）。
   合併是必要的：不合併的話反白套個幾次格式，runs 就碎成一堆單字，JSON 難讀、AI 也難改。 */
function runStyle(r){   // run 的「樣式指紋」；鍵序固定，可直接 JSON 比對
  const o={bold:!!r.bold,italic:!!r.italic,color:r.color||'1A1A1A',sizePt:r.sizePt||18};
  for(const k of RUN_OPT_KEYS) if(r[k]!=null&&r[k]!==false) o[k]=structuredClone(r[k]);
  return o;
}
const sameStyle=(a,b)=>JSON.stringify(runStyle(a))===JSON.stringify(runStyle(b));
const paraLen=p=>(p.runs||[]).reduce((n,r)=>n+String(r.text||'').length,0);
function mergeRuns(p){   // 併相鄰同樣式、丟空 run（全空時保留一個空殼，段落才有樣式可繼承）
  const out=[];
  for(const r of p.runs||[]){
    if(!String(r.text||'').length) continue;
    const last=out[out.length-1];
    if(last&&sameStyle(last,r)) last.text+=String(r.text);
    else out.push({...r,text:String(r.text)});
  }
  // 全空段落保留一個空殼 run；走 runStyle 才會補上 color／sizePt 預設，否則後續渲染與匯出拿到 undefined
  if(!out.length) out.push({...runStyle((p.runs||[])[0]||{}),text:''});
  p.runs=out;
}
// 在 run 陣列的第 pos 個字元處切開，回傳「pos 起算的那個 run 的索引」（pos 落在邊界時不切）
function runsSplitAt(runs,pos){
  let acc=0;
  for(let i=0;i<runs.length;i++){
    const t=String(runs[i].text||'');
    if(pos<=acc) return i;
    if(pos<acc+t.length){
      const off=pos-acc;
      runs.splice(i,1,{...runs[i],text:t.slice(0,off)},{...runs[i],text:t.slice(off)});
      return i+1;
    }
    acc+=t.length;
  }
  return runs.length;
}
// 段落版（文字框用）。儲存格是單段模型，直接對 run 陣列呼叫 runsSplitAt
function splitAt(p,pos){ return runsSplitAt(p.runs||(p.runs=[]),pos); }
// 對選取範圍 {p0,o0,p1,o1} 內的每個 run 執行 fn(run,para)
function applyRange(el,sel,fn){
  for(let pi=sel.p0;pi<=sel.p1;pi++){
    const p=(el.paras||[])[pi]; if(!p) continue;
    const a= pi===sel.p0? sel.o0 : 0;
    const b= pi===sel.p1? sel.o1 : paraLen(p);
    if(b<=a){ if((p.runs||[])[0]) fn(p.runs[0],p); continue; }   // 空段落：套在空殼 run 上，段落級設定也才生效
    const i0=splitAt(p,a), i1=splitAt(p,b);
    for(let i=i0;i<i1;i++) fn(p.runs[i],p);
    mergeRuns(p);
  }
}
/* ---- markdown 輸入糖 ----
   段落可寫 "md":"這是**粗體**與==標記=="，套用時展開成 runs 並**刪掉 md 鍵**，存檔中不留 markdown。
   純粹是給 AI 與手寫 JSON 用的簡寫。run 的 text 欄位**永遠是字面文字、絕不解析**——
   否則內容本來就含 ** 的簡報（程式教材、數學、檔名）會被改壞。 */
const MD_HL='FFFF00';   // == 高亮沒有顏色參數，固定用這個色（要別的顏色請直接寫 runs）
const MD_RE=/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|==([^=\n]+)==|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
function mdToRuns(str,styleSrc){
  const base=runStyle(styleSrc||{}), ESC='';
  // 先把跳脫字元（\* \~ \= \[ …）換成私用區暫存，避免被當成標記
  const s=String(str).replace(/\\([*~=[\]()\\])/g,(m,c)=>ESC+c.charCodeAt(0).toString(16).padStart(4,'0')+ESC);
  const un=t=>t.replace(new RegExp(ESC+'([0-9a-f]{4})'+ESC,'g'),(m,h)=>String.fromCharCode(parseInt(h,16)));
  const runs=[], push=(t,x)=>{ const v=un(t); if(v) runs.push({...base,...(x||{}),text:v}); };
  let i=0,m; MD_RE.lastIndex=0;
  while((m=MD_RE.exec(s))){
    push(s.slice(i,m.index));
    if(m[1]!=null) push(m[1],{bold:true});
    else if(m[2]!=null) push(m[2],{italic:true});
    else if(m[3]!=null) push(m[3],{strike:true});
    else if(m[4]!=null) push(m[4],{highlight:MD_HL});
    else push(m[5], m[6][0]==='#'? {link:{slide:Math.max(1,Math.round(+m[6].slice(1))||1)}} : {link:{url:un(m[6])}});
    i=m.index+m[0].length;
  }
  push(s.slice(i));
  if(!runs.length) runs.push({...base,text:''});
  return runs;
}
// 項目符號：level 每層縮排 BULLET_INDENT pt（＝PPT 預設 0.25 吋），懸掛縮排讓第二行對齊文字而非符號
const BULLET_INDENT=18, BULLET_CHAR='2022';   // 2022＝•（OOXML buChar 用 4 位 unicode）
function bulletMark(p,seq){ // 回傳畫布上要顯示的符號字串（number 型帶流水號）
  const b=p&&p.bullet; if(!b) return '';
  if(b.type==='number') return (seq)+'.';
  return b.code? String.fromCodePoint(parseInt(b.code,16)) : '•';
}
function maxPt(el){
  let m=0;
  for(const p of el.paras||[]) for(const r of p.runs||[]) m=Math.max(m,r.sizePt||18);
  return m||18;
}
// 單一段落的最大字級。行距是逐段算的（見 parasToPptx），用 maxPt(el) 會讓整框跟著最大的字走
function paraPt(p){
  let m=0;
  for(const r of (p&&p.runs)||[]) m=Math.max(m,r.sizePt||18);
  return m||18;
}
/* 線型（形狀外框／線條／文字框框線）：key＝OOXML <a:prstDash val>，PptxGenJS 的 line.dashType 直寫此值。
   dash＝畫布 SVG stroke-dasharray 的「線寬倍數」（隨線寬縮放，細線不會看起來像實線）；css＝文字框框線的近似。*/
const DASH_KINDS=[
  {key:'solid',     label:_t('實線'),  dash:null,          css:'solid'},
  {key:'sysDot',    label:_t('點線'),  dash:[1,2],         css:'dotted'},
  {key:'dash',      label:_t('虛線'),  dash:[4,3],         css:'dashed'},
  {key:'lgDash',    label:_t('長虛線'),dash:[8,3],         css:'dashed'},
  {key:'dashDot',   label:_t('點虛線'),dash:[4,3,1,3],     css:'dashed'},
  {key:'lgDashDot', label:_t('長點虛'),dash:[8,3,1,3],     css:'dashed'},
];
const dashKind=el=>DASH_KINDS.find(d=>d.key===(el&&el.dash))||DASH_KINDS[0];
function dashArray(el,sw){ const d=dashKind(el).dash;
  return d? d.map(n=>Math.max(1,+(n*sw).toFixed(2))).join(' ') : ''; }
const SAMPLE_CHART={grid:{left:44,right:16,top:30,bottom:30},
  xAxis:{type:'category',data:[_t('一月'),_t('二月'),_t('三月'),_t('四月')]},yAxis:{type:'value'},
  series:[{type:'bar',data:[52,88,64,120],itemStyle:{color:'#4D9DE0'}}]};

/* ---- 元素屬性的預設值與上限 ----
   資料模型的一部分：正規化（補預設、夾上限）、面板、畫布、匯出都讀同一份，所以放模型層。 */
// 頁面轉場（進入此頁時播放）。morph 走 mc:AlternateContent（p159 命名空間，PowerPoint 2019+/365），
// 舊版開啟時自動退回 fallback 的 fade；morph 跨頁配對靠「同名同型」shape——本工具 shape 名＝元素 JSON id，
// 複製頁刻意保留元素 id 即為此用（改位置/大小/adj 後兩頁同 id 元素會平滑補間）
const TRANSITIONS={
  morph:{label:_t('平滑（Morph）')},
  fade:{label:_t('淡出')},
  push:{label:_t('推入')},
  wipe:{label:_t('擦去')},
};
/* ---- 原生投影陰影（PPT 真實 <a:outerShdw>，非編輯器 CSS 效果）----
   PptxGenJS 3.12 對 inner 型的收尾標籤寫死成 </a:outerShdw>（產出不合法），故只開放 outer。
   畫布用 filter:drop-shadow 預覽（html2canvas 不支援 CSS filter，快照 PNG 不會有陰影，屬已知落差）。*/
const SHADOW_DEF={blur:8,offset:4,angle:270,color:'808080',opacity:0.5};
const GRAD_MAX=6;   // 色標數上限（PPT 沒有硬限制，這裡只是防手改 JSON 塞爆面板）
const CROP_MAX=3;      // 可見區最多放到原圖的 3 倍（再大就只是無盡留白）
