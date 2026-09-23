'use strict';
/* ================= 剪貼簿：跨頁／跨檔複製元素 =================
   Cmd/Ctrl+C 把選取元素序列化為 JSON 寫入系統剪貼簿（copy 事件，不需權限），
   Cmd/Ctrl+V 解析貼回（paste 事件）：換新 id／群組 id，僅當目標頁有同位置同型元素才偏移 16px（同 PPT 手感）。
   系統剪貼簿天然跨瀏覽器分頁 → 開兩份 DeckJSON 也能互貼；也接受整頁物件或單一元素 JSON。 */
function clipboardGuard(){
  return APP.editing||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||document.activeElement.isContentEditable;
}
/* ---- 剪貼簿的 HTML 表格 → 表格元素 ----
   Excel／PowerPoint／Word／網頁／md-table-converter 複製表格時，剪貼簿上都有一份 text/html，
   裡面是結構完整的 <table>：合併寫在 colspan/rowspan 屬性、樣式寫在 inline style。這是所有來源的
   **共同分母**，所以一支解析器就把它們全接下來，不必為每家寫一套私有格式的讀取器。

   關鍵手法：把 HTML 掛進「離屏但確實在 document 上」的容器，讓**瀏覽器自己排版**，再讀
   offsetWidth／getComputedStyle。好處有二：
     1. 欄寬直接量得到。Markdown 表格沒有寬度資訊只能拿字數猜，HTML 這條不必猜。
     2. PowerPoint 的 mso- 私有屬性、<o:p>、conditional comments 這些髒東西由排版引擎自行消化，
        我們只讀計算後的值，不必逐家維護清洗規則。
   代價是必須真的掛上 DOM（DOMParser 產生的 detached 文件沒有 computed style），故用 try/finally 確保移除。*/
/* 貼上表格的固定字級：10.5pt＝14px。
   為什麼是這個數字：md-table-converter 的預覽刻意對齊 Obsidian 的表格渲染（14px 字、行高 1.3），
   使用者用佔位符在 Obsidian 裡「畫」出來的欄寬列高就是以 14px 為尺量出來的。這邊用同一個尺接，
   兩端才是同一個座標系，送過來的 width/height 才對得上。對 Excel／PowerPoint／網頁來源同樣適用——
   分來源給不同字級會讓同一個貼上功能有兩種行為，日後難查。
   10.5pt 對投影片偏小是刻意的：貼入固定字級、再用比例鎖定與字級同步整體放大，
   比讓來源字級決定一切可控得多：來源字級多半是為了塞進原本的版面而縮過的妥協值，繼承過來只會把別人的妥協帶進這裡。*/
const PASTE_TBL_PT=10.5;
const PASTE_TBL_MAX_C=40, PASTE_TBL_MAX_R=200;   // 在 Excel 隨手框一大片就是上萬格，畫布撐不住，超過截斷
const PASTE_TBL_MINW=.30, PASTE_TBL_MAXW=.92;    // 貼入後的總寬夾在畫布寬的這個區間（來源沒寫寬度時會量得極窄）
function rgbToHex6(v){   // getComputedStyle 一律回 rgb()／rgba()
  const m=String(v||'').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
  if(!m) return hex6(v);
  if(m[4]!=null&&+m[4]<.05) return null;   // 透明＝沒設色，不是黑色
  return [m[1],m[2],m[3]].map(n=>Math.round(+n).toString(16).padStart(2,'0')).join('').toUpperCase();
}
/* 格內走訪 → runs。**刻意不讀 font-size**：來源的字級多半是「為了把表格塞進版面」被縮過的，
   那是別人的妥協不是階層資訊，繼承進來只會把妥協一起搬過來。一律用 defCell() 的 12pt，
   貼完再用「比例鎖定＋字級同步」拉整張表，欄寬列高與字級會一起縮，結構不會跑掉（見 resizeBy 的 table 分支）。
   粗體／斜體／字色／底線／刪除線照收——那些是語意。與格層級同值的鍵由 normCell 統一刪除，這裡不必自己瘦身。*/
function htmlCellRuns(td,base){
  const runs=[], push=(t,st)=>{ if(t) runs.push({...st,text:t}); };
  const walk=(node,st)=>{
    for(const n of node.childNodes){
      if(n.nodeType===3){ push(n.textContent.replace(/\s+/g,' '),st); continue; }
      if(n.nodeType!==1) continue;   // 註解節點（conditional comments）直接跳過
      const tag=n.tagName.toLowerCase();
      if(tag==='br'){ if(runs.length) runs[runs.length-1].text+='\n'; else push('\n',st); continue; }
      const cs=getComputedStyle(n), s={...st};
      /* 區塊元素之間補換行。Word／PowerPoint 的儲存格是一行一個 <p>，不補的話多行內容會被接成一長串。
         換行沿用扁平作法：`\n` 留在 run 的 text 裡不拆段（見 normCell 上方說明）。*/
      if(/^(block|list-item|flow-root|table-caption)$/.test(cs.display)
         &&runs.length&&!/\n$/.test(runs[runs.length-1].text)) runs[runs.length-1].text+='\n';
      if(+cs.fontWeight>=600) s.bold=true;
      if(cs.fontStyle==='italic'||cs.fontStyle==='oblique') s.italic=true;
      if(/underline/.test(cs.textDecorationLine)) s.underline=true;
      if(/line-through/.test(cs.textDecorationLine)) s.strike=true;
      /* 上下標只讀**語意**（<sup>/<sub> 的 UA 樣式與行內 vertical-align 都算進 computed），
         來源附帶的 font-size:0.8em 之類縮小一律丟掉——本工具的 sup/sub 匯出成 OOXML baseline，
         縮小與升降由 PowerPoint 自己做。照收縮小的話會變成雙重縮小，Fe₃O₄ 的下標會小到看不見。*/
      if(cs.verticalAlign==='super') s.sup=true;
      else if(cs.verticalAlign==='sub') s.sub=true;
      const c=rgbToHex6(cs.color);
      if(c&&c!=='000000') s.color=c;   // 同 cellFromTd：純黑＝沒指定，退回格層級，免得同一格內兩種黑
      const hl=rgbToHex6(cs.backgroundColor);   // 沒設背景時 computed 是全透明，rgbToHex6 回 null，不會誤標
      if(hl) s.highlight=hl;
      walk(n,s);
    }
  };
  walk(td,base);
  if(runs.length){   // 首尾的排版空白（原始碼縮排）與收尾換行都不是內容
    runs[0].text=runs[0].text.replace(/^[ \n]+/,'');
    runs[runs.length-1].text=runs[runs.length-1].text.replace(/[ \n]+$/,'');
  }
  return runs.filter(r=>r.text);
}
function cellFromTd(td){
  const cs=getComputedStyle(td), cl=defCell();
  cl.sizePt=PASTE_TBL_PT;   // 貼上一律固定字級，不繼承來源（見 PASTE_TBL_PT 的說明）
  const bg=rgbToHex6(cs.backgroundColor);
  /* 來源指定了非白的底色就照收；「純白」與「根本沒設」則收斂成同一件事，交給 APP.pasteWhite 決定。
     為什麼純白要和「沒設」同一組：Excel 匯出的 HTML **每一格都帶白底**，那是它的習慣不是使用者的意圖，
     兩者字面上都是 `#FFFFFF`，分不出來，硬要分只能靠來源留私有記號（見 PASTEW_KEY 的說明）。
     預設填白的理由也在那裡——下面 `cl.color` 那行會把純黑退回深色的 1A1A1A，
     深色字配透明底在非淺色背景上是整張看不見。*/
  cl.fill=(bg&&bg!=='FFFFFF')? bg : (APP.pasteWhite? 'FFFFFF' : null);
  cl.align=/right|end/.test(cs.textAlign)?'right' : /center/.test(cs.textAlign)?'center' : 'left';
  cl.valign=/top/.test(cs.verticalAlign)?'top' : /bottom/.test(cs.verticalAlign)?'bottom' : 'middle';
  cl.bold=+cs.fontWeight>=600;   // <th> 的粗體是 UA 樣式，computed 讀得到，不必特判標籤
  cl.italic=cs.fontStyle==='italic'||cs.fontStyle==='oblique';
  const fc=rgbToHex6(cs.color);
  if(fc&&fc!=='000000') cl.color=fc;   // 純黑退回 defCell 的 1A1A1A，免得整張表逐格寫同一個顏色
  // 底線／刪除線在本工具是 run 級屬性（格層級沒有對應欄位），故併進 run 的基底樣式
  const rb={bold:cl.bold,italic:cl.italic,color:cl.color,sizePt:cl.sizePt};
  if(/underline/.test(cs.textDecorationLine)) rb.underline=true;
  if(/line-through/.test(cs.textDecorationLine)) rb.strike=true;
  const runs=htmlCellRuns(td,rb);
  cl.text=runs.map(r=>r.text).join('');
  if(runs.length) cl.runs=runs;   // 單一 run 且無覆寫時，normCell 會自動退回扁平結構
  return cl;
}
/* 等格內圖片載入完成。**這是量測正確性的前提，不是效能優化**：未載入的 <img> 尺寸是 0，
   欄寬會被低估、列高整列塌掉，而且是「有時候對有時候不對」的那種——快取命中就對，
   第一次貼就錯。所以量測前一律等到底。
   逾時是護欄：來源若掛著連不到的遠端圖，不能讓整個貼上永遠卡住。逾時的那幾張會被
   當成量不到（尺寸 0）而略過，其餘照常。*/
const PASTE_IMG_WAIT=3000;
function waitImgs(box){
  const ims=[...box.querySelectorAll('img')].filter(im=>!im.complete);
  if(!ims.length) return Promise.resolve();
  return Promise.all(ims.map(im=>new Promise(res=>{
    const done=()=>res();
    im.addEventListener('load',done,{once:true});
    im.addEventListener('error',done,{once:true});
    setTimeout(done,PASTE_IMG_WAIT);
  })));
}
/* 格內圖片走「浮動圖片＋軟群組」（缺口總表 §I.7 的路線乙）。
   DrawingML 的 <a:tc> 只有 <a:txBody> 與 <a:tcPr>，**沒有圖片的容身處**；PowerPoint 自己
   在格子裡「插入圖片」時，那張圖也是浮在表格上方的獨立物件。所以這不是把圖片塞進儲存格，
   而是照著目標格式本來的做法擺——表格與圖片是平級的兄弟，靠 groupId 綁在一起。
   選路線甲（<a:tcPr> 的 <a:blipFill>）的話圖會被拉伸填滿整格、比例全毀，那是色塊／浮水印
   的用法，不是產品照。乙唯一的退步是「拖單一欄寬時圖不跟」，但那在 PowerPoint 裡本來就得手動對齊。
   回傳陣列（表格在前、圖片在後）而非單一元素，因為這件事在資料模型上本來就是多個元素。 */
async function htmlToTableEl(html){
  /* 量測容器必須做兩件事，缺一結果就會歪：
     ① **隔離本工具自己的樣式**。容器掛在 document 上才有 computed style，但這也代表沒設色的 <td>
        會繼承到 app UI 的深色主題文字色（實測會量到 #E8E8EA），被當成來源指定的字色收進去。
        故把所有「會被繼承」的屬性明確壓成中性值。
     ② **用本工具渲染表格的同一組度量**（12pt＝16px、padding 0 3px、line-height 1.2，見 :is(.el,.mel) td）。
        量測的目的不是重現來源的長相，而是求出「貼進來以 12pt 渲染時文字剛好放得下」的欄寬。
        來源字級被縮過（PPT 常見）時，照它的寬度收會太窄，一貼進來就整片折行。
     來源自己寫在 style 屬性上的 padding/width 仍然勝出（inline 特異性最高），所以 Excel 的欄寬照樣生效。*/
  const box=document.createElement('div');
  box.id='pasteMeasure';
  box.style.cssText='position:fixed;left:-99999px;top:0;width:'+STAGE_W+'px;visibility:hidden;'
    +'color:#000;font:'+pt2px(PASTE_TBL_PT)+'px/1.2 "Roboto","Noto Sans TC",sans-serif;font-weight:400;font-style:normal;'
    +'text-align:left;text-decoration:none;background:transparent';
  const sty=document.createElement('style');
  /* 字級要用 !important 壓過來源的 inline style：既然輸出固定 PASTE_TBL_PT，量測就必須也在同一個字級下進行，
     否則來源 24pt 量出來的列高會比實際渲染高一倍、來源 8pt 又會太窄。欄寬屬性（Excel 的 width=）
     不受影響，那是版面寬度不是字級推導的。上下標靠 vertical-align 判定，壓字級不影響偵測。*/
  sty.textContent='#pasteMeasure table{border-collapse:collapse}'
    +'#pasteMeasure td,#pasteMeasure th{padding:0 3px;line-height:1.2}'
    /* 格內圖片統一成區塊置中，與 md-table-converter 的預覽（.obs-tbl img.cell-img）逐字對齊：
       來源那邊的列高就是在這個規則下量出來的，這裡若讓 <img> 退回 inline，會多出一段基線
       下墜空間，同一張表在兩邊量到不同的列高。順帶讓「圖片置中於格內」這個放置模型
       在量測階段就成立，不是事後硬套。margin 要 !important，否則被下面的 * 規則歸零。*/
    +'#pasteMeasure img{display:block!important;margin:2px auto!important}'
    // margin 歸零：Word／PowerPoint 把每一行包成 <p class=MsoNormal>，<p> 的預設上下 margin 各 1em
    // 會被量成列高的一部分（實測一行的格子量到 65px），但本工具渲染儲存格沒有段落邊界。
    +'#pasteMeasure *{font-size:'+pt2px(PASTE_TBL_PT)+'px!important;line-height:1.2!important;margin:0!important}';
  box.appendChild(sty);
  document.body.appendChild(box);
  try{
    box.insertAdjacentHTML('beforeend',html);
    const tbl=box.querySelector('table'); if(!tbl) return null;
    const trs=[...tbl.querySelectorAll('tr')].filter(tr=>tr.querySelector('td,th'));
    if(!trs.length) return null;
    /* 先建佔位表推真正的 (r,c)：有 colspan/rowspan 時「第幾個 <td>」跟「第幾欄」對不上，
       拿 index 當欄號會讓整張表從第一個合併之後全部錯位。 */
    const occ=[], items=[];
    let nR=0,nC=0;
    trs.forEach((tr,r)=>{
      let c=0;
      for(const td of tr.children){
        if(!/^(TD|TH)$/.test(td.tagName)) continue;
        while((occ[r]||[])[c]) c++;
        const cs=Math.max(1,td.colSpan||1), rs=Math.max(1,td.rowSpan||1);
        items.push({r,c,cs,rs,td});
        for(let i=r;i<r+rs;i++) for(let j=c;j<c+cs;j++) (occ[i]=occ[i]||[])[j]=true;
        c+=cs; nC=Math.max(nC,c);
      }
      nR=r+1;
    });
    nC=Math.min(nC,PASTE_TBL_MAX_C); nR=Math.min(nR,PASTE_TBL_MAX_R);
    if(!nR||!nC) return null;
    /* 來源有沒有指定「絕對」欄寬（px 或 HTML width 屬性的純數字）。百分比不算——那要有容器寬度
       才有意義，本質上仍是「沒有絕對資訊」。
       量到絕對寬度時必須把量測容器放寬：容器原本是 STAGE_W，比畫布寬的表格會被容器本身壓縮
       （auto layout 下 CJK 可折行，瀏覽器就照折），量出來的數字已經不是來源指定的了，
       後面再怎麼判斷都來不及。實測 1370px 的表在 1280px 容器裡量到 1279px。*/
    const ABS_W=/^\s*[\d.]+(px)?\s*$/i, PCT_W=/%/;
    const wOf=el=>[el.style.width||'', el.getAttribute('width')||''];
    const absW=el=>wOf(el).some(v=>ABS_W.test(v));
    // <col width> 也算：Excel 的欄寬寫在 <colgroup> 上，<td> 身上沒有
    const cols=[...tbl.querySelectorAll('col')];
    const hasSrcW=items.some(it=>absW(it.td))||cols.some(absW);
    if(hasSrcW){
      /* 放寬容器前必須先中和百分比寬。百分比是相對容器的，容器一放到 99999px 就跟著膨脹——
         實測 `<table style="width:100%">` 配 td 的 px 寬（Word 常見組合），330px 的表量成 99998px。
         既然這條路已經確定有絕對寬度可用，百分比就是多餘且有害的資訊，直接拿掉。*/
      for(const el of [tbl, ...cols, ...items.map(it=>it.td)]){
        if(wOf(el).some(v=>PCT_W.test(v))){ el.style.width='auto'; el.removeAttribute('width'); }
      }
      box.style.width='99999px';
    }
    await waitImgs(box);   // 必須在任何 offsetWidth／offsetHeight 之前
    // 欄寬／列高：只拿「沒有跨格」的格子量，跨格的量到的是合併後的總寬，會把該欄撐爆
    const colW=new Array(nC).fill(0), rowH=new Array(nR).fill(0);
    for(const it of items){
      if(it.cs===1&&it.c<nC) colW[it.c]=Math.max(colW[it.c],it.td.offsetWidth);
      if(it.rs===1&&it.r<nR) rowH[it.r]=Math.max(rowH[it.r],it.td.offsetHeight);
    }
    const avg=a=>{ const v=a.filter(n=>n>0); return v.length? v.reduce((x,y)=>x+y,0)/v.length : 0; };
    const dw=avg(colW)||96, dh=avg(rowH)||28;   // 整欄都被合併蓋住 → 沒得量，用其他欄的平均頂上
    /* 列高下限＝1.5 倍字級高。本工具的儲存格沒有上下內距（見 :is(.el,.mel) td），12pt 量到的就是
       純文字高 19px，照收會擠成一團；來源自己有內距的（Excel）量到的本來就比這高，不受影響。*/
    const rhMin=Math.round(pt2px(PASTE_TBL_PT)*1.5);
    for(let i=0;i<nC;i++) colW[i]=Math.max(24,Math.round(colW[i]||dw));
    for(let i=0;i<nR;i++) rowH[i]=Math.max(rhMin,Math.round(rowH[i]||dh));
    /* 總寬夾進畫布的合理區間，但**來源有寫寬度就完全不夾**（兩個方向都不夾）。
       這個夾取是「來源沒給寬度，只能從量測猜」時的補救，不是政策：
       ① 放大：Word／網頁那類沒有寬度資訊的來源量出來會極窄，不撐開就是一條線。
       ② 縮小：同理，猜出來的寬度沒有權威性，超出畫布就壓回去。
       但 md-table-converter 送過來的 inline width 是使用者在 Obsidian 用 `---------0---------0`
       這類佔位符刻意撐出來的幾何，而且是 nowrap 量的「剛好夠」——沒有餘裕，**縮任何一點都必然折行**，
       且最緊的欄先爆，看起來是欄寬亂擠而不是整體變小。加上這裡只縮 colW、不動 rowH／sizePt，
       縮完連比例都不對。所以超寬的表格照原尺寸放進來、讓它超出畫布邊界，
       由使用者用比例鎖定＋字級同步自行縮放——那才是等比的，且資訊不會在貼上階段就被斬掉。
       （hasSrcW 在上面量測前就算好了，因為它同時決定量測容器要不要放寬。）*/
    let tw=colW.reduce((a,b)=>a+b,0);
    const lo=STAGE_W*PASTE_TBL_MINW, hi=STAGE_W*PASTE_TBL_MAXW;
    const sc= hasSrcW? 1 : tw>hi? hi/tw : tw<lo? lo/tw : 1;
    if(sc!==1){ for(let i=0;i<nC;i++) colW[i]=Math.max(24,Math.round(colW[i]*sc)); tw=colW.reduce((a,b)=>a+b,0); }
    const cells=[];
    for(let r=0;r<nR;r++){ cells[r]=[]; for(let c=0;c<nC;c++) cells[r][c]=defCell(); }
    const pics=[]; let skipped=0;
    for(const it of items){
      if(it.r>=nR||it.c>=nC) continue;
      const cs=Math.min(it.cs,nC-it.c), rs=Math.min(it.rs,nR-it.r);
      const cl=cellFromTd(it.td);
      cl.colspan=cs; cl.rowspan=rs; cl.covered=false;
      cells[it.r][it.c]=cl;
      for(let i=it.r;i<it.r+rs;i++) for(let j=it.c;j<it.c+cs;j++)
        if(i!==it.r||j!==it.c) cells[i][j].covered=true;
      /* 格內圖片：只收 data: URI。本工具的簡報必須自足可攜（匯出前的檢查會擋沒有 dataUrl 的
         圖片元素），而遠端網址既不自足，跨來源的 canvas 又會被污染、轉不成位元組。
         剪貼簿的 HTML flavor 本來就只能靠 data URI 帶位元組，所以 md-table-converter 那條路
         天生就對得上；網頁複製的表格多半是遠端網址，那些會被略過並回報，不再靜默消失。 */
      for(const im of it.td.querySelectorAll('img')){
        const src=im.getAttribute('src')||'';
        const iw=im.offsetWidth, ih=im.offsetHeight;
        if(!/^data:image\//i.test(src)||iw<1||ih<1){ skipped++; continue; }
        const tr=it.td.getBoundingClientRect(), ir=im.getBoundingClientRect();
        pics.push({r:it.r,c:it.c,cs,rs,src,w:iw,h:ih,dy:Math.round(ir.top-tr.top),
                   natW:im.naturalWidth||iw, natH:im.naturalHeight||ih});
      }
    }
    const th=rowH.reduce((a,b)=>a+b,0);
    const tx=Math.max(0,Math.round((STAGE_W-tw)/2)), ty=Math.max(0,Math.round((STAGE_H-th)/2));
    /* 框線一律用整表預設細線，不逐格反推來源。Excel 複製時會把「網格線」也寫成 border，
       照收的話貼進來是滿版格線；而框線在本工具是一鍵可套的，反推錯了反而更難清。*/
    const tbl2={id:uid('e'),type:'table',x:tx,y:ty,
      colW,rowH,cells,border:{pt:0.75,color:'999999'}};
    if(!pics.length) return {els:[tbl2],skipped};
    /* 座標一律從**最終的** colW／rowH 推，不用量測時的絕對位置：欄寬在上面可能被 sc 縮過
       （而 rowH 沒有），照抄量測座標會整排橫向錯位。橫向置中呼應量測時的 margin:0 auto；
       縱向沿用格內量到的位移，文字在上、圖在下的格子才不會被壓成疊字。 */
    const sum=(a,i,n)=>a.slice(i,i+n).reduce((x,y)=>x+y,0);
    const gid=uid('g');
    tbl2.groupId=gid;
    const els=[tbl2];
    for(const p of pics){
      const cw=sum(colW,p.c,p.cs), ch=sum(rowH,p.r,p.rs);
      const k=Math.min(1,cw/p.w);   // 欄寬被夾取縮過時，圖跟著等比縮，不讓它橫向溢出格子
      const w=Math.max(1,Math.round(p.w*k)), h=Math.max(1,Math.round(p.h*k));
      els.push({id:uid('e'),type:'image',groupId:gid,
        x:Math.round(tx+sum(colW,0,p.c)+(cw-w)/2),
        y:Math.round(ty+sum(rowH,0,p.r)+Math.min(Math.max(0,p.dy*k),Math.max(0,ch-h))),
        w,h,natW:p.natW,natH:p.natH,dataUrl:p.src});
    }
    return {els,skipped};
  }catch(err){ return null; }
  finally{ box.remove(); }
}
const clipHasTable=e=>{
  const h=e.clipboardData&&e.clipboardData.getData('text/html');
  return !!h&&/<table[\s>]/i.test(h);
};
document.addEventListener('copy',e=>{
  if(clipboardGuard()||!APP.selIds.length) return;
  const els=selEls().map(el=>structuredClone(el));
  e.clipboardData.setData('text/plain',JSON.stringify({format:'deckjson-elements',elements:els},null,1));
  e.preventDefault();
});
document.addEventListener('cut',e=>{
  if(clipboardGuard()||!APP.selIds.length) return;
  const els=selEls().map(el=>structuredClone(el));
  e.clipboardData.setData('text/plain',JSON.stringify({format:'deckjson-elements',elements:els},null,1));
  e.preventDefault();
  deleteSelected();
});
/* 貼上優先權：結構化內容 > 圖片。① 本工具自己的元素 JSON ② 任何來源的 HTML <table>
   ③ 圖片（在上面那個 listener，已讓位給 ②）。②③ 的先後是刻意的，理由見該處說明。*/
document.addEventListener('paste',e=>{
  if(clipboardGuard()) return;
  let els=null;
  const t=e.clipboardData.getData('text/plain');
  if(t&&(t[0]==='{'||t[0]==='[')){
    let o=null; try{ o=JSON.parse(t); }catch(err){ o=null; }
    if(o&&o.format==='deckjson-elements'&&Array.isArray(o.elements)) els=o.elements;
    else if(o&&Array.isArray(o.elements)&&!o.pages) els=o.elements;          // 整頁物件 → 取其元素
    else if(o&&o.type&&o.x!=null) els=[o];                                   // 單一元素物件
  }
  if(!els&&clipHasTable(e)){                                                 // Excel／PPT／Word／網頁／md-table-converter
    /* 這條路是非同步的：格內圖片必須先載入完成才量得到尺寸（見 waitImgs）。
       clipboardData 只在同步階段有效，所以先把字串取出來、先 preventDefault，
       剩下的交給 Promise——插入邏輯與同步路徑共用 insertPasted()。*/
    const html=e.clipboardData.getData('text/html');
    e.preventDefault();
    htmlToTableEl(html).then(res=>{
      if(!res||!res.els.length) return;
      insertPasted(res.els,true);   // 已算好置中座標，不要再套防重疊偏移
      if(res.skipped) alert(_t('有 {0} 張格內圖片未收進來。\n本工具只接受內嵌位元組（data: URI）的圖片——'
        +'遠端網址的圖既不能隨簡報帶走，也無法轉成位元組（跨來源 canvas 會被污染）。\n'
        +'若來源工具有「嵌入圖片」之類的選項，請先開啟再複製。',res.skipped));
    });
    return;
  }
  // 先過濾再決定要不要吃掉這次貼上：濾完是空的就讓瀏覽器照原本的方式處理
  els=els&&els.filter(pastableEl);
  if(!els||!els.length) return;
  e.preventDefault();
  insertPasted(els,false);
});
const PASTE_OK={text:1,table:1,image:1,shape:1,chart:1,video:1};
const pastableEl=x=>!!x&&typeof x==='object'&&!!PASTE_OK[x.type];
function insertPasted(els,placed){
  els=els.filter(pastableEl);
  if(!els.length) return;
  // @asset 佔位 → 還原 base64（同檔內複製時；跨檔貼遮罩 JSON 找不到位元組則擋下）
  try{ resolveAssets({elements:els}); }catch(err){ alert(_t('貼上失敗：{0}',err.message)); return; }
  commitUndo();
  const clash=!placed&&els.some(src=>curEls().some(t2=>t2.x===src.x&&t2.y===src.y&&t2.type===src.type));
  const off=clash?16:0;
  const gidMap=new Map(), ids=[];
  for(const src of els){
    const cp=structuredClone(src); cp.id=uid('e');
    if(cp.groupId){ if(!gidMap.has(cp.groupId)) gidMap.set(cp.groupId,uid('g')); cp.groupId=gidMap.get(cp.groupId); }
    cp.x=(cp.x||0)+off; cp.y=(cp.y||0)+off;
    curEls().push(cp); ids.push(cp.id);
  }
  try{ normalizeDeck(APP.deck); }catch(err){ undo(); alert(_t('貼上的元素格式不完整：{0}',err.message)); return; }
  setSel(ids); renderAll(); syncPageJson(); reportChartIssues();
}

