'use strict';
function defCell(){ return {text:'',bold:false,italic:false,color:'1A1A1A',sizePt:12,fill:null,align:'left',valign:'middle',colspan:1,rowspan:1,covered:false}; }
/* ---- 儲存格 runs（格內混排）----
   `cell.text` **永遠**是整格的完整純文字；`cell.runs` 是選用的，存在時才是渲染與匯出的真相，
   而 text 同步成 runs 的串接（衍生值）。這樣舊讀者、搜尋、以及只想看內容的 AI 拿 text 就夠。

   優先權：**run 有寫該鍵就用 run 的，沒寫就退回格層級**。所以 runs 只需要寫「和整格不一樣的地方」，
   normCell 會把與格層級相同的鍵刪掉——不這樣做的話，大表格逐格長出整套樣式會讓 JSON 膨脹到吃 token
   ——整份 JSON 要能貼給 AI，膨脹就是直接成本。

   換行沿用扁平時代的作法：`\n` 留在 run 的 text 裡，不拆段。PptxGenJS 的表格儲存格會自己把含 \n 的
   run 拆成多筆並補 breakLine，畫布則靠 `white-space:pre-wrap`，兩邊都不必另立段落模型。 */
const CELL_STYLE_KEYS=['bold','italic','color','sizePt'];
const cellRunKey=r=>JSON.stringify([...CELL_STYLE_KEYS,...RUN_OPT_KEYS].map(k=>r[k]??null));
function cellBase(cell){ return {bold:!!cell.bold,italic:!!cell.italic,color:cell.color||'1A1A1A',sizePt:cell.sizePt||12}; }
function cellRuns(cell){   // 一律回「已解析完繼承」的完整 run 陣列，渲染與匯出共用同一個來源
  const base=cellBase(cell);
  if(!Array.isArray(cell.runs)||!cell.runs.length) return [{...base,text:String(cell.text||'')}];
  return cell.runs.map(r=>{
    const o={...base,text:String(r.text||'')};
    for(const k of CELL_STYLE_KEYS) if(r[k]!=null) o[k]=r[k];   // 注意用 !=null：bold:false 是合法覆寫
    for(const k of RUN_OPT_KEYS) if(r[k]!=null) o[k]=r[k];
    return o;
  });
}
function normCell(cell){
  cell.text=String(cell.text||'');
  // markdown 輸入糖：與段落同一套語法（見 mdToRuns），展開成 runs 後刪鍵，存檔只留一種形式
  if(typeof cell.md==='string'){ cell.runs=mdToRuns(cell.md,cellRuns({...cell,runs:null})[0]); delete cell.md; }
  if(!Array.isArray(cell.runs)||!cell.runs.length){ delete cell.runs; return; }
  const base=cellBase(cell), out=[];
  for(const r0 of cell.runs){
    const t=String(r0.text||''); if(!t) continue;   // 空 run 一律丟（整格空的情形由下方退回扁平接手）
    const r={...r0,text:t}; normRunOpts(r);
    for(const k of CELL_STYLE_KEYS) if(r[k]==null||r[k]===base[k]) delete r[k];   // 瘦身：與格層級同值不寫
    for(const k of Object.keys(r)) if(k!=='text'&&!CELL_STYLE_KEYS.includes(k)&&!RUN_OPT_KEYS.includes(k)) delete r[k];
    const last=out[out.length-1];
    if(last&&cellRunKey(last)===cellRunKey(r)) last.text+=t; else out.push(r);   // 併相鄰同樣式，免得碎成一堆
  }
  if(!out.length){ delete cell.runs; cell.text=''; return; }
  cell.text=out.map(r=>r.text).join('');
  // 只剩一個 run 且沒有任何覆寫＝跟扁平結構等價，那就退回扁平，別留一層沒作用的巢狀
  if(out.length===1&&cellRunKey(out[0])===cellRunKey({})) delete cell.runs; else cell.runs=out;
}
// 合併儲存格：(r,c) 為左上錨點，跨 cs 欄 rs 列。範圍內其他格標 covered；
// 會先清掉錨點舊 span 與範圍內其他合併的 covered 標記（被覆蓋的舊合併直接還原為 1×1）
function tableMerge(el,r,c,cs,rs){
  const clearSpan=(i,j)=>{ const cc=el.cells[i][j];
    for(let y=i;y<Math.min(el.rowH.length,i+(cc.rowspan||1));y++)
      for(let x=j;x<Math.min(el.colW.length,j+(cc.colspan||1));x++)
        el.cells[y][x].covered=false;
    cc.colspan=1; cc.rowspan=1; };
  cs=Math.max(1,Math.min(cs,el.colW.length-c)); rs=Math.max(1,Math.min(rs,el.rowH.length-r));
  clearSpan(r,c);
  for(let i=r;i<r+rs;i++) for(let j=c;j<c+cs;j++){
    const cc=el.cells[i][j];
    if(!cc.covered&&(cc.colspan>1||cc.rowspan>1)) clearSpan(i,j);   // 吃掉範圍內舊合併
    cc.covered=!(i===r&&j===c);
  }
  el.cells[r][c].colspan=cs; el.cells[r][c].rowspan=rs; el.cells[r][c].covered=false;
}
/* ---- 逐格四邊框線 ----
   cell.border={t,r,b,l}，每邊 {pt,color,dash?}｜null（明確無線）｜缺鍵＝沿用整表 el.border。
   相鄰兩格共用邊 → 每次設一半必同步對面那一半（雙寫），讓 collapse 預覽與 PPT 逐格 <a:ln*> 一致。*/
const BSIDE_TWIN={t:['b',-1,0],b:['t',1,0],l:['r',0,-1],r:['l',0,1]};
const bSide=v=>v? {pt:v.pt,color:v.color,...(v.dash?{dash:true}:{})} : null;   // 只在虛線時留鍵，JSON 保持精簡
function cellSide(el,cell,side){   // side∈'t','r','b','l'；回 {pt,color,dash?}｜null
  if(cell.border&&(side in cell.border)) return bSide(cell.border[side]);
  return bSide(el.border);
}
function setCellSide(el,r,c,side,val){   // val={pt,color,dash?}｜null
  const cell=el.cells[r]&&el.cells[r][c]; if(!cell||cell.covered) return;
  if(!cell.border) cell.border={};
  cell.border[side]=bSide(val);
  const [ts,dr,dc]=BSIDE_TWIN[side], tr=r+dr, tc=c+dc;   // 對面半邊同步
  const nb=el.cells[tr]&&el.cells[tr][tc];
  if(nb&&!nb.covered){ if(!nb.border) nb.border={}; nb.border[ts]=bSide(val); }
}
// mode: all｜outer｜inner｜top｜bottom｜left｜right｜none(清除)。range 省略＝全表。
function applyBorder(el,range,mode,val){
  commitUndo();
  const {r0,c0,r1,c1}=range||{r0:0,c0:0,r1:el.rowH.length-1,c1:el.colW.length-1};
  const S=(r,c,side)=>setCellSide(el,r,c,side,val);
  const top   =()=>{ for(let c=c0;c<=c1;c++) S(r0,c,'t'); };
  const bottom=()=>{ for(let c=c0;c<=c1;c++) S(r1,c,'b'); };
  const left  =()=>{ for(let r=r0;r<=r1;r++) S(r,c0,'l'); };
  const right =()=>{ for(let r=r0;r<=r1;r++) S(r,c1,'r'); };
  const innerH=()=>{ for(let r=r0;r<r1;r++) for(let c=c0;c<=c1;c++) S(r,c,'b'); };
  const innerV=()=>{ for(let r=r0;r<=r1;r++) for(let c=c0;c<c1;c++) S(r,c,'r'); };
  if(mode==='all'||mode==='none'){ top();bottom();left();right();innerH();innerV(); }
  else if(mode==='outer'){ top();bottom();left();right(); }
  else if(mode==='inner'){ innerH();innerV(); }
  else if(mode==='top') top(); else if(mode==='bottom') bottom();
  else if(mode==='left') left(); else if(mode==='right') right();
  // 全表操作時同步整表預設 el.border，讓日後新增欄／列沿用一致基準
  const whole=!range||(r0===0&&c0===0&&r1===el.rowH.length-1&&c1===el.colW.length-1);
  if(whole&&mode==='all') el.border= val? bSide(val) : el.border;
  if(whole&&mode==='none') el.border=null;
  renderStage(); renderProps(); updateSelBox();
}
/* ---- 拖曳反白選格（PowerPoint 式）：規範化矩形＋外擴到整塊合併，避免切半 ---- */
// 兩端錨點 → 規範化矩形；反覆外擴，直到框內不再切穿任何合併儲存格
function normalizeCellSel(el,ra,ca,rb,cb){
  const R=el.rowH.length,C=el.colW.length;
  let r0=Math.max(0,Math.min(ra,rb)),r1=Math.min(R-1,Math.max(ra,rb));
  let c0=Math.max(0,Math.min(ca,cb)),c1=Math.min(C-1,Math.max(ca,cb));
  for(let guard=0;guard<64;guard++){
    let changed=false;
    for(let r=0;r<R;r++)for(let c=0;c<C;c++){
      const cc=el.cells[r][c]; if(cc.covered) continue;
      const cs=cc.colspan||1,rs=cc.rowspan||1; if(cs===1&&rs===1) continue;
      const er=r+rs-1,ec=c+cs-1;
      if(r<=r1&&er>=r0&&c<=c1&&ec>=c0){   // 此合併塊與現框相交→吃進整塊
        if(r<r0){r0=r;changed=true;} if(er>r1){r1=er;changed=true;}
        if(c<c0){c0=c;changed=true;} if(ec>c1){c1=ec;changed=true;}
      }
    }
    if(!changed) break;
  }
  return {id:el.id,r0,c0,r1,c1};
}
// 指標座標 → 該表格的 (r,c)：靠瀏覽器原生命中測試，旋轉/縮放免自算。covered 格無 td，會命中其跨越的 td（回錨點 r/c，規範化再外擴）
function cellRC(el,cx,cy){
  const stack=document.elementsFromPoint(cx,cy);
  const td=stack.find(n=>n.tagName==='TD'&&n.closest(`.el[data-id="${el.id}"]`));
  return td? {r:+td.dataset.r,c:+td.dataset.c} : null;
}
function tableEdgePx(el,r0,c0,r1,c1){   // 反白矩形在 selBox 內的像素框（欄用 colW 累加、列用 DOM tr offset）
  const trs=tableDom(el.id)?tableDom(el.id).querySelectorAll('tr'):[];
  let left=0; for(let i=0;i<c0;i++) left+=el.colW[i];
  let w=0; for(let i=c0;i<=c1;i++) w+=el.colW[i];
  const top=trs[r0]?trs[r0].offsetTop:0;
  const bottom=trs[r1]?trs[r1].offsetTop+trs[r1].offsetHeight:0;
  return {left,top,w,h:bottom-top};
}
// 已選表格時，指標是否落在「移動邊框帶」——落在帶內＝移動整張表，否則＝拖曳選格。
// 帶寬放寬到 16px（好抓、不易誤選格），但各軸不超過該軸螢幕尺寸的 30%，
// 以免低縮放下整張表太小、上下（或左右）帶重疊而吃掉全部內部（無處可選格）。
function nearTableEdge(box,cx,cy){
  const r=box.getBoundingClientRect();
  const mx=Math.min(16,r.width*0.3),my=Math.min(16,r.height*0.3);
  return cx-r.left<mx||r.right-cx<mx||cy-r.top<my||r.bottom-cy<my;
}
function mergeCellSel(el){
  const s=APP.cellSel; if(!s||s.id!==el.id) return;
  const cs=s.c1-s.c0+1,rs=s.r1-s.r0+1; if(cs<2&&rs<2) return;
  commitUndo(); tableMerge(el,s.r0,s.c0,cs,rs);
  renderStage(); renderProps(); updateSelBox();
}
function unmergeCellSel(el){
  const s=APP.cellSel; if(!s||s.id!==el.id) return;
  commitUndo(); tableMerge(el,s.r0,s.c0,1,1);
  APP.cellSel={id:el.id,r0:s.r0,c0:s.c0,r1:s.r0,c1:s.c0};
  renderStage(); renderProps(); updateSelBox();
}
// 刪除指定欄／列（合併儲存格 span 自動縮減，port 自 xlsx2pptx removeCol/RowFromModel）
function tableDeleteCol(el,i){
  if(el.colW.length<=1) return;
  const cells=el.cells;
  for(let r=0;r<cells.length;r++){
    for(let c=0;c<cells[r].length;c++){
      const cc=cells[r][c];
      if(cc.covered||cc.colspan<=1) continue;
      if(c<=i&&i<c+cc.colspan){
        if(c===i) cells[r][i+1]={...cc,colspan:cc.colspan-1};   // 合併主格被刪：內容右移
        else      cells[r][c]={...cc,colspan:cc.colspan-1};     // 範圍縮一欄
      }
    }
  }
  for(let r=0;r<cells.length;r++) cells[r].splice(i,1);
  el.colW.splice(i,1);
}
function tableDeleteRow(el,j){
  if(el.rowH.length<=1) return;
  const cells=el.cells;
  for(let r=0;r<cells.length;r++){
    for(let c=0;c<cells[r].length;c++){
      const cc=cells[r][c];
      if(cc.covered||cc.rowspan<=1) continue;
      if(r<=j&&j<r+cc.rowspan){
        if(r===j) cells[j+1][c]={...cc,rowspan:cc.rowspan-1};
        else      cells[r][c]={...cc,rowspan:cc.rowspan-1};
      }
    }
  }
  cells.splice(j,1); el.rowH.splice(j,1);
}
