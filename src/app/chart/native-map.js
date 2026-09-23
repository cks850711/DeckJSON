'use strict';
/* ================= 原生圖表對應 =================
   ECharts option 能不能、以及怎麼對應成 PowerPoint 原生圖表。不碰畫面，屬模型層：
   畫布角標（render）、面板勾選框（props、圖表 modal）、正規化的顏色檢查（normalize）、
   匯出（export）都要問同一個問題，所以放在它們共同的下層，而不是匯出區段裡。 */
/* ---- ECharts option → PowerPoint 原生圖表（addChart）----
   單向、匯出當下才跑：option 永遠是唯一真相來源，這裡只「讀它、生一份臨時資料」，
   從不寫回。所以「切回 PNG」不是還原，是不呼叫這個函式而已。
   同一個函式兼任檢查器（面板勾選框看 ok）與轉換器（匯出看 data/opts），
   避免出現「勾得下去卻匯不出來」的不一致。 */
const NCHART_UNSUP={sankey:_t('桑基圖'),treemap:_t('矩形樹圖'),sunburst:_t('旭日圖'),gauge:_t('儀表板'),
  graph:_t('關係圖'),heatmap:_t('熱力圖'),candlestick:_t('K 線圖'),boxplot:_t('盒鬚圖'),funnel:_t('漏斗圖'),
  parallel:_t('平行座標'),themeRiver:_t('主題河流'),tree:_t('樹狀圖'),map:_t('地圖'),pictorialBar:_t('象形柱狀圖'),
  custom:_t('自訂 series'),effectScatter:_t('漣漪散布圖')};
// ECharts splitLine.lineStyle → PptxGenJS 的格線描述
function gridLine(ax){
  const ls=((ax||{}).splitLine||{}).lineStyle||{};
  const o={};
  if(nvHex(ls.color)) o.color=nvHex(ls.color);
  if(typeof ls.width==='number') o.size=ls.width;
  if(ls.type==='dashed') o.style='dash'; else if(ls.type==='dotted') o.style='dot';
  return Object.keys(o).length? o : undefined;
}
function nvNum(v){ return typeof v==='object'&&v? (Array.isArray(v)? v[1] : v.value) : v; }
/* 一個 series 在 OOXML 只有一個顏色，但 ECharts 把線色與點色分成兩個欄位。
   優先取 itemStyle（圖例與資料標籤跟著它走），沒設才退到 lineStyle——
   先前只讀 itemStyle，「只設了線色」的折線圖匯出會靜靜退回 ECharts 預設色盤，
   畫布與 PPT 各自看起來都正常，是最難察覺的那種落差。 */
const serColor=s=>nvHex(s.itemStyle&&s.itemStyle.color)||nvHex(s.lineStyle&&s.lineStyle.color);
// ECharts 允許 #f00 縮寫，OOXML 的 srgbClr 只認 6 位，要展開
function nvHex(c){
  if(typeof c!=='string') return null;
  const h=c.replace('#','').trim().toUpperCase();
  if(/^[0-9A-F]{3}$/.test(h)) return h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return /^[0-9A-F]{6}$/.test(h)? h : null;
}
// 面板勾選框與匯出共用。回 {ok:false,reason} 或 {ok:true,type,data,opts,drop[]}
function nativeMap(op){
  if(!op||typeof op!=='object') return {ok:false,reason:_t('option 不是物件')};
  const ss=(op.series||[]).filter(s=>s&&typeof s==='object');
  if(!ss.length) return {ok:false,reason:_t('option 內沒有 series')};
  const t0=ss[0].type;
  const bad=ss.find(s=>NCHART_UNSUP[s.type]);
  if(bad) return {ok:false,reason:_t('{0}沒有 PowerPoint 原生對應',NCHART_UNSUP[bad.type])};
  if(ss.some(s=>s.type!==t0)) return {ok:false,reason:_t('同一張圖混用多種 series 型別，原生圖表無法表示')};
  const drop=[];                       // 映射時被丟掉的設定，回報給使用者
  const chk=(cond,what)=>{ if(cond&&!drop.includes(what)) drop.push(what); };
  for(const s of ss){
    chk(s.markLine||s.markArea||s.markPoint,_t('標記線／標記區（markLine／markArea）'));
    chk(s.label&&typeof s.label.formatter==='string',_t('資料標籤的 formatter 樣板'));
    chk(s.emphasis,_t('滑鼠移入強調（emphasis）'));
    // 逐點顏色只有圓餅類保得住（chartColors 在圓餅是逐項而非逐系列），其餘圖種必丟
    chk(s.type!=='pie'&&Array.isArray(s.data)&&s.data.some(v=>v&&typeof v==='object'&&v.itemStyle),
      _t('逐點自訂顏色'));
    chk(s.itemStyle&&s.itemStyle.borderRadius,_t('長條圓角（OOXML 無此概念）'));
    // 折線的線色與點色在 ECharts 是兩個欄位，OOXML 的一個 series 只有一個顏色
    {const a=nvHex(s.itemStyle&&s.itemStyle.color), b=nvHex(s.lineStyle&&s.lineStyle.color);
     chk(a&&b&&a!==b,_t('折線與資料點不同色（原生圖表一個數列只有一種顏色，取資料點色）'));}
  }
  chk(op.visualMap,_t('視覺映射（visualMap）'));
  for(const ax of [op.xAxis,op.yAxis])
    chk(ax&&ax.type==='value'&&ax.axisLabel&&ax.axisLabel.show===false,
      _t('隱藏數值軸標籤（PptxGenJS 只能整根軸刪掉）'));
  for(const ax of [op.xAxis,op.yAxis])
    chk(ax&&ax.minorSplitLine&&ax.minorSplitLine.show,_t('副格線（PptxGenJS 未開放 minorGridlines）'));
  chk(op.graphic,_t('自由圖層（graphic）'));
  chk(op.dataZoom,_t('縮放軸（dataZoom）'));
  chk(op.tooltip,_t('滑鼠提示（tooltip，PPT 無此概念）'));

  const legend=op.legend&&op.legend.show!==false;
  const ti=(op.title&&!Array.isArray(op.title))?op.title:null;
  const lb0=(ss[0].label)||{};
  // itemStyle.borderWidth/Color → OOXML 的資料點外框 <c:spPr><a:ln>
  const bw=(ss[0].itemStyle||{}).borderWidth;
  const common={
    showLegend:!!legend,
    legendPos:legend? ({top:'t',bottom:'b',left:'l',right:'r'}[
      ['top','bottom','left','right'].find(k=>op.legend[k]!=null&&op.legend[k]!=='auto')]||'b') : 'b',
    // 能鎖的全鎖上：字體與色盤不交給目標母版主題決定，盡量貼近畫布
    chartColors:ss.map((s,i)=>serColor(s)||CHART_PAL[i%CHART_PAL.length]),
    dataLabelFontFace:'Noto Sans TC',catAxisLabelFontFace:'Noto Sans TC',
    showValue:ss.some(s=>s.label&&s.label.show),
    dataLabelFontSize:lb0.fontSize,
    dataLabelColor:nvHex(lb0.color)||undefined,
    dataLabelPosition:({top:'t',inside:'ctr',insideTop:'inEnd',insideBottom:'inBase',
      outside:'outEnd',center:'ctr'})[lb0.position]||undefined,
    legendFontSize:(op.legend&&op.legend.textStyle||{}).fontSize,
    legendColor:nvHex((op.legend&&op.legend.textStyle||{}).color)||undefined,
    ...(bw>0? {dataBorder:{pct:bw,color:nvHex((ss[0].itemStyle||{}).borderColor)||'FFFFFF'}} : {}),
    ...(typeof op.backgroundColor==='string'&&nvHex(op.backgroundColor)?
      {chartArea:{fill:{color:nvHex(op.backgroundColor)}}} : {}),
    // 視覺編輯面板改的外觀要能一路帶到原生圖表，否則面板只對 PNG 有效
    ...(ti&&ti.text? {showTitle:true,title:String(ti.text),
      titleAlign:({left:'left',center:'center',right:'right'}[ti.left])||'center',
      ...(nvHex(ti.textStyle&&ti.textStyle.color)? {titleColor:nvHex(ti.textStyle.color)}:{}),
      ...(ti.textStyle&&ti.textStyle.fontSize? {titleFontSize:ti.textStyle.fontSize}:{})} : {showTitle:false}),
  };

  // 圓餅／環圈：標籤與數值都綁在 series.data 內，不看類別軸
  if(t0==='pie'){
    const raw=ss[0].data||[];
    if(!raw.length) return {ok:false,reason:_t('series.data 是空的')};
    const d=raw.map((v,i)=>({name:(v&&v.name)||_t('項目 {0}',i+1),value:nvNum(v)}));
    const r=ss[0].radius, inner=Array.isArray(r)? parseFloat(r[0]) : 0;
    return {ok:true,drop,type:inner>0?'doughnut':'pie',
      data:[{name:ss[0].name||_t('數列 1'),labels:d.map(x=>x.name),values:d.map(x=>x.value)}],
      opts:{...common,
        ...(typeof ss[0].startAngle==='number'? {firstSliceAng:(360-ss[0].startAngle+90)%360} : {}),
        // 圓餅的色盤是「逐項」而非「逐系列」，要重算
        chartColors:d.map((x,i)=>nvHex(raw[i]&&raw[i].itemStyle&&raw[i].itemStyle.color)||CHART_PAL[i%CHART_PAL.length]),
        ...(inner>0?{holeSize:Math.max(10,Math.min(90,Math.round(inner)))}:{})}};
  }

  // 其餘圖種：標籤在類別軸上。ECharts 橫條圖是把類別軸擺 yAxis
  const xCat=op.xAxis&&op.xAxis.type==='category'&&Array.isArray(op.xAxis.data);
  const yCat=op.yAxis&&op.yAxis.type==='category'&&Array.isArray(op.yAxis.data);
  if(t0==='scatter'){
    // 散布圖沒有類別軸，資料是 [x,y] 對
    const pts=(ss[0].data||[]).filter(Array.isArray);
    if(!pts.length) return {ok:false,reason:_t('散布圖的 series.data 需為 [x,y] 座標對陣列')};
    return {ok:true,drop,type:'scatter',
      data:[{name:'X',values:pts.map(p=>p[0])},
        ...ss.map((s,i)=>({name:s.name||_t('數列 {0}',i+1),
          values:(s.data||[]).filter(Array.isArray).map(p=>p[1])}))],
      opts:common};
  }
  if(!xCat&&!yCat) return {ok:false,reason:_t('找不到類別軸標籤（xAxis.data 或 yAxis.data）')};
  const labels=(xCat?op.xAxis:op.yAxis).data.map(v=>String((v&&v.value!=null)?v.value:v));
  const type= t0==='bar' ? 'bar'
    : t0==='line' ? (ss.some(s=>s.areaStyle)?'area':'line')
    : null;
  if(!type) return {ok:false,reason:_t('ECharts 的 {0} 圖沒有 PowerPoint 原生對應',t0)};
  const valAx=(xCat?op.yAxis:op.xAxis)||{};
  const catAx=(xCat?op.xAxis:op.yAxis)||{};
  const stacked=ss.some(s=>s.stack);
  // PptxGenJS 的 lineChart 分支從頭到尾不寫 <c:grouping>，折線圖的堆疊表達不出來。
  // 不能靜靜吞掉——畫布是堆疊、匯出變成各自獨立的線，是最難察覺的那種落差。
  chk(type==='line'&&stacked,_t('折線圖的堆疊（PptxGenJS 的 lineChart 不輸出 c:grouping）'));
  return {ok:true,drop,type,
    data:ss.map((s,i)=>({name:s.name||_t('數列 {0}',i+1),labels,
      values:(s.data||[]).map(nvNum).map(v=>isFinite(v)?v:0)})),
    opts:{...common,
      barDir: type==='bar'? (yCat?'bar':'col') : undefined,
      /* area 也必須給值：PptxGenJS 只有在 barGrouping==='stacked' 時才替 areaChart 寫 <c:grouping>，
         留空的話畫布上的堆疊區域圖匯出後會變成互相覆蓋的重疊區域，而且沒有任何提示。
         非堆疊時明寫 'standard'，順便讓 XML 帶齊 CT_AreaChart 要求的 grouping。*/
      barGrouping: type==='bar'? (stacked?'stacked':'clustered')
                 : type==='area'? (stacked?'stacked':'standard') : undefined,
      lineSmooth: type!=='bar'&&ss.some(s=>s.smooth),
      // 格線：ECharts 的 splitLine 掛在被切分的那根軸上，valGridLine／catGridLine 依此對應
      valGridLine: (valAx.splitLine&&valAx.splitLine.show===false)? {style:'none'} : gridLine(valAx),
      catGridLine: ((xCat?op.xAxis:op.yAxis).splitLine||{}).show===true? gridLine(catAx) : {style:'none'},
      // 柱寬：ECharts barWidth 是「柱佔類別寬的百分比」，OOXML barGapWidthPct 是「柱與柱的間隙百分比」
      barGapWidthPct: (type==='bar'&&ss[0].barWidth)?
        Math.max(0,Math.min(500,Math.round(100/(parseFloat(ss[0].barWidth)/100)-100))) : undefined,
      catAxisTitle:(xCat?op.xAxis:op.yAxis).name||undefined,
      showCatAxisTitle:!!(xCat?op.xAxis:op.yAxis).name,
      // 軸線／刻度／類別軸標籤：面板改的要能帶進原生，否則勾了原生等於白調
      catAxisLineShow:!(catAx.axisLine&&catAx.axisLine.show===false),
      valAxisLineShow:!(valAx.axisLine&&valAx.axisLine.show===false),
      catAxisMajorTickMark:(catAx.axisTick&&catAx.axisTick.show===false)?'none':'out',
      valAxisMajorTickMark:(valAx.axisTick&&valAx.axisTick.show===false)?'none':'out',
      catAxisLabelPos:(catAx.axisLabel&&catAx.axisLabel.show===false)?'none':undefined,
      catAxisLabelFontSize:(catAx.axisLabel||{}).fontSize,
      valAxisLabelFontSize:(valAx.axisLabel||{}).fontSize,
      catAxisLabelColor:nvHex((catAx.axisLabel||{}).color)||undefined,
      valAxisLabelColor:nvHex((valAx.axisLabel||{}).color)||undefined,
      catAxisLabelRotate:(catAx.axisLabel||{}).rotate,
      catAxisLineColor:nvHex(((catAx.axisLine||{}).lineStyle||{}).color)||undefined,
      valAxisLineColor:nvHex(((valAx.axisLine||{}).lineStyle||{}).color)||undefined,
      catAxisLineSize:((catAx.axisLine||{}).lineStyle||{}).width,
      valAxisLineSize:((valAx.axisLine||{}).lineStyle||{}).width,
      catAxisTitleFontSize:(catAx.nameTextStyle||{}).fontSize,
      valAxisTitleFontSize:(valAx.nameTextStyle||{}).fontSize,
      catAxisTitleColor:nvHex((catAx.nameTextStyle||{}).color)||undefined,
      valAxisTitleColor:nvHex((valAx.nameTextStyle||{}).color)||undefined,
      valAxisMajorUnit:typeof valAx.interval==='number'?valAx.interval:undefined,
      valAxisOrientation:valAx.inverse?'maxMin':undefined,
      ...(type!=='bar'? {
        lineSize:(ss[0].lineStyle&&ss[0].lineStyle.width)!=null?ss[0].lineStyle.width:2,
        lineDataSymbol:ss[0].symbol==='none'?'none':'circle'} : {}),
      valAxisTitle:valAx.name||undefined, showValAxisTitle:!!valAx.name,
      // 軸範圍：ECharts 沒寫就不鎖，交給 PowerPoint 自動（鎖死會讓改資料後爆表）
      valAxisMinVal:typeof valAx.min==='number'?valAx.min:undefined,
      valAxisMaxVal:typeof valAx.max==='number'?valAx.max:undefined}};
}
// ECharts 預設色盤前幾色，series 沒指定 itemStyle 時比照
const CHART_PAL=['5470C6','91CC75','FAC858','EE6666','73C0DE','3BA272','FC8452','9A60B4'];
