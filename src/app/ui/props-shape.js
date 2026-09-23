'use strict';
/* ================= 屬性面板：形狀與線條 ================= */
/* 線條類：線色、線寬、線型、端點 */
function propsLine(pp,el){
  pp.appendChild(colorRow(_t('線色'),el.lineColor,v=>el.lineColor=v,false));
  const row=document.createElement('div'); row.className='row'; row.innerHTML=_t('<label>線寬</label>');
  const inp=document.createElement('input'); inp.type='number'; inp.step=0.25; inp.min=0.25; inp.value=el.linePt||1.5;
  inp.onchange=()=>{ commitUndo(); el.linePt=+inp.value; renderStage(); };
  row.appendChild(inp); row.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:'pt'}));
  pp.appendChild(row);
  pp.appendChild(dashRow(el));
  const note=document.createElement('div'); note.className='row';
  note.innerHTML=_t('<span class="unit">拖兩端的圓點可以改方向，快接近水平或垂直時會自動貼齊。</span>');
  pp.appendChild(note);
  pp.appendChild(linkRows(el,_t('線條')));
}
/* 不帶文字的面狀形狀：填色、漸層、框線 */
function propsShape(pp,el){
  pp.appendChild(colorRow(_t('底色'),el.fill,v=>el.fill=v,true));
  pp.appendChild(gradRows(el));
  pp.appendChild(colorRow(_t('框線'),el.lineColor,v=>el.lineColor=v,true));
  if(el.lineColor!=null) pp.appendChild(dashRow(el));
  pp.appendChild(btnRow([[_t('加入文字'),()=>{ commitUndo(); el.paras=mkParas(_t('文字'),{sizePt:14,color:'FFFFFF',align:'center'}); el.valign='middle'; renderStage(); renderProps(); }]]));
  pp.appendChild(linkRows(el,_t('形狀')));
  pp.appendChild(shadowRows(el));
}
