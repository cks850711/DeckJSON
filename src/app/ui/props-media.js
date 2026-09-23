'use strict';
/* ================= 屬性面板：圖片與影片 ================= */
/* 圖片：裁切、壓縮、替代文字 */
function propsImage(pp,el){
  // 完整＝無 crop、框鎖原圖比例；裁切＝進入互動模式，構圖存進 el.crop 四邊比例
  const cropped=!cropIsEmpty(cropOf(el)), inCrop=APP.cropping===el.id;
  pp.appendChild(btnRow([
    [_t('完整'),()=>{ commitUndo(); delete el.crop; delete el.fit; APP.cropping=null;
      if(el.natW&&el.natH) el.h=Math.max(4,Math.round(el.w*el.natH/el.natW));   // 回到原始比例
      renderStage(); renderProps(); syncPageJson(); },_t('清除裁切，整張塞進框並回到原圖比例'),!cropped],
    [inCrop?_t('完成裁切'):_t('裁切…'),()=>{ inCrop? endCrop() : startCrop(el); },
      _t('雙擊圖片也可進入。裁切中：拖曳移動構圖、滾輪縮放、Enter 或 Esc 完成'),cropped||inCrop],
  ]));
  if(inCrop){
    const hint=document.createElement('div'); hint.className='row';
    hint.innerHTML=_t('<span class="unit" style="color:var(--accent)">裁切中：框內<b>拖曳</b>移動構圖 · <b>滾輪</b>縮放 · 拉<b>外框把手</b>改裁切範圍（圖片不動，寬高可各自調）· <b>Enter</b> 完成。可把圖拖出框外裁出留白。改動即時生效，反悔用 Undo。</span>');
    pp.appendChild(hint);
  }
  pp.appendChild(checkRow([[_t('圓形裁切'),()=>!!el.round,v=>{ commitUndo();
    if(v) el.round=true; else delete el.round; renderStage(); renderProps(); },_t('裁成圓／橢圓（匯出為 PPT prstGeom ellipse）')]]));
  const alr=document.createElement('div'); alr.className='row'; alr.innerHTML=_t('<label>替代文字</label>');
  const ali=document.createElement('input'); ali.type='text'; ali.style.flex='1'; ali.style.minWidth='80px';
  ali.placeholder=_t('無障礙說明'); ali.value=el.alt||''; ali.title=_t('寫入 pptx 的圖片說明（descr），螢幕閱讀器與「替代文字」窗格會讀到');
  ali.onchange=()=>{ commitUndo(); const v=ali.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
  alr.appendChild(ali); pp.appendChild(alr);
  if(!inCrop){
    const cn=document.createElement('div'); cn.className='row';
    cn.innerHTML='<span class="unit">'+_t('拉外框是<b>等比縮放</b>，圖不會變形。想讓寬高各自調，'
      +'進「裁切…」拉外框（圖本身釘住不動），或按住 <b>Alt</b> 拖把手強制拉成不等比。')
      +(cropped?_t('這張已經裁過了，匯出時是 PowerPoint 原生的裁切（<code>srcRect</code>）。'):'')+'</span>';
    pp.appendChild(cn);
  }
  pp.appendChild(imageCompressRows(el));
  pp.appendChild(linkRows(el,_t('圖片')));
  pp.appendChild(shadowRows(el));
}
/* 影片：線上／本機、封面 */
function propsVideo(pp,el){
  // 兩種模式共用一個元素；模式在插入時決定，這裡只做微調（換封面、改網址、補替代文字）
  const isOn=el.mode==='online';
  const mr=document.createElement('div'); mr.className='row';
  mr.innerHTML=`<span class="unit">${_t('模式：<b>{0}</b>',isOn?_t('YouTube 連結影片'):_t('本機影片（封面佔位）'))}</span>`;
  pp.appendChild(mr);
  if(isOn){
    const ur=document.createElement('div'); ur.className='row';
    ur.appendChild(Object.assign(document.createElement('label'),{textContent:_t('網址')}));
    const ui=document.createElement('input'); ui.type='text'; ui.style.flex='1'; ui.style.minWidth='80px';
    ui.value=el.embed||''; ui.title=_t('PowerPoint 需要 embed 形式；貼 watch／youtu.be 也會自動轉換');
    ui.onchange=()=>{ const e2=ytEmbed(ui.value);
      if(!e2){ ui.value=el.embed||''; alert(_t('無法解析成 YouTube 影片網址。可貼 watch?v=、youtu.be/ 或 embed/ 形式。')); return; }
      commitUndo(); el.embed=e2; renderStage(); renderProps(); };
    ur.appendChild(ui); pp.appendChild(ur);
    const un=document.createElement('div'); un.className='row';
    un.innerHTML=_t('<span class="unit">匯出為原生線上影片：pptx 內<b>只有封面圖</b>，影片走外部連結，<b>播放需要網路</b>。</span>');
    pp.appendChild(un);
  }else{
    const sn=document.createElement('div'); sn.className='row';
    sn.innerHTML='<span class="unit">'+_t('檔案：<b>{0}</b>',String((el.src&&el.src.name)||'—').replace(/</g,'&lt;'))+durText(el)
      +(el.src&&el.src.natW?_t('，原始 {0}×{1}',el.src.natW,el.src.natH):'')
      +_t('。<b>影片本身不在這份簡報裡</b>——匯出後請在 PowerPoint 該頁把封面換成真影片（匯出時會列清單提醒）。')+'</span>';
    pp.appendChild(sn);
  }
  pp.appendChild(btnRow([
    [{ic:'ic-image',txt:_t('換封面圖')},()=>{ COVER_TARGET=el.id; $('#coverInput').click(); },_t('選一張圖當封面（PNG／JPG）')],
    ...(el.mode==='local'? [[{ic:'ic-refresh',txt:_t('重抓封面')},()=>{ VID_RECOVER=el.id; $('#vidInput').click(); },_t('重新選同一個影片檔並抓一格畫面')]]:[]),
  ]));
  const alr=document.createElement('div'); alr.className='row'; alr.innerHTML=_t('<label>替代文字</label>');
  const ali=document.createElement('input'); ali.type='text'; ali.style.flex='1'; ali.style.minWidth='80px';
  ali.placeholder=_t('無障礙說明'); ali.value=el.alt||'';
  ali.onchange=()=>{ commitUndo(); const v=ali.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
  alr.appendChild(ali); pp.appendChild(alr);
  if(!isOn) pp.appendChild(shadowRows(el));
}
