'use strict';
function duplicateEl(el){
  commitUndo();
  const cp=structuredClone(el); cp.id=uid('e'); cp.x+=16; cp.y+=16;
  curEls().push(cp); setSel([cp.id]); renderAll();
}
function deleteEl(el){
  commitUndo();
  const arr=curEls(); arr.splice(arr.indexOf(el),1);
  setSel([]); renderAll();
}
function duplicateSelected(){
  const els=selEls(); if(!els.length) return;
  if(els.length===1) return duplicateEl(els[0]);
  commitUndo();
  const copies=els.map(el=>{ const cp=structuredClone(el); cp.id=uid('e'); cp.x+=16; cp.y+=16; curEls().push(cp); return cp.id; });
  setSel(copies); renderAll();
}
function deleteSelected(){
  if(!APP.selIds.length) return;
  const ids=new Set(APP.selIds);
  commitUndo();
  {const arr=curEls(); for(let i=arr.length-1;i>=0;i--) if(ids.has(arr[i].id)) arr.splice(i,1);}
  setSel([]); renderAll();
}

/* ================= 貼合內容 =================
   把文字框縮放到剛好裝下文字：橫書調高、直書調寬。keep 是不動的那一邊
   （'top'／'bottom'／'left'／'right'，省略＝上緣或左緣）——拖哪一邊的把手，就固定對邊。
   只改資料、不 commitUndo 也不重繪：畫布把手、屬性面板、腳本介面三個呼叫點各自收尾。
   回傳 {from,to}（沒變化或不適用時回 null）。 */
function fitTextBox(el,keep){
  const f=textFitSize(el); if(!f) return null;
  if(VERT_MODES[el.vert]){
    if(f.w===el.w) return null;
    const from=el.w; if(keep==='right') el.x+=el.w-f.w; el.w=f.w; return {from,to:f.w};
  }
  if(f.h===el.h) return null;
  const from=el.h; if(keep==='bottom') el.y+=el.h-f.h; el.h=f.h; return {from,to:f.h};
}
function fitSelected(){
  const els=selEls().filter(el=>el.type==='text'&&!el.locked); if(!els.length) return;
  const s=snapshot();   // 先拍、有變化才進堆疊：已經貼合時按下去不該多一步空的復原
  if(els.map(el=>fitTextBox(el)).some(Boolean)){ commitUndo(s); renderAll(); syncPageJson(); }
}

/* ================= 格式刷 ================= */
// 抽取來源樣式 → 點目標套用（依目標型別對映，不改內容/位置/尺寸）
function extractStyle(el){
  const s={};
  s.opacity=el.opacity;                       // 一律帶（含 undefined＝100%）
  s.shadow=el.shadow? structuredClone(el.shadow):null;   // 一律帶（null＝關閉，可用格式刷清掉陰影）
  if(el.paras){ const b=baseRun(el);
    s.run={bold:b.bold,italic:b.italic,color:b.color,sizePt:b.sizePt};
    // 選配樣式一律帶（沒有＝null，讓格式刷也能「清掉」目標的底線／高亮…）；link 屬內容不屬樣式，不搬
    for(const k of RUN_OPT_KEYS) if(k!=='link') s.run[k]= b[k]!=null? structuredClone(b[k]):null;
    s.align=b.align; s.valign=el.valign||'top'; }
  if(!isLineEl(el)&&'fill' in el) s.fill=el.fill;
  if('lineColor' in el) s.lineColor=el.lineColor;
  if(el.linePt!=null) s.linePt=el.linePt;
  s.dash=el.dash||null;                       // 線型一律帶（null＝實線，格式刷也能把虛線刷回實線）
  if(el.paras){ s.inset=el.inset||null; s.nowrap=!!el.nowrap; }   // 文字框內距／不換行也算樣式
  if(el.type==='table'){
    s.border=el.border?{...el.border}:null;
    const c0=(el.cells[0]&&el.cells[0][0])||{};
    s.cell={bold:!!c0.bold,italic:!!c0.italic,color:c0.color||'1A1A1A',sizePt:c0.sizePt||12};
  }
  return s;
}
function applyStyle(el,s){
  el.opacity=s.opacity;
  if('shadow' in s){ if(s.shadow) el.shadow=structuredClone(s.shadow); else delete el.shadow; }
  if(el.paras&&s.run){ setAllRuns(el,r=>{ r.bold=s.run.bold; r.italic=s.run.italic; r.color=s.run.color; r.sizePt=s.run.sizePt;
      for(const k of RUN_OPT_KEYS){ if(k==='link') continue;   // 超連結屬「內容」不屬樣式，格式刷不搬
        if(s.run[k]) r[k]=structuredClone(s.run[k]); else delete r[k]; } });
    if(s.align) setAllRuns(el,(r,p)=>p.align=s.align); }
  if(s.valign!=null&&(el.type==='text'||el.type==='shape')) el.valign=s.valign;
  if('fill' in s&&!isLineEl(el)&&(el.type==='text'||el.type==='shape')) el.fill=s.fill;
  if('lineColor' in s&&(el.type==='text'||el.type==='shape')) el.lineColor=s.lineColor;
  if('linePt' in s&&(el.type==='text'||el.type==='shape')) el.linePt=s.linePt;
  if('dash' in s&&(el.type==='text'||el.type==='shape')){ if(s.dash) el.dash=s.dash; else delete el.dash; }
  if(el.paras&&'inset' in s){ if(s.inset) el.inset=s.inset; else delete el.inset;
    if(s.nowrap) el.nowrap=true; else delete el.nowrap; }
  if(el.type==='table'&&s.cell){ el.cells.forEach(row=>row.forEach(c=>{ c.bold=s.cell.bold; c.italic=s.cell.italic; c.color=s.cell.color; c.sizePt=s.cell.sizePt; }));
    if('border' in s) el.border=s.border?{...s.border}:null; }
}
function armPainter(el){ APP.painter=extractStyle(el); updatePainterHint(); }
function updatePainterHint(){
  const on=!!APP.painter;
  stage.style.cursor= on?'copy':'';
  $('#painterHint').innerHTML= on?_t('<svg class="ic"><use href="#ic-brush"/></svg>格式刷啟用：點元素套用（可連續，Esc 取消）'):'';
}
function applyPainterTo(el){ if(!APP.painter||!el) return; commitUndo(); applyStyle(el,APP.painter); renderStage(); if(APP.sel===el.id) renderProps(); }

/* ================= 新增元素 ================= */
function addEl(el){ commitUndo(); curEls().push(el); setSel([el.id]); renderAll(); }
$('#btnAddText').onclick=()=>addEl({id:uid('e'),type:'text',x:120,y:120,w:420,h:60,valign:'top',fill:null,lineColor:null,
  paras:mkParas(_t('雙擊編輯文字'),{sizePt:18})});
$('#btnAddTable').onclick=()=>{
  const cells=[];
  for(let r=0;r<3;r++) cells.push([0,1,2].map(c=>{ const cl=defCell();
    if(r===0){ cl.bold=true; cl.fill='EEF2F8'; cl.align='center'; cl.text=_t('欄位{0}',c+1); }
    return cl; }));
  addEl({id:uid('e'),type:'table',x:120,y:200,colW:[140,140,140],rowH:[30,28,28],cells,border:{pt:0.75,color:'999999'}});
};
$('#btnAddImage').onclick=()=>$('#imgInput').click();
$('#imgInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) await insertImageFile(f);
});
// 頁面背景圖：存 dataUrl 在 pg.bgImage（與圖片元素同樣自足可攜；JSON 顯示層一併遮罩）
$('#bgInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  const dataUrl=await new Promise(res=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.readAsDataURL(f); });
  commitUndo(); curPage().bgImage=dataUrl; renderAll(); syncPageJson();
});
async function insertImageFile(f,x,y){
  const dataUrl=await new Promise(res=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.readAsDataURL(f); });
  const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=dataUrl; });
  let w=img.naturalWidth*.5,h=img.naturalHeight*.5;
  const mx=STAGE_W*.6,my=STAGE_H*.6;
  const f2=Math.min(1,mx/w,my/h); w*=f2; h*=f2;
  addEl({id:uid('e'),type:'image',x:Math.round(x!=null?x:(STAGE_W-w)/2),y:Math.round(y!=null?y:(STAGE_H-h)/2),
    w:Math.round(w),h:Math.round(h),natW:img.naturalWidth,natH:img.naturalHeight,dataUrl});
}

