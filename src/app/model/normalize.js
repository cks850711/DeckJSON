'use strict';
/* ================= JSON 交換 ================= */
/* ---- 手貼／AI 產生的 JSON 一律過這裡：新選配欄位若型別或範圍不對就刪掉或夾回合法值，
       避免壞值一路帶到匯出才炸（PptxGenJS 對不合法值多半是靜默產出壞 XML → PowerPoint 要求修復）---- */
const hex6=v=>{ const s=String(v==null?'':v).replace('#','').toUpperCase();
  return /^[0-9A-F]{6}$/.test(s)? s:null; };
const clampN=(v,lo,hi,def)=>{ const n=+v; return isFinite(n)? Math.max(lo,Math.min(hi,n)) : def; };
// 自訂幾何的髒值防線。AI 產座標很方便，但也很容易產出上千點、超界座標或亂寫的 curve type，
// 這些到匯出才炸就太晚了——一律在載入時夾回或丟掉。
const CUST_MAX_PTS=400;   // 點數上限：超過就截斷，免得 XML 爆掉（PowerPoint 開一份幾千點的形狀會很慘）
// pw/ph＝路徑座標空間（el.pathW/pathH），不是元素尺寸——座標夾在這個框內，
// 元素縮放不再改動座標，所以拉小圖形不會被夾壞（見 custPath 的說明）
/* 座標容許範圍是路徑框外擴一倍（[-pw, 2pw]），不是夾在框內。
   OOXML 本來就允許 custGeom 的座標伸出路徑框——圖說框的尾巴、bracePair 的括號都靠這個，
   畫布的 svg 也一直是 overflow:visible。原本夾在 [0,pw] 會讓 preset 轉 custGeom 時
   毀掉 23 個形狀（heart 的控制點就伸出半個框寬）。留一倍餘裕仍擋得住手改 JSON 的亂值。 */
function normPoints(pts,pw,ph){
  if(!Array.isArray(pts)) return [];
  const W=pw||1, H=ph||1;
  const cx=v=>Math.max(-W,Math.min(2*W,+v||0)), cy=v=>Math.max(-H,Math.min(2*H,+v||0));
  const out=[];
  for(const raw of pts.slice(0,CUST_MAX_PTS)){
    if(!raw||typeof raw!=='object') continue;
    if(raw.close){ out.push({close:true}); continue; }
    if(!isFinite(+raw.x)||!isFinite(+raw.y)) continue;
    const p={x:cx(raw.x),y:cy(raw.y)};
    const c=raw.curve;
    if(c&&typeof c==='object'){
      if(c.type==='cubic'&&['x1','y1','x2','y2'].every(k=>isFinite(+c[k])))
        p.curve={type:'cubic',x1:cx(c.x1),y1:cy(c.y1),x2:cx(c.x2),y2:cy(c.y2)};
      else if(c.type==='quadratic'&&['x1','y1'].every(k=>isFinite(+c[k])))
        p.curve={type:'quadratic',x1:cx(c.x1),y1:cy(c.y1)};
      else if(c.type==='arc'&&['wR','hR','stAng','swAng'].every(k=>isFinite(+c[k])))
        // 角度單位同 OOXML：1/60000 度（21600000＝整圈）。swAng 夾在正負一圈內——
        // 匯出端的 PptxGenJS 表達不了超過一圈的掃掠，先夾住比匯出後才發現形狀怪掉好
        p.curve={type:'arc',wR:Math.abs(+c.wR),hR:Math.abs(+c.hR),
                 stAng:normAng(Math.round(+c.stAng)),
                 swAng:Math.max(-ANG_FULL,Math.min(ANG_FULL,Math.round(+c.swAng)))};
      // 其餘 curve.type 一律當直線處理（白名單，不放行未知型別）
    }
    if(raw.moveTo) p.moveTo=true;
    out.push(p);
  }
  // 首點必須是 moveTo，否則 OOXML 的 pathLst 沒有起點
  const first=out.find(p=>!p.close);
  if(first) first.moveTo=true;
  return out;
}
/* 漸層：至少兩個色標才成立，否則整個鍵丟掉（退回單色 fill）。
   色標位置排序後存，畫布與匯出都不必再排一次。 */
function normGrad(el){
  const g=el&&el.grad;
  if(!g||typeof g!=='object'||!Array.isArray(g.stops)){ delete el.grad; return; }
  const stops=g.stops.map(s=>({pos:Math.max(0,Math.min(100,Math.round(+(s||{}).pos)||0)),color:hex6((s||{}).color)}))
    .filter(s=>s.color).slice(0,GRAD_MAX).sort((a,b)=>a.pos-b.pos);
  if(stops.length<2){ delete el.grad; return; }
  el.grad={type:g.type==='radial'?'radial':'linear',
    angle:((Math.round(+g.angle)||0)%360+360)%360, stops};
}
function normBorder(v){   // → {pt,color,dash?}｜null
  if(!v||typeof v!=='object') return null;
  const c=hex6(v.color); if(!c) return null;
  return {pt:clampN(v.pt,0.25,12,0.75),color:c,...(v.dash?{dash:true}:{})};
}
function normShadow(o){   // 原生陰影：合法才留，其餘刪鍵
  const s=o&&o.shadow;
  if(!s||typeof s!=='object'||!hex6(s.color||SHADOW_DEF.color)){ if(o) delete o.shadow; return; }
  o.shadow={blur:clampN(s.blur,0,100,SHADOW_DEF.blur),offset:clampN(s.offset,0,100,SHADOW_DEF.offset),
    angle:Math.round(clampN(s.angle,0,359,SHADOW_DEF.angle)),color:hex6(s.color)||SHADOW_DEF.color,
    opacity:clampN(s.opacity,0,1,SHADOW_DEF.opacity)};
}
function normRunOpts(r){
  r.underline=!!r.underline||undefined; if(!r.underline) delete r.underline;
  r.strike=!!r.strike||undefined; if(!r.strike) delete r.strike;
  // 上下標：渲染與匯出都吃這兩個鍵，先前漏了驗證（型別寫錯會一路帶進匯出）；兩者互斥
  for(const k of ['sup','sub']) if(k in r){ if(r[k]===true||r[k]==='true'||r[k]===1) r[k]=true; else delete r[k]; }
  if(r.sup&&r.sub) delete r.sub;
  if('highlight' in r){ const h=hex6(r.highlight); if(h) r.highlight=h; else delete r.highlight; }
  if('charSpacing' in r){ const n=+r.charSpacing;
    if(isFinite(n)&&n!==0) r.charSpacing=Math.max(-5,Math.min(30,n)); else delete r.charSpacing; }
  if('fontFace' in r){ const f=String(r.fontFace||'').trim(); if(f) r.fontFace=f; else delete r.fontFace; }
  if('outline' in r){ const c=hex6((r.outline||{}).color)||'FFFFFF';
    if(r.outline&&typeof r.outline==='object') r.outline={size:clampN(r.outline.size,0.25,8,1),color:c}; else delete r.outline; }
  if('glow' in r){ const c=hex6((r.glow||{}).color)||'FFFF00';
    if(r.glow&&typeof r.glow==='object') r.glow={size:clampN(r.glow.size,1,50,8),color:c,opacity:clampN(r.glow.opacity,0,1,0.6)}; else delete r.glow; }
  if('link' in r){ const l=r.link;
    if(l&&typeof l==='object'&&typeof l.url==='string'&&l.url.trim()) r.link={url:l.url.trim()};
    else if(l&&typeof l==='object'&&+l.slide>0) r.link={slide:Math.round(+l.slide)};
    else delete r.link; }
}
function normElLink(el){   // 物件層級超連結（形狀／圖片／圖表／線條）：{url|slide,tooltip?}
  const l=el.link;
  if(!l||typeof l!=='object'){ delete el.link; return; }
  const o= (typeof l.url==='string'&&l.url.trim())? {url:l.url.trim()}
         : (+l.slide>0)? {slide:Math.round(+l.slide)} : null;
  if(!o){ delete el.link; return; }
  if(l.tooltip!=null&&String(l.tooltip).trim()) o.tooltip=String(l.tooltip).trim().slice(0,200);
  el.link=o;
}
/* 影片元素驗證：**位元組永不入 JSON** 是硬規則，所以這裡明確擋掉 src.data／src.path
   （AI 或手改 JSON 很可能好意塞進來），並限制 cover 必須是 data:image/。 */
function normVideo(el){
  el.mode= el.mode==='online'? 'online':'local';
  if(el.mode==='online'){
    const em=ytEmbed(el.embed);
    if(!em) throw new Error(_t('影片 {0} 的 embed 不是可解析的 YouTube 網址',el.id));
    el.embed=em; delete el.src;
  }else{
    const s=(el.src&&typeof el.src==='object')? el.src : {};
    el.src={name:String(s.name||_t('影片')).slice(0,120),
      durationSec:Math.max(0,Math.round(+s.durationSec)||0),
      natW:Math.max(0,Math.round(+s.natW)||0),natH:Math.max(0,Math.round(+s.natH)||0)};
    delete el.embed;
  }
  if(typeof el.cover==='string'&&looksLikeAssetRef(el.cover))
    throw new Error(_t('影片 {0} 的 cover 是資產引用「{1}」，但這份 JSON 不在容器裡——'
      +'從 .deck 容器裡單獨挖出來的 deck.json 要連同 assets/ 一起開，不能只貼 JSON。',el.id,el.cover));
  if(typeof el.cover!=='string'||!el.cover.startsWith('data:image/')) delete el.cover;
}
function normParaOpts(p){
  if('bullet' in p){ const b=p.bullet;
    if(b&&typeof b==='object'){
      const o={type: b.type==='number'?'number':'bullet', level:Math.max(0,Math.min(8,Math.round(+b.level)||0))};
      if(o.type==='number') o.startAt=Math.max(1,Math.round(+b.startAt)||1);
      else if(/^[0-9A-Fa-f]{4}$/.test(String(b.code||''))) o.code=String(b.code).toUpperCase();
      p.bullet=o;
    }else delete p.bullet; }
  for(const k of ['spaceBefore','spaceAfter']){
    if(!(k in p)) continue;
    const n=+p[k]; if(isFinite(n)&&n>0) p[k]=Math.min(72,n); else delete p[k];
  }
}
/* ---- chart.option 的顏色檢查 ----
   option 原封不動交給 ECharts，最終落到 ctx.fillStyle，所以裡面必須是「合法 CSS 色」；
   而 deck 其餘欄位（run.color／fill／lineColor…）的慣例是不帶 # 的裸碼。同一份檔案兩套互斥慣例，
   是 2026-08-07 那次「七張圖表全黑」的成因：canvas 對無效色字串靜默沿用前一個值，不報錯、不進 console。

   這裡只改「原值不是合法色、補上 # 之後才是 6／8 位色碼」的字串，其餘一律不動。
   兩道判準缺一不可：
   - CSS.supports 認出已經合法的值（具名色 red、rgba()、transparent）不要碰
   - 長度限 6／8 位。實測 'fade'／'beef' 這種英文單字補上 # 之後是合法的 4 位 hex 色，
     只靠 CSS.supports 會把它們改成顏色。裸碼慣例本來就是 6 位，3／4 位一律歸類為無法辨識並回報 */
const CHART_COLOR_KEY=/^(color|borderColor|backgroundColor|shadowColor|textBorderColor|textShadowColor|areaColor|fill|stroke)$/;
const NORM_REPORT={colorFixed:0,colorBad:[],mapMissing:[],mapNameBad:[]};
function fixChartColor(v,k,out){
  if(!CHART_COLOR_KEY.test(k||'')||!v) return undefined;
  if(CSS.supports('color',v)) return undefined;                 // 已合法（含具名色、rgba()、漸層關鍵字）
  if(/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(v)&&CSS.supports('color','#'+v)){ out.colorFixed++; return '#'+v; }
  if(out.colorBad.length<20) out.colorBad.push(k+': '+String(v).slice(0,24));
  return undefined;                                             // 補了也不合法：留著原樣，只回報
}
function normChartColors(node,key,out){
  if(Array.isArray(node)){
    // 陣列元素沿用上層鍵名：頂層色盤 color:[…]、visualMap.inRange.color:[…] 都是這個形狀
    node.forEach((v,i)=>{
      if(typeof v==='string'){ const f=fixChartColor(v,key,out); if(f!==undefined) node[i]=f; }
      else normChartColors(v,key,out);
    });
    return;
  }
  if(!node||typeof node!=='object') return;
  for(const k in node){
    const v=node[k];
    if(typeof v==='string'){ const f=fixChartColor(v,k,out); if(f!==undefined) node[k]=f; }
    else normChartColors(v,k,out);
  }
}
/* ---- deck 層地圖 ----
   ECharts 的 map series 要先 echarts.registerMap(名稱, GeoJSON)，而那是 option 之外的
   執行期呼叫——option 自己存不下地圖幾何，換一台電腦開就是空白。把 GeoJSON 收進
   deck.maps，載入時逐一註冊，map series 才成為「單檔可攜」的。
   代價：map 在 NCHART_UNSUP 內（PowerPoint 沒有原生地圖），匯出一律走 PNG。 */
function normMaps(m){
  if(!m||typeof m!=='object'||Array.isArray(m)) return null;
  const o={};
  for(const k of Object.keys(m)){
    const g=m[k], name=String(k).trim().slice(0,40);
    if(!name||!g||typeof g!=='object') continue;
    // 只認 GeoJSON 的兩種頂層形狀。registerMap 收到別的東西不會當場失敗，
    // 而是等到畫的時候才炸，錯誤訊息也指不回這裡
    const ok= g.type==='FeatureCollection'? Array.isArray(g.features)
            : g.type==='GeometryCollection'? Array.isArray(g.geometries) : false;
    if(ok) o[name]=g;
  }
  return Object.keys(o).length? o : null;
}
/* map series 的兩種靜默失敗，症狀都是「那一塊沒上色」而不是報錯：
   一是 series.map 指到未註冊的名稱（整張圖空白），
   二是 data[].name 與 GeoJSON 的 properties.name 對不上（那一個縣市維持底色）。
   後者實測踩過：名稱多了 ' City' 這種後綴就對不上。 */
function checkMapSeries(s,out){
  if(!s||s.type!=='map'||!s.map) return;
  const mp=echarts.getMap(s.map);
  if(!mp){ if(!out.mapMissing.includes(s.map)) out.mapMissing.push(s.map); return; }
  const names=new Set(((mp.geoJson||{}).features||[]).map(f=>((f||{}).properties||{}).name));
  for(const d of (s.data||[]))
    if(d&&d.name&&!names.has(d.name)&&out.mapNameBad.length<20&&!out.mapNameBad.includes(d.name))
      out.mapNameBad.push(d.name);
}
function registerMaps(d){
  for(const k in (d.maps||{})){
    // 已註冊就跳過：registerMap 對大 GeoJSON 要做一輪座標轉換，而 normalizeDeck
    // 每次貼上、每次套用 JSON 都會跑。換地圖走匯入那條路徑，那裡一律覆蓋註冊
    if(!echarts.getMap(k)) try{ echarts.registerMap(k,d.maps[k]); }catch(e){ console.warn('[deckjson] 地圖 '+k+' 註冊失敗：'+e.message); }
  }
}
function normalizeDeck(d){
  NORM_REPORT.colorFixed=0; NORM_REPORT.colorBad=[]; NORM_REPORT.mapMissing=[]; NORM_REPORT.mapNameBad=[];
  if(!d||typeof d!=='object'||!Array.isArray(d.pages)||!d.pages.length) throw new Error(_t('不是有效的 DeckJSON（缺 pages）'));
  // 地圖要在 normEls 之前註冊：那裡會檢查 map series 引用的名稱在不在
  {const mp=normMaps(d.maps); if(mp){ d.maps=mp; registerMaps(d); } else delete d.maps;}
  d.format='deckjson'; d.version=d.version||1;
  d.title=d.title||_t('未命名簡報');
  d.fontMode= d.fontMode==='inherit'?'inherit':'locked';
  /* 環境設定（尺寸／預留區／字體／語言）：一律過 normProfile 夾值。
     舊版 JSON 沒有這些鍵時補上中性預設，其中 stage 的預設正好＝舊版寫死的 1280×720，故完全相容。 */
  {const p=normProfile({name:d.profileName||_t('預設'),stage:d.stage,zones:d.zones,fonts:d.fonts,lang:d.lang});
   d.profileName=p.name; d.stage=p.stage; d.zones=p.zones; d.fonts=p.fonts; d.lang=p.lang;}
  for(const k of ['author','company','subject']){   // 檔案屬性：字串才留，空值一律刪鍵
    if(d[k]==null||!String(d[k]).trim()) delete d[k]; else d[k]=String(d[k]).trim();
  }
  // 自動頁碼／日期：物件才留，位置／字級／顏色一律 clamp 到合法範圍
  for(const [key,def] of [['pageNum',PAGENUM_DEF],['date',DATE_DEF]]){
    const p=d[key];
    if(!p||typeof p!=='object'){ delete d[key]; continue; }
    p.pos=['bl','bc','br'].includes(p.pos)? p.pos:def.pos;
    p.sizePt=Math.max(6,Math.min(36,Math.round(+p.sizePt)||def.sizePt));
    p.color=hex6(p.color)||def.color;
    if(p.skipFirst) p.skipFirst=true; else delete p.skipFirst;
  }
  if(d.date){   // 日期另有「自動更新／固定文字」兩態；固定文字沒填內容等於沒設，退回自動
    d.date.fmt= d.date.fmt==='fixed'? 'fixed':'auto';
    const t=String(d.date.text||'').trim().slice(0,60);
    if(t) d.date.text=t; else{ delete d.date.text; d.date.fmt='auto'; }
  }
  {const m=normMaster(d.master); if(m) d.master=m; else delete d.master;}
  const mstIds=new Set(((d.master||{}).elements||[]).map(e=>e.id));
  const secSeen=new Set();   // 章節標題去重（同名會被 PptxGenJS 併成同一章，見 uniqTitle）
  for(const pg of d.pages){
    pg.id=pg.id||uid('p'); pg.bg=pg.bg||'FFFFFF';
    // 章節：有非空字串＝從本頁起一個新章節；空字串／缺鍵＝延續上一章
    if(typeof pg.section==='string'&&pg.section.trim()) pg.section=uniqTitle(pg.section.trim().slice(0,60),secSeen);
    else delete pg.section;
    if(typeof pg.bgImage==='string'&&looksLikeAssetRef(pg.bgImage))
      throw new Error(_t('頁面 {0} 的 bgImage 是資產引用「{1}」，但這份 JSON 不在容器裡。',pg.id,pg.bgImage));
    if(typeof pg.bgImage!=='string'||!pg.bgImage.startsWith('data:image/')) delete pg.bgImage;
    pg.transition=(pg.transition&&typeof pg.transition==='object'&&TRANSITIONS[pg.transition.type])? pg.transition:null;
    if(pg.transition&&pg.transition.type==='morph') pg.transition.dur=Math.max(100,Math.min(10000,Math.round(+pg.transition.dur)||600));
    pg.notes= pg.notes==null? '' : String(pg.notes);
    if(pg.skip) pg.skip=true; else delete pg.skip;   // 不放映（匯出 <p:sld show="0">）
    if(pg.noMaster) pg.noMaster=true; else delete pg.noMaster;   // 這一頁不套母版（如封面）
    pg.elements=normEls(pg.elements,mstIds);
  }
  // console 一律留痕（含自動存檔還原這條靜默路徑）；要不要跳視窗由呼叫端決定
  if(NORM_REPORT.colorFixed||NORM_REPORT.colorBad.length)
    console.warn('[deckjson] chart.option 顏色：自動補 # '+NORM_REPORT.colorFixed+' 處'
      +(NORM_REPORT.colorBad.length? '；無法辨識 '+NORM_REPORT.colorBad.length+' 處 → '+NORM_REPORT.colorBad.join(_t('、')) : ''));
  if(NORM_REPORT.mapMissing.length)
    console.warn('[deckjson] map series 引用了 deck.maps 沒有的地圖：'+NORM_REPORT.mapMissing.join(_t('、')));
  if(NORM_REPORT.mapNameBad.length)
    console.warn('[deckjson] map series 的區域名稱在 GeoJSON 找不到：'+NORM_REPORT.mapNameBad.join(_t('、')));
  return d;
}
// 開檔與套用 JSON 這兩個「人剛貼進來一份東西」的時機才跳視窗——
// 這類缺陷的本質是靜默，修法的重點就在會不會叫
function reportChartIssues(){
  const r=NORM_REPORT, msg=[];
  if(r.colorFixed) msg.push(_t('已自動補上 # 的圖表顏色：{0} 處。\n'
    +'（chart.option 是原生 ECharts 規格，顏色必須帶 #；deck 其餘欄位相反，一律裸碼。）',r.colorFixed));
  if(r.colorBad.length) msg.push(_t('以下圖表顏色無法辨識，已原樣保留——畫布上該處可能不顯示，或沿用前一個元素的顏色：\n{0}',
    r.colorBad.join('\n')));
  if(r.mapMissing.length) msg.push(_t('以下地圖沒有幾何資料，圖表會是空白：{0}'
    +'\n請在圖表的「option JSON」分頁按「匯入地圖 GeoJSON」補上，名稱要與 series.map 相同。',r.mapMissing.join(_t('、'))));
  if(r.mapNameBad.length) msg.push(_t('以下地圖區域名稱在 GeoJSON 內找不到，該區會維持底色：\n{0}'
    +'\n（名稱要與 GeoJSON 的 properties.name 逐字相同。）',r.mapNameBad.join(_t('、'))));
  if(msg.length) alert(msg.join('\n\n'));
}
/* reserved：不得撞名的既有 id（頁面元素不可與母版元素同名）。
   撞名會讓畫布的 [data-id] 查詢、匯出後製的 name="<id>" 正則、以及 Morph 配對三處同時認錯對象；
   母版是共用的，所以改名一律改頁面這一邊。 */
function normEls(list,reserved){
  const arr=Array.isArray(list)?list:[];
  const seenIds=new Set(reserved||[]);   // 同頁 id 去重（JSON 手貼複製元素常忘了改 id → 點選/屬性面板會認錯對象）；跨頁同 id 合法且是 Morph 配對依據
  for(const el of arr){
    el.id=el.id||uid('e');
    if(seenIds.has(el.id)) el.id=uid('e');
    seenIds.add(el.id);
    el.x=Math.round(el.x||0); el.y=Math.round(el.y||0);
    if(el.opacity!=null){ const o=Math.round(+el.opacity); el.opacity=(isFinite(o)&&o>=0&&o<100)?o:undefined; if(el.opacity===undefined) delete el.opacity; }
    if(el.groupId!=null) el.groupId=String(el.groupId); else delete el.groupId;
    el.hidden=!!el.hidden||undefined; if(!el.hidden) delete el.hidden;
    el.locked=!!el.locked||undefined; if(!el.locked) delete el.locked;
    if(el.lineSpacing!=null){ const ls=+el.lineSpacing; el.lineSpacing=(isFinite(ls)&&ls>=0.5&&ls<=5)?ls:undefined; if(el.lineSpacing===undefined) delete el.lineSpacing; }
    normShadow(el);
    normElLink(el);
    if(el.alt==null||!String(el.alt).trim()) delete el.alt; else el.alt=String(el.alt).trim();
    // 線型：只認 DASH_KINDS 的 key，solid 等同不設（維持 JSON 精簡）
    if(el.dash!=null){ const ok=DASH_KINDS.some(d=>d.key===el.dash&&d.key!=='solid');
      if(!ok) delete el.dash; }
    // 文字框內距／不換行（只對有文字的元素有意義）
    if(el.type==='text'||(el.type==='shape'&&el.paras)){
      if(el.inset!=null){ const n=+el.inset;
        if(isFinite(n)&&n>0) el.inset=Math.min(72,n); else delete el.inset; }
      if(el.nowrap) el.nowrap=true; else delete el.nowrap;
      if(!VERT_MODES[el.vert]) delete el.vert;   // 白名單外一律丟掉：亂值會讓 PowerPoint 開不了檔
    }else{ delete el.inset; delete el.nowrap; delete el.vert; }
    // 漸層填色：只有走 addText 那條路（文字框／非線條形狀）才有 spPr 可注入
    if(el.type==='text'||(el.type==='shape'&&!LINE_KINDS[el.shape])) normGrad(el); else delete el.grad;
    if(el.type==='video') normVideo(el);
    if(el.type==='image'){
      if(el.fit!=='cover') delete el.fit;
      if(el.round) el.round=true; else delete el.round;
      normCrop(el);
    }else{ delete el.fit; delete el.round; delete el.crop; }
    // adj：舊格式 adj/adj2 是 0–1 比例，新格式 el.adjs 是 OOXML 千分比陣列（100000＝100%）
    if(el.type==='shape'&&(typeof el.adj==='number'||typeof el.adj2==='number')&&!Array.isArray(el.adjs)){
      const mig=[el.adj,el.adj2].map(v=>typeof v==='number'&&isFinite(v)? Math.round(v*OOX_PCT) : null);
      while(mig.length&&mig[mig.length-1]==null) mig.pop();
      if(mig.length) el.adjs=mig;
    }
    delete el.adj; delete el.adj2;
    if(el.type==='shape'&&Array.isArray(el.adjs)){
      const n=adjCount(el.shape);
      el.adjs=el.adjs.slice(0,n).map(v=>(v==null||!isFinite(v))? null
        : Math.round(Math.max(-ADJ_LIMIT,Math.min(ADJ_LIMIT,+v))));
      while(el.adjs.length&&el.adjs[el.adjs.length-1]==null) el.adjs.pop();
      if(!el.adjs.length) delete el.adjs;
    }else delete el.adjs;
    if(el.type==='table'){
      if(!Array.isArray(el.colW)||!Array.isArray(el.rowH)||!Array.isArray(el.cells)) throw new Error(_t('表格 {0} 缺 colW/rowH/cells',el.id));
      el.cells=el.cells.map(row=>row.map(c=>{ const cc=Object.assign(defCell(),c);
        if(cc.border&&typeof cc.border==='object'){   // 逐邊：合法值→{pt,color,dash?}；null／不合法→null（明確無線）；缺鍵＝沿用整表
          for(const k of ['t','r','b','l']) if(k in cc.border) cc.border[k]=normBorder(cc.border[k]);
          for(const k of Object.keys(cc.border)) if(!['t','r','b','l'].includes(k)) delete cc.border[k];
          if(!Object.keys(cc.border).length) delete cc.border;
        }else delete cc.border;
        normCell(cc);   // 格內混排：md 展開／run 瘦身／text 同步（見 normCell 上方說明）
        return cc; }));
      el.border= ('border' in el)? (el.border? (normBorder(el.border)||null):null) : {pt:0.75,color:'999999'};
    }else{
      el.w=Math.max(1,Math.round(el.w??100)); el.h=Math.max(0,Math.round(el.h??40));
    }
    if(el.type==='shape'){
      if(el.dir!==undefined){ el.flipV=el.dir==='up'; delete el.dir; }  // 舊格式相容
      if(el.shape==='custGeom'){
        // 路徑座標空間。舊檔沒有這兩鍵＝座標當年就是 px，補成當時的 w/h 完全等價（比例 1）
        el.pathW=Math.max(1,Math.round(+el.pathW>0? +el.pathW : el.w));
        el.pathH=Math.max(1,Math.round(+el.pathH>0? +el.pathH : el.h));
        el.points=normPoints(el.points,el.pathW,el.pathH);
      }else{ delete el.points; delete el.pathW; delete el.pathH;
        if(!SHAPES[el.shape]&&!LINE_KINDS[el.shape]) el.shape='rect'; }
    }
    if(el.type==='image'||el.type==='shape') el.rot=((parseFloat(el.rot)||0)%360+360)%360;
    if(el.type==='text'&&!el.paras) el.paras=mkParas(el.text||'',{sizePt:el.sizePt||18});
    if(Array.isArray(el.paras)) for(const p of el.paras){ normParaOpts(p);
      // markdown 輸入糖：展開成 runs 後刪鍵，存檔只留一種形式
      if(typeof p.md==='string') p.runs=mdToRuns(p.md,(p.runs||[])[0]||{});
      delete p.md;
      if(Array.isArray(p.runs)) for(const r of p.runs) normRunOpts(r); }
    if(el.type==='chart'&&!el.option) el.option=structuredClone(SAMPLE_CHART);
    if(el.type==='chart'){
      normChartColors(el.option,'',NORM_REPORT);
      for(const s of (el.option.series||[])) checkMapSeries(s,NORM_REPORT);
    }
    // native 只是旗標，映射不過就當沒勾——不能讓 JSON 帶進一個匯出時才發現無效的狀態
    if(el.type==='chart'){ if(el.native&&nativeMap(el.option).ok) el.native=true; else delete el.native; }
    if(el.type==='image'&&!el.dataUrl) throw new Error(_t('圖片 {0} 缺 dataUrl',el.id));
  }
  return arr;
}
/* 母版（「信紙」）：一份共用元素，套用到所有沒關閉的頁。
   on＝啟用；flatten＝匯出時畫進每一頁（而非放在母版上——畫進每頁的單張投影片複製到別的簡報也帶得走，代價是圖片位元組每頁各存一份）。 */
function normMaster(m){
  if(!m||typeof m!=='object') return null;
  const o={on:!!m.on,flatten:!!m.flatten,elements:normEls(m.elements)};
  return (o.on||o.elements.length)? o : null;
}
