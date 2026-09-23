'use strict';
/* ================= 形狀庫：preset 幾何引擎 ================= */
// key＝OOXML prstGeom 名稱（PptxGenJS ShapeType 同名）。
// 幾何**不再手寫近似路徑**：一律由 PRESET_GEOM（vendor/preset-geom.js，轉自 OOXML
// presetShapeDefinitions.xml）即時求值，所以畫布上看到的就是 PPT 裡的原生幾何本身。
// 一個 preset 含四段：avLst（調整值與預設）、gdLst（公式）、ahLst（黃點）、pathLst（輪廓）。
// 線條類（LINE_KINDS）另外處理：兩端點模型，可水平/垂直/斜向/翻轉。
const OOX_DEG=60000;          // OOXML 角度單位：1/60000 度
const D2R=Math.PI/(180*OOX_DEG);
const OOX_PCT=100000;         // adj 千分比：100000 ＝ 100%
const ADJ_LIMIT=21600000;     // adj 的絕對上限：角度型 adj 可到 21599999（＝整圈 360°），不能設更小
const ADJ_OPEN=500000;        // preset 寫 ±2147483647（＝不設限）時，滑桿改用的實用範圍（±500%）

// ---- guide 公式求值：ECMA-376 的 17 個運算子全集 ----
const gv=(a,V)=>typeof a==='number'? a : (V[a]!=null? V[a] : 0);
function fmla(op,args,V){
  const x=gv(args[0],V), y=gv(args[1],V), z=gv(args[2],V);
  switch(op){
    case 'val':  return x;
    case '*/':   return z? x*y/z : 0;
    case '+-':   return x+y-z;
    case '+/':   return z? (x+y)/z : 0;
    case '?:':   return x>0? y : z;
    case 'abs':  return Math.abs(x);
    case 'max':  return Math.max(x,y);
    case 'min':  return Math.min(x,y);
    case 'pin':  return y<x? x : (y>z? z : y);
    case 'sqrt': return Math.sqrt(Math.max(0,x));
    case 'mod':  return Math.sqrt(x*x+y*y+z*z);
    case 'at2':  return Math.atan2(y,x)/D2R;
    case 'cat2': return x*Math.cos(Math.atan2(z,y));
    case 'sat2': return x*Math.sin(Math.atan2(z,y));
    case 'cos':  return x*Math.cos(y*D2R);
    case 'sin':  return x*Math.sin(y*D2R);
    case 'tan':  return x*Math.tan(y*D2R);
  }
  return 0;
}
// 內建 guide：l/t/r/b、hc/vc、ss＝min(w,h)、wdN/hdN/ssdN（N 等分）、cdN 角度常數
function geomVars(w,h){
  const ss=Math.min(w,h);
  const V={w,h,l:0,t:0,r:w,b:h,hc:w/2,vc:h/2,ss,
    cd2:10800000,cd4:5400000,cd8:2700000,
    '3cd4':16200000,'3cd8':8100000,'5cd8':13500000,'7cd8':18900000};
  for(const n of [2,3,4,5,6,8,10,12,16,32]){ V['wd'+n]=w/n; V['hd'+n]=h/n; V['ssd'+n]=ss/n; }
  return V;
}
// 求出某形狀在 w×h＋給定 adj 下的全部 guide 值；adjs 缺項用 preset 預設
function geomEnv(key,w,h,adjs){
  const def=PRESET_GEOM[key]||PRESET_GEOM[geomKey(key)]; if(!def) return null;
  const V=geomVars(w,h);
  (def[0]||[]).forEach(([n,d],i)=>{ const a=adjs&&adjs[i]; V[n]=(a!=null&&isFinite(a))? +a : d; });
  for(const g of def[1]||[]) V[g[0]]=fmla(g[1],g.slice(2),V);
  return V;
}
const N3=v=>{ const n=Math.round(v*1000)/1000; return Object.is(n,-0)? 0 : n; };
// ⚠ OOXML 弧的角度是「真實幾何角」（從中心量出去那條射線的角度），不是橢圓的參數角。
// gdLst 裡到處用 cat2／sat2 把角度換算成橢圓上的點，就是在做這件事；arcTo 的 stAng／swAng
// 用的是同一套慣例。若誤當參數角，橢圓中心會算錯位（chord 實測偏 19px），弧的起訖點就對不上
// 同一份 gdLst 自己算出來的 x1/y1、x2/y2。轉換：參數角 φ = atan2(wR·sin a, hR·cos a)。
const ellPt=(cx,cy,wR,hR,a)=>{
  const p=Math.atan2(wR*Math.sin(a*D2R), hR*Math.cos(a*D2R));
  return [cx+wR*Math.cos(p), cy+hR*Math.sin(p)];
};
// arcTo → SVG A：OOXML 給「起始角＋掃掠角」，SVG 要「終點＋旗標」，須自行推終點。
// 每段最多 90°，large-arc 恆為 0，避開 SVG 大弧旗標的歧義，也自然支援 360° 以上的掃掠。
function arcSeg(cur,wR,hR,st,sw,out){
  const p0=Math.atan2(wR*Math.sin(st*D2R), hR*Math.cos(st*D2R));
  const cx=cur[0]-wR*Math.cos(p0), cy=cur[1]-hR*Math.sin(p0);
  let rest=sw, a=st, guard=0;
  while(Math.abs(rest)>1e-6&&guard++<32){
    const step=(rest>0?1:-1)*Math.min(Math.abs(rest),90*OOX_DEG);
    a+=step; rest-=step;
    const [ex,ey]=ellPt(cx,cy,wR,hR,a);
    out.push(`A${N3(Math.abs(wR))},${N3(Math.abs(hR))} 0 0 ${step>0?1:0} ${N3(ex)},${N3(ey)}`);
    cur[0]=ex; cur[1]=ey;
  }
}
// preset → SVG 子路徑清單。每個 pathLst 項可自帶座標空間（w/h），需線性縮放到元素尺寸。
function presetPaths(key,w,h,adjs){
  const def=PRESET_GEOM[key]; if(!def) return [];
  const V=geomEnv(key,w,h,adjs), out=[];
  for(const p of def[3]||[]){
    const sx=p[1]? w/p[1] : 1, sy=p[2]? h/p[2] : 1;
    const X=v=>gv(v,V)*sx, Y=v=>gv(v,V)*sy, d=[], cur=[0,0];
    for(const c of p[0]){
      switch(c[0]){
        case 'm': cur[0]=X(c[1]); cur[1]=Y(c[2]); d.push(`M${N3(cur[0])},${N3(cur[1])}`); break;
        case 'l': cur[0]=X(c[1]); cur[1]=Y(c[2]); d.push(`L${N3(cur[0])},${N3(cur[1])}`); break;
        case 'c': d.push('C'+[X(c[1]),Y(c[2]),X(c[3]),Y(c[4]),X(c[5]),Y(c[6])].map(N3).join(','));
                  cur[0]=X(c[5]); cur[1]=Y(c[6]); break;
        case 'q': d.push('Q'+[X(c[1]),Y(c[2]),X(c[3]),Y(c[4])].map(N3).join(','));
                  cur[0]=X(c[3]); cur[1]=Y(c[4]); break;
        case 'a': arcSeg(cur,gv(c[1],V)*sx,gv(c[2],V)*sy,gv(c[3],V),gv(c[4],V),d); break;
        case 'z': d.push('Z'); break;
      }
    }
    if(d.length) out.push({d:d.join(''),fill:p[3]||'',noStroke:!!p[4]});
  }
  return out;
}
// 子路徑的填色修飾（cube／can／bevel 這類立體感形狀會用到）。
// ⚠ 只是畫布預覽的近似；匯出走原生 prstGeom，實際明暗由 PowerPoint 自己算。
function shadeFill(hex,mode){
  if(mode==='none') return 'none';
  if(!mode||!hex) return hex? '#'+hex : 'none';
  const n=parseInt(hex,16), c=[(n>>16)&255,(n>>8)&255,n&255];
  const f={darken:v=>v*.5, darkenLess:v=>v*.8,
           lighten:v=>v+(255-v)*.5, lightenLess:v=>v+(255-v)*.2}[mode];
  if(!f) return '#'+hex;
  return '#'+c.map(v=>Math.round(Math.max(0,Math.min(255,f(v)))).toString(16).padStart(2,'0')).join('');
}
// 線條類：兩端點模型（bbox＋flipH/flipV），P2 為箭頭端
const LINE_KINDS={
  line:{label:_t('直線'),pptx:'line'},
  arrow:{label:_t('箭頭'),pptx:'line',end:1},
  doubleArrow:{label:_t('雙頭箭頭'),pptx:'line',begin:1,end:1},
  elbow:{label:_t('肘形連接線'),pptx:'bentConnector3'},
  elbowArrow:{label:_t('肘形箭頭'),pptx:'bentConnector3',end:1},
  elbowDoubleArrow:{label:_t('肘形雙箭頭'),pptx:'bentConnector3',begin:1,end:1},
};
// 形狀清單：中文名／分類／插入預設尺寸。幾何本身不在這裡，一律來自 PRESET_GEOM。
// 形狀名不走 _t()：各語言的名稱對的是該語言版 PowerPoint 的官方名稱，以 preset 名為鍵（語言包的
// shapes，例如 i18n/en.js），而且中文同名不同義的情形避不掉（「外框」是 frame 形狀，也是表格的外框線）。
// 分類代碼 rc 矩形／bs 基本圖案／ar 箭號圖案／eq 方程式／fl 流程圖／st 星星綵帶／cl 圖說／ab 動作按鈕
const SHAPE_META={
  // rc
  rect:["矩形","rc",200,120],
  roundRect:["圓角矩形","rc",200,120],
  snip1Rect:["單角減去矩形","rc",200,120],
  snip2SameRect:["同側兩角減去矩形","rc",200,120],
  snip2DiagRect:["對角兩角減去矩形","rc",200,120],
  snipRoundRect:["一角減去一角圓角矩形","rc",200,120],
  round1Rect:["單角圓角矩形","rc",200,120],
  round2SameRect:["同側兩角圓角矩形","rc",200,120],
  round2DiagRect:["對角兩角圓角矩形","rc",200,120],
  // bs
  ellipse:["橢圓","bs",200,120],
  triangle:["三角形","bs",200,120],
  rtTriangle:["直角三角形","bs",200,120],
  parallelogram:["平行四邊形","bs",200,120],
  trapezoid:["梯形","bs",200,120],
  nonIsoscelesTrapezoid:["不等腰梯形","bs",200,120],
  diamond:["菱形","bs",150,150],
  pentagon:["五邊形","bs",150,150],
  hexagon:["六邊形","bs",200,120],
  heptagon:["七邊形","bs",150,150],
  octagon:["八邊形","bs",150,150],
  decagon:["十邊形","bs",150,150],
  dodecagon:["十二邊形","bs",150,150],
  pie:["圓形圖","bs",150,150],
  pieWedge:["四分之一圓","bs",150,150],
  chord:["弦形","bs",150,150],
  teardrop:["淚滴形","bs",150,150],
  frame:["外框","bs",200,120],
  halfFrame:["半外框","bs",200,120],
  corner:["L 形","bs",200,120],
  diagStripe:["對角紋","bs",200,120],
  plus:["十字形","bs",150,150],
  plaque:["飾牌","bs",200,120],
  can:["圓柱","bs",130,160],
  cube:["立方體","bs",160,150],
  bevel:["斜角","bs",200,120],
  donut:["環圈","bs",150,150],
  noSmoking:["禁止符號","bs",150,150],
  blockArc:["弧形區塊","bs",150,150],
  foldedCorner:["摺角矩形","bs",200,120],
  smileyFace:["笑臉","bs",150,150],
  heart:["愛心","bs",150,140],
  lightningBolt:["閃電","bs",130,160],
  sun:["太陽","bs",150,150],
  moon:["月亮","bs",130,150],
  cloud:["雲朵","bs",170,120],
  arc:["弧形","bs",150,150],
  bracePair:["大括號對","bs",200,120],
  bracketPair:["中括號對","bs",200,120],
  leftBracket:["左中括號","bs",60,180],
  rightBracket:["右中括號","bs",60,180],
  leftBrace:["左大括號","bs",60,180],
  rightBrace:["右大括號","bs",60,180],
  gear6:["六齒齒輪","bs",150,150],
  gear9:["九齒齒輪","bs",150,150],
  funnel:["漏斗","bs",150,150],
  chartPlus:["圖表加號","bs",150,150],
  chartStar:["圖表星號","bs",150,150],
  chartX:["圖表叉號","bs",150,150],
  cornerTabs:["四角標籤","bs",200,120],
  squareTabs:["方形標籤","bs",200,120],
  plaqueTabs:["飾牌標籤","bs",200,120],
  // ar
  rightArrow:["右箭號","ar",220,110],
  leftArrow:["左箭號","ar",220,110],
  upArrow:["上箭號","ar",110,200],
  downArrow:["下箭號","ar",110,200],
  leftRightArrow:["左右箭號","ar",220,110],
  upDownArrow:["上下箭號","ar",110,220],
  quadArrow:["四向箭號","ar",150,150],
  leftRightUpArrow:["左右上箭號","ar",150,150],
  bentArrow:["彎曲箭號","ar",150,150],
  uturnArrow:["U 形箭號","ar",150,150],
  leftUpArrow:["左上箭號","ar",150,150],
  bentUpArrow:["向上彎曲箭號","ar",150,150],
  curvedRightArrow:["向右彎弧箭號","ar",150,150],
  curvedLeftArrow:["向左彎弧箭號","ar",150,150],
  curvedUpArrow:["向上彎弧箭號","ar",150,150],
  curvedDownArrow:["向下彎弧箭號","ar",150,150],
  stripedRightArrow:["虛線右箭號","ar",220,110],
  notchedRightArrow:["凹形右箭號","ar",220,110],
  homePlate:["五邊形箭號","ar",220,110],
  chevron:["山形箭號","ar",220,110],
  circularArrow:["環形箭號","ar",150,150],
  leftCircularArrow:["左環形箭號","ar",150,150],
  leftRightCircularArrow:["左右環形箭號","ar",150,150],
  swooshArrow:["掠過箭號","ar",200,120],
  rightArrowCallout:["右弧形箭號圖說","ar",200,120],
  leftArrowCallout:["左弧形箭號圖說","ar",200,120],
  upArrowCallout:["上箭號圖說","ar",150,190],
  downArrowCallout:["下箭號圖說","ar",150,190],
  leftRightArrowCallout:["左右箭號圖說","ar",200,120],
  upDownArrowCallout:["上下箭號圖說","ar",150,200],
  quadArrowCallout:["四向箭號圖說","ar",150,150],
  // eq
  mathPlus:["加","eq",130,130],
  mathMinus:["減","eq",130,130],
  mathMultiply:["乘","eq",130,130],
  mathDivide:["除","eq",130,130],
  mathEqual:["等於","eq",130,130],
  mathNotEqual:["不等於","eq",130,130],
  // fl
  flowChartProcess:["流程","fl",200,120],
  flowChartAlternateProcess:["替代流程","fl",200,120],
  flowChartDecision:["決策","fl",200,120],
  flowChartInputOutput:["資料","fl",200,120],
  flowChartPredefinedProcess:["預先定義的處理","fl",200,120],
  flowChartInternalStorage:["內部儲存裝置","fl",200,120],
  flowChartDocument:["文件","fl",200,120],
  flowChartMultidocument:["多重文件","fl",200,120],
  flowChartTerminator:["結束點","fl",180,90],
  flowChartPreparation:["準備","fl",200,120],
  flowChartManualInput:["手動輸入","fl",200,120],
  flowChartManualOperation:["手動作業","fl",200,120],
  flowChartConnector:["接點","fl",110,110],
  flowChartOffpageConnector:["跳離頁面參考","fl",200,120],
  flowChartPunchedCard:["卡片","fl",200,120],
  flowChartPunchedTape:["打孔紙帶","fl",200,120],
  flowChartSummingJunction:["總和接點","fl",110,110],
  flowChartOr:["或","fl",110,110],
  flowChartCollate:["對照","fl",200,120],
  flowChartSort:["排序","fl",200,120],
  flowChartExtract:["擷取","fl",200,120],
  flowChartMerge:["合併","fl",200,120],
  flowChartOnlineStorage:["儲存資料","fl",200,120],
  flowChartDelay:["延遲","fl",200,120],
  flowChartMagneticTape:["循序存取儲存裝置","fl",150,150],
  flowChartMagneticDisk:["磁碟","fl",140,120],
  flowChartMagneticDrum:["直接存取儲存裝置","fl",200,120],
  flowChartDisplay:["顯示","fl",200,120],
  flowChartOfflineStorage:["離線儲存裝置","fl",200,120],
  // st
  irregularSeal1:["爆炸 1","st",150,150],
  irregularSeal2:["爆炸 2","st",150,150],
  star4:["四角星","st",150,150],
  star5:["五角星","st",150,150],
  star6:["六角星","st",150,150],
  star7:["七角星","st",150,150],
  star8:["八角星","st",150,150],
  star10:["十角星","st",150,150],
  star12:["十二角星","st",150,150],
  star16:["十六角星","st",150,150],
  star24:["二十四角星","st",150,150],
  star32:["三十二角星","st",150,150],
  ribbon:["下彎綵帶","st",220,110],
  ribbon2:["上彎綵帶","st",220,110],
  ellipseRibbon:["下彎弧形綵帶","st",220,110],
  ellipseRibbon2:["上彎弧形綵帶","st",220,110],
  leftRightRibbon:["左右綵帶","st",220,110],
  verticalScroll:["直式捲軸","st",140,190],
  horizontalScroll:["橫式捲軸","st",190,140],
  wave:["波浪","st",220,110],
  doubleWave:["雙波浪","st",220,110],
  // cl
  wedgeRectCallout:["矩形圖說","cl",200,140],
  wedgeRoundRectCallout:["圓角圖說","cl",200,140],
  wedgeEllipseCallout:["橢圓圖說","cl",200,140],
  cloudCallout:["雲朵圖說","cl",200,140],
  borderCallout1:["線條圖說 1（外框）","cl",200,120],
  borderCallout2:["線條圖說 2（外框）","cl",200,120],
  borderCallout3:["線條圖說 3（外框）","cl",200,120],
  accentCallout1:["線條圖說 1（強調線）","cl",200,120],
  accentCallout2:["線條圖說 2（強調線）","cl",200,120],
  accentCallout3:["線條圖說 3（強調線）","cl",200,120],
  callout1:["線條圖說 1","cl",200,120],
  callout2:["線條圖說 2","cl",200,120],
  callout3:["線條圖說 3","cl",200,120],
  accentBorderCallout1:["線條圖說 1（外框與強調線）","cl",200,120],
  accentBorderCallout2:["線條圖說 2（外框與強調線）","cl",200,120],
  accentBorderCallout3:["線條圖說 3（外框與強調線）","cl",200,120],
  // ab
  actionButtonBlank:["動作按鈕：空白","ab",110,110],
  actionButtonHome:["動作按鈕：首頁","ab",110,110],
  actionButtonHelp:["動作按鈕：說明","ab",110,110],
  actionButtonInformation:["動作按鈕：資訊","ab",110,110],
  actionButtonBackPrevious:["動作按鈕：上一張","ab",110,110],
  actionButtonForwardNext:["動作按鈕：下一張","ab",110,110],
  actionButtonBeginning:["動作按鈕：第一張","ab",110,110],
  actionButtonEnd:["動作按鈕：最後一張","ab",110,110],
  actionButtonReturn:["動作按鈕：返回","ab",110,110],
  actionButtonDocument:["動作按鈕：文件","ab",110,110],
  actionButtonSound:["動作按鈕：聲音","ab",110,110],
  actionButtonMovie:["動作按鈕：影片","ab",110,110],
};
const SHAPE_CAT_NAMES={rc:_t('矩形'),bs:_t('基本圖案'),ar:_t('箭號圖案'),eq:_t('方程式圖形'),
  fl:_t('流程圖'),st:_t('星星及綵帶'),cl:_t('圖說文字'),ab:_t('動作按鈕')};
const SHAPES={};
for(const k in SHAPE_META){
  if(!PRESET_GEOM[k]) continue;                    // 分類表寫錯字時寧可少一個，也不要留個畫不出來的按鈕
  const m=SHAPE_META[k];
  const tr=UI_PACK.shapes&&UI_PACK.shapes[k];     // 語言包沒有這個形狀的名稱就用中文
  SHAPES[k]={label:tr||m[0],cat:m[1],size:[m[2],m[3]]};
}
// 自訂幾何：不是 preset，幾何來自元素自己的 points 陣列。
// 三種來源：形狀庫插入後直接開圖形編輯器、內建形狀按「轉成可編輯端點」、或由 AI 直接寫 points。
SHAPES.custGeom={label:_t('自訂幾何'),cat:'cg',size:[180,140]};
const CUST_SAMPLE=(w,h)=>[
  {x:0,y:h},{x:w*0.28,y:h*0.15,moveTo:false},
  {x:w*0.62,y:h*0.42,curve:{type:'quadratic',x1:w*0.45,y1:0}},
  {x:w,y:0},{x:w,y:h},{close:true}];
const SHAPE_CATS=[[_t('線條'),Object.keys(LINE_KINDS)],
  ...Object.keys(SHAPE_CAT_NAMES).map(c=>[SHAPE_CAT_NAMES[c],Object.keys(SHAPES).filter(k=>SHAPES[k].cat===c)]),
  [_t('自訂幾何'),['custGeom']]];

/* ---- 形狀 adj 控點（畫布黃點）----
   全部由 preset 的 avLst（有幾個調整值、預設多少）與 ahLst（控點擺哪、能拖多遠）產生，
   不再逐形狀手寫。這同時讓「avLst 要嘛不注入、要注入就得注入全部」那個坑結構性消失。
   ⚠ OOXML 的 min/max 界定的是**控點位置**而不是 adj 值，中間隔著 gdLst 公式，沒有解析反函式
   ——所以拖曳與滑桿範圍一律用數值反解（粗掃＋二分），見 solveAdj()。
   JSON 欄位為 el.adjs（陣列，OOXML 千分比；100000＝100%）；舊格式 el.adj/el.adj2 於
   normalizeDeck 換算後淘汰。 */
const ADJ_LABELS={   // 沿用既有的好名字，其餘一律「調整 N」
  roundRect:[_t('圓角')], round1Rect:[_t('圓角')], round2SameRect:[_t('圓角 1'),_t('圓角 2')],
  round2DiagRect:[_t('圓角 1'),_t('圓角 2')], snip1Rect:[_t('切角')], snip2SameRect:[_t('切角 1'),_t('切角 2')],
  snip2DiagRect:[_t('切角 1'),_t('切角 2')], snipRoundRect:[_t('切角'),_t('圓角')],
  trapezoid:[_t('斜度')], parallelogram:[_t('斜度')], chevron:[_t('箭深')], homePlate:[_t('箭深')],
  hexagon:[_t('切角')], octagon:[_t('切角')], donut:[_t('環寬')], can:[_t('蓋高')], cube:[_t('厚度')], bevel:[_t('斜邊')],
  rightArrow:[_t('桿寬'),_t('箭頭')], leftArrow:[_t('桿寬'),_t('箭頭')], upArrow:[_t('桿寬'),_t('箭頭')],
  downArrow:[_t('桿寬'),_t('箭頭')], leftRightArrow:[_t('桿寬'),_t('箭頭')], upDownArrow:[_t('桿寬'),_t('箭頭')],
  wedgeRectCallout:[_t('尾標 X'),_t('尾標 Y')], wedgeRoundRectCallout:[_t('尾標 X'),_t('尾標 Y'),_t('圓角')],
  wedgeEllipseCallout:[_t('尾標 X'),_t('尾標 Y')], cloudCallout:[_t('尾標 X'),_t('尾標 Y')],
  pie:[_t('起始角'),_t('結束角')], arc:[_t('起始角'),_t('結束角')], chord:[_t('起始角'),_t('結束角')],
  blockArc:[_t('起始角'),_t('結束角'),_t('厚度')], frame:[_t('框寬')], halfFrame:[_t('框寬 1'),_t('框寬 2')],
  plus:[_t('臂寬')], teardrop:[_t('尖角')], plaque:[_t('切角')], noSmoking:[_t('斜槓寬')],
};
// 形狀 key → preset key。線條類（elbow…）自己不是 preset，幾何借它對應的連接器（bentConnector3）
const geomKey=k=>(LINE_KINDS[k]? LINE_KINDS[k].pptx : k);
const geomDef=k=>PRESET_GEOM[geomKey(k)];
// 該形狀有幾個可調值（＝preset avLst 的長度）
const adjCount=key=>((geomDef(key)||[])[0]||[]).length;
const adjLabel=(key,i)=>(ADJ_LABELS[key]||[])[i]||_t('調整 {0}',i+1);
// 元素目前的 adj 值（缺項補 preset 預設）——渲染、黃點、匯出共用同一份，確保預覽＝輸出
function adjVals(el){
  const av=el&&((geomDef(el.shape)||[])[0]||[]); if(!av||!av.length) return [];
  const cur=Array.isArray(el.adjs)? el.adjs : [];
  return av.map(([n,d],i)=>{ const a=cur[i]; return (a!=null&&isFinite(a))? +a : d; });
}
const adjOf=el=>{ const v=adjVals(el); return v.length? v[0] : null; };
// 使用者是否動過這個形狀的 adj——沒動過就不注入 avLst，讓 PowerPoint 用 preset 自己的預設值
const adjCustom=el=>Array.isArray(el&&el.adjs)&&el.adjs.some(v=>v!=null&&isFinite(v));
function setAdj(el,i,v){
  const n=adjCount(el.shape); if(!n) return;
  const cur=adjVals(el);
  cur[i]=Math.round(Math.max(-ADJ_LIMIT,Math.min(ADJ_LIMIT,v)));
  el.adjs=cur.slice(0,n);
}
// ---- 黃點：位置與數值反解 ----
// ah＝['xy'|'p', gdA,minA,maxA, gdB,minB,maxB, posX,posY]
// xy：A 軸＝x、B 軸＝y；polar：A 軸＝角度、B 軸＝離中心的半徑。gd 為 0 表示該軸不綁任何 adj。
// ⚠ minA/maxA 界定的是 **adj 的值域**（可為 guide 名稱），不是控點的螢幕位置——
//   roundRect 寫 0..50000＝圓角 0%～50%，pie 寫 0..21599999＝整圈角度，都不是像素。
const ANG_FULL=21600000;
const normAng=a=>((a%ANG_FULL)+ANG_FULL)%ANG_FULL;
function ahPos(key,w,h,adjs,ah){
  const V=geomEnv(key,w,h,adjs);
  return V? [gv(ah[7],V),gv(ah[8],V)] : [0,0];
}
function ahMetric(key,w,h,adjs,ah,axis){
  const [x,y]=ahPos(key,w,h,adjs,ah);
  if(ah[0]==='xy') return axis? y : x;
  const dx=x-w/2, dy=y-h/2;
  return axis? Math.sqrt(dx*dx+dy*dy) : normAng(Math.atan2(dy,dx)/D2R);
}
// 數值反解：在 [lo,hi] 內找出讓控點量等於 target 的 adj。控點量是 adj 經過整串 gdLst 公式後的
// 結果，沒有解析反函式，所以粗掃找包夾區間再二分；公式含 pin 而出現平坦區時，退回掃描中最接近的值。
function solveAdj(key,w,h,adjs,ah,axis,i,target,lo,hi){
  const f=a=>{ const t=adjs.slice(); t[i]=a; return ahMetric(key,w,h,t,ah,axis); };
  const N=96, step=(hi-lo)/N;
  let best=lo, bestD=Infinity, pa=lo, pv=f(lo);
  for(let k=1;k<=N;k++){
    const a=lo+step*k, v=f(a);
    if((pv-target)*(v-target)<=0&&pv!==v){
      let a0=pa,a1=a,v0=pv;
      for(let it=0;it<48;it++){
        const am=(a0+a1)/2, vm=f(am);
        if((v0-target)*(vm-target)<=0) a1=am; else { a0=am; v0=vm; }
      }
      return (a0+a1)/2;
    }
    const d=Math.abs(v-target); if(d<bestD){ bestD=d; best=a; }
    pa=a; pv=v;
  }
  return best;
}
// 每個 adj 的可調範圍。**沒有被任何 ahLst 引用的 adj＝該 preset 的固定補齊值**（hexagon 的 vf、
// star5 的 hf/vf、wedgeRoundRectCallout 的 adj3…），不出滑桿但匯出時仍要一起注入 avLst。
const ADJ_BOUND_CACHE=new Map();
function adjBounds(key,w,h){
  const ck=`${key}|${Math.round(w)}|${Math.round(h)}`;
  if(ADJ_BOUND_CACHE.has(ck)) return ADJ_BOUND_CACHE.get(ck);
  const def=geomDef(key)||[], av=def[0]||[];
  const V=geomEnv(geomKey(key),w,h,av.map(a=>a[1]));
  // ±2147483647（2^31−1）是「不設限」的哨兵值，直接拿來當滑桿邊界會讓滑桿完全沒有解析度。
  // ⚠ 只認這個確切值——角度型 adj 的正當上限 21599999 也很大，誤判會把整圈砍成 8 度。
  const cap=v=>Math.abs(v)>=2147483647? Math.sign(v)*ADJ_OPEN : Math.max(-ADJ_LIMIT,Math.min(ADJ_LIMIT,v));
  const out=av.map(([n,d])=>({lo:cap(d),hi:cap(d),def:d,fixed:true}));
  for(const ah of def[2]||[]) for(const axis of [0,1]){
    const gd=ah[axis?4:1]; if(!gd) continue;
    const i=av.findIndex(a=>a[0]===gd); if(i<0) continue;
    const a=cap(gv(ah[axis?5:2],V)), b=cap(gv(ah[axis?6:3],V));
    out[i]={lo:Math.min(a,b),hi:Math.max(a,b),def:av[i][1],fixed:false};
  }
  ADJ_BOUND_CACHE.set(ck,out);
  return out;
}
// 畫布黃點清單：每個 ahLst 項一顆點
function adjDots(el){
  const def=geomDef(el&&el.shape); if(!def||!(def[2]||[]).length) return [];
  return def[2];
}
// 極座標控點另走一套：角度量在 0↔21600000 交界處是不連續的，二分法會在那裡整個失效
// （實測 circularArrow 家族反解直接歸零）。改成「直接讓控點位置逼近指標」——粗掃取最近點
// 再逐步收斂，全程不碰角度，繞過不連續性。
function solveAdjNear(key,w,h,adjs,ah,i,tx,ty,lo,hi){
  const d=a=>{ const t=adjs.slice(); t[i]=a;
    const p=ahPos(key,w,h,t,ah); return Math.hypot(p[0]-tx,p[1]-ty); };
  const N=240; let best=lo, bd2=d(lo);
  for(let k=1;k<=N;k++){ const a=lo+(hi-lo)*k/N, v=d(a); if(v<bd2){ bd2=v; best=a; } }
  let step=(hi-lo)/N;
  for(let it=0;it<40&&step>1e-4;it++){
    for(const a of [best-step,best-step/2,best+step/2,best+step]){
      if(a<lo||a>hi) continue;
      const v=d(a); if(v<bd2){ bd2=v; best=a; }
    }
    step/=2;
  }
  return best;
}
// 拖曳：把指標位置反解回它綁定的每個 adj，再夾進 preset 允許的值域
function applyAdjDot(el,ah,lx,ly,w,h){
  const key=geomKey(el.shape), av=(geomDef(el.shape)[0]||[]), bd=adjBounds(el.shape,w,h);
  for(const axis of [0,1]){
    const gd=ah[axis?4:1]; if(!gd) continue;
    const i=av.findIndex(a=>a[0]===gd); if(i<0) continue;
    const b=bd[i];
    setAdj(el,i, ah[0]==='xy'
      ? solveAdj(key,w,h,adjVals(el),ah,axis,i,axis?ly:lx,b.lo,b.hi)
      : solveAdjNear(key,w,h,adjVals(el),ah,i,lx,ly,b.lo,b.hi));
  }
}
// 自訂幾何：points 陣列 → SVG 路徑。指令集與 preset 的 pathLst 完全相同（moveTo／lnTo／
// cubicBezTo／quadBezTo／arcTo／close），所以這裡跟 presetPaths 用的是同一個 arcSeg。
// ⚠ 座標活在元素自己的路徑座標空間（pathW×pathH），渲染時線性縮放到 w×h——與 preset
// 的 pathLst w/h 同一套規則（見 presetPaths 的 sx/sy）。這是 2026-07-28 改的：先前座標
// 直接當 px 用，形狀拉大圖案不跟著大、拉小還會被 normPoints 夾掉座標（不可逆）。
function custPath(points,sx,sy){
  sx=sx||1; sy=sy||1;
  const d=[], cur=[0,0];
  (points||[]).forEach((pt,i)=>{
    if(pt.close){ d.push('Z'); return; }
    const x=(+pt.x||0)*sx, y=(+pt.y||0)*sy, c=pt.curve;
    if(c&&c.type==='cubic'){ d.push('C'+[c.x1*sx,c.y1*sy,c.x2*sx,c.y2*sy,x,y].map(v=>N3(+v||0)).join(',')); }
    else if(c&&c.type==='quadratic'){ d.push('Q'+[c.x1*sx,c.y1*sy,x,y].map(v=>N3(+v||0)).join(',')); }
    else if(c&&c.type==='arc'){ arcSeg(cur,(+c.wR||0)*sx,(+c.hR||0)*sy,+c.stAng||0,+c.swAng||0,d); return; }
    else if(i===0||pt.moveTo){ d.push(`M${N3(x)},${N3(y)}`); }
    else d.push(`L${N3(x)},${N3(y)}`);
    cur[0]=x; cur[1]=y;
  });
  return d.join('');
}
// 自訂幾何的路徑座標空間 → 元素尺寸的縮放比。pathW/pathH 由 normalizeDeck 保證存在
// （舊檔缺鍵時補成當時的 w/h，比例即 1，畫面完全不變）
const custScale=el=>[el.pathW>0? el.w/el.pathW : 1, el.pathH>0? el.h/el.pathH : 1];
// 元素 → SVG 子路徑清單（渲染、縮圖、快照共用同一條路，所以三者不可能對不上）
/* preset → custGeom（PowerPoint 的「編輯端點」）。
   刻意「不」去反解 presetPaths() 產出的 SVG d 字串——preset 的指令陣列本身就與 points 一一對應，
   直接照抄即可，連 A 弧段的還原問題都不存在（arc 原樣保留，不折成貝茲）。
   座標一律換算到元素 px，因為 points 只有一個座標空間，而 preset 的各子路徑各有自己的 w/h。 */
function arcEndPt(cur,wR,hR,st,sw){
  const p0=Math.atan2(wR*Math.sin(st*D2R),hR*Math.cos(st*D2R));
  return ellPt(cur[0]-wR*Math.cos(p0),cur[1]-hR*Math.sin(p0),wR,hR,st+sw);
}
function presetPoints(key,w,h,adjs){
  const def=PRESET_GEOM[key]; if(!def) return null;
  const V=geomEnv(key,w,h,adjs), pts=[];
  let mixed=false, outside=false;
  const R=v=>Math.round(v*100)/100;
  const chk=(x,y)=>{ if(x<0||y<0||x>w||y>h) outside=true; return true; };
  for(const p of def[3]||[]){
    const sx=p[1]? w/p[1] : 1, sy=p[2]? h/p[2] : 1;
    const X=v=>gv(v,V)*sx, Y=v=>gv(v,V)*sy;
    if(p[3]==='none'||p[4]) mixed=true;   // 子路徑各有填色／描邊差異，custGeom 只有一種
    let cur=[0,0];
    for(const c of p[0]){
      switch(c[0]){
        case 'm': cur=[X(c[1]),Y(c[2])]; chk(...cur); pts.push({x:R(cur[0]),y:R(cur[1]),moveTo:true}); break;
        case 'l': cur=[X(c[1]),Y(c[2])]; chk(...cur); pts.push({x:R(cur[0]),y:R(cur[1])}); break;
        case 'c': cur=[X(c[5]),Y(c[6])]; chk(...cur); chk(X(c[1]),Y(c[2])); chk(X(c[3]),Y(c[4]));
          pts.push({x:R(cur[0]),y:R(cur[1]),curve:{type:'cubic',x1:R(X(c[1])),y1:R(Y(c[2])),x2:R(X(c[3])),y2:R(Y(c[4]))}}); break;
        case 'q': cur=[X(c[3]),Y(c[4])]; chk(...cur); chk(X(c[1]),Y(c[2]));
          pts.push({x:R(cur[0]),y:R(cur[1]),curve:{type:'quadratic',x1:R(X(c[1])),y1:R(Y(c[2]))}}); break;
        case 'a': {
          const wR=gv(c[1],V)*sx, hR=gv(c[2],V)*sy, st=gv(c[3],V), sw=gv(c[4],V);
          const e=arcEndPt(cur,wR,hR,st,sw); chk(...e);
          pts.push({x:R(e[0]),y:R(e[1]),curve:{type:'arc',wR:R(Math.abs(wR)),hR:R(Math.abs(hR)),
                    stAng:Math.round(st),swAng:Math.round(sw)}});
          cur=e; break; }
        case 'z': pts.push({close:true}); break;
      }
    }
  }
  return {points:pts,mixed,outside};
}
function shapePaths(el){
  if(el.shape==='custGeom'){ const s=custScale(el), d=custPath(el.points,s[0],s[1]);
    return d? [{d,fill:'',noStroke:false,rule:'evenodd'}] : []; }   // 規則差異見 shapeNodes
  const key=PRESET_GEOM[el.shape]? el.shape : 'rect';
  return presetPaths(key,el.w,el.h,adjVals(el));
}
// 子路徑清單 → SVG 節點。⚠ DrawingML 的繪製順序是「先填完所有子路徑，再描所有外框」，
// 不是逐路徑填了就描——chartPlus 的十字（fill="none"）就排在方框之前，逐路徑畫會被方框蓋掉。
// cube／can 的立體感也依賴這個順序：本體填色墊底、亮面暗面疊上、外框最後統一描。
function shapeNodes(paths,fill,lineColor,sw,da,paint){
  /* ⚠ 填充規則按來源分兩種，別統一。
     custGeom → **even-odd**：2026-08-03 在真實 PowerPoint 實測出來的——同向繞行的兩個正方形
       在 PowerPoint 上中間被挖空。原本從 preset 資料反推成 nonzero（donut／frame／noSmoking
       的內圈都刻意反向繞行，「若是 even-odd 這個反轉毫無意義」），推論錯在最後那句：
       even-odd 下反向繞行同樣挖得出洞，那個反轉只是冗餘，不構成證據。別再照這條線反推回去。
     preset → **nonzero**：PowerPoint 畫 preset 用的是 prstGeom、它自己的內建幾何，
       根本不看我們這份路徑資料。這裡的任務是「重現 PowerPoint 的外觀」，而 187 個 preset 中
       有 9 條路徑（7 個 actionButton ＋ horizontal／verticalScroll）在兩種規則下結果不同，
       even-odd 會把按鈕上的箭頭誤挖成洞。這 9 條未經 PowerPoint 實測，故維持原本的 nonzero。
     ⚠ 兩者的交會點：preset 轉 custGeom（「編輯端點」）之後就改用 custGeom 的規則了，
       那 9 個形狀轉完會真的變成挖洞——畫布會照實顯示，因為 PowerPoint 那時也會這樣畫。 */
  const out=[], mk=(d,rule)=>{ const p=document.createElementNS(NS,'path');
    p.setAttribute('d',d); p.setAttribute('fill-rule',rule||'nonzero'); return p; };
  for(const sp of paths){
    if(sp.fill==='none'||!fill) continue;
    // 有漸層時全部子路徑用同一份漸層：立體感形狀的明暗（shadeFill）與漸層無法並存，漸層優先
    const p=mk(sp.d,sp.rule); p.setAttribute('fill',paint||shadeFill(fill,sp.fill)); out.push(p);
  }
  if(lineColor!=null) for(const sp of paths){
    if(sp.noStroke) continue;
    const p=mk(sp.d,sp.rule);
    p.setAttribute('fill','none');
    p.setAttribute('stroke','#'+lineColor);
    p.setAttribute('stroke-width',sw);
    p.setAttribute('stroke-linejoin','round');
    if(da) p.setAttribute('stroke-dasharray',da);
    out.push(p);
  }
  return out;
}
/* 這個形狀改用 even-odd 之後外觀會不會變？（＝轉成 custGeom 值不值得先警告一句）
   不寫死清單、當場量：借一個離螢幕 SVG，同一條 d 掛兩種 fill-rule，用 isPointInFill 抽樣比對。
   抽樣是近似的，但要偵測的是「整塊鏤空」這種尺度的差異，網格夠密就綽綽有餘。
   實測 187 個 preset 中有 9 條路徑會變（7 個 actionButton ＋ horizontal／verticalScroll）。 */
function ruleChangesLook(el){
  let paths; try{ paths=shapePaths(el); }catch(e){ return false; }
  const withFill=paths.filter(sp=>sp.d&&sp.fill!=='none'&&(sp.d.match(/M/g)||[]).length>1);
  if(!withFill.length) return false;
  const svg=document.createElementNS(NS,'svg');
  svg.style.cssText='position:absolute;left:-9999px;top:0;width:1px;height:1px';
  const a=document.createElementNS(NS,'path'), b=document.createElementNS(NS,'path');
  a.setAttribute('fill-rule','nonzero'); b.setAttribute('fill-rule','evenodd');
  svg.appendChild(a); svg.appendChild(b); document.body.appendChild(svg);
  const pt=svg.createSVGPoint(), W=Math.max(1,el.w), H=Math.max(1,el.h), N=48;
  let differ=false;
  try{
    for(const sp of withFill){
      a.setAttribute('d',sp.d); b.setAttribute('d',sp.d);
      for(let i=1;i<N&&!differ;i++) for(let j=1;j<N;j++){
        pt.x=W*i/N; pt.y=H*j/N;
        if(a.isPointInFill(pt)!==b.isPointInFill(pt)){ differ=true; break; }
      }
      if(differ) break;
    }
  }catch(e){ differ=false; }
  svg.remove();
  return differ;
}
function isLineEl(el){ return el&&el.type==='shape'&&!!LINE_KINDS[el.shape]; }
// 圖片預設強制等比（整張塞進框、不變形）；切到「裁切填滿」後框比例自由，超出部分裁掉，故解除鎖定
/* 圖片一律鎖等比，**裁切過的也鎖**。理由：框的 w/h 一旦脫離圖片比例，
   dw=w/vw 與 dh=h/vh 的比值就跟著歪，畫面上看到的就是圖被拉扁。
   要改變形狀不該靠拉扁圖片，而是進裁切模式拉框（那時圖片釘住、只有窗口變），
   或按住 Alt 明確表示「我就是要非等比拉伸」。裁切模式中一律放開。 */
function imgLocked(el){ return !!el&&el.type==='image'&&APP.cropping!==el.id; }
function lineEnds(el){ // P1 起點、P2 終點（箭頭端），相對元素左上角
  const x1=el.flipH? el.w:0, y1=el.flipV? el.h:0;
  return {x1,y1,x2:el.w-x1,y2:el.h-y1};
}

