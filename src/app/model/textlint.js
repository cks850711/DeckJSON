'use strict';
/* ================= 容易被換行拆開的寫法 =================
   換行位置由 Unicode 的換行規則決定，引擎只看字元、不懂語意：一般空白、en dash「–」、連字號「-」
   後面都是合法的換行點，所以「2 GHz」「2–18」「F-42%」會被拆到兩行。瀏覽器與 PowerPoint 都一樣，
   只是字型不同、每行寬度不同，拆開的位置不同——畫布上沒拆開，不代表 PowerPoint 裡也沒拆開。

   pptx 沒有「這段不換行」的格式設定，能擋住的只有字元本身：不斷行空白 U+00A0、不斷行連字號 U+2011
   （2026-09-25 以 PowerPoint 實測；en dash、全形～、U+2060 都擋不住）。這跟 Word 的做法相同：
   由寫的人決定哪裡要黏住，編輯器提供輸入方式（edit/text.js 的 noBreakKey）。
   所以這裡**只提醒、不修改**：同一個「2–18」在英文句子裡斷開可能是可以接受的，要不要黏住是寫的人的判斷。

   與 model/schema.js 一樣只能用 JS 本身，tools/deck-lint.js 在 node 裡載入同一份。 */
const BREAK_UNITS=['GHz','MHz','kHz','THz','Hz','dBm','dB','mm','cm','km','nm','μm','µm','Å','m',
  '°C','°F','K','ms','μs','ns','min','h','s','vol%','wt%','at%','%','r/min','rpm','kg/m²','kg/m2','g/cm³',
  'mg','kg','g','emu/g','Oe','mT','T','mA','A','mV','kV','V','kW','mW','W','kΩ','Ω','MPa','GPa','kPa','Pa',
  'N','J','mL','μL','L','eV','keV','ppm','px','pt','dpi','fps','MB','GB','TB','KB'];
const BREAK_RULES=[
  {re:new RegExp('\\d+(?:\\.\\d+)? ('+BREAK_UNITS.map(u=>u.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')).join('|')+')(?![A-Za-zμµ°²³/%])','g'),
   why:'a line can break between the number and the unit; use a no-break space (U+00A0)'},
  {re:/\d+(?:\.\d+)?%? ?[–—~～] ?\d+(?:\.\d+)?%?/g,
   why:'a line can break at the dash; for a range write a word between the numbers with no-break spaces (U+00A0) around it, or use U+2011 as the dash'},
  {re:/[A-Za-zα-ωΑ-Ω]+-\d+(?:\.\d+)?%?/g,
   why:'a line can break after the hyphen; use a non-breaking hyphen (U+2011)'},
  {re:/\S+ [<>≤≥] [−\-+]?\d+(?:\.\d+)?/g,
   why:'a line can break around the comparison sign; use no-break spaces (U+00A0) on both sides'},
];
/* 一個元素的所有文字 → 提醒字串陣列：同一條規則合併成一行，列出前幾個片段。
   逐格逐段各列一行的話，一張 5×7 的表就能洗掉整個畫面，真正要看的反而被淹沒 */
function breakHints(texts,where){
  const out=[];
  for(const r of BREAK_RULES){
    const hits=[];
    for(const t of texts){ r.re.lastIndex=0; for(const m of String(t).matchAll(r.re)) if(!hits.includes(m[0])) hits.push(m[0]); }
    if(!hits.length) continue;
    const shown=hits.slice(0,4).map(h=>'"'+h+'"').join(', ')+(hits.length>4? ' (+'+(hits.length-4)+' more)' : '');
    out.push(where+': '+shown+': '+r.why);
  }
  return out;
}
/* 掃一個物件，回傳提醒字串陣列。kind 與 path 同 schemaCheck：'deck'｜'page'｜'element'｜'elements'。
   只看會畫在投影片上的字：文字框、形狀的段落與表格儲存格；備忘稿不上投影片，不看。 */
function breakCheck(obj,kind,path){
  const out=[];
  const paraText=p=>p&&typeof p==='object'? (Array.isArray(p.runs)? p.runs.map(r=>r&&r.text||'').join('') : '')+(typeof p.md==='string'? p.md : '') : '';
  const el=(e,p)=>{
    if(!e||typeof e!=='object'||e.hidden) return;
    const texts=(Array.isArray(e.paras)?e.paras:[]).map(paraText);
    if(e.type==='table') for(const row of Array.isArray(e.cells)?e.cells:[]) for(const c of Array.isArray(row)?row:[]){
      if(!c||typeof c!=='object'||c.covered) continue;
      texts.push(Array.isArray(c.runs)? c.runs.map(r=>r&&r.text||'').join('') : String(c.md!=null? c.md : c.text||''));
    }
    out.push(...breakHints(texts,p));
  };
  // 位置寫成「頁/元素」：元素 id 只在同一頁內唯一（跨頁同 id 是 Morph 的配對方式），只給 id 看不出是哪一頁
  const elsOf=(list,p)=>(Array.isArray(list)?list:[]).forEach((e,i)=>el(e,p+'/'+(e&&e.id? e.id : '['+i+']')));
  const page=(g,p)=>{ if(g&&typeof g==='object') elsOf(g.elements,p); };
  if(kind==='element') el(obj,path);
  else if(kind==='elements') elsOf(obj,path);
  else if(kind==='page') page(obj,path);
  else if(kind==='deck'&&obj&&typeof obj==='object'){
    if(obj.master&&typeof obj.master==='object') elsOf(obj.master.elements,'master');
    (Array.isArray(obj.pages)?obj.pages:[]).forEach((g,i)=>page(g,g&&g.id? g.id : 'pages['+i+']'));
  }
  return out;
}
