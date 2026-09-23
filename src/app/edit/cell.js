'use strict';
/* ================= 格內 run 級編輯 =================
   儲存格是**單段**模型（換行是留在 run 文字裡的 \n，不另立段落），所以沒有沿用文字框那套
   以「段索引＋段內位移」為主鍵的編輯器，改用單純的「格內字元位移」重寫一份薄的。
   資料操作本身仍共用：runsSplitAt 切開、normCell 收尾（瘦身＋併相鄰同樣式＋單 run 退回扁平）。 */
function cellEdCell(){   // 目前正在編輯的那一格（元素可能已被重繪換掉，故每次重查）
  const e=APP.cellEdit; if(!e) return null;
  const el=curEls().find(x=>x.id===e.id); if(!el||el.type!=='table') return null;
  const cell=(el.cells[e.r]||[])[e.c];
  return cell? {el,cell} : null;
}
/* 換行在編輯中的 DOM 有兩種長相：<br>，以及 Chrome 把後續每一行各包成的 <div>。
   位移換算（cellEdPos）、寫回資料（cellEdSync）、還原選取（cellEdNode）三處**必須用同一套規則**
   數這些換行，否則按過 Enter 之後反白位置就會整個錯開一格一格累積。故三者都走這個判斷：
   行尾的 <br> ＝渲染佔位，不算；非行尾的 <br> ＝一個 \n；非開頭的區塊元素 ＝一個 \n。

   ⚠「行尾」指**所在區塊容器的最後一個節點**，不是整棵樹的最後。初版寫成後者，於是連按兩次
   換行產生的 <div><span><br></span></div>（Chrome 用來表示空行）被記成兩個 \n——區塊記一個、
   裡面的佔位 <br> 又記一個，實測 "a\n\nb" 存成 "a\n\n\nb"。故 walk 進區塊元素時把 isLast
   基準重設為 true（見 CELL_ED_LAST）。 */
const CELL_ED_BLOCK=n=>n.tagName==='DIV'||n.tagName==='P';
// 子節點的 isLast 基準：進到區塊元素就重新起算，讓「行尾 <br>」以該區塊為界
const CELL_ED_LAST=(n,isLast)=>CELL_ED_BLOCK(n)? true : isLast;
// (node,offset) → 格內字元位移
function cellEdPos(root,node,offset){
  let o=0,hit=false,started=false;
  const walk=(n,isLast)=>{
    if(hit) return;
    /* 區塊自身帶的那個換行要在**命中判斷之前**記。range 指向區塊本身（空行的行首就長這樣）
       時，若先命中再記，那個 \n 會漏掉，跟 cellEdNode 的落點對不起來。 */
    if(n.nodeType===1&&CELL_ED_BLOCK(n)&&started&&n!==root) o+=1;
    if(n===node&&n.nodeType===1){
      const cs=[...n.childNodes], lb=CELL_ED_LAST(n,true);
      for(let i=0;i<offset&&i<cs.length;i++) walk(cs[i],lb&&i===cs.length-1);
      hit=true; return;
    }
    if(n.nodeType===3){
      if(n===node){ o+=Math.min(offset,n.nodeValue.length); hit=true; }
      else { o+=n.nodeValue.length; if(n.nodeValue) started=true; }
      return;
    }
    if(n.nodeType!==1) return;
    if(n.tagName==='BR'){ if(!isLast){ o+=1; started=true; } return; }
    const cs=[...n.childNodes];
    const lb=CELL_ED_LAST(n,isLast);
    for(let i=0;i<cs.length;i++){ walk(cs[i],lb&&i===cs.length-1); if(hit) return; }
  };
  walk(root,true);
  return hit? o : null;
}
// 字元位移 → (node,offset)
function cellEdNode(root,o){
  let acc=0,res=null,started=false;
  const walk=(n,isLast)=>{
    if(res) return;
    if(n.nodeType===3){
      const L=n.nodeValue.length;
      if(o<=acc+L){ res={node:n,offset:o-acc}; return; }
      acc+=L; if(L) started=true; return;
    }
    if(n.nodeType!==1) return;
    /* 換行本身也要能當落點。只在文字節點產生 res 的話，游標落在換行上時 acc 已經超過 o，
       會一路走到下一個文字節點算出**負的 offset**，`setStart` 拋 IndexSizeError 被 catch 吞掉，
       表現為「套完格式後反白沒還原」。故兩種換行都在記完位移後立刻檢查是不是就落在這裡。 */
    if(n.tagName==='BR'){
      if(!isLast){ acc+=1; started=true;
        if(o===acc){ const ps=[...n.parentNode.childNodes]; res={node:n.parentNode,offset:ps.indexOf(n)+1}; } }
      return;
    }
    if(CELL_ED_BLOCK(n)&&started&&n!==root){ acc+=1; if(o===acc){ res={node:n,offset:0}; return; } }
    const cs=[...n.childNodes];
    const lb=CELL_ED_LAST(n,isLast);
    for(let i=0;i<cs.length;i++){ walk(cs[i],lb&&i===cs.length-1); if(res) return; }
  };
  walk(root,true);
  return res||{node:root,offset:root.childNodes.length};
}
function cellEdReadSel(){
  const e=APP.cellEdit; if(!e||!e.root) return null;
  const s=document.getSelection(); if(!s||!s.rangeCount) return null;
  const r=s.getRangeAt(0);
  if(!e.root.contains(r.startContainer)||!e.root.contains(r.endContainer)) return null;
  const a=cellEdPos(e.root,r.startContainer,r.startOffset), b=cellEdPos(e.root,r.endContainer,r.endOffset);
  return (a!=null&&b!=null)? {o0:Math.min(a,b),o1:Math.max(a,b)} : null;
}
function cellEdSelSync(){ const e=APP.cellEdit; if(!e) return; const s=cellEdReadSel(); if(s) e.sel=s; }
function cellEdSetSel(sel){
  const e=APP.cellEdit; if(!e||!e.root||!sel) return;
  const a=cellEdNode(e.root,sel.o0), b=cellEdNode(e.root,sel.o1);
  const r=document.createRange();
  try{ r.setStart(a.node,a.offset); r.setEnd(b.node,b.offset); }catch(err){ return; }
  const s=document.getSelection(); s.removeAllRanges(); s.addRange(r);
  e.sel=sel;
}
/* DOM → cell.runs。樣式來源是開啟編輯時拍下的 src（data-r 是絕對索引），
   所以瀏覽器怎麼搬 span 都對得回去；沒有 data-r 祖先的裸文字（貼上、輸入法補的）沿用左鄰樣式。 */
function cellEdSync(){
  const e=APP.cellEdit, cur=cellEdCell();
  if(!e||!e.root||!cur) return;
  const src=e.src||[], runs=[];
  const kids=[...e.root.childNodes];
  let started=false;   // 是否已經吐出過內容——用來判斷「開頭的區塊」不該補換行
  const push=(txt,st)=>{ if(!txt) return; runs.push({...(st||src[0]||{}),text:txt}); started=true; };
  const walk=(n,st,isLast)=>{
    if(n.nodeType===3){ push(n.nodeValue,st); return; }
    if(n.nodeType!==1) return;
    // 末尾那個 <br> 是 Chrome 為了「讓最後一個空行看得見」補的渲染產物，不是使用者打的換行
    if(n.tagName==='BR'){ if(!isLast) push('\n',st); return; }
    /* Chrome 在 contenteditable 內換行（Enter／貼多行）不是插 <br>，而是把後續每一行各自包成
       <div>。只認 <br> 的話換行會整個消失——實測 execCommand('insertText','\n') 就是走這條。
       故區塊元素一律等同一次換行，語意對齊 innerText。 */
    if(CELL_ED_BLOCK(n)&&started) push('\n',st);
    const s=(n.dataset&&n.dataset.r!=null&&src[+n.dataset.r])? src[+n.dataset.r] : st;
    const cs=[...n.childNodes];
    const lb=CELL_ED_LAST(n,isLast);
    cs.forEach((c,i)=>walk(c,s,lb&&i===cs.length-1));
  };
  kids.forEach((n,i)=>walk(n,null,i===kids.length-1));
  cur.cell.runs=runs.map(r=>({...r}));
  normCell(cur.cell);   // 瘦身／併同樣式／單 run 退回扁平／同步 text，一次到位
}
/* 格式套用。**有反白就只套那幾個字（run 級），沒反白就回 false 交給呼叫端做格層級**——
   與文字框的 runApply 同一條規則，使用者不必記兩套。key 為 CELL_STYLE_KEYS 或 RUN_OPT_KEYS 之一；
   val 傳 undefined 代表刪除該鍵（＝退回格層級）。 */
function cellRunApply(el,key,val){
  const patch= (key&&typeof key==='object')? key : {[key]:val};   // 也吃 {key:val,…} 一次改多個鍵
  const e=APP.cellEdit; if(!e||e.id!==el.id) return false;
  cellEdSelSync();
  const sel=e.sel; if(!sel||sel.o1<=sel.o0) return false;
  const cur=cellEdCell(); if(!cur) return false;
  commitUndo();
  cellEdSync();                       // 先把 DOM 現況寫回資料，再對資料動刀
  const rs=cellRuns(cur.cell);        // 解析完繼承的完整 run 陣列
  const i0=runsSplitAt(rs,sel.o0), i1=runsSplitAt(rs,sel.o1);
  for(let i=i0;i<i1;i++) for(const k of Object.keys(patch)){
    if(patch[k]===undefined) delete rs[i][k]; else rs[i][k]=patch[k];
  }
  cur.cell.runs=rs;
  normCell(cur.cell);
  renderStage();
  // 重繪換掉了整棵 DOM，重開編輯器並還原反白，讓使用者可以連續按（B 之後接著按底線）
  const td=tableDom(el.id)&&[...tableDom(el.id).querySelectorAll('td')]
    .find(t=>+t.dataset.r===e.r&&+t.dataset.c===e.c);
  if(td) startCellEdit(el,td,sel);
  renderProps();
  return true;
}
// 面板顯示用：反白時反映範圍第一個字的樣式，否則反映整格
function cellProbeRun(cell){
  const e=APP.cellEdit;
  if(e&&e.sel&&e.sel.o1>e.sel.o0){
    const rs=cellRuns(cell); let acc=0;
    for(const r of rs){ const n=String(r.text||'').length; if(e.sel.o0<acc+n) return r; acc+=n; }
    return rs[rs.length-1]||cellBase(cell);
  }
  return null;
}
// 格層級套用某個樣式鍵：同時清掉所有 run 對該鍵的覆寫（同 PowerPoint「整格選起來按粗體」的行為）
function setCellStyle(cell,key,val){
  cell[key]=val;
  if(Array.isArray(cell.runs)){ for(const r of cell.runs) delete r[key]; normCell(cell); }
}
document.addEventListener('selectionchange',()=>{
  if(!APP.cellEdit) return;
  cellEdSelSync(); syncProps();   // 游標一動，面板就要反映游標處的樣式（同文字框）
});

