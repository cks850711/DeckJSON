'use strict';
/* ================= 寫入 HTML 的出口 =================
   介面上要放帶標記的字串（翻譯裡夾 <b>／<code>、圖示 <svg><use>、說明本文）時一律走 setHTML／appendHTML，
   不直接寫 innerHTML。做法：
     1. 字串在一份獨立的文件裡解析（htmlParse，全程式唯一把字串交給 HTML 解析器的地方）。
        那份文件沒有瀏覽環境：解析時不執行腳本、不載入圖片、不觸發事件。
     2. 依下面的白名單走一遍節點樹：不認得的元素拆掉外殼留下子節點，會帶出程式碼或樣式的元素連內容一起拿掉，
        不認得的屬性拿掉，註解拿掉。
     3. 把消毒後的節點本身搬進目標元素，不再序列化回字串、也不重新解析：解析與放進去的是同一棵樹。
   白名單照實際寫入的內容定（介面字串、說明本文、圖示、格線）。要用新的標籤、屬性或 CSS 屬性，加進這裡；
   沒加的會被拿掉，並在 console 警告（同一種只報一次）。 */
const HTML_NS='http://www.w3.org/1999/xhtml';
const HTML_SVG_NS='http://www.w3.org/2000/svg';
const HTML_TAGS=new Set(['b','br','code','details','div','h4','kbd','label','li','mark','option','p','span',
  'sub','summary','sup','table','tbody','td','th','thead','tr','u','ul']);
const HTML_SVG_TAGS=new Set(['svg','use','path']);
/* 連同內容一起拿掉（比對時不分大小寫）：內容是程式碼、樣式或不在樹上的片段，攤開來只會變成亂碼或漏網 */
const HTML_DROP=new Set(['script','style','template','noscript','iframe','frame','frameset','object','embed',
  'noembed','noframes','textarea','title','xmp','foreignobject']);
/* 屬性：'*' 是該命名空間所有允許元素共用的。沒列到的一律拿掉，所以 on*、id、src、xlink:href 都不會留下 */
const HTML_ATTRS={'*':['class','style'], h4:['data-tab'], div:['data-fig'], option:['value','selected']};
const HTML_SVG_ATTRS={'*':['class'], use:['href'],
  path:['d','fill','stroke','stroke-width','stroke-dasharray','opacity','vector-effect']};
/* style 只留這幾個 CSS 屬性（目前寫入的字串用到的全部）。都是不吃網址的屬性，所以不必再檢查值。
   比對的是 el.style 列出的名稱，縮寫屬性在那裡是展開後的細項：white-space 在新版瀏覽器展開成
   white-space-collapse＋text-wrap-mode（較舊的版本是 text-wrap），所以細項名也要列 */
const HTML_CSS=new Set(['color','font-size','min-width','opacity',
  'white-space','white-space-collapse','text-wrap-mode','text-wrap']);
/* 其餘屬性的值：fill／stroke 這類可以寫 url(…)；反斜線擋掉 u\72l( 這類跳脫寫法 */
const HTML_BAD_VALUE=/\\|url\s*\(|image-set\s*\(|expression\s*\(/i;
/* <use> 只引用同一份文件裡的圖示（#ic-…），外部或 data: 網址會載入別處的 SVG */
const HTML_USE_HREF=/^#[a-z][\w-]*$/i;

/* 解析改在 DOMParser 產生的獨立文件中進行，不碰目前的頁面。字串包在 <template> 裡解析、回傳那個 template，
   呼叫端取它的 content（節點）或 innerHTML（序列化）。
   - 開頭的 <!DOCTYPE html> 讓這份文件和頁面一樣用標準模式解析；少了它會用相容模式，
     例如 <p>…<table> 不會先收掉 <p>
   - template 是 <head> 的第一個子節點；內容照片段的規則解析，頂層單獨的 <tr>、<td>、<option> 都保留
   - 結尾不補 </template>，wrapper 在字串結束時收掉，沒收尾的元素照常處理
   和在頁面上建 template 寫入不同的地方：內容自帶 </template>（不在 textarea 這類純文字元素裡）時，
   wrapper 在那裡結束，之後的內容落在 wrapper 外，不會被取用，等於被截掉；頁面上的 template 會忽略這個結束標記、
   保留後面的內容。另外 template 開著時不記錄所屬表單，巢狀的 <form> 會留成兩層（form 不在白名單，拆殼後一樣）；
   獨立文件不執行腳本，<noscript> 的內容照一般標記解析（白名單把 noscript 連內容拿掉）。 */
function htmlParse(html){
  return new DOMParser().parseFromString('<!DOCTYPE html><template>'+html,'text/html').head.firstChild;
}

const htmlWarned=new Set();
function htmlWarn(what){
  if(htmlWarned.has(what)) return;
  htmlWarned.add(what); console.warn('[deckjson] setHTML 拿掉了 '+what);
}
/* style：瀏覽器已經把它解析成 el.style。全部是允許的 CSS 屬性就原樣保留（序列化不變）；
   有不允許的就逐一移除，全部移除時拿掉整個屬性。回傳 false 代表整個屬性要拿掉 */
function htmlKeepStyle(el){
  const bad=[...el.style].filter(p=>!HTML_CSS.has(p));
  for(const p of bad){ htmlWarn('style: '+p); el.style.removeProperty(p); }
  return el.style.length>0;
}
function htmlClean(parent){
  for(const n of [...parent.childNodes]){
    if(n.nodeType===3) continue;
    if(n.nodeType!==1){ n.remove(); continue; }
    const name=n.localName, svg=n.namespaceURI===HTML_SVG_NS;
    const known= svg? HTML_SVG_TAGS.has(name) : n.namespaceURI===HTML_NS&&HTML_TAGS.has(name);
    if(!known){
      htmlWarn('<'+name+'>');
      if(HTML_DROP.has(name.toLowerCase())) n.remove();
      else { htmlClean(n); n.replaceWith(...n.childNodes); }
      continue;
    }
    const table=svg? HTML_SVG_ATTRS : HTML_ATTRS;
    const allow=table['*'].concat(Object.prototype.hasOwnProperty.call(table,name)? table[name] : []);
    for(const a of [...n.attributes]){
      const keep= !allow.includes(a.name)? false
        : a.name==='style'? htmlKeepStyle(n)
        : name==='use'? HTML_USE_HREF.test(a.value)
        : !HTML_BAD_VALUE.test(a.value);
      if(!keep){ htmlWarn(name+'['+a.name+']'); n.removeAttributeNode(a); }
    }
    htmlClean(n);
  }
}
/* 目標是 SVG 元素時，字串包一層 <svg> 再解析：<path> 這類標籤要在 SVG 裡才是 SVG 元素，
   直接解析會變成 HTML 的未知元素（innerHTML 原本是照目標元素的命名空間解析的） */
function htmlNodes(el,html){
  const inSvg=el.namespaceURI===HTML_SVG_NS;
  const t=htmlParse(inSvg? '<svg>'+html+'</svg>' : html);
  const root=inSvg? t.content.firstChild : t.content;
  htmlClean(root);
  return [...root.childNodes];
}
/* 取代 el 的全部子節點 */
function setHTML(el,html){ el.replaceChildren(...htmlNodes(el,html)); }
/* 接在 el 的最後面 */
function appendHTML(el,html){ el.append(...htmlNodes(el,html)); }
/* 只解析再序列化回字串，不消毒、不放進文件：給 i18n 把字典鍵與靜態標記轉成同一種寫法再比對。
   瀏覽器序列化時會改寫寫法（<use/> 變 <use></use>），兩邊都過一次解析才對得上 */
function htmlKey(html){ return htmlParse(html).innerHTML; }
