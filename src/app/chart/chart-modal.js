'use strict';
/* ================= 圖表 modal ================= */
/* 存「頁 id ＋ 元素 id」而非物件參考：undo／redo 會整份換掉 APP.deck（applySnap），
   抓著舊物件的話後續編輯會寫進斷線的孤兒，靜靜消失。
   ⚠ 必須連頁一起記：Morph 轉場**刻意**讓同一個 id 跨頁重複（跨頁配對就靠它），
   只用元素 id 全 deck 搜尋會抓到別頁的同名元素。 */
let chartTargetRef=null;
function chartTarget(){
  if(!chartTargetRef) return null;
  const pg=APP.deck.pages.find(p=>p.id===chartTargetRef.page);
  return pg? pg.elements.find(e=>e.id===chartTargetRef.el)||null : null;
}
function openChartModal(el){
  chartTargetRef={page:curPage().id,el:el.id};
  $('#chartArea').value=JSON.stringify(el.option,null,1);
  $('#chartTargetTag').textContent=_t('{0}：{1}',L_NAME[el.type]||_t('圖表'),el.id);
  $('#chartModal').hidden=false;
  chartTab('vis');
}
function chartTab(which){
  const v=which==='vis';
  $('#tabChartVis').classList.toggle('on',v);
  $('#tabChartJson').classList.toggle('on',!v);
  $('#chartVisPane').hidden=!v; $('#chartJsonPane').hidden=v;
  const ap=$('#btnChartApply');
  ap.disabled=v;
  ap.title= v? _t('視覺編輯的改動已即時反映在畫布上，不需要按套用') : _t('寫入並重繪，面板留著繼續改');
  const el=chartTarget(); if(!el) return;
  if(v) buildChartVis();
  else { $('#chartArea').value=JSON.stringify(el.option,null,1); syncMapList(); }
}
// 已載入哪些地圖、各多大——不列出來的話，series.map 該填什麼名稱只能靠猜
function syncMapList(){
  const m=APP.deck.maps||{}, ks=Object.keys(m);
  $('#chartMapList').textContent= ks.length
    ? _t('已有地圖：{0}',ks.map(k=>k+_t('（{0}KB）',Math.round(JSON.stringify(m[k]).length/1024))).join(_t('、')))
    : _t('尚無地圖資料');
}
$('#btnChartMap').onclick=()=>$('#mapInput').click();
$('#mapInput').onchange=async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const g=JSON.parse(await f.text());
    const one=normMaps({tmp:g});
    if(!one) throw new Error(_t('不是 GeoJSON：頂層要有 type:"FeatureCollection"（含 features 陣列）或 "GeometryCollection"'));
    // 預設名稱取檔名去副檔名；名稱就是 series.map 要填的字串，所以讓使用者自己定
    const def=f.name.replace(/\.(geo)?json$/i,'').slice(0,40);
    const name=(prompt(_t('地圖名稱（series.map 要填的就是這個字串）：'),def)||'').trim().slice(0,40);
    if(!name) return;
    commitUndo();
    APP.deck.maps=Object.assign({},APP.deck.maps,{[name]:g});
    echarts.registerMap(name,g);   // 這條路徑一律覆蓋註冊，才能換掉同名的舊地圖
    THUMB_CHART.clear();           // 已有的圖表縮圖是「地圖畫不出來」的版本，全部作廢
    renderAll(); syncPageJson(); syncMapList();
    alert(_t('已載入地圖「{0}」（{1}KB）。\n'
      +'在 option 內寫 series:[{"type":"map","map":"{0}", …}] 即可使用。\n'
      +'地圖資料會存進這份簡報的 maps 欄位，換一台電腦開也在。',name,Math.round(JSON.stringify(g).length/1024)));
  }catch(err){ alert(_t('GeoJSON 載入失敗：{0}',err.message)); }
};
$('#tabChartVis').onclick=()=>chartTab('vis');
$('#tabChartJson').onclick=()=>chartTab('json');
function closeChartModal(){
  $('#chartModal').hidden=true; chartTargetRef=null;
}
$('#btnChartClose').onclick=closeChartModal;
/* 套用＝寫入並重繪、面板留著；確認＝寫入後關閉。
   視覺編輯分頁的控件本來就即時寫入，沒有「尚未套用」的狀態，故該分頁的「套用」停用
   （停用而非隱藏：按鈕位置跟著分頁跳動比灰掉更難用）。 */
function chartApplyJson(){
  const el=chartTarget(); if(!el) return false;
  try{
    const opt=JSON.parse($('#chartArea').value);
    // 這裡是手貼 option 的正門，也是「顏色少 # 」與「地圖名稱打錯」最常見的入口
    NORM_REPORT.colorFixed=0; NORM_REPORT.colorBad=[]; NORM_REPORT.mapMissing=[]; NORM_REPORT.mapNameBad=[];
    normChartColors(opt,'',NORM_REPORT);
    for(const s of (opt.series||[])) checkMapSeries(s,NORM_REPORT);
    commitUndo(); el.option=opt;
    renderAll(); syncPageJson();
    reportChartIssues();
    return true;
  }catch(err){ alert(_t('option JSON 解析失敗：{0}',err.message)); return false; }
}
$('#btnChartApply').onclick=()=>chartApplyJson();
$('#btnChartOk').onclick=()=>{
  // 視覺編輯分頁的改動早已寫入，這裡只要關；JSON 分頁則要先套用成功才關
  if($('#chartJsonPane').hidden || chartApplyJson()) closeChartModal();
};
makeDraggable($('#chartModal'),$('#chartHead'),'#btnChartClose');
makeDraggable($('#geomModal'),$('#geomHead'),'#btnGeomClose');

/* ---- 圖表視覺編輯面板 ----
   鐵則：**定點寫入，不重生整份 option**。使用者手寫的 markLine／grid／tooltip／
   backgroundColor 都必須原封不動活下來，所以每個控制項只碰自己那一格。
   讀不回來的設定（例如函式 formatter）一律鎖住並寫明原因——顯示成空白會誘導
   使用者存檔時把自己寫的東西蓋掉。 */
function cvSet(obj,path,val){       // 'series.0.itemStyle.color' → 逐層建物件後寫值
  const ks=path.split('.'); let o=obj;
  for(let i=0;i<ks.length-1;i++){
    const k=ks[i], nextNum=/^\d+$/.test(ks[i+1]);
    if(o[k]==null||typeof o[k]!=='object') o[k]=nextNum?[]:{};
    o=o[k];
  }
  if(val===undefined) delete o[ks[ks.length-1]]; else o[ks[ks.length-1]]=val;
}
// 面板能不能編這份 option 的「資料」。編不了就只鎖資料表，其餘控制項照常。
function cvShape(op){
  const ss=(op&&op.series||[]).filter(s=>s&&typeof s==='object');
  if(!ss.length) return {kind:'none',reason:_t('option 內沒有 series')};
  if(ss.some(s=>s.type==='pie'))
    return ss.length===1? {kind:'pie',ss}
      : {kind:'none',reason:_t('多個圓餅 series 疊圖，請用 JSON 編輯')};
  if(ss.every(s=>s.type==='bar'||s.type==='line')){
    const xCat=op.xAxis&&op.xAxis.type==='category'&&Array.isArray(op.xAxis.data);
    const yCat=op.yAxis&&op.yAxis.type==='category'&&Array.isArray(op.yAxis.data);
    if(xCat||yCat) return {kind:'cat',ss,catKey:xCat?'xAxis':'yAxis',valKey:xCat?'yAxis':'xAxis'};
    return {kind:'none',reason:_t('找不到類別軸（xAxis.data 或 yAxis.data）')};
  }
  return {kind:'none',reason:_t('{0} 的資料結構面板未涵蓋，請用 JSON 編輯',ss.map(s=>s.type).join(_t('／')))};
}
const CV_KINDS=[['bar',_t('直條圖')],['barH',_t('橫條圖')],['line',_t('折線圖')],['area',_t('區域圖')],
  ['pie',_t('圓餅圖')],['doughnut',_t('環圈圖')]];
function cvKindOf(op,sh){
  if(sh.kind==='pie') return (Array.isArray(sh.ss[0].radius)&&parseFloat(sh.ss[0].radius[0])>0)?'doughnut':'pie';
  if(sh.kind!=='cat') return null;
  if(sh.ss[0].type==='bar') return sh.catKey==='yAxis'?'barH':'bar';
  return sh.ss.some(s=>s.areaStyle)?'area':'line';
}
/* 換圖種。同家族內（直↔橫、柱↔線↔區域、圓↔環）完全不動 data。
   跨家族（類別軸 ↔ 圓餅）要換 data 的**形狀**——類別軸把標籤放 xAxis.data、數值放
   series.data；圓餅則兩者合併成 [{name,value}]。換的是容器不是內容，標籤與數值
   逐項對應、可逆無損，所以仍提供；只有多系列轉圓餅會截掉第二個系列以後（圓餅畫不了），
   那一種才擋下來。 */
function cvSetKind(op,sh,kind){
  const toPie=(kind==='pie'||kind==='doughnut'), wasPie=sh.kind==='pie';
  if(toPie&&!wasPie){
    const labels=op[sh.catKey].data.map(v=>String((v&&v.value!=null)?v.value:v));
    const s0=sh.ss[0];
    s0.type='pie';
    s0.data=labels.map((l,i)=>({name:l,value:cvNum((s0.data||[])[i])}));
    delete s0.stack; delete s0.areaStyle; delete s0.smooth; delete s0.barWidth;
    delete s0.lineStyle; delete s0.symbol;
    if(s0.itemStyle) delete s0.itemStyle.borderRadius;
    op.series=[s0];
    delete op.xAxis; delete op.yAxis;     // 留著會畫出多餘的座標軸
    sh={kind:'pie',ss:op.series};
  }else if(!toPie&&wasPie){
    const s0=sh.ss[0];
    const d=(s0.data||[]).map((v,i)=>({name:(v&&v.name)||_t('項目 {0}',i+1),value:cvNum(v)}));
    delete s0.radius; delete s0.roseType; delete s0.center; delete s0.startAngle;
    s0.data=d.map(x=>x.value);
    op.xAxis={type:'category',data:d.map(x=>x.name)}; op.yAxis={type:'value'};
    op.series=[s0];
    sh={kind:'cat',ss:op.series,catKey:'xAxis',valKey:'yAxis'};
  }
  if(toPie){
    const s0=op.series[0];
    if(kind==='doughnut'){ if(!Array.isArray(s0.radius)||!(parseFloat(s0.radius[0])>0)) s0.radius=['45%','70%']; }
    else delete s0.radius;
    return;
  }
  if(sh.kind!=='cat') return;
  const want= kind==='barH'?'yAxis':'xAxis';
  if(sh.catKey!==want){                    // 直↔橫：類別軸與數值軸整個對調
    const c=op[sh.catKey], v=op[sh.valKey];
    op[want]=c; op[want==='xAxis'?'yAxis':'xAxis']=v;
  }
  for(const s of op.series){
    s.type=(kind==='bar'||kind==='barH')?'bar':'line';
    if(kind==='area'){ if(!s.areaStyle) s.areaStyle={}; } else delete s.areaStyle;
    if(kind==='bar'||kind==='barH'){ delete s.smooth; delete s.lineStyle; delete s.symbol; }
    else { delete s.barWidth; if(s.itemStyle) delete s.itemStyle.borderRadius; }
  }
}
function cvNum(v){ const n=(v&&typeof v==='object')?(Array.isArray(v)?v[1]:v.value):v;
  return isFinite(parseFloat(n))?parseFloat(n):0; }
/* 預覽：跟畫布共用同一份 option，所以看到的就是實際結果。
   刻意不重新 init（只 setOption），否則每改一格都閃一下。 */
/* 面板內原本有一個 echarts 小預覽（cvPrevInst / #cvPreviewWrap），已整組移除：
   面板改成無遮罩可拖放之後，畫布上的真圖表就看得到，同一份 option 沒有理由畫兩次。
   原本掛在預覽角落的「原生圖表」提示改由 buildChartVis 寫成面板內的一段 note。 */
function buildChartVis(){
  const el=chartTarget();
  if(!el){ closeChartModal(); return; }
  const pane=$('#cvControls'); pane.innerHTML='';
  const op=el.option||{};
  const sh=cvShape(op);
  const kind=cvKindOf(op,sh);
  const isPie=sh.kind==='pie', isCat=sh.kind==='cat';
  // 已勾原生匯出時，原生表達不了的設定一律停用——不讓使用者設一個匯出時會靜靜消失的值
  const nat=!!el.native&&nativeMap(op).ok;
  const PNG_ONLY=_t('原生圖表無此設定。要使用請先取消側欄的「匯出為原生圖表」');
  const apply=(fn,rebuild)=>{ commitUndo(); fn(); renderAll(); syncPageJson();
    if(rebuild!==false) buildChartVis(); };
  const pngTag=p=>p.appendChild(Object.assign(document.createElement('span'),
    {className:'cvPng',textContent:_t('僅 PNG'),title:_t('此設定沒有 PowerPoint 原生圖表的對應，只有 PNG 匯出會呈現')}));

  const sec=t=>{ const d=document.createElement('div'); d.className='cvSec'; d.textContent=t; pane.appendChild(d); };
  const row=()=>{ const d=document.createElement('div'); d.className='cvRow'; pane.appendChild(d); return d; };
  const lab=(p,t)=>p.appendChild(Object.assign(document.createElement('label'),{textContent:t}));
  const note=(t,cls)=>{ const d=document.createElement('div'); d.className=cls||'mnote'; d.innerHTML=t; pane.appendChild(d); };
  const chk=(p,text,get,set,o)=>{
    o=o||{};
    const l=document.createElement('label'); l.style.cssText='display:flex;align-items:center;gap:4px;cursor:pointer';
    const c=document.createElement('input'); c.type='checkbox'; c.style.width='auto'; c.checked=!!get();
    if(o.lock){ c.disabled=true; l.style.opacity='.5'; l.title=o.lock; }
    else if(o.title) l.title=o.title;
    c.onchange=()=>apply(()=>set(c.checked),o.rebuild);
    l.appendChild(c); l.appendChild(document.createTextNode(text)); p.appendChild(l); return c;
  };
  const sel=(p,val,items,set,o)=>{
    o=o||{};
    const e=document.createElement('select');
    for(const [k,t] of items) e.appendChild(Object.assign(document.createElement('option'),{value:k,textContent:t}));
    e.value=val; if(o.disabled||o.lock){ e.disabled=true; e.title=o.lock||o.title||''; }
    e.onchange=()=>apply(()=>set(e.value),o.rebuild);
    p.appendChild(e); return e;
  };
  const num=(p,text,val,set,o)=>{
    o=o||{}; if(text) lab(p,text);
    const i=document.createElement('input'); i.type='number'; i.style.width=(o.w||64)+'px';
    if(o.min!=null)i.min=o.min; if(o.max!=null)i.max=o.max; if(o.step!=null)i.step=o.step;
    i.value=val==null?'':val; if(o.placeholder)i.placeholder=o.placeholder;
    if(o.lock){ i.disabled=true; i.title=o.lock; }
    i.onchange=()=>apply(()=>set(i.value===''?undefined:parseFloat(i.value)),false);
    p.appendChild(i); if(o.unit) p.appendChild(Object.assign(document.createElement('span'),{className:'unit',textContent:o.unit}));
    return i;
  };
  const txt=(p,text,val,set,w)=>{
    lab(p,text);
    const i=document.createElement('input'); i.type='text'; i.style.width=(w||120)+'px'; i.value=val||'';
    i.onchange=()=>apply(()=>set(i.value.trim()),false);
    p.appendChild(i); return i;
  };
  // 用本專案的色票系統（設計師精選／Open Color／全色域），不用瀏覽器原生色盤
  const color=(p,val,set,title)=>{
    const b=document.createElement('button'); b.className='swatchBtn';
    b.style.cssText='width:24px;height:20px'; b.style.background='#'+val;
    if(title)b.title=title;
    b.onclick=()=>openPalette(b,val,hex=>{ b.style.background='#'+hex;
      commitUndo(); set(hex); renderAll(); syncPageJson(); buildChartVis(); });
    p.appendChild(b); return b;
  };
  const hexOf=(v,d)=>nvHex(v)||d;

  /* ---- 圖種 ---- */
  sec(_t('圖種'));
  const r1=row();
  if(kind){
    const multi=isCat&&op.series.length>1;
    sel(r1,kind,CV_KINDS,v=>{
      if((v==='pie'||v==='doughnut')&&multi&&
         !confirm(_t('圓餅圖只能畫一個系列。轉換後只保留第一個系列「{0}」，其餘 {1} 個會被移除。要繼續嗎？',
           op.series[0].name||_t('數列 1'),op.series.length-1)))
        return;
      cvSetKind(op,sh,v);
    });
    lab(r1,isPie?_t('（圓餅與長條類互換會重排 data 的形狀，標籤與數值逐項保留）'):'');
  }else{
    const t=(op.series||[]).map(x=>x&&x.type).filter(Boolean).join(_t('／'))||_t('（未知）');
    sel(r1,'',[['','—']],()=>{},{disabled:true});
    lab(r1,_t('目前是 {0}，面板不涵蓋此圖種',t));
  }
  if(isCat&&(kind==='line'||kind==='area'))
    chk(r1,_t('平滑曲線'),()=>sh.ss.some(x=>x.smooth),
      v=>{ for(const x of op.series){ if(v)x.smooth=true; else delete x.smooth; } });

  /* ---- 標題 ---- */
  sec(_t('標題'));
  const ti=(op.title&&!Array.isArray(op.title))? op.title : null;
  const r2=row();
  txt(r2,_t('圖表標題'),ti&&typeof ti.text==='string'?ti.text:'',v=>{
    if(v){ cvSet(op,'title.text',v); if(!op.title.left) op.title.left='center'; }
    else if(op.title) delete op.title.text; },180);
  const hasTi=!!(ti&&ti.text);
  sel(r2,(ti&&ti.left)||'center',[['left',_t('靠左')],['center',_t('置中')],['right',_t('靠右')]],
    v=>cvSet(op,'title.left',v),{disabled:!hasTi});
  num(r2,_t('字級'),ti&&ti.textStyle&&ti.textStyle.fontSize,
    v=>cvSet(op,'title.textStyle.fontSize',v),{min:8,max:72,placeholder:'18',unit:'px'});
  if(hasTi) color(r2,hexOf(ti.textStyle&&ti.textStyle.color,'333333'),
    h=>cvSet(op,'title.textStyle.color','#'+h),_t('標題顏色'));
  if(isCat){
    const r3=row();
    const axTitle=(key,text)=>{
      txt(r3,text,op[key]&&op[key].name,
        v=>{ if(v) cvSet(op,key+'.name',v); else if(op[key]) delete op[key].name; },100);
      if(op[key]&&op[key].name){
        num(r3,'',op[key].nameTextStyle&&op[key].nameTextStyle.fontSize,
          v=>cvSet(op,key+'.nameTextStyle.fontSize',v),{min:6,max:48,placeholder:'12',w:56,unit:'px'});
        color(r3,hexOf(op[key].nameTextStyle&&op[key].nameTextStyle.color,'666666'),
          h=>cvSet(op,key+'.nameTextStyle.color','#'+h),_t('軸標題顏色'));
      }
    };
    axTitle(sh.catKey,_t('類別軸標題')); axTitle(sh.valKey,_t('數值軸標題'));
  }

  /* ---- 座標軸 ---- */
  if(isCat){
    sec(_t('座標軸'));
    const on=(k,sub)=>{ const a=op[k]; return !(a&&a[sub]&&a[sub].show===false); };
    const r4=row();
    chk(r4,_t('軸線'),()=>on(sh.catKey,'axisLine')&&on(sh.valKey,'axisLine'),
      v=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisLine.show',v?undefined:false); });
    color(r4,hexOf(op[sh.catKey].axisLine&&op[sh.catKey].axisLine.lineStyle&&op[sh.catKey].axisLine.lineStyle.color,'888888'),
      h=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisLine.lineStyle.color','#'+h); },_t('軸線顏色'));
    num(r4,_t('粗細'),(op[sh.catKey].axisLine&&op[sh.catKey].axisLine.lineStyle&&op[sh.catKey].axisLine.lineStyle.width),
      v=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisLine.lineStyle.width',v); },
      {min:0.5,max:8,step:0.5,placeholder:'1',unit:'px'});
    chk(r4,_t('刻度'),()=>on(sh.catKey,'axisTick')&&on(sh.valKey,'axisTick'),
      v=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisTick.show',v?undefined:false); });

    const r5=row();
    chk(r5,_t('類別軸標籤'),()=>on(sh.catKey,'axisLabel'),
      v=>cvSet(op,sh.catKey+'.axisLabel.show',v?undefined:false));
    // 數值軸標籤：PptxGenJS 只能整根軸刪掉（catAxisHidden 是 <c:delete>），無法只隱藏標籤
    const cbVal=chk(r5,_t('數值軸標籤'),()=>on(sh.valKey,'axisLabel'),
      v=>cvSet(op,sh.valKey+'.axisLabel.show',v?undefined:false),{lock:nat?PNG_ONLY:''});
    pngTag(cbVal.parentElement);
    num(r5,_t('字級'),op[sh.catKey].axisLabel&&op[sh.catKey].axisLabel.fontSize,
      v=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisLabel.fontSize',v); },
      {min:6,max:36,placeholder:'12',unit:'px'});
    color(r5,hexOf(op[sh.catKey].axisLabel&&op[sh.catKey].axisLabel.color,'666666'),
      h=>{ for(const k of [sh.catKey,sh.valKey]) cvSet(op,k+'.axisLabel.color','#'+h); },_t('軸標籤顏色'));
    num(r5,_t('類別傾斜'),op[sh.catKey].axisLabel&&op[sh.catKey].axisLabel.rotate,
      v=>cvSet(op,sh.catKey+'.axisLabel.rotate',v),{min:-90,max:90,placeholder:'0',unit:'°'});

    const r6=row();
    // 留空＝交給 ECharts 自動；不預填實際計算值，否則會被誤認為已設定
    num(r6,_t('數值軸最小'),op[sh.valKey].min,v=>cvSet(op,sh.valKey+'.min',v),{placeholder:_t('自動'),w:72});
    num(r6,_t('最大'),op[sh.valKey].max,v=>cvSet(op,sh.valKey+'.max',v),{placeholder:_t('自動'),w:72});
    num(r6,_t('刻度間隔'),op[sh.valKey].interval,v=>cvSet(op,sh.valKey+'.interval',v),{placeholder:_t('自動'),w:72});
    chk(r6,_t('數值軸反轉'),()=>!!op[sh.valKey].inverse,v=>cvSet(op,sh.valKey+'.inverse',v||undefined));
  }

  /* ---- 格線 ---- */
  if(isCat){
    sec(_t('格線'));
    // ECharts 的 splitLine 掛在「被切分的那根軸」上：橫格線由數值軸畫
    const hAx=sh.catKey==='xAxis'?sh.valKey:sh.catKey;
    const vAx=sh.catKey==='xAxis'?sh.catKey:sh.valKey;
    const r7=row();
    const hOn=!(op[hAx]&&op[hAx].splitLine&&op[hAx].splitLine.show===false);
    chk(r7,_t('橫向格線'),()=>hOn,v=>cvSet(op,hAx+'.splitLine.show',v?undefined:false),
      {title:_t('數值軸的分隔線')});
    chk(r7,_t('縱向格線'),()=>{ const a=op[vAx]; return !!(a&&a.splitLine&&a.splitLine.show===true); },
      v=>cvSet(op,vAx+'.splitLine.show',v?true:undefined),{title:_t('類別軸的分隔線（ECharts 預設關閉）')});
    const ls=(op[hAx]&&op[hAx].splitLine&&op[hAx].splitLine.lineStyle)||{};
    color(r7,hexOf(ls.color,'E0E0E0'),h=>cvSet(op,hAx+'.splitLine.lineStyle.color','#'+h),_t('格線顏色'));
    num(r7,_t('線寬'),ls.width,v=>cvSet(op,hAx+'.splitLine.lineStyle.width',v),
      {min:0.5,max:6,step:0.5,placeholder:'1',unit:'px'});
    sel(r7,ls.type||'solid',[['solid',_t('實線')],['dashed',_t('虛線')],['dotted',_t('點線')]],
      v=>cvSet(op,hAx+'.splitLine.lineStyle.type',v==='solid'?undefined:v));
    // 副格線：OOXML 有 <c:minorGridlines>，但 PptxGenJS 沒開放（只給 minorTickMark）
    const r8=row();
    const mi=chk(r8,_t('副格線'),()=>!!(op[hAx]&&op[hAx].minorSplitLine&&op[hAx].minorSplitLine.show),
      v=>cvSet(op,hAx+'.minorSplitLine.show',v||undefined),{lock:nat?PNG_ONLY:''});
    pngTag(mi.parentElement);
    if(!(op[hAx]&&op[hAx].minorTick)) lab(r8,_t('（需同時開啟數值軸的次刻度才看得到）'));
  }

  /* ---- 圖例 ---- */
  sec(_t('圖例'));
  const r9=row();
  const lgOn=!!(op.legend&&op.legend.show!==false);
  chk(r9,_t('顯示'),()=>lgOn,v=>{
    if(v){ op.legend=op.legend||{}; delete op.legend.show;
      if(!['top','bottom','left','right'].some(k=>op.legend[k]!=null)) op.legend.bottom=5; }
    else cvSet(op,'legend.show',false); });
  sel(r9,['top','bottom','left','right'].find(k=>op.legend&&op.legend[k]!=null)||'bottom',
    [['top',_t('上')],['bottom',_t('下')],['left',_t('左')],['right',_t('右')]],
    v=>{ op.legend=op.legend||{};
      for(const k of ['top','bottom','left','right']) delete op.legend[k];
      op.legend[v]=5; },{disabled:!lgOn});
  if(lgOn){
    num(r9,_t('字級'),op.legend.textStyle&&op.legend.textStyle.fontSize,
      v=>cvSet(op,'legend.textStyle.fontSize',v),{min:6,max:36,placeholder:'12',unit:'px'});
    color(r9,hexOf(op.legend.textStyle&&op.legend.textStyle.color,'333333'),
      h=>cvSet(op,'legend.textStyle.color','#'+h),_t('圖例文字顏色'));
  }

  /* ---- 資料標籤 ---- */
  sec(_t('資料標籤'));
  const r10=row();
  const fmtHit=(op.series||[]).some(x=>x&&x.label&&x.label.formatter!=null);
  const dlOn=(op.series||[]).some(x=>x&&x.label&&x.label.show);
  chk(r10,_t('顯示'),()=>dlOn,
    v=>{ (op.series||[]).forEach((x,i)=>{
      if(v) cvSet(op,'series.'+i+'.label.show',true); else if(x.label) delete x.label.show; }); },
    {lock:fmtHit?_t('有自訂 formatter 樣板，請用 option JSON 分頁編輯'):''});
  if(dlOn&&!fmtHit){
    const l0=(op.series[0].label)||{};
    sel(r10,l0.position||(isPie?'outside':'top'),
      isPie? [['outside',_t('外側')],['inside',_t('內側')],['center',_t('中央')]]
           : [['top',_t('上方')],['inside',_t('內部')],['insideTop',_t('內部上')],['insideBottom',_t('內部下')]],
      v=>{ (op.series||[]).forEach((x,i)=>cvSet(op,'series.'+i+'.label.position',v)); });
    num(r10,_t('字級'),l0.fontSize,
      v=>{ (op.series||[]).forEach((x,i)=>cvSet(op,'series.'+i+'.label.fontSize',v)); },
      {min:6,max:36,placeholder:'12',unit:'px'});
    color(r10,hexOf(l0.color,'333333'),
      h=>{ (op.series||[]).forEach((x,i)=>cvSet(op,'series.'+i+'.label.color','#'+h)); },_t('標籤顏色'));
  }
  if(fmtHit) note(_t('🔒 資料標籤設了自訂 <code>formatter</code> 樣板。面板只能表達開／關，'
    +'存下去會把樣板洗掉，因此鎖住——請切「option JSON」分頁編輯。'),'cvLock');

  /* ---- 系列外觀 ---- */
  sec(isPie?_t('各項顏色'):_t('系列外觀'));
  if(isPie){
    const r11=row();
    (op.series[0].data||[]).forEach((v,i)=>{
      const box=document.createElement('span'); box.style.cssText='display:flex;align-items:center;gap:3px';
      box.appendChild(Object.assign(document.createElement('span'),
        {textContent:(v&&v.name)||_t('項目 {0}',i+1),style:'font-size:12px;color:var(--fg-dim)'}));
      color(box,hexOf(v&&v.itemStyle&&v.itemStyle.color,CHART_PAL[i%CHART_PAL.length]),
        h=>{ const d=op.series[0].data[i];
          // 保住 value／name，只加掛 itemStyle
          const o=(d&&typeof d==='object')? d : {value:cvNum(d)};
          o.itemStyle={...(o.itemStyle||{}),color:'#'+h}; op.series[0].data[i]=o; });
      r11.appendChild(box);
    });
    const r12=row();
    num(r12,_t('內圈大小'),Array.isArray(op.series[0].radius)?parseFloat(op.series[0].radius[0]):0,
      v=>{ const inner=Math.max(0,Math.min(90,v||0));
        if(inner>0) op.series[0].radius=[inner+'%','70%']; else delete op.series[0].radius; },
      {min:0,max:90,unit:'%',title:_t('0＝實心圓餅')});
    num(r12,_t('起始角度'),op.series[0].startAngle,v=>cvSet(op,'series.0.startAngle',v),
      {min:0,max:360,placeholder:'90',unit:'°'});
    const bw=(op.series[0].itemStyle&&op.series[0].itemStyle.borderWidth)||0;
    num(r12,_t('扇形邊框'),bw,v=>cvSet(op,'series.0.itemStyle.borderWidth',v||undefined),
      {min:0,max:10,unit:'px'});
    if(bw>0) color(r12,hexOf(op.series[0].itemStyle.borderColor,'FFFFFF'),
      h=>cvSet(op,'series.0.itemStyle.borderColor','#'+h),_t('邊框顏色'));
  }else if(isCat){
    (op.series||[]).forEach((x,i)=>{
      const r=row();
      r.appendChild(Object.assign(document.createElement('span'),
        {textContent:x.name||_t('數列 {0}',i+1),style:'font-size:12px;min-width:64px;color:var(--fg-dim)'}));
      /* 折線／區域圖：線色與點色在 ECharts 是 lineStyle.color 與 itemStyle.color 兩個欄位。
         面板只寫後者的話，改完顏色線不會變——這裡一次寫兩個。
         要拆開設不同色的（少數情形）請走 JSON 分頁；面板刻意不為此多開一格。
         顯示值也要回退到 lineStyle.color，否則只設了線色的圖會顯示成預設色盤。 */
      const isLine=!(kind==='bar'||kind==='barH');
      color(r,hexOf((x.itemStyle&&x.itemStyle.color)||(isLine&&x.lineStyle&&x.lineStyle.color),CHART_PAL[i%CHART_PAL.length]),
        h=>{ cvSet(op,'series.'+i+'.itemStyle.color','#'+h);
             if(isLine) cvSet(op,'series.'+i+'.lineStyle.color','#'+h); },
        isLine?_t('線與資料點的顏色'):_t('系列顏色'));
      if(kind==='bar'||kind==='barH'){
        const bw=(x.itemStyle&&x.itemStyle.borderWidth)||0;
        num(r,_t('邊框'),bw,v=>cvSet(op,'series.'+i+'.itemStyle.borderWidth',v||undefined),{min:0,max:10,unit:'px'});
        if(bw>0) color(r,hexOf(x.itemStyle.borderColor,'FFFFFF'),
          h=>cvSet(op,'series.'+i+'.itemStyle.borderColor','#'+h),_t('邊框顏色'));
        // OOXML 的長條沒有圓角概念，PptxGenJS 也無對應選項 → 只有 PNG 會呈現
        num(r,_t('圓角'),(x.itemStyle&&x.itemStyle.borderRadius)||0,
          v=>cvSet(op,'series.'+i+'.itemStyle.borderRadius',v||undefined),
          {min:0,max:40,unit:'px',lock:nat?PNG_ONLY:''});
        pngTag(r);
        num(r,_t('柱寬'),x.barWidth==null?null:parseFloat(x.barWidth),
          v=>cvSet(op,'series.'+i+'.barWidth',v==null?undefined:v+'%'),
          {min:5,max:100,unit:'%',placeholder:_t('自動')});
      }else{
        num(r,_t('線寬'),(x.lineStyle&&x.lineStyle.width)!=null?x.lineStyle.width:2,
          v=>cvSet(op,'series.'+i+'.lineStyle.width',v),{min:0.5,max:12,step:0.5,unit:'px'});
        chk(r,_t('端點'),()=>x.symbol!=='none',v=>cvSet(op,'series.'+i+'.symbol',v?undefined:'none'));
        if(x.symbol!=='none')
          num(r,_t('端點大小'),x.symbolSize,v=>cvSet(op,'series.'+i+'.symbolSize',v),
            {min:2,max:30,placeholder:'4',unit:'px'});
      }
    });
    if((op.series||[]).length>1){
      const rs=row();
      chk(rs,_t('堆疊'),()=>sh.ss.some(x=>x.stack),
        v=>{ for(const x of op.series){ if(v) x.stack=_t('總計'); else delete x.stack; } });
    }
  }else{
    note(_t('🔒 {0}。標題、圖例等其餘設定仍可調整。',esc(sh.reason)),'cvLock');
  }

  /* ---- 版面 ---- */
  sec(_t('版面'));
  const r13=row();
  if(isCat){
    lab(r13,_t('繪圖區留白'));
    for(const [k,t] of [['left',_t('左')],['right',_t('右')],['top',_t('上')],['bottom',_t('下')]])
      num(r13,t,op.grid&&typeof op.grid[k]==='number'?op.grid[k]:null,
        v=>cvSet(op,'grid.'+k,v),{min:0,max:300,placeholder:_t('自動'),unit:'px',w:60});
  }
  const r14=row();
  const bgOn=typeof op.backgroundColor==='string';
  chk(r14,_t('圖表底色'),()=>bgOn,v=>{ if(v) op.backgroundColor='#FFFFFF'; else delete op.backgroundColor; });
  if(bgOn) color(r14,hexOf(op.backgroundColor,'FFFFFF'),h=>{ op.backgroundColor='#'+h; },_t('圖表底色'));
  else lab(r14,_t('（透明，沿用投影片背景）'));

  note(_t('改動<b>即時反映在畫布上</b>，可用 Cmd/Ctrl+Z 復原。面板擋到圖表時拖標題列移開。<br>'
    +'<b>資料（類別名、數值、系列名）不在這裡改</b>——請切「option JSON」分頁，或把整份 JSON 交給 AI 產。<br>'
    +'面板只寫它自己那幾格，手寫的 <code>markLine</code>、<code>tooltip</code>、<code>visualMap</code> 等設定不會被動到。')
    +(nat? _t('<br><b>已勾「匯出為原生圖表」</b>：標<span class="cvPng">僅 PNG</span>的設定原生無對應，已停用。')
         : _t('<br>標<span class="cvPng">僅 PNG</span>的設定沒有原生圖表對應，勾了原生匯出就不會呈現。')));
  // 原本掛在小預覽角落的提示，預覽移除後改寫在這裡——這是匯出行為的差異，不能跟著預覽一起消失
  if(nat) note(_t('<b>原生圖表</b>：畫布上是 ECharts 的樣子，PPT 內的實際排版由 PowerPoint 決定，兩者不會完全一致。'));
}

