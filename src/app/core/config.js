'use strict';
/* ================= 常數 ================= */
/* 版本號只在這裡定義一次：說明面板的標頭顯示它，存檔時 deck.json 的 generator 欄位也寫它。
   單檔成品是離線傳播的——使用者手上那份沒有自動更新，回報問題時「哪一版」只能靠檔案自己講。 */
const APP_VERSION='0.2.0';
/* 容器的自我識別。`.deck` 這個副檔名至少有三套互不相容的格式在用（本專案、deckyard 的
   application/vnd.deckyard.deck、OpenDeck 的 application/x-deck），單看副檔名分不出誰是誰。
   仿 OCF／EPUB 的作法：zip 的第一個 entry 是未壓縮的 mimetype，於是不解壓也認得出來。
   尚未向 IANA 註冊，vnd. 樹先佔著自己的名字，日後真要註冊時字串不用改。 */
const DECK_MIME='application/vnd.deckjson.deck';
/* 投影片尺寸不是常數，而是資料（deck.stage）：STAGE_W/H 由 applyStage() 依 deck 設定改寫，
   全檔所有讀取點（畫布、吸附、頁碼座標、defineLayout、sldSz）都跟著同一份來源。1px = 9525 EMU。 */
let STAGE_W=1280, STAGE_H=720;
const PX2CM=2.54/96, pt2px=pt=>pt*96/72, px2in=px=>px/96, px2emu=px=>Math.round(px*9525);
// 投影片尺寸預設（px；1px=1/96 吋）。type＝OOXML sldSz 的標準名稱，非標準比例則不寫 type
const STAGE_PRESETS=[
  {key:'16x9', label:_t('16:9（寬螢幕）'), w:1280,h:720, type:'screen16x9'},
  {key:'4x3',  label:_t('4:3（傳統）'),    w:960, h:720, type:'screen4x3'},
  {key:'16x10',label:'16:10',          w:1152,h:720, type:'screen16x10'},
];
function stagePresetOf(w,h){ return STAGE_PRESETS.find(p=>p.w===w&&p.h===h)||null; }
/* 頁尾佔位符（頁碼 sldNum／日期 dt）：預設樣式與三種位置（貼齊投影片底緣，隨投影片尺寸浮動）。
   兩者共用同一套幾何——PowerPoint 的日期／頁尾／頁碼本來就是底部同一排的三個佔位符。
   預設把日期放左下、頁碼放右下，免得開箱就疊在一起（真疊了畫布預覽會直接看得出來）。 */
const PAGENUM_DEF={pos:'br',sizePt:10,color:'888888'};
const DATE_DEF={pos:'bl',sizePt:10,color:'888888',fmt:'auto'};
const PAGENUM_SIZE={w:160,h:24,m:24,gap:18};   // gap＝距底緣留白
function hfBox(p,def){
  const {w,h,m,gap}=PAGENUM_SIZE;
  const pos=p.pos||def.pos, y=STAGE_H-h-gap;
  const x= pos==='bl'? m : pos==='bc'? Math.round((STAGE_W-w)/2) : STAGE_W-m-w;
  return {x,y,w,h,align:{bl:'left',bc:'center',br:'right'}[pos]||'right',
    sizePt:p.sizePt||def.sizePt,color:p.color||def.color};
}
function pageNumBox(){ return hfBox(APP.deck.pageNum||PAGENUM_DEF,PAGENUM_DEF); }
function dateBox(){ return hfBox(APP.deck.date||DATE_DEF,DATE_DEF); }
/* 日期文字。自動更新模式在 PowerPoint 端是 <a:fld type="datetime1">，實際字樣由**開檔那台電腦**
   的地區設定決定；這裡只是畫布預覽與 pptx 內的快取值，故跟著 deck.lang 走，能對到八九成。 */
function dateText(){
  const d=APP.deck.date||DATE_DEF;
  if(d.fmt==='fixed') return String(d.text||'').trim();
  try{ return new Date().toLocaleDateString(APP.deck.lang||defaultLang()); }
  catch(e){ return new Date().toLocaleDateString(); }
}
/* ---- 出廠預設 profile（中性）----
   通用版不帶任何個人／公司母版設定：無預留區、系統可用字體、語言跟隨瀏覽器。
   個人化設定一律走 profile（deck.profile 欄位群 → localStorage → 這裡），見 §profile。 */
function defaultEaFont(){   // 中文字體無跨平台通解，依作業系統挑一個「本機一定有」的
  const ua=navigator.userAgent||'';
  if(/Mac|iPhone|iPad/.test(ua)) return 'PingFang TC';
  if(/Windows/.test(ua)) return 'Microsoft JhengHei';
  return 'Noto Sans CJK TC';
}
function defaultLang(){
  const l=String(navigator.language||'en-US');
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l)? l : 'en-US';
}
function defaultProfile(){
  return {format:'deckjson-profile',version:1,name:_t('預設'),
    stage:{w:1280,h:720}, zones:[],
    fonts:{ea:defaultEaFont(),latin:'Arial',tableLatin:'Arial'},
    lang:defaultLang()};
}
// BUILD_PROFILE：build.sh --profile 可把一份 profile 內嵌成出廠值（公開版留 null＝中性）
const BUILD_PROFILE=null;
const FONTS=defaultProfile().fonts;   // 字體欄位的補值基準（deck.fonts 缺鍵時填這裡）
const $=s=>document.querySelector(s);
const NS='http://www.w3.org/2000/svg';
/* 把 sprite 塞進任何按鈕：btnRow 走 {ic,txt}，手工建的按鈕走這支。 */
function setIcoBtn(b,ic,txt,title){
  b.className=(b.className? b.className+' ':'')+'icBtn';
  b.innerHTML='<svg class="ic"><use href="#'+ic+'"/></svg>';
  if(txt) b.appendChild(document.createTextNode(txt));
  if(title) b.title=title;
  return b;
}
const stage=$('#stage');
const uid=p=>(p||'e')+'-'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);

/* ================= profile（環境設定檔） =================
   把「投影片尺寸／預留區／三字體／語言／頁碼與日期樣式／檔案屬性」這些原本寫死在程式裡的客製化，
   全部降為資料。三層來源，優先序由高到低：
     1. deck 本身的欄位（stage／zones／fonts／lang／pageNum／date…）——跟著簡報走，貼 JSON 給 AI 不會掉設定
     2. localStorage 的「我的預設」——新建空白簡報時帶入，載入一次就長期記住
     3. BUILD_PROFILE（build.sh --profile 內嵌）→ defaultProfile()（中性出廠值）
   同一份原始碼即可產出「個人版」與「中性通用版」，不需要維護兩套程式。 */
const PROFILE_KEY='deckjson.profile';
const PROFILE_FIELDS=['stage','zones','fonts','lang','pageNum','date'];
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }   // file:// 下可能被擋
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function normProfile(p){   // 手改／外來 profile 一律過這裡，壞值夾回或丟棄
  const d=defaultProfile();
  if(!p||typeof p!=='object') return d;
  const o={format:'deckjson-profile',version:1,name:String(p.name||_t('未命名設定')).slice(0,40)};
  const w=Math.round(+((p.stage||{}).w)), h=Math.round(+((p.stage||{}).h));
  o.stage={w:(isFinite(w)&&w>=160&&w<=4000)?w:d.stage.w, h:(isFinite(h)&&h>=120&&h<=4000)?h:d.stage.h};
  o.zones=normZones(p.zones);
  o.fonts={}; for(const k of ['ea','latin','tableLatin']){
    const v=String(((p.fonts||{})[k])||'').trim(); o.fonts[k]= v||d.fonts[k]; }
  o.lang= /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(p.lang||''))? String(p.lang) : d.lang;
  if(p.pageNum&&typeof p.pageNum==='object') o.pageNum=structuredClone(p.pageNum);
  if(p.date&&typeof p.date==='object') o.date=structuredClone(p.date);
  if(p.docProps&&typeof p.docProps==='object') o.docProps=structuredClone(p.docProps);
  return o;
}
function normZones(v){   // 預留區：僅保留有效矩形，數量上限 12（防手改 JSON 塞爆畫布）
  if(!Array.isArray(v)) return [];
  const out=[];
  for(const z of v.slice(0,12)){
    if(!z||typeof z!=='object') continue;
    const x=Math.round(+z.x)||0, y=Math.round(+z.y)||0;
    const w=Math.round(+z.w), h=Math.round(+z.h);
    if(!(isFinite(w)&&w>0&&isFinite(h)&&h>0)) continue;
    out.push({name:String(z.name||_t('預留區')).slice(0,20),x,y,w:Math.min(4000,w),h:Math.min(4000,h)});
  }
  return out;
}
function startupProfile(){ return normProfile(JSON.parse(lsGet(PROFILE_KEY)||'null')||BUILD_PROFILE); }
function profileFromDeck(d,name){
  const p={format:'deckjson-profile',version:1,name:name||d.profileName||_t('我的設定'),
    stage:{...d.stage},zones:structuredClone(d.zones||[]),fonts:{...d.fonts},lang:d.lang};
  if(d.pageNum) p.pageNum=structuredClone(d.pageNum);
  if(d.date) p.date=structuredClone(d.date);
  const dp={}; for(const k of ['author','company','subject']) if(d[k]) dp[k]=d[k];
  if(Object.keys(dp).length) p.docProps=dp;
  return p;
}
function applyProfileToDeck(d,p){
  p=normProfile(p);
  d.profileName=p.name;
  d.stage={...p.stage}; d.zones=structuredClone(p.zones); d.fonts={...p.fonts}; d.lang=p.lang;
  if(p.pageNum) d.pageNum=structuredClone(p.pageNum);
  if(p.date) d.date=structuredClone(p.date);
  if(p.docProps) for(const k of ['author','company','subject']) if(p.docProps[k]) d[k]=p.docProps[k];
  return d;
}

