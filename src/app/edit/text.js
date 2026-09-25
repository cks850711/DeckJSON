'use strict';
/* ================= 文字框 run 級編輯 =================
   直接把 renderEl 產生的 .txt（已逐 run 切成 <span>，並標好 data-p／data-r）轉成 contenteditable，
   不另建一套編輯用 DOM。編輯期間 **以 DOM 為真相**，每次 input 同步回 el.paras；
   只有分段（Enter）與套格式才重繪，重繪後由 renderStage 尾端的 editOpen 重開編輯器並還原選取。
   這樣避開「每按一鍵就從資料重畫」會帶來的游標還原與輸入法組字中斷問題。 */
function editEl(){ return APP.edit? curEls().find(x=>x.id===APP.edit.id) : null; }
// (node,offset) → {p:段索引, o:段內字元位置}；跳過項目符號等渲染產物
function edPos(root,node,offset){
  const base=node.nodeType===3? node.parentNode : node;
  const pdiv=base&&base.closest? base.closest('[data-p]') : null;
  if(!pdiv||!root.contains(pdiv)) return null;
  let o=0,hit=false;
  const walk=n=>{
    if(hit) return;
    if(n===node&&n.nodeType===1){ for(let i=0;i<offset&&i<n.childNodes.length;i++) walk(n.childNodes[i]); hit=true; return; }
    if(n.nodeType===3){ if(n===node){ o+=offset; hit=true; } else o+=n.nodeValue.length; return; }
    if(n.nodeType!==1||(n.dataset&&n.dataset.mk!=null)) return;
    for(const c of n.childNodes){ walk(c); if(hit) return; }
  };
  walk(pdiv);
  return {p:+pdiv.dataset.p,o};
}
// {p,o} → (node,offset)
function edNode(root,p,o){
  const pdiv=root.querySelector(`[data-p="${p}"]`);
  if(!pdiv) return null;
  let acc=0,res=null;
  const w=document.createTreeWalker(pdiv,NodeFilter.SHOW_TEXT,{acceptNode:n=>
    (n.parentNode&&n.parentNode.closest('[data-mk]'))? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  let t;
  while((t=w.nextNode())){
    if(o<=acc+t.nodeValue.length){ res={node:t,offset:o-acc}; break; }
    acc+=t.nodeValue.length;
  }
  return res||{node:pdiv,offset:pdiv.childNodes.length};
}
function editReadSel(){
  const e=APP.edit; if(!e||!e.root) return null;
  const s=document.getSelection();
  if(!s||!s.rangeCount) return null;
  const r=s.getRangeAt(0);
  if(!e.root.contains(r.startContainer)||!e.root.contains(r.endContainer)) return null;
  // 全選（Cmd+A／selectAllChildren）時端點會落在 .txt 本身，先收斂到對應的段落 div，否則查不到 data-p
  const fix=(node,off,isEnd)=>{
    if(node!==e.root) return [node,off];
    const kids=[...e.root.children];
    if(!kids.length) return [node,off];
    const d=kids[Math.min(Math.max(isEnd? off-1 : off,0),kids.length-1)];
    return [d, isEnd? d.childNodes.length : 0];
  };
  const a=edPos(e.root,...fix(r.startContainer,r.startOffset,false)),
        b=edPos(e.root,...fix(r.endContainer,r.endOffset,true));
  return (a&&b)? {p0:a.p,o0:a.o,p1:b.p,o1:b.o} : null;
}
function editSetSel(sel){
  const e=APP.edit; if(!e||!e.root||!sel) return;
  const a=edNode(e.root,sel.p0,sel.o0), b=edNode(e.root,sel.p1,sel.o1);
  if(!a||!b) return;
  const r=document.createRange();
  try{ r.setStart(a.node,a.offset); r.setEnd(b.node,b.offset); }catch(err){ return; }
  const s=document.getSelection(); s.removeAllRanges(); s.addRange(r);
  e.sel=sel;   // 同步寫回：selectionchange 是非同步的，不能等它
}
// DOM → el.paras。樣式來源是開啟編輯時拍下的 src（data-r 存「段:run」絕對鍵），
// 所以就算瀏覽器把兩段合併、把 span 搬家，樣式依然對得回去。
function editSync(){
  const e=APP.edit, el=editEl();
  if(!e||!e.root||!el) return;
  const src=e.src||[];
  const styleKey=k=>{ const [pi,ri]=String(k).split(':').map(Number);
    const r=src[pi]&&(src[pi].runs||[])[ri]; return r? runStyle(r) : null; };
  const paras=[]; let lastPi=0;
  for(const node of [...e.root.childNodes]){
    if(node.nodeType===3&&!node.nodeValue) continue;
    if(node.nodeType!==1&&node.nodeType!==3) continue;
    if(node.nodeType===1&&node.tagName==='BR') continue;   // 全部清空後 Chrome 會留一個裸 <br>
    const isEl=node.nodeType===1;
    const pi=(isEl&&node.dataset&&node.dataset.p!=null)? +node.dataset.p : lastPi;
    lastPi=pi;
    const s=src[pi]||src[0]||{};
    // items：文字片段與硬斷行（貼上多行文字時瀏覽器會插 <br>，視為分段）
    const items=[]; let last=null;
    const walk=n=>{
      if(n.nodeType===3){
        if(!n.nodeValue) return;
        let st=null,a=n.parentNode;
        while(a&&a!==e.root){ if(a.dataset&&a.dataset.r!=null){ st=styleKey(a.dataset.r); break; } a=a.parentNode; }
        st=st||last||runStyle((s.runs||[])[0]||{});
        items.push({text:n.nodeValue,st}); last=st; return;
      }
      if(n.nodeType!==1||(n.dataset&&n.dataset.mk!=null)) return;   // data-mk：項目符號與空段落佔位 <br>
      if(n.tagName==='BR'){ items.push({br:true}); return; }
      for(const c of n.childNodes) walk(c);
    };
    if(isEl) for(const c of node.childNodes) walk(c); else walk(node);
    let cur=[];
    const flush=()=>{
      // 空段落也要留一個帶樣式的空殼 run：樣式取「上一個片段」或原段落第一個 run，不能退回全域預設
      const empty=[{...(last||runStyle((s.runs||[])[0]||{})),text:''}];
      const p={align:s.align||'left',runs:cur.length? cur.map(it=>({...it.st,text:it.text})) : empty};
      for(const k of PARA_OPT_KEYS) if(s[k]!=null) p[k]=structuredClone(s[k]);
      mergeRuns(p); paras.push(p); cur=[];
    };
    for(const it of items){ if(it.br) flush(); else cur.push(it); }
    flush();
  }
  if(!paras.length){
    const s=src[0]||{};
    paras.push({align:s.align||'left',runs:[{...runStyle((s.runs||[])[0]||{}),text:''}]});
  }
  // 全選刪光時 Chrome 常留下兩個空 div；整份都空就只留一段（有內容時的空行是刻意的，不動）
  if(paras.length>1&&paras.every(p=>!paraLen(p))) paras.length=1;
  el.paras=paras;
}
// 第一次改動才把「編輯前」推進 undo：只開編輯器沒動過，不留空步
function editDirty(){ const e=APP.edit; if(e&&!e.pushed){ e.pushed=true; commitUndo(e.snap); } }
function editCommit(){
  const e=APP.edit; if(!e) return;
  editSync();
  APP.edit=null; APP.editing=null;
  renderAll();
}
// 輸入法組字期間不同步：組字中的 DOM 是暫態，等 compositionend 一次寫回就好
function onEditInput(){ if(APP.edit&&APP.edit.composing) return; editDirty(); editSync(); markOverflow(); }
function onEditPaste(ev){   // 一律轉純文字：擋掉從網頁帶進來的整包 HTML
  ev.preventDefault();
  const t=(ev.clipboardData&&ev.clipboardData.getData('text/plain'))||'';
  if(t) document.execCommand('insertText',false,t.replace(/\r\n?/g,'\n'));
}
/* 不斷行字元的快捷鍵，按法同 Word：Cmd/Ctrl+Shift+空白＝不斷行空白（U+00A0）、Cmd/Ctrl+Shift+連字號＝
   不斷行連字號（U+2011）。「2 GHz」「F-42%」這類不該被換行拆開的字，PowerPoint 與瀏覽器都只認這兩個
   字元——pptx 沒有「這段不換行」的格式設定，所以提供的是輸入方式，不是新格式。
   U+2060（字詞連接符）瀏覽器認、PowerPoint 不認（2026-09-25 以 PowerPoint 實測），故不採用。
   文字框與表格儲存格兩個編輯器共用；回傳 true 表示已處理。 */
function noBreakKey(ev){
  if(!ev.shiftKey||!(ev.metaKey||ev.ctrlKey)||ev.altKey) return false;
  // code 是實體鍵位；再看 key 做後備（部分鍵盤配置或自動化工具送出的事件沒有 code，Shift 下連字號鍵的 key 是「_」）
  const ch= ev.code==='Space'||ev.key===' '? '\u00a0' : ev.code==='Minus'||ev.key==='-'||ev.key==='_'? '\u2011' : null;
  if(!ch) return false;
  ev.preventDefault(); document.execCommand('insertText',false,ch);
  return true;
}
function onEditKey(ev){
  if(ev.isComposing||ev.keyCode===229) return;   // 輸入法組字中不攔截
  if(noBreakKey(ev)) return;
  /* 選字確認的餘波：引擎若先發 compositionend 再發 keydown，那一下的 isComposing 已是 false，
     注音按 Enter 確認選字就會順帶多分一段。同儲存格編輯器的 60ms 守衛。 */
  if(ev.key==='Enter'&&APP.edit&&APP.edit.compEnd&&Date.now()-APP.edit.compEnd<60){ APP.edit.compEnd=0; return; }
  if(ev.key==='Escape'){ ev.preventDefault(); editCommit(); return; }
  if(ev.key!=='Enter') return;
  // 分段自己接管：不讓瀏覽器決定要生 <div> 還是 <br>，段落結構才守得住
  ev.preventDefault();
  const sel0=document.getSelection();
  if(sel0&&sel0.rangeCount&&!sel0.getRangeAt(0).collapsed) document.execCommand('delete');
  const sel=editReadSel(); if(!sel) return;
  editDirty(); editSync();
  const el=editEl(); const p=el&&(el.paras||[])[sel.p0]; if(!p) return;
  const i=splitAt(p,sel.o0);
  const head=p.runs.slice(0,i), tail=p.runs.slice(i);
  const np={align:p.align,runs:tail.length? tail : [{...runStyle(head[head.length-1]||{}),text:''}]};
  for(const k of PARA_OPT_KEYS) if(p[k]!=null) np[k]=structuredClone(p[k]);
  p.runs= head.length? head : [{...runStyle(tail[0]||{}),text:''}];
  el.paras.splice(sel.p0+1,0,np);
  APP.edit.sel={p0:sel.p0+1,o0:0,p1:sel.p0+1,o1:0};
  renderStage();
}
// 把剛渲染好的 .txt 接管成編輯器（renderStage 尾端會呼叫，故重繪後編輯狀態不中斷）
function editOpen(){
  const e=APP.edit, el=editEl();
  if(!e||!el){ APP.edit=null; APP.editing=null; return; }
  const box=stage.querySelector(`.el[data-id="${e.id}"]`);
  const ed=box&&box.querySelector('.txt');
  if(!ed){ APP.edit=null; APP.editing=null; return; }
  e.src=structuredClone(el.paras||[]);
  e.root=ed;
  ed.contentEditable='true';
  ed.spellcheck=false;
  for(const mk of ed.querySelectorAll('[data-mk]')) mk.contentEditable='false';
  ed.addEventListener('input',onEditInput);
  ed.addEventListener('keydown',onEditKey);
  ed.addEventListener('paste',onEditPaste);
  ed.addEventListener('compositionstart',()=>{ if(APP.edit){ APP.edit.composing=true; APP.edit.compEnd=0; } });
  ed.addEventListener('compositionend',()=>{ if(APP.edit){ APP.edit.composing=false; APP.edit.compEnd=Date.now(); onEditInput(); } });
  ed.addEventListener('focusout',()=>setTimeout(()=>{
    const cur=APP.edit;
    if(!cur||cur.root!==ed) return;                       // 已被重繪換掉的舊節點，忽略
    const a=document.activeElement;
    if(a&&(ed.contains(a)||a===ed||a.closest('#propPanel'))) return;   // 焦點移到屬性面板：保留選取繼續編輯
    editCommit();
  },0));
  ed.focus();
  if(e.sel) editSetSel(e.sel);
  else{ document.getSelection().selectAllChildren(ed); e.sel=editReadSel(); }
}
function startTextEdit(el,box){
  if(el.type==='shape'&&!el.paras){ el.paras=mkParas('',{sizePt:14,color:'FFFFFF',align:'center'}); el.valign='middle'; }
  APP.editing=el.id;
  APP.edit={id:el.id,sel:null,root:null,src:null,pushed:false,snap:snapshot()};
  renderStage();   // 重繪一次拿到乾淨的 .txt，尾端的 editOpen 會接管它
  renderProps();
}
// 選取範圍隨時記著：點到屬性面板時 DOM 選取可能失效，套格式要靠這份
document.addEventListener('selectionchange',()=>{
  const e=APP.edit; if(!e||!e.root) return;
  const s=editReadSel(); if(s) e.sel=s;
  syncProps();   // 游標一動，面板就要反映游標所在那個 run 的樣式
});
// 有選取就只套範圍，沒選取（或不在編輯中）就整塊套用
function runApply(el,fn){
  const e=APP.edit, s=(e&&e.id===el.id)? e.sel : null;
  if(s&&!(s.p0===s.p1&&s.o0===s.o1)){ e.pushed=true; editSync(); applyRange(el,s,fn); }
  else setAllRuns(el,fn);
}
/* 面板顯示用：編輯中反映「游標所在的那個 run」，不在編輯中才沿用元素第一個 run。
   ⚠ 這裡刻意**不**要求「有反白」——游標插在高亮文字中間（collapsed）時也要反映該處的樣式，
   否則面板會說「沒有高亮」，與眼睛看到的不符。與 Word／PowerPoint 一致：
   collapsed 時看的是「游標左邊那個字」，所以 probe 取 o0-1。
   注意 runApply 的判斷維持原樣（有反白只套範圍、沒反白套整塊），兩者是不同的問題。*/
function panelRun(el){
  const e=APP.edit, s=(e&&e.id===el.id)? e.sel : null;
  if(s){
    const p=(el.paras||[])[s.p0];
    if(p&&(p.runs||[]).length){
      const collapsed=(s.p0===s.p1&&s.o0===s.o1);
      const probe=collapsed? Math.max(0,s.o0-1) : s.o0;
      // 預設取最後一個 run：游標停在段落末尾時 probe 會超出總長度，落回第一個 run 是錯的
      let acc=0,r=p.runs[p.runs.length-1];
      for(const q of p.runs){ const L=String(q.text||'').length; if(probe<acc+L){ r=q; break; } acc+=L; }
      const o={bold:!!r.bold,italic:!!r.italic,color:r.color||'1A1A1A',sizePt:r.sizePt||18,align:p.align||'left'};
      for(const k of RUN_OPT_KEYS) if(r[k]!=null) o[k]=r[k];
      for(const k of PARA_OPT_KEYS) if(p[k]!=null) o[k]=p[k];
      return o;
    }
  }
  return baseRun(el);
}
function startCellEdit(el,td,initSel){
  const r=+td.dataset.r,c=+td.dataset.c;
  const cell=el.cells[r][c];
  APP.editing=el.id;
  APP.cellSel=null;   // 進入格內文字編輯→收起反白/合併鈕
  APP.lastCell={id:el.id,r,c};   // 屬性面板「合併」以此為錨點
  focusCellJson(el.id,r,c);   // JSON 面板開著時捲至該格
  td.textContent='';
  const ed=editableDiv();
  ed.style.cssText='min-height:1em;white-space:pre-wrap;';   // pre-wrap：Enter 的格內換行才顯示得出來
  /* 逐 run 建 span 並標 data-r：格式化按鈕靠這個索引回查「開啟編輯當下」的樣式，
     所以就算瀏覽器把 span 搬家／合併，樣式依然對得回去（同文字框編輯器的作法）。 */
  const src=cellRuns(cell);
  for(let i=0;i<src.length;i++){ const sp=runSpan(src[i],12); sp.dataset.r=i; ed.appendChild(sp); }
  td.appendChild(ed);
  APP.cellEdit={id:el.id,r,c,root:ed,src,sel:null};
  /* initSel＝套完格式重開編輯器時要還原的反白（見 cellRunApply）；沒給才全選（進格即改寫的手感）。
     ⚠ rAF 那次一定要跟著判斷：初版兩次都無條件全選，於是按下「上標」後反白被吃掉，
     連按第二個格式鍵就會套到整格。 */
  const grab=()=>{ ed.focus();
    if(initSel) cellEdSetSel(initSel); else document.getSelection().selectAllChildren(ed);
    cellEdSelSync(); };
  grab(); requestAnimationFrame(grab);
  let done=false;
  const save=()=>{ if(done) return; done=true; APP.editing=null; commitUndo(); cellEdSync(); APP.cellEdit=null; };
  /* 輸入法（注音／拼音／日文）確認選字按的也是 Enter。Chrome 對那一下送的 keydown 帶
     isComposing=true／keyCode 229，擋得掉；但引擎若先發 compositionend 再發 keydown，
     那一下的 isComposing 已是 false，會被誤當成「換行」而在選完字之後多跑一行。
     故再用 compositionend 的時間戳補一道守門：組字剛結束的那 60ms 內，Enter 只當作確認。
     （人要在 60ms 內打完字再按 Enter 等於每秒 16 下，構不成誤擋。） */
  let compEnd=0;
  ed.addEventListener('compositionstart',()=>{ compEnd=0; });
  ed.addEventListener('compositionend',()=>{ compEnd=Date.now(); });
  ed.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229) return;   // 組字中不攔截（含 Esc：那是取消組字，不是結束編輯）
    if(e.key==='Enter'&&compEnd&&Date.now()-compEnd<60){ compEnd=0; return; }   // 選字確認的餘波
    if(noBreakKey(e)) return;
    if(e.key==='Enter'){   // Enter／Shift+Enter＝格內換行（明確插入 \n，不依賴瀏覽器預設，跨引擎一致）
      e.preventDefault(); document.execCommand('insertText',false,'\n');
    }else if(e.key==='Tab'){   // 吃掉 Tab：不跳格，也不讓瀏覽器把焦點帶去別的控件（那會意外結束編輯）
      e.preventDefault();
    }else if(e.key==='Escape'){ e.preventDefault(); ed.blur(); }   // 結束編輯
  });
  /* 失焦才收工，但**焦點移到屬性面板時不算**——否則按下「上標」的瞬間編輯就結束了，
     格內反白也跟著沒了，run 級按鈕永遠按不到。同文字框編輯器的 focusout 判斷。 */
  ed.addEventListener('blur',()=>setTimeout(()=>{
    if(done) return;
    const cur=APP.cellEdit;
    if(!cur||cur.root!==ed) return;        // 已被重繪換掉的舊節點，忽略
    const a=document.activeElement;
    if(a&&(a===ed||ed.contains(a)||(a.closest&&a.closest('#propPanel')))) return;
    save(); renderAll();
  },0));
}
