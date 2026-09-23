'use strict';
/* ================= 格線（檢視輔助） =================
   製圖式三階層：一格虛線、每 sub 格細實線、每 major 格粗實線，原點固定在投影片左上角。
   刻意**不寫進 deck**：格線是「怎麼看」不是「簡報內容」，寫進去會污染貼給 AI 的 JSON，
   也會讓同一份簡報在別人電腦上被迫接受你的格線設定。改存 localStorage 長期記住。 */
const GRID_KEY='deckjson.grid';
const MM2PX=96/25.4;   // 內部長度一律 px（1px = 1/96 吋）
const GRID_DEF={on:false,snap:true,size:5*MM2PX,sub:5,major:10,color:'ADB5BD'};
function normGrid(g){   // 手改 localStorage 或跨版本殘值一律過這裡，壞值退回預設
  const d={...GRID_DEF};
  if(!g||typeof g!=='object') return d;
  const size=+g.size;
  return {on:!!g.on, snap:g.snap!==false,
    size:(isFinite(size)&&size>=1&&size<=800)? size : d.size,
    sub:Math.max(1,Math.min(50,Math.round(+g.sub)||d.sub)),
    major:Math.max(1,Math.min(200,Math.round(+g.major)||d.major)),
    color:/^[0-9A-Fa-f]{6}$/.test(String(g.color||''))? String(g.color).toUpperCase() : d.color};
}
function loadGrid(){ try{ return normGrid(JSON.parse(lsGet(GRID_KEY)||'null')); }catch(e){ return {...GRID_DEF}; } }
function saveGrid(){ lsSet(GRID_KEY,JSON.stringify(APP.grid)); }

/* 貼上外部表格時，來源「沒指定底色」或「指定純白」的格子要不要填白。
   **預設填白，而且這是修正而非偏好**：同一條貼上路徑會把純黑字色退回 `1A1A1A`（深色），
   底色卻留空——深色字配透明底，只要簡報背景不是淺色就整張看不見。兩種壞法不對等：
   白底貼到深色簡報是「醜但讀得到，選全表清掉底色即可」，透明是「內容消失，且要同時改底色與字色」。
   而且 PowerPoint 內建的表格樣式全都有填色，透明表格本來就是要特地去設的例外。

   一律套用所有來源，不分 converter／Excel／Word／網頁：DeckJSON 收到的只是 HTML，
   而 Excel 複製出來每一格也都寫著白色，字面上都是 `#FFFFFF`，**分不出誰寫的**。
   要分就得讓 converter 在 HTML 上留私有記號，那是兩個 app 之間的隱形耦合，不划算。

   同格線，存 localStorage 不寫進 deck：這是「怎麼貼」不是「簡報內容」。 */
const PASTEW_KEY='deckjson.pasteWhite';
function loadPasteWhite(){ return lsGet(PASTEW_KEY)!=='0'; }   // 未設過＝預設開
function savePasteWhite(){ lsSet(PASTEW_KEY,APP.pasteWhite?'1':'0'); }

/* ================= App 狀態 ================= */
const APP={deck:newDeck(),page:null,sel:null,selIds:[],zoom:.65,editing:null,painter:null,
  grid:loadGrid(),   // 格線與吸附設定（不屬於 deck，見上方說明）
  melMark:lsGet('deckjson.melmark')!=='0',   // 一般頁上是否給母版元素畫虛線（同格線，屬檢視設定）
  pasteWhite:loadPasteWhite(),   // 貼上外部表格：無底色格填白（同樣不屬於 deck）
  file:null,      // 就地覆寫的目標 {handle,name,stamp,stale}；null＝還沒有對應的硬碟檔案（見〈檔案存檔〉）
  dirty:false,    // 上次寫檔之後改過沒有（給 #fileHint 的 ● 用；與自動存檔無關）
  edit:null,      // 文字框 run 級編輯狀態 {id,root,src,sel:{p0,o0,p1,o1},pushed,snap}
  cellEdit:null,  // 格內 run 級編輯狀態 {id,r,c,root,src,sel:{o0,o1}}（單段模型，位移以整格計）
  cellSel:null,   // 表格儲存格反白範圍 {id,r0,c0,r1,c1}（規範化：含 min/max、外擴到整塊合併）
  tblPen:{pt:0.75,color:'999999',dash:false},   // 框線筆：線寬＋顏色＋實／虛線，供框線按鈕套用
  dimUnit:'px',                      // 座標尺寸面板單位：px｜pt｜cm（預設 px）
  gridUnit:'mm',                     // 格距輸入框的顯示單位（純顯示，格距內部一律 px）
  ratioLock:false,fontSync:false,scaleFont:true,   // ratioLock/fontSync＝寬高列旗標(預設關)；scaleFont＝縮放滑桿含字級(預設開)
  masterEdit:false,   // 編輯母版模式：畫布只顯示母版元素，所有工具改作用在它們身上
  ready:false};   // 自動存檔閘門：還原完才置 true，否則開機時的空白 deck 會蓋掉硬碟上的內容
APP.page=APP.deck.pages[0].id;
const CHARTS=new Map();   // 圖表元素 id → echarts 實例
const round1=v=>Math.round(v*10)/10;
function curPage(){ return APP.deck.pages.find(p=>p.id===APP.page)||APP.deck.pages[0]; }
/* ---- 母版（「信紙」）----
   deck.master.elements 是一份共用元素，畫在每一頁底下。編輯母版時 curEls() 整個換指向它，
   於是拖曳、屬性面板、圖層、複製貼上、undo 全部沿用同一套工具，不必為母版另寫一份編輯器。 */
function masterOn(){ return !!(APP.deck.master&&APP.deck.master.on); }
function masterEls(){
  if(!APP.deck.master) APP.deck.master={on:false,flatten:false,elements:[]};
  if(!Array.isArray(APP.deck.master.elements)) APP.deck.master.elements=[];
  return APP.deck.master.elements;
}
// 這一頁實際會墊上的母版元素（沒啟用／本頁關閉／正在編輯母版時都不墊）
function pageMasterEls(pg){
  return (masterOn()&&!APP.masterEdit&&!(pg||curPage()).noMaster)? masterEls() : [];
}
function curEls(){ return APP.masterEdit? masterEls() : curPage().elements; }
function selEls(){ return APP.selIds.map(id=>curEls().find(e=>e.id===id)).filter(Boolean); }
// 軟群組：同 groupId 的所有成員（無 groupId 則回自身）
function groupMembers(el){ return el&&el.groupId? curEls().filter(e=>e.groupId===el.groupId) : (el?[el]:[]); }
function selEl(){ return APP.selIds.length===1? (curEls().find(e=>e.id===APP.selIds[0])||null) : null; }
function setSel(ids){
  const live=[...new Set(ids)].filter(id=>curEls().some(e=>e.id===id));
  APP.selIds=live; APP.sel=live.length? live[live.length-1]:null;
  if(APP.cellSel&&APP.sel!==APP.cellSel.id) APP.cellSel=null;   // 選取換到別的元素→清掉儲存格反白
}
function groupBBox(els){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const el of els){ const {w,h}=elSize(el); x0=Math.min(x0,el.x); y0=Math.min(y0,el.y); x1=Math.max(x1,el.x+w); y1=Math.max(y1,el.y+h); }
  return {x:x0,y:y0,w:x1-x0,h:y1-y0};
}

/* ================= 復原／重做 ================= */
const UNDO=[],REDO=[];
function snapshot(){ return {deck:structuredClone(APP.deck),page:APP.page,selIds:[...APP.selIds]}; }
function updateUndoBtns(){ $('#btnUndo').disabled=!UNDO.length; $('#btnRedo').disabled=!REDO.length; }
function commitUndo(s){ UNDO.push(s||snapshot()); if(UNDO.length>60)UNDO.shift(); REDO.length=0; updateUndoBtns();
  scheduleAutosave(); }   // 補網：拖曳／就地編輯等只走 renderStage 的路徑，靠這裡也能觸發存檔
function applySnap(s,into){ into.push(snapshot()); APP.edit=null; APP.editing=null; APP.deck=s.deck; APP.page=s.page;
  if(APP.masterEdit&&!(APP.deck.master&&APP.deck.master.on)) setMasterEdit(false);   // 撤銷把母版關掉了就退出編輯
  if(!APP.deck.pages.find(p=>p.id===APP.page)) APP.page=APP.deck.pages[0].id;
  setSel(s.selIds||[]);
  renderAll();
  // 圖表面板開著時，deck 已整份換新 → 重建面板讓它指向新物件
  if(!$('#chartModal').hidden&&!$('#chartVisPane').hidden) buildChartVis(); }
function undo(){ const s=UNDO.pop(); if(s) applySnap(s,REDO); updateUndoBtns(); }
function redo(){ const s=REDO.pop(); if(s) applySnap(s,UNDO); updateUndoBtns(); }

/* ================= 尺寸工具 ================= */
function tableDom(id){ return stage.querySelector(`.el[data-id="${id}"] table`); }
function elSize(el){  // 表格的實際高度以 DOM 為準（wrap 會長高）
  if(el.type==='table'){
    const w=el.colW.reduce((a,b)=>a+b,0);
    const d=tableDom(el.id);
    return {w,h:d? d.offsetHeight : el.rowH.reduce((a,b)=>a+b,0)};
  }
  return {w:el.w,h:el.h};
}

