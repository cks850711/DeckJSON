'use strict';
/* ================= 屬性面板：圖表 ================= */
/* 圖表：option 編輯、原生圖表 */
function propsChart(pp,el){
  pp.appendChild(btnRow([[_t('編輯圖表'),()=>openChartModal(el)]]));
  // 原生圖表：同一個 chart 元素上的旗標，不是第二種元素。option 不動，切換零損失。
  const nm=nativeMap(el.option);
  const nrow=checkRow([[_t('匯出為原生圖表'),()=>!!el.native,v=>{ commitUndo();
    if(v) el.native=true; else delete el.native;
    renderStage(); renderProps(); syncPageJson(); },
    _t('在 PPT 內可「編輯資料」、跟隨目標母版；外觀由 PowerPoint 排版，與畫布不會完全一致')]]);
  const ncb=nrow.querySelector('input');
  if(!nm.ok){ ncb.checked=false; ncb.disabled=true; nrow.querySelector('label').style.opacity='.5'; }
  pp.appendChild(nrow);
  const nn=document.createElement('div'); nn.className='row';
  nn.innerHTML='<span class="unit">'+(!nm.ok
    ? _t('這張圖走 PNG，因為<b>{0}</b>。',esc(nm.reason))
    : el.native
      ? _t('匯出為 <b>{0}</b> 原生圖表，在 PowerPoint 裡可以改資料。顏色、字體與繪圖區已經鎖定，'
        +'但<b>圖例要不要換行、太長的軸標籤怎麼截字，是 PowerPoint 自己決定的</b>，鎖不住。'
        +'原生圖表也不支援陰影與超連結。',nm.type)
        +(nm.drop.length? _t('<br>將不保留：{0}',esc(nm.drop.join(_t('、')))) : '')
      : _t('目前以 3 倍解析度 PNG 匯出（外觀與畫布一致，PPT 內不可改資料）。可勾選改為原生 <b>{0}</b>。',nm.type))
    +'</span>';
  pp.appendChild(nn);
  const car=document.createElement('div'); car.className='row'; car.innerHTML=_t('<label>替代文字</label>');
  const cai=document.createElement('input'); cai.type='text'; cai.style.flex='1'; cai.style.minWidth='80px';
  cai.placeholder=_t('無障礙說明'); cai.value=el.alt||''; cai.title=_t('寫入無障礙說明：PNG 走圖片 descr，原生圖表走 graphicFrame 的 descr');
  cai.onchange=()=>{ commitUndo(); const v=cai.value.trim(); if(v) el.alt=v; else delete el.alt; renderProps(); };
  car.appendChild(cai); pp.appendChild(car);
  pp.appendChild(linkRows(el,_t('圖表')));
  pp.appendChild(shadowRows(el));
}
