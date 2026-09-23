'use strict';
/* ================= 屬性面板：無選取與編輯母版 ================= */
/* 編輯母版、沒有選取任何元素時：母版本身的設定 */
function propsMasterPage(pp){
  /* 母版編輯中沒選東西時，右欄不該顯示頁面屬性——那些控件（底色、背景圖、備忘稿、
     章節、不放映此頁）全都作用在**離開母版後會回去的那一頁**，不是母版。畫面上正在
     編輯母版卻擺著一排會改到別處的控件，是會讓人改錯東西的誤導。 */
  pp.innerHTML=_t('<h4>母版</h4>');
  pp.appendChild(secTitle(_t('母版'),true));
  const mi=document.createElement('div'); mi.className='row';
  mi.innerHTML='<span class="unit">'+_t('正在編輯母版。這裡放的元素會出現在<b>每一頁</b>，一般工具全部照用，'
    +'<b>點任何一個母版元素</b>就能在這裡改它的屬性。<br><br>'
    +'底色、背景圖、備忘稿、章節這些屬於個別頁面，母版模式下改不到。'
    +'整份簡報的設定請按工具列的<b>全簡報設定</b>。')+'</span>';
  pp.appendChild(mi);
  pp.appendChild(btnRow([[{ic:'ic-master',txt:_t('完成，回到頁面')},()=>setMasterEdit(false),_t('離開母版編輯')]]));
  updateCopyPalWin();
}
/* 沒有選取任何元素時：頁面樣式、章節、備忘稿、範本與合併、全簡報的工具 */
function propsPage(pp){
  pp.innerHTML=_t('<h4>頁面</h4>');
  pp.appendChild(secTitle(_t('頁面樣式'),true));
  pp.appendChild(colorRow(_t('底色'),curPage().bg,v=>{curPage().bg=v||'FFFFFF';},false));
  // 頁面背景圖（滿版拉伸，匯出為原生 <p:bg> blipFill；蓋在底色之上、所有元素之下）
  pp.appendChild(btnRow([
    [{ic:'ic-image',txt:_t('背景圖')},()=>$('#bgInput').click(),_t('選一張圖當本頁滿版背景（匯出為原生頁面背景）')],
    ...(curPage().bgImage? [[_t('清除'),()=>{ commitUndo(); delete curPage().bgImage; renderAll(); syncPageJson(); },_t('移除背景圖')]]:[]),
  ]));
  if(curPage().bgImage){
    const bn=document.createElement('div'); bn.className='row';
    bn.innerHTML=_t('<span class="unit">背景圖已設定（滿版拉伸，不隨元素選取）。想要精確裁切／局部露出，請改用一般圖片元素鋪滿整頁。</span>');
    pp.appendChild(bn);
    /* 背景圖的單獨壓縮入口：它不是元素、選不到，沒有這條路就只能連同其他圖一起批次壓。
       目標像素按滿版畫布算（STAGE_W×STAGE_H×倍率），與下方批次用的是同一套換算。 */
    pp.appendChild(batchCompressRows('pagebg'));
  }
  // 轉場（進入此頁時播放；Morph 依元素 id 跨頁配對，複製頁改版面即可平滑補間）
  const trRow=document.createElement('div'); trRow.className='row'; trRow.innerHTML=_t('<label>轉場</label>');
  const trSel=document.createElement('select');
  trSel.innerHTML='<option value="">'+_t('無')+'</option>'+Object.entries(TRANSITIONS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
  trSel.value=(curPage().transition&&curPage().transition.type)||'';
  trSel.onchange=()=>{ commitUndo();
    curPage().transition= trSel.value? (trSel.value==='morph'? {type:'morph',dur:600}:{type:trSel.value}) : null;
    renderProps(); syncPageJson(); };
  trRow.appendChild(trSel); pp.appendChild(trRow);
  if(curPage().transition&&curPage().transition.type==='morph'){
    const dr=document.createElement('div'); dr.className='row'; dr.innerHTML=_t('<label>時長</label>');
    const di=document.createElement('input'); di.type='number'; di.min=100; di.max=10000; di.step=100; di.value=curPage().transition.dur||600;
    di.onchange=()=>{ commitUndo(); curPage().transition.dur=Math.max(100,Math.min(10000,Math.round(+di.value)||600)); syncPageJson(); };
    dr.appendChild(di); dr.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'ms'}));
    pp.appendChild(dr);
    const mn=document.createElement('div'); mn.className='row';
    mn.innerHTML='<span class="unit">'+_t('Morph 是看元素 id 去配對前一頁的同名元素，所以「複製此頁」會保留 id，'
      +'就是為了讓它配得到。太舊的 PowerPoint 不支援 Morph，會自動退成淡出。')+'</span>';
    pp.appendChild(mn);
  }
  // 本頁圖片批次壓縮：含元素圖與本頁背景圖，每張各自依自己的顯示尺寸換算目標像素
  // 「本頁不套母版」是逐頁設定，留在頁面屬性；母版本身的開關與匯出方式在「全簡報」面板
  if(masterOn()&&!APP.masterEdit)
    pp.appendChild(checkRow([[_t('本頁不套母版'),()=>!!curPage().noMaster,v=>{ commitUndo();
      if(v) curPage().noMaster=true; else delete curPage().noMaster;
      renderAll(); syncPageJson(); },_t('封面／全出血圖片頁常用')]]));
  // 隱藏投影片：仍在檔案裡、放映時跳過（匯出為 <p:sld show="0">）
  pp.appendChild(checkRow([[_t('不放映此頁'),()=>!!curPage().skip,v=>{ commitUndo();
    if(v) curPage().skip=true; else delete curPage().skip;
    renderAll(); syncPageJson(); },_t('頁仍在檔案內，但放映與「從頭開始」會跳過（PPT 的「隱藏投影片」）')]]));
  // 沒有圖片就整段不長：留一行「沒有圖片」只是佔位，想壓縮的人才會來看這一區
  if(collectImageTargets('page').length){
    pp.appendChild(secTitle(_t('圖片壓縮（本頁）')));
    pp.appendChild(batchCompressRows('page'));
  }
  /* 章節：PowerPoint 縮圖窗格的可摺疊分組，只影響編輯時的導覽，放映與版面完全不變。
     語意掛在「頁」上但作用是「從這頁起的一段」，故標籤寫成「從本頁開始」。 */
  pp.appendChild(secTitle(_t('章節')));
  const hasSec=curPage().section!=null;
  pp.appendChild(checkRow([[_t('從本頁開始新章節'),()=>hasSec,v=>{ commitUndo();
    if(v){ const idx=APP.deck.pages.indexOf(curPage());
           curPage().section=curPage().name||_t('章節 {0}',idx+1); }
    else delete curPage().section;
    normalizeDeck(APP.deck); renderAll(); syncPageJson(); },
    _t('PowerPoint 縮圖窗格的可摺疊分組：可整段收合／搬動／隱藏。不影響投影片內容，放映時看不到')]]));
  if(hasSec){
    const sr=document.createElement('div'); sr.className='row'; sr.innerHTML=_t('<label>章節名</label>');
    const si=document.createElement('input'); si.type='text'; si.value=curPage().section; si.maxLength=60;
    si.onchange=()=>{ commitUndo();
      curPage().section=si.value.trim()||curPage().name||_t('章節');
      normalizeDeck(APP.deck);        // 撞名時會自動補 (2)，馬上回寫欄位讓使用者看得到
      renderAll(); syncPageJson(); };
    sr.appendChild(si); pp.appendChild(sr);
    const sn=document.createElement('div'); sn.className='row';
    sn.innerHTML=_t('<span class="unit">本頁到下一個章節起點之間的頁面同屬此章。章節名<b>必須唯一</b>，撞名會自動補「(2)」——PowerPoint 是靠名稱認章節的。</span>');
    pp.appendChild(sn);
  }
  pp.appendChild(secTitle(_t('備忘稿')));
  const nl=document.createElement('div'); nl.className='row'; nl.innerHTML=_t('<label style="min-width:auto">講者備忘稿</label>');
  pp.appendChild(nl);
  const nt=document.createElement('textarea'); nt.rows=4; nt.placeholder=_t('此頁備忘稿（匯出寫入 pptx 備忘稿）'); nt.value=curPage().notes||'';
  nt.onchange=()=>{ commitUndo(); curPage().notes=nt.value; };
  pp.appendChild(nt);
  // ── 以下三區為「整份簡報」層級（不只本頁），標題已標明，避免與頁面屬性混淆 ──
  // 整份簡報的圖片壓縮：所有頁的元素圖＋母版圖片（背景圖另立一區，見下）
  if(collectImageTargets('deck').length){
    pp.appendChild(secTitle(_t('圖片壓縮（整份簡報）')));
    pp.appendChild(batchCompressRows('deck'));
  }
  // 背景圖獨立成區：滿版、通常最大、觀眾整場都在看，該不該壓要讓使用者單獨決定
  if(APP.deck.pages.some(p=>p.bgImage)){
    pp.appendChild(secTitle(_t('背景圖壓縮（整份簡報）')));
    pp.appendChild(batchCompressRows('deckbg'));
  }
  pp.appendChild(secTitle(_t('範本與合併')));
  pp.appendChild(btnRow([[{ic:'ic-template',txt:_t('套範本')},()=>openTemplateModal(),_t('插入版型頁')],[{ic:'ic-merge',txt:_t('合併簡報')},()=>$('#mergeInput').click(),_t('把另一份 .deck 的頁附加進來')]]));
  /* 「本頁 JSON」不屬於「範本與合併」，改放底部動作列——與選取元素時同一個位置。
     這一段是無選取時唯一的動作，標題仍用「動作」才會被 applyPropTabs 抽到 propFoot。 */
  pp.appendChild(secTitle(_t('動作')));
  pp.appendChild(btnRow([[{ic:'ic-code',txt:_t('本頁 JSON')},()=>openPageJson(),
    _t('開啟本頁 JSON 面板（點畫布元素會聚焦其 JSON）')]]));
  updateCopyPalWin();
}
