'use strict';
/* ================= 屬性面板 ================= */
/* 本檔：多選面板、分頁與重繪節奏、renderPropsBody()（依選取分派＋所有元素共用的位置尺寸／變形／排列／動作）。
   各類型元素的專屬段落在 ui/props-<類型>.js，共用控件在 ui/props-widgets.js，色票在 ui/palette.js。 */
function renderMultiProps(pp){
  const els=selEls();
  const gid=els[0]&&els[0].groupId;
  const isGroup=!!gid&&els.every(el=>el.groupId===gid)&&groupMembers(els[0]).length===els.length;
  pp.innerHTML=`<h4>${isGroup?_t('軟群組 {0} 個物件',els.length):_t('多選 {0} 個物件',els.length)}`
    +(isGroup?` <span class="unit" style="font-weight:400">${gid}</span>`:'')+`</h4>`;
  /* 位置尺寸：軟群組沒有自己的 x/y/w/h（成員各自獨立，匯出時攤平），這裡顯示的是**包圍盒**。
     改 X／Y＝整組平移；改寬／高＝以包圍盒左上角為不動點縮放整組，與拖四角把手同一個模型。 */
  pp.appendChild(secTitle(_t('位置尺寸（包圍盒）'),true));
  pp.appendChild(dimUnitRow());
  const moveAll=(ax,ay)=>{ for(const el of selEls()){ el.x=Math.round(el.x+ax); el.y=Math.round(el.y+ay); } };
  pp.appendChild(dimRow('X',()=>groupBBox(selEls()).x,v=>moveAll(v-groupBBox(selEls()).x,0)));
  pp.appendChild(dimRow('Y',()=>groupBBox(selEls()).y,v=>moveAll(0,v-groupBBox(selEls()).y)));
  const scaleBB=(fx,fy)=>{
    const list=selEls(), bb=groupBBox(list);
    if(!(bb.w>0)||!(bb.h>0)) return;
    if(APP.ratioLock){ const f=(fx!==1)?fx:fy; fx=f; fy=f; }   // 比例鎖定：改一邊另一邊跟著等比
    groupScaleXY({anchor:{x:bb.x,y:bb.y},orig:list.map(el=>structuredClone(el)),scaleFont:APP.fontSync},fx,fy);
  };
  pp.appendChild(dimRow(_t('寬'),()=>groupBBox(selEls()).w,v=>{ const bb=groupBBox(selEls()); if(v>0&&bb.w>0) scaleBB(v/bb.w,1); }));
  pp.appendChild(dimRow(_t('高'),()=>groupBBox(selEls()).h,v=>{ const bb=groupBBox(selEls()); if(v>0&&bb.h>0) scaleBB(1,v/bb.h); }));
  pp.appendChild(checkRow([
    [_t('比例鎖定'),()=>APP.ratioLock,v=>APP.ratioLock=v,_t('鎖包圍盒寬高比：改一邊另一邊等比跟著變')],
    [_t('字級同步'),()=>APP.fontSync,v=>APP.fontSync=v,_t('改包圍盒尺寸時，組內文字的字級一起放大縮小')],
  ]));
  pp.appendChild(secTitle(_t('變形')));
  pp.appendChild(btnRow([
    [_t('橫中'),()=>{ commitUndo(); const bb=groupBBox(selEls()); moveAll(Math.round((STAGE_W-bb.w)/2)-bb.x,0); renderStage(); renderProps(); },_t('整組在投影片水平置中（組內相對位置不變）')],
    [_t('縱中'),()=>{ commitUndo(); const bb=groupBBox(selEls()); moveAll(0,Math.round((STAGE_H-bb.h)/2)-bb.y); renderStage(); renderProps(); },_t('整組在投影片垂直置中')],
  ]));
  const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>縮放</label>');
  const inp=document.createElement('input'); inp.type='number'; inp.min=5; inp.max=1000; inp.value=100; inp.step=5;
  inp.onchange=()=>{ const s=(+inp.value)/100; if(!(s>0))return; commitUndo();
    const bb=groupBBox(selEls()); groupScaleTo({anchor:{x:bb.x+bb.w/2,y:bb.y+bb.h/2},orig:selEls().map(el=>structuredClone(el))},s);
    inp.value=100; updateSelBox(); };
  row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:_t('%（比例）')}));
  pp.appendChild(row);
  pp.appendChild(opacityRow(els));
  pp.appendChild(secTitle(_t('對齊與分佈')));
  const alignH=(mode)=>{ commitUndo(); const bb=groupBBox(selEls());
    for(const el of selEls()){ const {w}=elSize(el);
      el.x=Math.round(mode==='l'?bb.x: mode==='c'?bb.x+(bb.w-w)/2 : bb.x+bb.w-w); }
    renderStage(); };
  const alignV=(mode)=>{ commitUndo(); const bb=groupBBox(selEls());
    for(const el of selEls()){ const {h}=elSize(el);
      el.y=Math.round(mode==='t'?bb.y: mode==='m'?bb.y+(bb.h-h)/2 : bb.y+bb.h-h); }
    renderStage(); };
  pp.appendChild(btnRow([[_t('左'),()=>alignH('l'),_t('左對齊')],[_t('中'),()=>alignH('c'),_t('水平置中')],[_t('右'),()=>alignH('r'),_t('右對齊')]]));
  pp.appendChild(btnRow([[_t('上'),()=>alignV('t'),_t('上對齊')],[_t('中'),()=>alignV('m'),_t('垂直置中')],[_t('下'),()=>alignV('b'),_t('下對齊')]]));
  // 等距分佈：首尾固定、中間平均間隙（需≥3）
  const distribute=(axis)=>{
    const list=selEls(); if(list.length<3) return; commitUndo();
    const m=list.map(el=>{ const {w,h}=elSize(el); return {el,w,h}; });
    m.sort((a,b)=> axis==='h'? a.el.x-b.el.x : a.el.y-b.el.y);
    const total=m.reduce((s,o)=> s+(axis==='h'?o.w:o.h),0);
    const span= axis==='h'? (m[m.length-1].el.x+m[m.length-1].w)-m[0].el.x
                          : (m[m.length-1].el.y+m[m.length-1].h)-m[0].el.y;
    const gap=(span-total)/(m.length-1);
    let cur= axis==='h'? m[0].el.x : m[0].el.y;
    for(const o of m){ if(axis==='h'){ o.el.x=Math.round(cur); cur+=o.w+gap; } else { o.el.y=Math.round(cur); cur+=o.h+gap; } }
    renderStage();
  };
  pp.appendChild(btnRow([[{ic:'ic-dist-h',txt:_t('水平等距')},()=>distribute('h'),_t('水平方向等間距（需 ≥3 個）')],[{ic:'ic-dist-v',txt:_t('垂直等距')},()=>distribute('v'),_t('垂直方向等間距（需 ≥3 個）')]]));
  pp.appendChild(secTitle(_t('群組與動作')));
  // 軟群組
  pp.appendChild(btnRow([
    [_t('群組'),()=>{ commitUndo(); const gid=uid('g'); for(const el of selEls()) el.groupId=gid; renderStage(); renderProps(); },_t('綁為軟群組：日後點任一即選全組')],
    ...(els.some(el=>el.groupId)? [[_t('解散'),()=>{ commitUndo(); for(const el of selEls()) delete el.groupId; renderStage(); renderProps(); },_t('解除群組')]] : []),
  ]));
  pp.appendChild(btnRow([[_t('複製'),()=>duplicateSelected(),'Cmd/Ctrl+D'],[_t('刪除'),()=>deleteSelected(),'Delete']]));
  const note=document.createElement('div'); note.className='row';
  note.innerHTML='<span class="unit">'+_t('拖四角是整組等比縮放，拖本體是整組搬移，吸附作用在包圍盒上。'
    +'上面的 X／Y／寬／高講的也是<b>包圍盒</b>——群組本身沒有座標，成員各自獨立，匯出時會攤平成獨立元素。'
    +'要改其中一個成員，雙擊進去。')+'</span>';
  pp.appendChild(note);
}
/* ---- 面板跟著游標／選取走 ----
   游標移動或反白範圍改變時，原本只更新 APP.edit.sel／APP.cellSel，面板不重繪，
   於是面板一直停在上一次的狀態——非得隨便按一個設定（那個 handler 順手呼叫了 renderProps）
   才會突然更新，看起來就是「每項調整都慢半拍」。
   但也不能無條件重繪：拖曳反白時 selectionchange 每一像素都會觸發，而 renderProps 是整個
   重建 #propPanel，會把使用者正在操作的控制項抽掉。故設三道閘。*/
/* ══ 右欄分頁 ══
   renderProps 產生的是**扁平**節點（H4／secTitle／subTitle／row…全在同一層），所以分頁
   做成事後處理：切群組 → 依標題歸頁 → 搬進 pane。renderProps 那 799 行一行都不用改，
   新增的區塊最差也只是落到預設頁，不會消失。

   為什麼要切到 subTitle 而不只是 secTitle：實測選中表格時「表格」這一個 secTitle 區塊
   自己就 1026px（全欄 1538px），只按 secTitle 分頁的話那一頁照樣要捲。切到 subTitle 後
   三頁分別是 670／480／546px，都在可見高度內。 */
/* 分頁的語意（2026-09-05 重整）：
   第一頁＝與內容無關的操作（位置、變形、層級、對齊、複製刪除）
   中間頁＝這個型別特有的內容與樣式，頁名就是型別名
   最後一頁＝所有型別都有的效果（超連結、陰影）
   舊分法是固定的「排列／樣式／型別名」三頁，名字對不上內容：「形狀」頁裡
   沒有形狀（形狀樣式被『樣式』頁認領走，只剩超連結與陰影），而圖表與影片
   因為沒有區塊落進『樣式』，分頁列會從三顆掉成兩顆。 */
const TAB_SEL_ARRANGE=[_t('位置尺寸'),_t('位置尺寸（包圍盒）'),_t('變形'),_t('排列'),_t('對齊與分佈')];
const TAB_SEL_ACT=[_t('動作'),_t('群組與動作')];   // 不進分頁，釘在面板底部
const TAB_SEL_FX=[_t('超連結'),_t('超連結（整個物件）'),_t('陰影')];
const TAB_SEL_CELL=[_t('儲存格樣式'),_t('框線'),_t('格內文字（反白處）')];
const TAB_SEL_PARA=[_t('字元進階'),_t('段落')];
const TAB_NONE_PAGE=[_t('頁面樣式'),_t('章節'),_t('備忘稿'),_t('範本與合併')];
/* 無選取時有 15 個區塊、共 2072px，三頁分不平（「簡報」那頁實測仍要捲 136px），故拆四頁。
   四個兩字頁籤在 220px 欄寬下各佔約 53px，剛好放得下。
   三個壓縮區塊歸「工具」而非「輸出」：它們是對簡報動手術（不可逆地重編碼位元組），
   不是匯出時的設定；擺在一起也方便比較「本頁／整份／背景圖」三者的現況。
   ⚠ 量分頁高度時不能用 pane.scrollHeight：.propPane 是 flex:1，內容再短也被拉滿，
   量到的永遠等於可用高度。要量「首子元素 top → 末子元素 bottom」，且一次只開一個 pane。
   照這個量法，四頁實際是 367／601／455／289px（可用 668px），都不必捲。 */
const TAB_NONE_TOOL=[_t('圖片壓縮（本頁）'),_t('圖片壓縮（整份簡報）'),_t('背景圖壓縮（整份簡報）')];
const TAB_CONTENT_NAME={text:_t('文字'),shape:_t('形狀'),table:_t('表格'),image:_t('圖片'),chart:_t('圖表'),video:_t('影片')};
const propTabMem={sel:0,none:0};   // 分頁選擇要撐過重繪——renderProps 每次改動都全量重建
function applyPropTabs(){
  const pp=$('#propPanel');
  const kids=[...pp.childNodes];
  if(!kids.length) return;
  const head=(kids[0].nodeType===1&&kids[0].tagName==='H4')? kids.shift() : null;
  // 切群組：secTitle／subTitle 各開一段，之後的節點都歸該段
  const groups=[]; let cur=null;
  for(const n of kids){
    const c=n.nodeType===1&&n.classList;
    if(c&&(c.contains('secTitle')||c.contains('subTitle'))){ cur={t:n.textContent.trim(),nodes:[]}; groups.push(cur); }
    if(!cur){ cur={t:'',nodes:[]}; groups.push(cur); }
    cur.nodes.push(n);
  }
  // 動作段抽出來釘底部，不參與分頁裝箱
  const actGroups=groups.filter(g=>TAB_SEL_ACT.includes(g.t));
  if(actGroups.length){
    const keep=new Set(actGroups);
    for(let i=groups.length-1;i>=0;i--) if(keep.has(groups[i])) groups.splice(i,1);
  }
  const mode=APP.selIds.length? 'sel' : 'none';
  const el=APP.selIds.length===1? selEl() : null;
  // null ＝這一頁收容所有沒被前面認領的區塊
  // 型別名：形狀若是線條類，內容區塊叫「線條樣式」，頁名跟著叫「線條」
  const typeName= el? (isLineEl(el)? _t('線條') : (TAB_CONTENT_NAME[el.type]||_t('內容'))) : _t('內容');
  const hasText= el&&(el.type==='text'||(el.type==='shape'&&el.paras));
  const defs= mode==='sel'
    ? (el&&el.type==='table'
        // 表格區塊多且高（單「表格」一段就 1026px），拆成結構與儲存格兩頁
        ? [[_t('版面'),TAB_SEL_ARRANGE],[_t('表格'),null],[_t('儲存格'),TAB_SEL_CELL],[_t('效果'),TAB_SEL_FX]]
      : hasText
        // 文字樣式＋字元進階＋段落合起來 774px，矮一點的視窗就要捲，故段落另立一頁
        ? [[_t('版面'),TAB_SEL_ARRANGE],[typeName,null],[_t('段落'),TAB_SEL_PARA],[_t('效果'),TAB_SEL_FX]]
        : [[_t('版面'),TAB_SEL_ARRANGE],[typeName,null],[_t('效果'),TAB_SEL_FX]])
    // 「簡報」「輸出」兩頁的內容 2026-09-05 搬進「全簡報設定」面板，右欄只留每天在用的
    : [[_t('頁面'),null],[_t('工具'),TAB_NONE_TOOL]];
  const fb=defs.findIndex(d=>d[1]===null);
  const buckets=defs.map(()=>[]);
  for(const g of groups){
    let i=g.t? defs.findIndex(d=>d[1]&&d[1].includes(g.t)) : 0;
    buckets[i<0? fb : i].push(g);
  }
  pp.innerHTML='';
  const addFoot=()=>{ if(!actGroups.length) return;
    const foot=document.createElement('div'); foot.id='propFoot';
    actGroups.forEach(g=>g.nodes.forEach(n=>foot.appendChild(n)));
    const s0=foot.querySelector('.secTitle'); if(s0) s0.classList.add('first');
    pp.appendChild(foot); };
  if(head){ const hd=document.createElement('div'); hd.id='propHead'; hd.appendChild(head); pp.appendChild(hd); }
  const fill=(pane,gs)=>{ gs.forEach(g=>g.nodes.forEach(n=>pane.appendChild(n)));
    // 每頁的第一個 secTitle 都要是 .first（沒有上邊框），否則每頁開頭都多一條線
    const secs=[...pane.querySelectorAll('.secTitle')];
    secs.forEach((n,i)=>n.classList.toggle('first',i===0)); };
  const live=defs.map((d,i)=>[d[0],buckets[i]]).filter(x=>x[1].length);
  if(live.length<=1){   // 只有一頁（如多選）就不擺分頁列，省一行高度
    const pane=document.createElement('div'); pane.className='propPane';
    live.forEach(([,gs])=>fill(pane,gs)); pp.appendChild(pane); addFoot(); return;
  }
  const bar=document.createElement('div'); bar.id='propTabs';
  const panes=[];
  const sync=()=>{ const k=Math.min(propTabMem[mode]||0,panes.length-1);
    panes.forEach(([b,pn],j)=>{ b.classList.toggle('on',j===k); pn.hidden=j!==k; }); };
  live.forEach(([name,gs],i)=>{
    const b=document.createElement('button'); b.className='propTab'; b.textContent=name;
    b.onclick=()=>{ propTabMem[mode]=i; sync(); };
    const pane=document.createElement('div'); pane.className='propPane'; fill(pane,gs);
    bar.appendChild(b); panes.push([b,pane]);
  });
  pp.appendChild(bar); panes.forEach(([,pn])=>pp.appendChild(pn)); addFoot();
  sync();
}
function renderProps(){ renderPropsBody(); applyPropTabs(); }
function propsSig(){
  const el=selEl();
  if(!el) return 'none';
  const ce=APP.cellEdit;
  return el.id+'|'+JSON.stringify(APP.cellSel||null)
    +'|'+(ce? ce.r+','+ce.c+','+JSON.stringify(ce.sel||null) : '')   // 格內反白改變→面板要跟著換範圍提示與樣式
    +'|'+(el.paras? JSON.stringify(panelRun(el)) : '');
}
let _propsSig='', _propsRaf=0;
function syncProps(){
  if(_propsRaf) return;                                   // 閘三：同一幀只做一次
  _propsRaf=requestAnimationFrame(()=>{
    _propsRaf=0;
    if($('#propPanel').contains(document.activeElement)) return;   // 閘一：正在操作面板
    if(!$('#palettePop').hidden) return;                           // 色票開著時重建會失去對象
    if(propsSig()===_propsSig) return;                             // 閘二：顯示內容沒變
    renderProps();
  });
}
function renderPropsBody(){
  _propsSig=propsSig();
  const pp=$('#propPanel'); pp.innerHTML='';
  if(APP.selIds.length>1){ renderMultiProps(pp); updateCopyPalWin(); return; }
  const el=selEl();
  if(!el&&APP.masterEdit){ propsMasterPage(pp); return; }
  if(!el){ propsPage(pp); return; }
  const names={text:_t('文字框'),table:_t('表格'),image:_t('圖片'),shape:_t('形狀'),chart:_t('圖表'),video:_t('影片')};
  pp.innerHTML=`<h4>${names[el.type]||el.type} <span class="unit" style="font-weight:400">${el.id}</span></h4>`;
  const sz=elSize(el);
  pp.appendChild(secTitle(_t('位置尺寸'),true));
  pp.appendChild(dimUnitRow());
  pp.appendChild(dimRow('X',()=>el.x,v=>el.x=Math.round(v)));
  pp.appendChild(dimRow('Y',()=>el.y,v=>el.y=Math.round(v)));
  pp.appendChild(dimRow(_t('寬'),()=>elSize(el).w,v=>applyDim(el,true,v)));
  pp.appendChild(dimRow(_t('高'),()=>elSize(el).h,v=>applyDim(el,false,v)));
  if(el.type==='text') pp.appendChild(btnRow([[_t('貼合內容'),fitSelected,
    _t('把框縮放到剛好裝下文字：橫書調高、直書調寬。\n也可以直接雙擊框邊中間的把手（固定對邊）。')]]));
  if(el.type==='table') pp.appendChild(btnRow([[_t('列高貼合內容'),fitSelected,
    _t('每一列調成剛好裝下文字，再上下留約 5px 的空隙，列會變高也會變矮。\n儲存格上下沒有內距，不留空隙字會貼著框線。')]]));
  if(el.type!=='image'&&!isLineEl(el)) pp.appendChild(checkRow([
    [_t('比例鎖定'),()=>APP.ratioLock,v=>APP.ratioLock=v,_t('鎖寬高比：改一邊或拖曳 resize 時另一邊等比放大')],
    [_t('字級同步'),()=>APP.fontSync,v=>APP.fontSync=v,_t('改尺寸／拖曳 resize 時字級一起放大')],
  ]));
  // 縮放滑桿（0.1–2.0×，停頓於 0.5/0.8/1.0/1.2/1.5）＋含字級（預設開）；放開歸回 1.0×
  pp.appendChild(secTitle(_t('變形')));
  const scWrap=document.createElement('div'); scWrap.className='row'; scWrap.style.flexWrap='wrap'; scWrap.innerHTML=_t('<label>縮放</label>');
  const sl=document.createElement('input'); sl.type='range'; sl.min='0.1'; sl.max='2'; sl.step='0.01'; sl.value='1'; sl.style.flex='1'; sl.style.minWidth='90px'; sl.setAttribute('list','scaleTicks');
  const scVal=Object.assign(document.createElement('span'),{className:'unit'}); scVal.textContent='1.00×';
  const DET=[0.5,0.8,1,1.2,1.5]; let scOrig=null;
  sl.addEventListener('pointerdown',()=>{ scOrig=structuredClone(el); });
  sl.oninput=()=>{ let v=parseFloat(sl.value);
    for(const d of DET){ if(Math.abs(v-d)<0.03){ v=d; sl.value=d; break; } }   // 停頓感
    if(!scOrig) scOrig=structuredClone(el);
    scVal.textContent=v.toFixed(2)+'×';
    groupScaleTo({anchor:{x:scOrig.x,y:scOrig.y},orig:[structuredClone(scOrig)],scaleFont:APP.scaleFont},v);
    updateSelBox();
  };
  sl.onchange=()=>{ const v=parseFloat(sl.value);
    if(scOrig&&Math.abs(v-1)>1e-6){   // 還原→commit→重套，確保 undo 一步回原尺寸
      const cur=curEls().find(e=>e.id===el.id);
      if(cur){ Object.keys(cur).forEach(k=>delete cur[k]); Object.assign(cur,structuredClone(scOrig)); }
      commitUndo();
      groupScaleTo({anchor:{x:scOrig.x,y:scOrig.y},orig:[structuredClone(scOrig)],scaleFont:APP.scaleFont},v);
    }
    scOrig=null; sl.value=1; renderProps();
  };
  const scChk=document.createElement('label'); scChk.style.cssText='display:flex;align-items:center;gap:3px;min-width:auto;cursor:pointer'; scChk.title=_t('縮放時字級一起放大');
  const scCb=document.createElement('input'); scCb.type='checkbox'; scCb.checked=APP.scaleFont; scCb.style.width='auto'; scCb.onchange=()=>APP.scaleFont=scCb.checked;
  scChk.appendChild(scCb); scChk.appendChild(document.createTextNode(_t('含字級')));
  scWrap.appendChild(sl); scWrap.appendChild(scVal); scWrap.appendChild(scChk);
  pp.appendChild(scWrap);
  pp.appendChild(opacityRow([el]));
  pp.appendChild(btnRow([
    [_t('橫中'),()=>{ commitUndo(); el.x=Math.round((STAGE_W-elSize(el).w)/2); renderStage(); renderProps(); },_t('水平置中')],
    [_t('縱中'),()=>{ commitUndo(); el.y=Math.round((STAGE_H-elSize(el).h)/2); renderStage(); renderProps(); },_t('垂直置中')],
  ]));
  // 旋轉／翻轉（圖片與面狀形狀；線條類方向由端點控制）
  if(el.type==='image'||(el.type==='shape'&&!isLineEl(el))){
    const rr=document.createElement('div'); rr.className='row'; rr.innerHTML=_t('<label>角度</label>');
    const ri=document.createElement('input'); ri.type='number'; ri.step='0.1'; ri.value=el.rot||0;
    ri.onchange=()=>{ commitUndo(); el.rot=((parseFloat(ri.value)||0)%360+360)%360; renderStage(); renderProps(); };
    rr.appendChild(ri); rr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'°'}));
    rr.appendChild(setIcoBtn(Object.assign(document.createElement('button'),{
      onclick:()=>{ commitUndo(); el.rot=(((el.rot||0)+90)%360); renderStage(); renderProps(); }}),'ic-rotate','90°',_t('順時針轉 90°')));
    pp.appendChild(rr);
    pp.appendChild(btnRow([
      [{ic:'ic-flip-h',txt:''},()=>{ commitUndo(); el.flipH=!el.flipH; renderStage(); renderProps(); },_t('水平翻轉'),!!el.flipH],
      [{ic:'ic-flip-v',txt:''},()=>{ commitUndo(); el.flipV=!el.flipV; renderStage(); renderProps(); },_t('垂直翻轉'),!!el.flipV],
    ]));
  }
  /* 幾何：編輯端點／圖形編輯器／adj 黃點微調。自成一段才不會被歸進上面的「變形」，
     那會讓它們跟著跑到「版面」分頁，而它們明明是形狀本身的事。 */
  if(el.type==='shape'&&((el.shape!=='custGeom'&&!LINE_KINDS[el.shape]&&PRESET_GEOM[el.shape])
      ||el.shape==='custGeom'||adjCount(el.shape)))
    pp.appendChild(subTitle(_t('幾何')));
  /* 內建形狀 → custGeom（等同 PowerPoint 的「編輯端點」）。
     單向不可逆，且會失去黃點與子路徑各自的填色／描邊差異，故先問清楚才做。 */
  if(el.type==='shape'&&el.shape!=='custGeom'&&!LINE_KINDS[el.shape]&&PRESET_GEOM[el.shape]){
    const r=document.createElement('div'); r.className='row';
    r.innerHTML=_t('<label>編輯端點</label>');
    const b=setIcoBtn(document.createElement('button'),'ic-pencil',_t('轉成可編輯端點'));
    b.style.flex='1';
    b.title=_t('把這個內建形狀拆成端點後進圖形編輯器（同 PowerPoint 的「編輯端點」）。單向不可逆');
    b.onclick=()=>toCustGeom(el);
    r.appendChild(b); pp.appendChild(r);
  }
  // 自訂幾何：進圖形編輯器（畫布上直接畫，不必手改 points）
  if(el.type==='shape'&&el.shape==='custGeom'){
    const r=document.createElement('div'); r.className='row';
    r.innerHTML=_t('<label>自訂幾何</label>');
    const b=setIcoBtn(document.createElement('button'),'ic-pencil',_t('開啟圖形編輯器'));
    b.style.flex='1'; b.onclick=()=>openGeomEditor(el);
    r.appendChild(b); pp.appendChild(r);
  }
  // 形狀 adj 控點（黃點微調）：圓角/斜度/箭深/桿寬/尾標等，每參數一條滑桿，即時預覽、匯出注入原生 avLst
  if(el.type==='shape'&&adjCount(el.shape)){
    const bd=adjBounds(el.shape,el.w,el.h||1);
    bd.forEach((b,mi)=>{
      if(b.fixed) return;   // 沒有黃點引用的 adj＝preset 的固定補齊值，不給使用者調
      const cur=()=>adjVals(el)[mi];
      const pct=v=>(v/1000).toFixed(1)+'%';   // adj 是 OOXML 千分比，面板顯示成百分比才讀得懂
      const ar=document.createElement('div'); ar.className='row'; ar.innerHTML=`<label>${adjLabel(el.shape,mi)}</label>`;
      const ai=document.createElement('input'); ai.type='range';
      ai.min=Math.round(b.lo); ai.max=Math.round(b.hi); ai.step=Math.max(1,Math.round((b.hi-b.lo)/400));
      ai.value=cur(); ai.style.flex='1'; ai.style.minWidth='70px';
      const av=Object.assign(document.createElement('span'),{className:'unit'}); av.textContent=pct(cur());
      let adjDirty=false;
      ai.addEventListener('pointerdown',()=>adjDirty=false);
      ai.oninput=()=>{ if(!adjDirty){ commitUndo(); adjDirty=true; } setAdj(el,mi,parseFloat(ai.value)); av.textContent=pct(cur());
        const box=stage.querySelector(`.el[data-id="${el.id}"]`); if(box) renderShapeInto(box,el); updateSelBox(); };
      ar.appendChild(ai); ar.appendChild(av);
      pp.appendChild(ar);
    });
  }
  const contentTitle= el.type==='text' ? _t('文字樣式')
    : (el.type==='shape'&&el.paras&&!isLineEl(el)) ? _t('形狀與文字樣式')   // 這段底下同時有底色／漸層／框線與字級行距
    : isLineEl(el) ? _t('線條樣式')
    : el.type==='shape' ? _t('形狀樣式')
    : el.type==='table' ? _t('表格')
    : el.type==='image' ? _t('圖片')
    : el.type==='chart' ? _t('圖表')
    : el.type==='video' ? _t('影片') : null;
  if(contentTitle) pp.appendChild(secTitle(contentTitle));

  if(el.type==='text'||(el.type==='shape'&&el.paras)) propsText(pp,el);
  if(isLineEl(el)) propsLine(pp,el);
  if(el.type==='shape'&&!isLineEl(el)&&!el.paras) propsShape(pp,el);
  if(el.type==='image') propsImage(pp,el);
  if(el.type==='video') propsVideo(pp,el);
  if(el.type==='table') propsTable(pp,el);
  if(el.type==='chart') propsChart(pp,el);
  pp.appendChild(secTitle(_t('排列')));
  const pg=curPage(); const idx=pg.elements.indexOf(el);
  pp.appendChild(btnRow([
    [{ic:'ic-front',txt:''},()=>{ commitUndo(); pg.elements.splice(idx,1); pg.elements.push(el); renderStage(); renderProps(); },_t('置頂')],
    [{ic:'ic-forward',txt:''},()=>{ if(idx>=pg.elements.length-1)return; commitUndo(); pg.elements.splice(idx,1); pg.elements.splice(idx+1,0,el); renderStage(); },_t('上移一層')],
    [{ic:'ic-backward',txt:''},()=>{ if(idx<=0)return; commitUndo(); pg.elements.splice(idx,1); pg.elements.splice(idx-1,0,el); renderStage(); },_t('下移一層')],
    [{ic:'ic-back',txt:''},()=>{ commitUndo(); pg.elements.splice(idx,1); pg.elements.unshift(el); renderStage(); },_t('置底')],
  ]));
  /* 動作列釘在面板底部（見 applyPropTabs 的 propFoot），所以壓成單列圖示：
     它每一頁都在，多佔一列高度就等於每一頁都少一列。 */
  pp.appendChild(secTitle(_t('動作')));
  const act=btnRow([
    [{ic:'ic-brush',txt:''},()=>armPainter(el),_t('複製樣式（格式刷）：武裝後點其他元素套用其字體/顏色/填色/框線')],
    [{ic:'ic-copy',txt:''},()=>duplicateEl(el),_t('複製（Cmd/Ctrl+D）')],
    [{ic:'ic-code',txt:''},()=>openPageJson(),_t('開啟本頁 JSON 面板（點畫布元素會聚焦其 JSON）')],
    ...(el.groupId? [[{ic:'ic-merge',txt:''},()=>{ commitUndo(); for(const m of groupMembers(el)) delete m.groupId; setSel([el.id]); renderStage(); renderProps(); },_t('解散群組')]] : []),
    [{ic:'ic-trash',txt:''},()=>deleteEl(el),_t('刪除（Delete）')],
  ]);
  act.lastChild.classList.add('danger');   // 刪除排最後並描紅，與其他動作拉開距離
  pp.appendChild(act);
  updateCopyPalWin();
}
