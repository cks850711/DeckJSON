'use strict';
/* ================= 屬性面板：文字 ================= */
/* 文字框，以及帶文字的形狀：字元、段落、清單、內距 */
function propsText(pp,el){
  const b=panelRun(el);   // 編輯中有選取時＝選取起點那個 run 的樣式，否則＝元素第一個 run
  const ta=document.createElement('textarea'); ta.rows=3;
  ta.title=_t('純文字覆寫整個文字框（會清掉格內混排格式）。要只改幾個字的格式，請在畫布上雙擊、反白後用下面的按鈕。');
  ta.value=plainText(el);
  ta.onchange=()=>{
    // 這條路一定會攤平（純文字沒有格式資訊），所以混排時先問過再做
    const mixed=(el.paras||[]).some(p=>(p.runs||[]).some(r=>!sameStyle(r,el.paras[0].runs[0])));
    if(mixed&&!confirm(_t('純文字覆寫會清掉這個文字框的混排格式（粗體、顏色、連結…），確定要覆寫嗎？'))){ ta.value=plainText(el); return; }
    commitUndo(); el.paras=mkParas(ta.value,baseRun(el)); renderStage(); renderProps();
  };
  pp.appendChild(ta);
  const row=document.createElement('div'); row.className='row';
  row.innerHTML=_t('<label>字級</label>');
  const inp=document.createElement('input'); inp.type='number'; inp.min=6; inp.max=96; inp.value=b.sizePt;
  inp.onchange=()=>{ commitUndo(); runApply(el,r=>r.sizePt=+inp.value); renderStage(); };
  row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
  pp.appendChild(row);
  const lsr=document.createElement('div'); lsr.className='row'; lsr.innerHTML=_t('<label>行距</label>');
  const lsi=document.createElement('input'); lsi.type='number'; lsi.step='0.05'; lsi.min='0.5'; lsi.max='5'; lsi.value=el.lineSpacing||1.2;
  lsi.onchange=()=>{ commitUndo(); const v=parseFloat(lsi.value); el.lineSpacing=(v&&Math.abs(v-1.2)>1e-6)?v:undefined; if(el.lineSpacing===undefined)delete el.lineSpacing; renderStage(); };
  lsr.appendChild(lsi); lsr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('×字級')}));
  pp.appendChild(lsr);
  pp.appendChild(btnRow([
    ['B',()=>{ commitUndo(); const on=!b.bold; runApply(el,r=>r.bold=on); renderStage(); renderProps(); },_t('粗體（畫布上反白幾個字，就只套那幾個字）'),b.bold],
    ['I',()=>{ commitUndo(); const on=!b.italic; runApply(el,r=>r.italic=on); renderStage(); renderProps(); },_t('斜體（同上，可只套選取範圍）'),b.italic],
    ['U',()=>{ commitUndo(); const on=!b.underline; setRunOpt(el,'underline',on||undefined); renderStage(); renderProps(); },_t('底線'),!!b.underline],
    ['S',()=>{ commitUndo(); const on=!b.strike; setRunOpt(el,'strike',on||undefined); renderStage(); renderProps(); },_t('刪除線'),!!b.strike],
  ]));
  pp.appendChild(colorRow(_t('文字'),b.color,v=>runApply(el,r=>r.color=v),false));
  pp.appendChild(colorRow(_t('高亮'),b.highlight||null,v=>setRunOpt(el,'highlight',v||undefined),true));
  pp.appendChild(btnRow([[_t('左'),()=>{commitUndo();runApply(el,(r,p)=>p.align='left');renderStage();renderProps();},'',b.align==='left'],
    [_t('中'),()=>{commitUndo();runApply(el,(r,p)=>p.align='center');renderStage();renderProps();},'',b.align==='center'],
    [_t('右'),()=>{commitUndo();runApply(el,(r,p)=>p.align='right');renderStage();renderProps();},'',b.align==='right']]));
  pp.appendChild(btnRow([[_t('上'),()=>{commitUndo();el.valign='top';renderStage();renderProps();},'',(el.valign||'top')==='top'],
    [_t('中'),()=>{commitUndo();el.valign='middle';renderStage();renderProps();},'',el.valign==='middle'],
    [_t('下'),()=>{commitUndo();el.valign='bottom';renderStage();renderProps();},'',el.valign==='bottom']]));
  pp.appendChild(colorRow(_t('底色'),el.fill,v=>el.fill=v,true));
  pp.appendChild(gradRows(el));
  pp.appendChild(colorRow(_t('框線'),el.lineColor,v=>el.lineColor=v,true));
  if(el.lineColor!=null) pp.appendChild(dashRow(el));
  // 文字框內距與換行：目前預設 0 內距、自動換行（與舊版行為一致），有需要才調
  pp.appendChild(numRow(_t('內距'),el.inset||0,v=>{ if(v>0) el.inset=v; else delete el.inset; },
    {min:0,max:72,step:1,unit:'pt',title:_t('文字與框邊的距離（匯出為 bodyPr 的 lIns/tIns/rIns/bIns）。有填色的卡片式文字框很有感')}));
  pp.appendChild(checkRow([[_t('不自動換行'),()=>!!el.nowrap,v=>{ commitUndo();
    if(v) el.nowrap=true; else delete el.nowrap; renderStage(); renderProps(); },
    _t('文字超出框寬不折行（匯出 bodyPr wrap="none"）；適合單行標籤')]]));
  // 文字方向（直書／旋轉）：匯出為原生 bodyPr vert，不是把文字框整個轉角度
  {const vr=document.createElement('div'); vr.className='row'; vr.innerHTML=_t('<label>文字方向</label>');
   const vs=document.createElement('select'); vs.style.flex='1';
   vs.innerHTML='<option value="">'+_t('橫書')+'</option>'+Object.entries(VERT_MODES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
   vs.value=el.vert||'';
   vs.title=_t('匯出為原生 <a:bodyPr vert>：文字在框內轉向，框本身不轉（要轉整個框請用「旋轉」）');
   vs.onchange=()=>{ commitUndo();
     if(VERT_MODES[vs.value]) el.vert=vs.value; else delete el.vert;
     renderStage(); renderProps(); syncPageJson(); };
   vr.appendChild(vs); pp.appendChild(vr);}
  // ── 字元進階：字距／自訂字型／描邊／輝光（皆 run 級，套用到本元素全部 run）──
  pp.appendChild(subTitle(_t('字元進階')));
  pp.appendChild(numRow(_t('字距'),b.charSpacing||0,v=>setRunOpt(el,'charSpacing',v||undefined),
    {min:-5,max:30,step:0.5,unit:'pt',title:_t('字元間距（正值拉寬、負值收緊）')}));
  const ffr=document.createElement('div'); ffr.className='row'; ffr.innerHTML=_t('<label>字型</label>');
  const ffi=document.createElement('input'); ffi.type='text'; ffi.style.flex='1'; ffi.style.minWidth='80px';
  ffi.placeholder=_t('沿用全域'); ffi.value=b.fontFace||'';
  ffi.title=_t('只覆寫此元素的字型（留空＝沿用頂端「字體」模式設定）。匯出時 latin/ea/cs 三槽都用此字型。');
  ffi.onchange=()=>{ commitUndo(); setRunOpt(el,'fontFace',ffi.value.trim()||undefined); renderStage(); renderProps(); };
  ffr.appendChild(ffi); pp.appendChild(ffr);
  pp.appendChild(checkRow([
    [_t('描邊'),()=>!!b.outline,v=>{ commitUndo(); setRunOpt(el,'outline', v?{size:1,color:'FFFFFF'}:undefined); renderStage(); renderProps(); },_t('文字外框描邊（海報式大字）')],
    [_t('輝光'),()=>!!b.glow,v=>{ commitUndo(); setRunOpt(el,'glow', v?{size:8,color:'FFFF00',opacity:0.6}:undefined); renderStage(); renderProps(); },_t('文字外緣輝光')],
  ]));
  if(b.outline){
    pp.appendChild(colorRow(_t('描邊色'),b.outline.color||'FFFFFF',v=>setRunOpt(el,'outline',{...b.outline,color:v}),false));
    pp.appendChild(numRow(_t('描邊寬'),b.outline.size||1,v=>setRunOpt(el,'outline',{...b.outline,size:Math.max(0.25,v)}),{min:0.25,max:8,step:0.25,unit:'pt'}));
  }
  if(b.glow){
    pp.appendChild(colorRow(_t('輝光色'),b.glow.color||'FFFF00',v=>setRunOpt(el,'glow',{...b.glow,color:v}),false));
    pp.appendChild(numRow(_t('輝光徑'),b.glow.size||8,v=>setRunOpt(el,'glow',{...b.glow,size:Math.max(1,v)}),{min:1,max:50,step:1,unit:'pt'}));
  }
  // ── 段落：項目符號／編號、縮排層級、段前後間距 ──
  pp.appendChild(subTitle(_t('段落')));
  const buType=(b.bullet&&b.bullet.type)||null;
  const setBullet=v=>{ commitUndo(); runApply(el,(r,p)=>{ if(v) p.bullet=v; else delete p.bullet; }); renderStage(); renderProps(); };
  pp.appendChild(btnRow([
    [_t('無'),()=>setBullet(null),_t('不使用清單'),!buType],
    [_t('• 符號'),()=>setBullet({type:'bullet',level:(b.bullet&&b.bullet.level)||0}),_t('項目符號清單'),buType==='bullet'],
    [_t('1. 編號'),()=>setBullet({type:'number',level:(b.bullet&&b.bullet.level)||0,startAt:1}),_t('編號清單'),buType==='number'],
  ]));
  if(buType){
    const lv=(b.bullet.level|0);
    const lvRow=btnRow([
      ['−',()=>setBullet({...b.bullet,level:Math.max(0,lv-1)}),_t('減少縮排層級')],
      [_t('＋'),()=>setBullet({...b.bullet,level:Math.min(8,lv+1)}),_t('增加縮排層級')],
    ]);
    lvRow.insertBefore(Object.assign(document.createElement('label'),{textContent:_t('縮排')}),lvRow.firstChild);
    lvRow.appendChild(Object.assign(document.createElement('span'),{className:'unit',
      textContent:_t('層級 {0}（每層 {1}pt）',lv+1,BULLET_INDENT)}));
    pp.appendChild(lvRow);
  }
  pp.appendChild(numRow(_t('段前'),(b.spaceBefore)||0,v=>runApply(el,(r,p)=>{ if(v>0)p.spaceBefore=v; else delete p.spaceBefore; }),{min:0,max:72,step:1,unit:'pt',title:_t('段落上方額外間距')}));
  pp.appendChild(numRow(_t('段後'),(b.spaceAfter)||0,v=>runApply(el,(r,p)=>{ if(v>0)p.spaceAfter=v; else delete p.spaceAfter; }),{min:0,max:72,step:1,unit:'pt',title:_t('段落下方額外間距')}));
  // ── 超連結：外部網址或跳到本簡報某頁 ──
  pp.appendChild(subTitle(_t('超連結')));
  const lkr=document.createElement('div'); lkr.className='row'; lkr.innerHTML=_t('<label>連結</label>');
  const lki=document.createElement('input'); lki.type='text'; lki.style.flex='1'; lki.style.minWidth='80px';
  lki.placeholder=_t('https://… 或 #3');
  lki.value= b.link? (b.link.url||('#'+b.link.slide)) : '';
  lki.title=_t('填網址；或填「#頁碼」跳到本簡報該頁。PptxGenJS 會自動補底線（預覽同步顯示）。');
  lki.onchange=()=>{ commitUndo(); const v=lki.value.trim();
    setRunOpt(el,'link', !v? undefined : (v[0]==='#'? {slide:Math.max(1,Math.round(+v.slice(1))||1)} : {url:v}));
    renderStage(); renderProps(); };
  lkr.appendChild(lki); pp.appendChild(lkr);
  if(el.type==='shape') pp.appendChild(linkRows(el,_t('形狀')));   // 有文字的形狀：整塊也可設連結
  pp.appendChild(shadowRows(el));
}
