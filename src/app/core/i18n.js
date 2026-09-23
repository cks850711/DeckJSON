'use strict';
/* ================= 介面語言 =================
   中文原文就是鍵（gettext 式）：程式碼照樣讀得懂，漏翻時退回中文而不是露出一個鍵名。
   英文在 i18n/en.js 的 I18N_EN；值可以是字串（{0} {1} 依序代入參數），
   也可以是函式（英文單複數這類要邏輯的，參數原樣傳入）。
   語言只在開機時決定一次：形狀名清單、範本頁這些字串在載入時就求值，
   所以切換語言走「存進自動存檔 → 重載」，不做即時重繪（見 setUiLang）。
   漏翻檢查：python3 tools/i18n-check.py。 */
const UI_LANG_KEY='deckjson.uiLang';
const UI_LANG=(()=>{
  /* 網址參數優先：localStorage 在某些 file:// 環境寫不進去，那時語言就靠 ?lang= 帶過重載 */
  const q=new URLSearchParams(location.search).get('lang');
  if(q==='zh'||q==='en') return q;
  try{ const v=localStorage.getItem(UI_LANG_KEY); if(v==='zh'||v==='en') return v; }catch(e){}
  return /^zh\b/i.test(navigator.language||'')? 'zh' : 'en';
})();
document.documentElement.lang= UI_LANG==='en'? 'en' : 'zh-Hant';
function _t(zh,...a){
  const s= UI_LANG==='en' && typeof I18N_EN!=='undefined' && Object.prototype.hasOwnProperty.call(I18N_EN,zh)
    ? I18N_EN[zh] : zh;
  if(typeof s==='function') return s(...a);
  return a.length? s.replace(/\{(\d+)\}/g,(m,i)=> i<a.length? String(a[i]) : m) : s;
}
/* 靜態 HTML 的中文：開機時照字典換掉文字節點與 title／placeholder。
   比對前把空白壓成單一空格（HTML 原始碼裡的長句會跨行）。說明面板不走這條，
   它中英各有一份完整 HTML（見 applyHelpLang）。 */
function i18nStatic(root){
  if(UI_LANG!=='en'||typeof I18N_EN==='undefined') return;
  const tr=s=>{ const k=s.replace(/\s+/g,' ').trim();
    return Object.prototype.hasOwnProperty.call(I18N_EN,k)&&typeof I18N_EN[k]==='string'? I18N_EN[k] : null; };
  /* 帶 data-i18n 的元素整段 innerHTML 當鍵：句中夾 <b>／<code> 的長說明拆成碎片各自翻，
     英文語序會亂。瀏覽器序列化 innerHTML 時會改寫寫法（<use/> 變 <use></use>），
     所以字典裡的鍵也先過一次同樣的解析再比對。 */
  const ser=h=>{ const t=document.createElement('template'); t.innerHTML=h; return t.innerHTML.replace(/\s+/g,' ').trim(); };
  const blocks=root.querySelectorAll('[data-i18n]');
  if(blocks.length){
    const byHtml=new Map();
    for(const k of Object.keys(I18N_EN)) if(k.includes('<')&&typeof I18N_EN[k]==='string') byHtml.set(ser(k),I18N_EN[k]);
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
