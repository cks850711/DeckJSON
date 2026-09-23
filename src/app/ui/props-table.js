'use strict';
/* ================= 屬性面板：表格 ================= */
/* 表格：結構、儲存格樣式、框線、格內文字 */
function propsTable(pp,el){
  pp.appendChild(subTitle(_t('結構')));
  const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>新增</label>');
  for(const [t,fn] of [[_t('＋欄'),()=>{ el.colW.push(el.colW[el.colW.length-1]||100);
      el.cells.forEach(r=>r.push(defCell())); }],
    [_t('＋列'),()=>{ el.rowH.push(el.rowH[el.rowH.length-1]||26); el.cells.push(el.colW.map(()=>defCell())); }]]){
    const bt=document.createElement('button'); bt.textContent=t;
    bt.onclick=()=>{ commitUndo(); fn(); renderStage(); renderProps(); };
    row.appendChild(bt);
  }
  pp.appendChild(row);
  const dnote=document.createElement('div'); dnote.className='row';
  dnote.innerHTML=_t('<span class="unit">要刪掉整欄或整列：滑到表格上緣（欄）或左緣（列）的灰色區段，變紅之後點一下。</span>');
  pp.appendChild(dnote);
  // ── 樣式套用範圍：畫布有反白選格→只套選中（非 covered）格；否則套全表 ──
  const cs=APP.cellSel&&APP.cellSel.id===el.id? APP.cellSel : null;
  const scopedCells=()=>{
    if(cs){ const a=[];
      for(let r=cs.r0;r<=cs.r1;r++) for(let c=cs.c0;c<=cs.c1;c++){ const cc=el.cells[r]&&el.cells[r][c]; if(cc&&!cc.covered) a.push(cc); }
      if(a.length) return a; }
    return el.cells.flat().filter(c=>!c.covered);
  };
  const c0=cs? el.cells[cs.r0][cs.c0] : (el.cells.flat().find(c=>!c.covered)||el.cells[0][0]);
  const applyCells=fn=>{ commitUndo(); scopedCells().forEach(fn); renderStage(); renderProps(); };
  /* ── 格內反白（run 級）優先 ──
     正在編輯某一格、而且格內有反白文字時，樣式只套那幾個字；沒反白才退回上面的「格／全表」範圍。
     與文字框的 runApply 同一條規則（見該函式），使用者不必記兩套。 */
  const ce=(APP.cellEdit&&APP.cellEdit.id===el.id)? APP.cellEdit : null;
  const ceCell=ce? (el.cells[ce.r]||[])[ce.c] : null;
  const probe=ceCell? cellProbeRun(ceCell) : null;   // 有格內反白時，面板反映反白處的樣式
  const runOn=!!probe;
  const styleAt=(key,def)=>probe? (probe[key]!=null? probe[key] : def) : def;
  // 一律先試 run 級；回 false 代表沒有格內反白，才做格層級（setCellStyle 會順手清掉 run 覆寫）
  const applyStyle=(key,val)=>{ if(!cellRunApply(el,key,val)) applyCells(c=>setCellStyle(c,key,val)); };
  pp.appendChild(subTitle(_t('儲存格樣式')));
  // 範圍提示（反白後樣式只作用選取格）
  const scope=document.createElement('div'); scope.className='row';
  scope.innerHTML= runOn
    ? `<span class="unit">${_t('現在改的是<b>格子裡反白的那幾個字</b>（第 {0} 列第 {1} 欄）。字級、粗體、斜體、文字色，還有下面那排「格內文字」，都只套在它們身上；取消反白就回到整格。',ce.r+1,ce.c+1)}</span>`
    : cs
    ? `<span class="unit">${_t('現在改的是<b>反白的 {0} 格</b>（{1}）。點畫布別的地方取消反白，就回到整張表。',scopedCells().length,
          `R${cs.r0+1}C${cs.c0+1}`+((cs.r1!==cs.r0||cs.c1!==cs.c0)?_t(' 到 {0}',`R${cs.r1+1}C${cs.c1+1}`):''))}</span>`
    : `<span class="unit">${_t('現在改的是<b>整張表</b>。在表格裡拖曳反白幾格，下面的字級、行距、粗斜體、文字色、對齊、底色與框線就只套那幾格；雙擊進某一格、再反白幾個字，就只套那幾個字。')}</span>`;
  pp.appendChild(scope);
  const fr=document.createElement('div'); fr.className='row'; fr.innerHTML=_t('<label>字級</label>');
  const inp=document.createElement('input'); inp.type='number'; inp.min=6; inp.max=48; inp.value=styleAt('sizePt',c0.sizePt||12);
  inp.onchange=()=>{ if(!cellRunApply(el,'sizePt',+inp.value)){ commitUndo(); scopedCells().forEach(c=>setCellStyle(c,'sizePt',+inp.value)); renderStage(); } };
  fr.appendChild(inp); fr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
  pp.appendChild(fr);
  const tls=document.createElement('div'); tls.className='row'; tls.innerHTML=_t('<label>行距</label>');
  const tli=document.createElement('input'); tli.type='number'; tli.step='0.05'; tli.min='0.5'; tli.max='5'; tli.value=c0.lineSpacing||1.2;
  tli.onchange=()=>{ commitUndo(); const v=parseFloat(tli.value); scopedCells().forEach(c=>{ if(v&&Math.abs(v-1.2)>1e-6)c.lineSpacing=v; else delete c.lineSpacing; }); renderStage(); };
  tls.appendChild(tli); tls.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('×字級')}));
  pp.appendChild(tls);
  pp.appendChild(btnRow([
    ['B',()=>applyStyle('bold',!styleAt('bold',c0.bold)),_t('粗體'),styleAt('bold',c0.bold)],
    ['I',()=>applyStyle('italic',!styleAt('italic',c0.italic)),_t('斜體'),styleAt('italic',c0.italic)],
  ]));
  pp.appendChild(colorRow(_t('文字'),styleAt('color',c0.color||'1A1A1A'),
    v=>{ if(!cellRunApply(el,'color',v)) scopedCells().forEach(c=>setCellStyle(c,'color',v)); },false));
  /* 格內文字（run 級專屬）：上下標是 Excel 化學式／科學記號要能無損進來的關鍵，
     而格層級沒有這些鍵——不開這一排，JSON 以外就沒有任何路徑設得到它們。 */
  if(runOn){
    const tog=(key,label,title)=>[label,()=>cellRunApply(el,key,probe[key]?undefined:true),title,!!probe[key]];
    pp.appendChild(subTitle(_t('格內文字（反白處）')));
    pp.appendChild(btnRow([
      tog('sup','x²',_t('上標')),tog('sub','x₂',_t('下標')),
      tog('underline','U',_t('底線')),tog('strike','S',_t('刪除線')),
    ]));
    pp.appendChild(btnRow([
      [_t('高亮'),()=>cellRunApply(el,'highlight',probe.highlight?undefined:'FFFF00'),_t('黃色高亮'),!!probe.highlight],
      [_t('清除格式'),()=>cellRunApply(el,Object.fromEntries(
          ['sup','sub','underline','strike','highlight','charSpacing','fontFace','outline','glow','bold','italic','color','sizePt']
            .map(k=>[k,undefined]))),_t('把反白處退回整格的樣式')],
    ]));
  }
  pp.appendChild(btnRow([[_t('左'),()=>applyCells(c=>c.align='left'),'',(c0.align||'left')==='left'],
    [_t('中'),()=>applyCells(c=>c.align='center'),'',c0.align==='center'],
    [_t('右'),()=>applyCells(c=>c.align='right'),'',c0.align==='right']]));
  pp.appendChild(btnRow([[_t('上'),()=>applyCells(c=>c.valign='top'),'',c0.valign==='top'],
    [_t('中'),()=>applyCells(c=>c.valign='middle'),'',(c0.valign||'middle')==='middle'],
    [_t('下'),()=>applyCells(c=>c.valign='bottom'),'',c0.valign==='bottom']]));
  pp.appendChild(colorRow(_t('底色'),c0.fill,v=>scopedCells().forEach(c=>c.fill=v),true));
  // ── 框線：逐格四邊，反白＝只套選取範圍，未反白＝全表；筆＝線寬＋顏色 ──
  pp.appendChild(subTitle(_t('框線')));
  const brRange=()=> cs? {r0:cs.r0,c0:cs.c0,r1:cs.r1,c1:cs.c1} : null;
  const pen=APP.tblPen;
  const penRow=document.createElement('div'); penRow.className='row'; penRow.innerHTML=_t('<label>框線筆</label>');
  const pw=document.createElement('input'); pw.type='number'; pw.step='0.25'; pw.min='0.25'; pw.max='6'; pw.value=pen.pt; pw.title=_t('線寬（pt）');
  pw.onchange=()=>{ pen.pt=Math.max(0.25,parseFloat(pw.value)||0.75); };
  penRow.appendChild(pw); penRow.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
  const psw=document.createElement('button'); psw.className='swatchBtn'; psw.title=_t('框線顏色'); psw.style.background='#'+pen.color;
  psw.onclick=()=>openPalette(psw,pen.color,hex=>{ pen.color=hex; psw.style.background='#'+hex; });
  penRow.appendChild(psw);
  penRow.appendChild(checkRow([[_t('虛線'),()=>pen.dash,v=>{ pen.dash=v; },_t('虛線框線（匯出 prstDash sysDash）')]]).firstChild);
  pp.appendChild(penRow);
  const bBtn=(label,mode,title)=>[label,()=>applyBorder(el,brRange(),mode, mode==='none'?null:{pt:pen.pt,color:pen.color,dash:pen.dash}),title];
  pp.appendChild(btnRow([bBtn(_t('全部'),'all',_t('所有格線')),bBtn(_t('外框'),'outer',_t('範圍外周')),bBtn(_t('內部'),'inner',_t('範圍內部格線'))]));
  pp.appendChild(btnRow([bBtn(_t('上'),'top'),bBtn(_t('下'),'bottom'),bBtn(_t('左'),'left'),bBtn(_t('右'),'right'),bBtn(_t('無'),'none',_t('清除框線'))]));
  const brNote=document.createElement('div'); brNote.className='row';
  brNote.innerHTML='<span class="unit">'+_t('每一格的四邊各自獨立，線寬與顏色也是；現在<b>{0}</b>。相鄰兩格的共用邊會自動同步，所以畫布上看到的就是匯出結果。',
    cs?_t('套在反白的 {0} 格',scopedCells().length):_t('套在整張表'))+'</span>';
  pp.appendChild(brNote);
  // 合併儲存格：改用畫布拖曳反白＋就近按鈕（見下方提示），不再用側欄數字框
  pp.appendChild(subTitle(_t('合併')));
  const mh=document.createElement('div'); mh.className='row';
  mh.innerHTML=_t('<span class="unit">在表格裡拖曳，反白要合併的那幾格，按反白框旁浮出來的<b>「合併儲存格」</b>。反白單一一個已經合併的格子，那顆鈕會變成<b>「取消合併」</b>。搬動整張表請抓最外圈的邊框。</span>');
  pp.appendChild(mh);
  const note=document.createElement('div'); note.className='row';
  note.innerHTML=_t('<span class="unit">更細的東西（例如同一格裡混用好幾種樣式）也可以直接寫 JSON。</span>');
  pp.appendChild(note);
}
