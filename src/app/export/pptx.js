'use strict';
/* ================= 匯出 PPTX ================= */
/* 一個 run → PptxGenJS 的 run options。文字框（parasToPptx）與表格儲存格（addTableToSlide）
   共用，兩邊才不會出現「文字框有上下標、儲存格沒有」這種靠人記得同步的差異。
   defSizePt 同 runSpan：文字框 18、儲存格 12。 */
function runPptxOpts(r,defSizePt){
  return {
    bold:!!r.bold,italic:!!r.italic,color:r.color||'1A1A1A',
    fontSize:r.sizePt||defSizePt,
    superscript:r.sup||undefined,subscript:r.sub||undefined,
    underline:r.underline?{style:'sng'}:undefined,
    strike:r.strike?'sngStrike':undefined,
    highlight:r.highlight||undefined,
    charSpacing:r.charSpacing||undefined,
    fontFace:r.fontFace||undefined,
    outline:r.outline?{size:r.outline.size||0.75,color:r.outline.color||'FFFFFF'}:undefined,
    glow:r.glow?{size:r.glow.size||8,color:r.glow.color||'FFFF00',opacity:r.glow.opacity!=null?r.glow.opacity:0.6}:undefined,
    hyperlink:r.link?(r.link.url?{url:r.link.url}:{slide:Math.max(1,Math.round(r.link.slide)||1)}):undefined,
  };
}
function parasToPptx(el){
  const out=[];
  for(const p of el.paras||[]){
    const rr=(p.runs&&p.runs.length)?p.runs:[{text:''}];
    // 段落級（bullet／段距）在 PptxGenJS 是掛在 run option 上，由該段第一個 run 帶頭寫進 <a:pPr>
    const bu= p.bullet? (p.bullet.type==='number'
        ? {type:'number',style:'arabicPeriod',startAt:Math.max(1,Math.round(p.bullet.startAt)||1),indent:BULLET_INDENT}
        : {code:p.bullet.code||BULLET_CHAR,indent:BULLET_INDENT}) : undefined;
    rr.forEach((r,i)=>out.push({text:String(r.text??''),options:{
      ...runPptxOpts(r,18),
      /* 行距要逐段給，不能只在元素層給一個值。畫布的 CSS line-height 是「無單位倍數」，
         每個 run 各自乘自己的字級；PptxGenJS 的 lineSpacing 是「絕對點數」，元素層只能給一個。
         元素層原本用 maxPt(el)（全元素最大字級）→ 一個 40pt 標題會把同框內 8pt 小字的行距
         也撐成 48pt，畫布只有 9.6pt。改成每段用該段自己的最大字級，落差就只剩「同一段內
         混字級」這種 CSS 也只能取最大值的情形。元素層那個值留著當沒有段落時的退路。 */
      ...(i===0? {bullet:bu,indentLevel:(p.bullet&&p.bullet.level)||undefined,
        lineSpacing:Math.round(paraPt(p)*(el.lineSpacing||1.2)*10)/10,
        paraSpaceBefore:p.spaceBefore||undefined,paraSpaceAfter:p.spaceAfter||undefined} : {}),
      align:p.align||'left',
      breakLine:i===rr.length-1}}));
  }
  return out.length?out:[{text:'',options:{fontSize:18}}];
}
const nvDowngrade=[];     // 匯出時填：勾了原生卻映射不過的圖表，匯出後明講，不靜默降級
async function chartPng(el){
  const div=document.createElement('div');
  div.style.cssText=`position:fixed;left:-10000px;top:0;width:${el.w}px;height:${el.h}px;`;
  document.body.appendChild(div);
  const inst=echarts.init(div,null,{renderer:'canvas'});
  inst.setOption(Object.assign(structuredClone(el.option),{animation:false}),true);
  const url=inst.getDataURL({type:'png',pixelRatio:3,backgroundColor:'rgba(255,255,255,0)'});
  inst.dispose(); div.remove();
  return url;
}
function addTableToSlide(slide,el){
  const tr=(el.opacity!=null&&el.opacity<100)? 100-el.opacity : 0;
  const dom=tableDom(el.id);
  const trH=dom? [...dom.querySelectorAll('tr')].map(t=>t.offsetHeight) : el.rowH;
  const rows=el.cells.map(row=>{
    const arr=[];
    row.forEach(cell=>{
      if(cell.covered) return;
      const o={align:cell.align||'left',
        valign:{top:'top',middle:'middle',bottom:'bottom'}[cell.valign||'middle'],
        bold:!!cell.bold,italic:!!cell.italic,color:cell.color||'1A1A1A',
        fontSize:cell.sizePt||12,
        margin:[0,0.03,0,0.03],   // 單位是「吋」！0.03in ≈ 2.2pt ≈ 預覽 3px（xlsx2pptx 踩坑 #10）
        // 行距用整格最大字級：同一格內混字級時 OOXML 的 <a:lnSpc> 一段只能一個值，取最大才不會裁字
        lineSpacing:Math.round(Math.max(...cellRuns(cell).map(r=>r.sizePt||12))*(cell.lineSpacing||1.2)*10)/10};
      // 逐格四邊：PptxGenJS border 陣列順序 [上,右,下,左]，各邊寫成原生 <a:lnT/lnR/lnB/lnL>
      // type:'dash' → 該邊 <a:prstDash val="sysDash"/>（PptxGenJS 只認 dash／solid 兩種）
      o.border= ['t','r','b','l'].map(k=>{ const s=cellSide(el,cell,k);
        return s? {type:s.dash?'dash':'solid',pt:s.pt,color:s.color} : {type:'none'}; });
      if(cell.fill) o.fill={color:cell.fill,...(tr?{transparency:tr}:{})};
      if(cell.colspan>1) o.colspan=cell.colspan;
      if(cell.rowspan>1) o.rowspan=cell.rowspan;
      /* 格內混排：PptxGenJS 的儲存格 text 本來就吃 {text,options} 陣列（和文字框共用 jt()），
         所以這裡只要把 runs 攤成陣列即可，每個 run 都寫全樣式。
         ⚠ 有 runs 時**必須把四個文字樣式鍵從儲存格層級拿掉**：PptxGenJS 只在值為真時才寫
         `b="1"`／`i="1"`（原始碼 `null!=t&&t.bold? ' b="1"':''`），**沒有 `b="0"` 這條路**。
         於是「整格粗體、某幾個字不粗」的 run 因為 bold:false 什麼都沒寫，反而被格層級的
         b="1" 蓋回去——實測就是整格都變粗。拿掉之後每個 run 自己說了算，沒寫＝不粗。
         扁平格仍走單一字串那條路：XML 一模一樣，舊簡報的匯出結果因此逐位元組不變。 */
      if(Array.isArray(cell.runs)&&cell.runs.length){
        for(const k of ['bold','italic','color','fontSize']) delete o[k];
        arr.push({text:cellRuns(cell).map(r=>({text:String(r.text||''),options:runPptxOpts(r,12)})),options:o});
      }else arr.push({text:String(cell.text||''),options:o});
    });
    return arr;
  });
  slide.addTable(rows,{x:px2in(el.x),y:px2in(el.y),
    colW:el.colW.map(px2in),rowH:trH.map(px2in),autoPage:false,objectName:el.id});
}
// 原生陰影：只用 outer（PptxGenJS 3.12 對 inner 的收尾標籤寫死成 </a:outerShdw>，會產出不合法 XML）
function shadowOpt(el){
  const s=el&&el.shadow; if(!s) return undefined;
  return {type:'outer',blur:s.blur??SHADOW_DEF.blur,offset:s.offset??SHADOW_DEF.offset,
    angle:Math.round(s.angle??SHADOW_DEF.angle),color:s.color||SHADOW_DEF.color,
    opacity:s.opacity??SHADOW_DEF.opacity};
}
/* 物件層級超連結 → PptxGenJS 的 options.hyperlink。
   ⚠ 只有 addImage 與 addShape 兩條路可用；**addText 這條路壞的**：
   PptxGenJS 3.12 註冊 hyperlink 關聯的迴圈只走「每個 run 的 options.hyperlink」（run 級連結），
   沒有處理 addText **物件層級**的 options.hyperlink → _rId 從未指派，XML 寫出
   `r:id="rIdundefined"`（懸空關聯，PowerPoint 判為毀損），而且該連結還會被下推到每個 run
   並強制加上 u="sng"（整塊當按鈕用時不該有底線）。
   因此文字框與非線條形狀改為「不交給 PptxGenJS」，於匯出後處理自行注入 cNvPr 的 hlinkClick ＋ 關聯，
   見 exportPptx 的補丁 (8)。走 addText 的判定＝isTextPath()。 */
function isTextPath(el){ return el.type==='text'||(el.type==='shape'&&!LINE_KINDS[el.shape]); }
function linkOpt(el){
  const l=el&&el.link; if(!l) return undefined;
  const o= l.url? {url:l.url} : {slide:Math.max(1,Math.round(l.slide)||1)};
  if(l.tooltip) o.tooltip=l.tooltip;
  return o;
}
const reEsc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');   // 元素 id 進 RegExp 前先轉義
// <a:gradFill>：色標位置單位是 1/1000 %（0～100000），角度是 1/60000 度（0°＝由左至右）
function gradXml(g){
  const gs=g.stops.map(s=>`<a:gs pos="${Math.round(s.pos*1000)}"><a:srgbClr val="${s.color}"/></a:gs>`).join('');
  const dir= g.type==='radial'
    ? '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>'
    : `<a:lin ang="${Math.round(g.angle*OOX_DEG)}" scaled="0"/>`;
  return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst>${dir}</a:gradFill>`;
}
const xmlAttr=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/* 匯出期的媒體去重鍵。
   PptxGenJS 其實有去重，但它比的是 options.path，而本工具一直只給 data、沒給 path，
   所以 `t.path===c` 那條永遠不成立——同一張圖被重複寫進 ppt/media/ 好幾份。驗收測試簿
   實測：26 個媒體檔裡只有 7 種相異內容，改完剩 11 個、檔案小 12.4%。
   作法是把內容雜湊當成假的 path：內容相同 → path 相同 → 共用同一個 Target → zip 內
   只留一份。位元組仍由 data 帶走，不會因為多了 path 就跑去抓檔案——PptxGenJS 的
   抓檔清單是 `!t.data` 過濾的，我們永遠有 data（2026-09-15 實測 network 零請求）。

   ⚠ 去重只在「同一頁內」生效：_relsMedia 是每頁一份的陣列，去重濾鏡只掃自己那頁，
     而 Target 又寫死了 _slideNum。跨頁重複吃不到，要吃得動 vendor，見功能缺口總表。
   ⚠ cNvPr 的 descr 是 `altText || options.path`，所以一給 path，沒有替代文字的圖片
     descr 就會從 "preencoded.png" 變成雜湊檔名——PowerPoint 的「編輯替代文字」會直接
     顯示它，而 TC-27 明訂該欄位必須空白。既有的清除寫死比對 "preencoded.png"，攔不到
     雜湊；故改為比對「本次真的餵出去過的 path」（見 isInternalMediaPath），精確，且
     不會誤傷剛好長得像檔名的使用者替代文字。
   SVG 走另一條分支（先轉 PNG、本來就不去重），不套用。 */
const _expMediaPath=new Map();
function exportMediaPath(dataUrl){
  if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:')) return null;
  const mime=(dataUrl.slice(0,dataUrl.indexOf(',')).match(/^data:([^;,]+)/)||[])[1]||'';
  const ext=MIME2EXT[mime];
  if(!ext||ext==='svg') return null;
  let v=_expMediaPath.get(dataUrl);
  if(!v){ v=assetHash(dataUrlDecode(dataUrl).bytes)+'.'+ext; _expMediaPath.set(dataUrl,v); }
  return v;
}
/* 餵出去過的 path 一覽，給 descr 清除用——不靠字串樣式猜，只清自己放進去的。 */
const isInternalMediaPath=v=>v==='preencoded.png'||[..._expMediaPath.values()].includes(v);
async function addElToSlide(slide,el,pend){
  const common={x:px2in(el.x),y:px2in(el.y),w:px2in(el.w),h:px2in(el.h),objectName:el.id};
  const tr=(el.opacity!=null&&el.opacity<100)? 100-el.opacity : 0;   // pptx transparency：0=不透明
  const sh=shadowOpt(el);
  const lk=linkOpt(el);
  if(el.type==='table'){ addTableToSlide(slide,el); return; }
  if(el.type==='video'){
    // 封面圖：使用者沒給就自繪一張（不連網、不用 PptxGenJS 內建的佔位 PNG，那張很醜）
    const cover=el.cover||drawFallbackCover(el.w,el.h, el.mode==='online'? _t('YouTube 影片') : ((el.src&&el.src.name)||_t('影片')));
    if(el.mode==='online'){
      // type:'online' → 只寫 TargetMode="External" 的關聯（Target 即 embed 網址）＋封面圖，無影片位元組
      slide.addMedia({...common,type:'online',link:el.embed,cover,
        ...(el.alt?{altText:el.alt}:{})});
      return;
    }
    // 本機影片：完全不呼叫 addMedia，只放封面圖佔位。三路提示之一＝替代文字（descr）
    const tip=_t('待插入影片：{0}',((el.src&&el.src.name)||_t('影片'))+durText(el));
    slide.addImage({...common,data:cover,altText:el.alt? el.alt+_t('（{0}）',tip):tip,
      ...(tr?{transparency:tr}:{}),...(sh?{shadow:sh}:{}),...(lk?{hyperlink:lk}:{})});
    if(pend) pend.push(tip);
    return;
  }
  if(el.type==='image'){
    const o={...common,data:el.dataUrl};
    const mp=exportMediaPath(el.dataUrl); if(mp) o.path=mp;   // 媒體去重鍵，見 exportMediaPath
    /* 裁切：PptxGenJS 的 sizing:'crop' 算 srcRect 的公式是
         l=x/w、r=(w-(x+w_))/w（t/b 同理），而最終 ext 取的是 sizing.w/h。
       所以餵進去的 o.w/o.h 必須是「裁切後恰好等於框」的虛擬原圖尺寸 vw/vh，
       四邊比例才會正好等於 el.crop，且 ext 仍是真正的框尺寸。
       vw=W/(1-l-r) 與畫布端 imgGeom 用的是同一條式子——兩邊不會漂移。 */
    const cr=cropOf(el);
    if(!cropIsEmpty(cr)){
      const W=px2in(el.w), H=px2in(el.h);
      const vw=W/Math.max(.02,1-cr.l-cr.r), vh=H/Math.max(.02,1-cr.t-cr.b);
      o.w=vw; o.h=vh;
      o.sizing={type:'crop',x:vw*cr.l,y:vh*cr.t,w:W,h:H};
    }
    if(el.round) o.rounding=true;
    if(el.alt) o.altText=el.alt;
    if(el.rot) o.rotate=el.rot;
    if(el.flipH) o.flipH=true;
    if(el.flipV) o.flipV=true;
    if(tr) o.transparency=tr;
    if(sh) o.shadow=sh;
    if(lk) o.hyperlink=lk;
    slide.addImage(o); return;
  }
  if(el.type==='chart'){
    // 旗標只是「意圖」，匯出前一律重跑一次 nativeMap——使用者可能勾完之後又改了 option。
    // 檢查沒過就退回 PNG，但退回這件事會在匯出報告明說，不靜默降級。
    const m=el.native? nativeMap(el.option) : null;
    if(m&&!m.ok) nvDowngrade.push({id:el.id,reason:m.reason});
    if(m&&m.ok){
      const o={...common,...m.opts};
      if(el.alt)o.altText=el.alt;
      // 繪圖區鎖定：不鎖的話 PowerPoint 會依圖例／軸標籤長度自行伸縮，跟畫布落差最大的就是這裡
      // 繪圖區：優先用面板設定的 grid 換算成比例，沒設才用預設
      const g=el.option&&el.option.grid;
      const fr=(v,tot,d)=>typeof v==='number'? Math.max(0,Math.min(0.4,v/tot)) : d;
      const L=fr(g&&g.left,el.w,0.06), R=fr(g&&g.right,el.w,0.04);
      /* 上緣預設要替標題留高度。PowerPoint 的標題是自動排版、繪圖區卻是這裡鎖死的，
         不留位就會被標題壓到——圓餅／環圈這種「填滿繪圖區」的圖形最明顯（實測重疊）。
         下緣早就替圖例留了 0.16，上緣漏掉標題，是同一件事只做了一半。
         留多少跟著標題字級走，並給 0.14 的下限（PowerPoint 標題框自帶內距）。 */
      const tTop=o.showTitle? Math.min(0.35,Math.max(0.14,pt2px(o.titleFontSize||14)*2.4/el.h)) : 0.08;
      const T=fr(g&&g.top,el.h,tTop), B=fr(g&&g.bottom,el.h,o.showLegend?0.16:0.08);
      if(!o.layout) o.layout={x:L,y:T,w:Math.max(0.2,1-L-R),h:Math.max(0.2,1-T-B)};
      slide.addChart(m.type,m.data,o); return;
    }
    const o={...common,data:await chartPng(el)};
    if(tr)o.transparency=tr; if(el.alt)o.altText=el.alt; if(sh)o.shadow=sh; if(lk)o.hyperlink=lk;
    slide.addImage(o); return; }
  if(el.type==='shape'&&LINE_KINDS[el.shape]){
    const k=LINE_KINDS[el.shape];
    const o={...common,line:{color:el.lineColor||'333333',width:el.linePt||1.5,dashType:dashKind(el).key}};
    if(k.begin) o.line.beginArrowType='triangle';
    if(k.end) o.line.endArrowType='triangle';
    if(el.flipH) o.flipH=true;
    if(el.flipV) o.flipV=true;
    if(tr) o.line.transparency=tr;
    if(sh) o.shadow=sh;
    if(lk) o.hyperlink=lk;
    slide.addShape(k.pptx,o);   // line 或 bentConnector3（PPT 原生連接線）
    return;
  }
  // 文字框與含文字／純色形狀：一律走 addText（關 autofit、行距鎖定）
  // margin 這裡的單位是「點」（PptxGenJS 對 addText 走 R()＝pt→EMU；表格儲存格的 margin 才是吋）
  const o={...common,valign:{top:'top',middle:'middle',bottom:'bottom'}[el.valign||'top'],
    margin:el.inset||0,fit:'none',wrap:!el.nowrap,
    // 元素層行距只是退路：有段落時 parasToPptx 會逐段覆蓋掉它（PptxGenJS 取 run 的 options 優先）
    lineSpacing:Math.round(maxPt(el)*(el.lineSpacing||1.2)*10)/10};
  if(VERT_MODES[el.vert]) o.vert=el.vert;   // → <a:bodyPr vert="…">（PptxGenJS 原樣寫出，不驗值，故先過白名單）
  // 漸層：先寫第一個色標的 solidFill 當錨點，後製再整段換成 <a:gradFill>（PptxGenJS 無原生 API）
  const fillCol= el.grad? el.grad.stops[0].color : el.fill;
  if(fillCol) o.fill={color:fillCol,...(tr?{transparency:tr}:{})};
  if(el.lineColor!=null) o.line={color:el.lineColor,width:el.linePt||1,dashType:dashKind(el).key,...(tr?{transparency:tr}:{})};
  if(sh) o.shadow=sh;
  // 物件連結刻意「不」在這裡設（見 linkOpt 上方說明）：addText 的 hyperlink 會產出懸空 rIdundefined
  if(el.rot) o.rotate=el.rot;
  if(el.type==='shape'){
    if(el.shape==='custGeom'&&Array.isArray(el.points)&&el.points.length){
      o.shape='custGeom';   // 路徑座標先按 pathW/pathH→w/h 縮放成 px，再換算成吋（PptxGenJS 的 points 單位）
      const [csx,csy]=custScale(el), ix=v=>px2in((+v||0)*csx), iy=v=>px2in((+v||0)*csy);
      o.points=el.points.map(pt=>{
        if(pt.close) return {close:true};
        const q={x:ix(pt.x),y:iy(pt.y)};
        if(pt.moveTo) q.moveTo=true;
        if(pt.curve){ const c=pt.curve, k={type:c.type};
          k.x1=ix(c.x1); k.y1=iy(c.y1);
          if(c.type==='cubic'){ k.x2=ix(c.x2); k.y2=iy(c.y2); }
          if(c.type==='arc'){ delete k.x1; delete k.y1;
            k.wR=ix(c.wR); k.hR=iy(c.hR);
            // ⚠ PptxGenJS 的 arcTo 角度收的是「度」，內部再乘 60000（bundle 的 O()）。
            // OOXML 與本專案內部一律用 1/60000 度，直接送會被乘兩次（實測 270° 變 971978400000）。
            // 另注意 O() 只做一次 t>360 的減法，故 stAng 必須先正規化進 [0,360)。
            k.stAng=normAng(c.stAng)/OOX_DEG;
            k.swAng=Math.max(-360,Math.min(360,c.swAng/OOX_DEG)); }
          q.curve=k; }
        return q;
      });
    }else o.shape=SHAPES[el.shape]? el.shape : 'rect';   // key＝prstGeom 名稱，PptxGenJS 同名支援
    // roundRect 圓角與其他 adj 一律在匯出後處理注入 avLst（rectRadius 換算值不準），此處不設
    if(el.flipH) o.flipH=true;
    if(el.flipV) o.flipV=true;
  }
  slide.addText(el.paras? parasToPptx(el):[{text:'',options:{fontSize:12}}],o);
}
// 字體後處理：兩種模式都明確填 latin/ea/cs（不剝離、不切 run），全 run lang=zh-TW
// 鎖定模式寫死三字體；繼承模式寫 +mn-lt/+mn-ea/+mn-cs 主題槽引用（貼上時由目的端母版接手）
// 頁面轉場（進入此頁時播放）。morph 走 mc:AlternateContent（p159 命名空間，PowerPoint 2019+/365），
// 舊版開啟時自動退回 fallback 的 fade；morph 跨頁配對靠「同名同型」shape——本工具 shape 名＝元素 JSON id，
// 複製頁刻意保留元素 id 即為此用（改位置/大小/adj 後兩頁同 id 元素會平滑補間）
const TRANSITIONS={
  morph:{label:_t('平滑（Morph）')},
  fade:{label:_t('淡出')},
  push:{label:_t('推入')},
  wipe:{label:_t('擦去')},
};
function transitionXml(tr){
  if(!tr||!TRANSITIONS[tr.type]) return '';
  if(tr.type==='morph'){
    const dur=Math.max(100,Math.min(10000,Math.round(tr.dur||600)));
    const opt={byObject:1,byWord:1,byChar:1}[tr.option]? tr.option:'byObject';
    return '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
      +'<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">'
      +`<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="slow" p14:dur="${dur}"><p159:morph option="${opt}"/></p:transition>`
      +'</mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
  }
  const inner={fade:'<p:fade/>',push:'<p:push dir="u"/>',wipe:'<p:wipe dir="l"/>'}[tr.type];
  return `<p:transition spd="med">${inner}</p:transition>`;
}
