'use strict';
/* ================= 介面語言 =================
   中文原文就是鍵（gettext 式）：程式碼照樣讀得懂，漏翻時退回中文而不是露出一個鍵名。
   各語言的資料在 src/i18n/ 的語言包（I18N_PACKS，結構見 i18n/zh.js）；介面字串在該包的 ui，
   值可以是字串（{0} {1} 依序代入參數），也可以是函式（英文單複數這類要邏輯的，參數原樣傳入）。
   程式只查「目前語言的那一包」（UI_PACK），不寫死任何語言。
   語言只在開機時決定一次：形狀名清單、範本頁這些字串在載入時就求值，
   所以切換語言走「存進自動存檔 → 重載」，不做即時重繪（見 setUiLang）。
   漏翻檢查：python3 tools/i18n-check.py。 */
const UI_LANG_KEY='deckjson.uiLang';
/* 可選的語言＝有登記語言包的語言。中文是原文，沒有語言包也永遠可選 */
const LANGS=typeof I18N_PACKS==='object'&&I18N_PACKS.zh? Object.keys(I18N_PACKS) : ['zh'];
const UI_LANG=(()=>{
  const ok=v=>LANGS.includes(v);
  /* 網址參數優先：localStorage 在某些 file:// 環境寫不進去，那時語言就靠 ?lang= 帶過重載 */
  const q=new URLSearchParams(location.search).get('lang');
  if(ok(q)) return q;
  try{ const v=localStorage.getItem(UI_LANG_KEY); if(ok(v)) return v; }catch(e){}
  /* 第一次開啟：照瀏覽器語言挑；都對不上就用英文（沒有英文包時才用中文） */
  const nav=navigator.language||'';
  return LANGS.find(l=>I18N_PACKS[l].match&&I18N_PACKS[l].match.test(nav)) || (ok('en')? 'en' : 'zh');
})();
const UI_PACK=(typeof I18N_PACKS==='object'&&I18N_PACKS[UI_LANG])||{};
const UI_DICT=UI_PACK.ui||null;          // 中文沒有字典：_t() 直接回原文
document.documentElement.lang=UI_PACK.html||'zh-Hant';
function _t(zh,...a){
  const s= UI_DICT&&Object.prototype.hasOwnProperty.call(UI_DICT,zh)? UI_DICT[zh] : zh;
  if(typeof s==='function') return s(...a);
  return a.length? s.replace(/\{(\d+)\}/g,(m,i)=> i<a.length? String(a[i]) : m) : s;
}
/* 靜態 HTML 的中文：開機時照字典換掉文字節點與 title／placeholder。
   比對前把空白壓成單一空格（HTML 原始碼裡的長句會跨行）。說明面板不走這條，
   每個語言各有一份完整 HTML（見 applyHelpTabs）。 */
function i18nStatic(root){
  if(!UI_DICT) return;
  const tr=s=>{ const k=s.replace(/\s+/g,' ').trim();
    return Object.prototype.hasOwnProperty.call(UI_DICT,k)&&typeof UI_DICT[k]==='string'? UI_DICT[k] : null; };
  /* 帶 data-i18n 的元素整段 innerHTML 當鍵：句中夾 <b>／<code> 的長說明拆成碎片各自翻，
     英文語序會亂。瀏覽器序列化 innerHTML 時會改寫寫法（<use/> 變 <use></use>），
     所以字典裡的鍵也先過一次同樣的解析再比對。 */
  const ser=h=>{ const t=document.createElement('template'); t.innerHTML=h; return t.innerHTML.replace(/\s+/g,' ').trim(); };
  const blocks=root.querySelectorAll('[data-i18n]');
  if(blocks.length){
    const byHtml=new Map();
    for(const k of Object.keys(UI_DICT)) if(k.includes('<')&&typeof UI_DICT[k]==='string') byHtml.set(ser(k),UI_DICT[k]);
    for(const el of blocks){ const v=byHtml.get(ser(el.innerHTML)); if(v!=null) el.innerHTML=v; }
  }
  const skip=n=>n.closest&&n.closest('#helpBody,script,style,template,[data-i18n],[translate="no"]');
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const hit=[];
  for(let n=w.nextNode();n;n=w.nextNode()){
    if(!n.nodeValue.trim()||skip(n.parentElement)) continue;
    const v=tr(n.nodeValue); if(v!=null) hit.push([n,v]);
  }
  for(const [n,v] of hit){ const m=/^(\s*)[\s\S]*?(\s*)$/.exec(n.nodeValue); n.nodeValue=m[1]+v+m[2]; }
  for(const el of root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')){
    if(skip(el)) continue;
    for(const a of ['title','placeholder','aria-label','alt']){
      const s=el.getAttribute(a); if(!s) continue;
      const v=tr(s); if(v!=null) el.setAttribute(a,v);
    }
  }
}
i18nStatic(document.body);
document.title=_t(document.title);
