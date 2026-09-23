'use strict';
/* ================= 頁尾佔位符（頁碼 sldNum／日期 dt） =================
   為什麼不用 PptxGenJS 的 slide.slideNumber：它寫出的是「明寫 <a:xfrm> 座標 ＋ idx="4294967295"」
   的佔位符。有自己的座標就不會去繼承目的端版面的位置，貼進別人的母版時永遠卡在原座標；
   那個 idx（0xFFFFFFFF）意思是「不對應任何版面配置索引」，等於自己把繼承鏈剪斷。
   日期（type="dt"）它則根本沒有。兩件事同源，所以整組自己寫。

   兩種輸出，跟著同一個「母版繼承」開關走（與字體同一個開關，見說明面板）：
     locked  → 投影片上寫滿座標／字級／顏色／對齊，貼到哪裡都長一樣
     inherit → 投影片上只留空殼（<p:spPr/>、<a:bodyPr/>、<a:lstStyle/>，沒有 xfrm、沒有字級），
               位置與樣式全部交給所屬版面配置 → 貼進別人的簡報就跟著對方的頁尾走
   inherit 模式下這個檔自己打開時仍然正確，因為「帶座標的完整版」同時寫進了自家的 slideMaster
   與每一個 slideLayout（見 injectHfParts）——繼承鏈是 slide → layout → master，缺一層就往上找。

   idx 取 PowerPoint 版面配置的慣例值（dt=10、ftr=11、sldNum=12；母版端另有一組 2/3/4）。
   實測一份 PowerPoint 自製範本：母版用 2/3/4、版面配置用 10/11/12，兩邊 idx 不同而繼承照樣成立
   ——可知這三種佔位符主要靠 type 匹配、idx 只是輔助，貼到 idx 不同的別家母版上不會斷。 */
const HF_KINDS={
  sldNum:{sz:'quarter',idx:12,name:'Slide Number Placeholder',fld:'slidenum',
          guid:'{F7021451-1387-4CA6-816F-3879F97B5CBC}'},
  dt:    {sz:'half',   idx:10,name:'Date Placeholder',        fld:'datetime1',
          guid:'{5D2C1B0A-9E44-4F27-B6D3-2A8E7C914B60}'},
};
const HF_ALGN={left:'l',center:'ctr',right:'r'};
function hfSpXml(kind,o){
  const K=HF_KINDS[kind], lang=o.lang||'en-US';
  // auto＝可更新欄位（<a:fld>，開檔／放映時由 PowerPoint 重算）；fixed＝一般 run，字面就是內容
  const body= o.fixed
    ? `<a:r><a:rPr lang="${lang}"/><a:t>${xmlAttr(o.text)}</a:t></a:r>`
    : `<a:fld id="${K.guid}" type="${K.fld}"><a:rPr lang="${lang}"/><a:t>${xmlAttr(o.text)}</a:t></a:fld>`;
  const nv=`<p:nvSpPr><p:cNvPr id="${o.id}" name="${K.name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>`
    +`<p:nvPr><p:ph type="${kind}" sz="${K.sz}" idx="${K.idx}"/></p:nvPr></p:nvSpPr>`;
  if(o.inherit)   // 空殼：一個座標、一個字級都不能寫，寫了就不是繼承
    return `<p:sp>${nv}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>`
      +`<a:p>${body}<a:endParaRPr lang="${lang}"/></a:p></p:txBody></p:sp>`;
  const b=o.box, al=HF_ALGN[b.align]||'r';
  return `<p:sp>${nv}<p:spPr><a:xfrm><a:off x="${px2emu(b.x)}" y="${px2emu(b.y)}"/>`
    +`<a:ext cx="${px2emu(b.w)}" cy="${px2emu(b.h)}"/></a:xfrm>`
    +`<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
    +`<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>`
    +`<a:lstStyle><a:lvl1pPr algn="${al}"><a:defRPr sz="${Math.round(b.sizePt*100)}">`
    +`<a:solidFill><a:srgbClr val="${b.color.toUpperCase()}"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>`
    +`<a:p><a:pPr algn="${al}"/>${body}<a:endParaRPr lang="${lang}"/></a:p></p:txBody></p:sp>`;
}
/* 把兩個佔位符插進一份 spTree。inherit 只對投影片成立——母版與版面配置永遠寫完整座標，
   否則這個檔案自己打開時就沒有任何一層知道頁碼該放哪裡。
   id 取「現有最大值 +1、+2」；後續的 cNvPr id 去重（後製 (7)）仍會再兜一次底。 */
function injectHf(xml,{inherit,lang,pageIdx}){
  const D=APP.deck, add=[];
  let id=Math.max(0,...[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>+m[1]));
  const skip=c=>pageIdx!=null&&c.skipFirst&&pageIdx===0;   // 母版／版面配置沒有頁次，一律要寫
  if(D.pageNum&&!skip(D.pageNum)) add.push(hfSpXml('sldNum',
    {box:pageNumBox(),text:pageIdx!=null? String(pageIdx+1):'‹#›',lang,id:++id,inherit}));
  if(D.date&&!skip(D.date)) add.push(hfSpXml('dt',
    {box:dateBox(),text:dateText(),fixed:D.date.fmt==='fixed',lang,id:++id,inherit}));
  return add.length? xml.replace('</p:spTree>',add.join('')+'</p:spTree>') : xml;
}
function patchFonts(xml,latinFont,mode,F,lang){
  const mk= mode==='inherit'
    ? '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>'
    : `<a:latin typeface="${latinFont}"/><a:ea typeface="${F.ea}"/><a:cs typeface="${latinFont}"/>`;
  // 全文件同一個 lang（不按語言切 run，見說明「字體模式」）；語言碼由 deck.lang 決定
  const fixA=a=>` lang="${lang||'en-US'}"`+a.replace(/\s+lang="[^"]*"/g,'');
  const strip=s=>s.replace(/<a:(latin|ea|cs)\b[^>]*\/>/g,'');
  // run 級自訂字型（run.fontFace）例外：該 rPr 已被 PptxGenJS 寫入 latin/ea/cs，
  // 不可被全域字體覆蓋，改為三槽都用該字型（同 PptxGenJS 對 fontFace 的處理）
  const pick=inner=>{ const m=inner.match(/<a:latin typeface="([^"]+)"[^>]*\/>/);
    return m? `<a:latin typeface="${m[1]}"/><a:ea typeface="${m[1]}"/><a:cs typeface="${m[1]}"/>` : mk; };
  // 順序重要：先處理「成對」再處理「自閉合」。
  // 若反過來，自閉合展開後產生的成對標籤會被第二段 regex 再塞一次字體
  // → <a:endParaRPr> 內重複 <a:latin> 子節點，違反 schema，PowerPoint 要求修復
  let s=xml.replace(/<a:(rPr|endParaRPr|defRPr)((?:\s+[-\w:]+="[^"]*")*)\s*>([\s\S]*?)<\/a:\1>/g,
    (m,t,at,inner)=>`<a:${t}${fixA(at)}>${strip(inner)}${pick(inner)}</a:${t}>`);
  s=s.replace(/<a:(rPr|endParaRPr|defRPr)((?:\s+[-\w:]+="[^"]*")*)\s*\/>/g,
    (m,t,at)=>`<a:${t}${fixA(at)}>${mk}</a:${t}>`);
  return s;
}
async function exportPptx(download=true){
  const orig=APP.page, origSel=[...APP.selIds];
  // 匯出途中會 renderStage() 量表格列高；若停在「編輯母版」，curEls() 會指向母版元素
  // 而不是該頁內容，量到的列高全錯。先切回一般模式，收尾再還原。
  const origME=APP.masterEdit; APP.masterEdit=false;
  const pptx=new PptxGenJS();
  const SW=APP.deck.stage.w, SH=APP.deck.stage.h;
  const LAY=`DeckJSON${SW}x${SH}`;
  pptx.defineLayout({name:LAY,width:px2in(SW),height:px2in(SH)});
  pptx.layout=LAY;
  // 檔案屬性（docProps/core.xml、app.xml）：留空的欄位不寫，避免塞入無意義預設值
  pptx.title=APP.deck.title||_t('未命名簡報');
  if(APP.deck.author) pptx.author=APP.deck.author;
  if(APP.deck.company) pptx.company=APP.deck.company;
  if(APP.deck.subject) pptx.subject=APP.deck.subject;
  const pendList=[];        // 全 deck 的待插入影片清單（匯出後彙總對話框用）
  nvDowngrade.length=0;     // 勾了原生但匯出前複檢沒過的圖表（見下方降級提示）
  let wroteNotes=false;     // 是否真的有寫進備忘稿（含待辦提示）→ 決定要不要保留 notesMaster 基建
  /* 章節（PowerPoint 縮圖窗格的可摺疊分組）。
     PptxGenJS 只認「標題字串」：addSlide({sectionTitle}) 是拿字串去 sections 陣列比對，
     所以標題必須全域唯一（normalizeDeck 已負責去重）。另一個坑：一旦存在任何 section，
     沒指定 sectionTitle 的投影片會被自動塞進 "Default-1" 這種英文名分組——
     故若有人從第 N 頁才開始分章，這裡先替前面幾頁補一個明確命名的章節。 */
  /* ---- 母版（「信紙」）----
     兩種輸出，同一份 deck.master.elements，切換不動資料：
       flatten=false → PowerPoint 的版面配置（slideLayout），每頁只掛一個參照 → 檔案最小
       flatten=true  → 母版元素併進每一頁的元素清單，變成該頁真正的 shape → 整張搬得走
     ⚠ PptxGenJS 的 defineSlideMaster({objects}) 只認 text/image/line/rect/chart/table 六種簡表，
     custGeom、preset 幾何、漸層、陰影、超連結全都表達不了。故此處不用 objects，
     改用「借一張暫時投影片跑既有的 addElToSlide，再把成果移植到 layout 上」——
     母版因此自動享有一般元素的全部能力，也不必維護第二套寫入器。 */
  const MST=APP.deck.master;
  const mstEls=(MST&&MST.on)? MST.elements.filter(e=>!e.hidden) : [];
  const useMasterLayout=mstEls.length&&!MST.flatten;
  // 展開模式下這一頁要併進來的母版元素（匯出與匯出後製都要用同一份，否則後製會漏掉母版形狀）
  const mstForPage=pg=>(mstEls.length&&MST.flatten&&!pg.noMaster)? mstEls : [];
  const MST_NAME=_t('DeckJSON 母版');
  if(useMasterLayout) pptx.defineSlideMaster({title:MST_NAME});
  const useSec=APP.deck.pages.some(p=>p.section);
  let curSec=null;
  if(useSec&&!APP.deck.pages[0].section){
    curSec=secLead(APP.deck);
    pptx.addSection({title:curSec});
  }
  for(let pi=0;pi<APP.deck.pages.length;pi++){
    const pg=APP.deck.pages[pi];
    APP.page=pg.id; APP.selIds=[];
    renderStage();               // 表格列高（wrap 長高）需以實際渲染 DOM 為準
    if(pg.section){ curSec=pg.section; pptx.addSection({title:curSec}); }
    const useM=useMasterLayout&&!pg.noMaster;
    const slide=pptx.addSlide(Object.assign({},curSec?{sectionTitle:curSec}:null,useM?{masterName:MST_NAME}:null));
    // 背景圖片走 blipFill（副檔名由 data URL 的 mime 決定，否則 PptxGenJS 一律當 png，jpg 會對不上型別）
    if(pg.bgImage){
      const m=/^data:image\/(\w+)/.exec(pg.bgImage);
      slide.background={data:pg.bgImage,path:'bg.'+((m&&m[1].toLowerCase()==='jpeg')?'jpeg':'png')};
    }else slide.background={color:pg.bg||'FFFFFF'};
    const pend=[];   // 本頁的「待插入影片」清單（本機影片只放了封面圖佔位）
    for(const el of [...mstForPage(pg),...pg.elements]) if(!el.hidden) await addElToSlide(slide,el,pend);
    if(pg.skip) slide.hidden=true;   // 不放映此頁 → <p:sld show="0">
    /* 講者備忘稿。待插入影片的提示在這裡「只附加到輸出字串」，刻意不寫回 pg.notes——
       否則每次匯出都會再累加一份，還得做去重，而且動到了使用者自己的資料。 */
    const noteOut=[String(pg.notes||'').trim(),
      ...(pend.length? [_t('—— DeckJSON 待辦 ——'),...pend.map(t=>'• '+t)]:[])].filter(Boolean).join('\n');
    if(noteOut){ slide.addNotes(noteOut); wroteNotes=true; }
    if(pend.length) pendList.push(_t('第 {0} 頁',pi+1)+(pg.name?_t('（{0}）',pg.name):'')+_t('：')+pend.join(_t('、')));
  }
  /* 母版內容移植：借最後一張暫時投影片跑完既有寫入器，再把 _slideObjects 與三份 rels
     整組搬到 layout 上，然後把那張暫時投影片從輸出移除。
     時機刻意放在所有頁之後——addSlide 的 _slideNum 是「目前張數+1」，媒體檔名是
     media-<_slideNum>-<n>.ext，先建暫時頁會跟第 1 頁撞名。
     rels 的 Target 是 ../media/…，從 ppt/slideLayouts/ 與 ppt/slides/ 解出來的路徑相同，故可直接搬。 */
  if(useMasterLayout){
    /* addSlide 會順手把新頁掛進章節；一旦已有任何章節，沒指定 sectionTitle 的頁還會生一個
       "Default-1" 分組。暫時頁事後雖然移除，那個章節條目卻留著 → 匯出多一個空章節。
       故先記下章節狀態，移除暫時頁時一併還原。 */
    const secSnap=pptx.sections.map(x=>x._slides.length);
    const tmp=pptx.addSlide();
    for(const el of mstEls) await addElToSlide(tmp,el,[]);
    pptx.slides.pop();
    pptx.sections.length=secSnap.length;
    pptx.sections.forEach((x,i)=>{ x._slides.length=secSnap[i]; });
    const lay=pptx.slideLayouts.find(l=>l._name===MST_NAME);
    lay._slideObjects=tmp._slideObjects;
    lay._rels=tmp._rels; lay._relsChart=tmp._relsChart; lay._relsMedia=tmp._relsMedia;
  }
  APP.page=orig; setSel(origSel); APP.masterEdit=origME;
  document.body.classList.toggle('masterEdit',origME);
  renderAll();

  const ab=await pptx.write('arraybuffer');
  const zip=await JSZip.loadAsync(ab);
  // sldSz 精確（PptxGenJS 吋換算會差 ~30 EMU）：1px=9525 EMU 直接算，
  // type 只在尺寸命中標準比例時才寫（非標準比例硬掛 type 會與 cx/cy 矛盾）
  let pres=await zip.file('ppt/presentation.xml').async('string');
  {const pre=stagePresetOf(SW,SH);
   pres=pres.replace(/<p:sldSz[^>]*\/>/,
     `<p:sldSz cx="${px2emu(SW)}" cy="${px2emu(SH)}"${pre?` type="${pre.type}"`:''}/>`);}

  /* ---- 套件級修復：PptxGenJS 3.12 已知缺陷（上游停更，gitbrent/PptxGenJS#1449），
          多頁＋備忘稿時會觸發 PowerPoint「需要修復」並丟元素 ---- */
  // (1) presentation.xml：notesMasterIdLst 依 CT_Presentation schema 應在 sldIdLst 之前（PptxGenJS 寫在其後）
  {const nm=pres.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/);
   if(nm){ pres=pres.replace(nm[0],''); pres=pres.replace('</p:sldMasterIdLst>','</p:sldMasterIdLst>'+nm[0]); }}
  // (2) 備忘稿基建：全 deck 無備忘稿時整組拆除（PptxGenJS 的 notesMaster 含畸形佔位形狀，修復時被 PPT 移除）；
  //     有備忘稿時給 notesMaster 專屬 theme（誤共用 slideMaster 的 theme1 也是修復觸發點）
  // 注意：不能只看 pg.notes——「待插入影片」的待辦提示也會寫進備忘稿，
  // 漏算會把 notesMaster 基建整組拆掉，連帶弄壞那些頁的 notesSlide 關聯
  const hasNotes=wroteNotes;
  if(!hasNotes){
    for(const n of Object.keys(zip.files)) if(/^ppt\/(notesMasters|notesSlides)\//.test(n)) zip.remove(n);
    zip.remove('ppt/notesMasters'); zip.remove('ppt/notesSlides');
    pres=pres.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/,'');
    let prels=await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    prels=prels.replace(/<Relationship[^>]*notesMaster[^>]*\/>/g,'');
    zip.file('ppt/_rels/presentation.xml.rels',prels);
    for(const n of Object.keys(zip.files)){
      if(!/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n)) continue;
      let r=await zip.file(n).async('string');
      zip.file(n,r.replace(/<Relationship[^>]*notesSlide[^>]*\/>/g,''));
    }
  }else{
    const th=await zip.file('ppt/theme/theme1.xml').async('string');
    zip.file('ppt/theme/theme2.xml',th);
    let nrels=await zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels').async('string');
    zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels',nrels.replace('theme/theme1.xml','theme/theme2.xml'));
  }
  // (3) 空鷹架目錄（charts/embeddings/media 沒內容仍佔 zip 條目）
  for(const d of ['ppt/charts','ppt/embeddings','ppt/media'])
    if(!Object.keys(zip.files).some(n=>n.startsWith(d+'/')&&!zip.files[n].dir)) zip.remove(d);
  // (4) Content_Types：移除指向不存在部件的 Override（PptxGenJS 每頁多寫一個幽靈 slideMaster）
  //     與沒用到的 Default 副檔名；有備忘稿時補 theme2 Override
  let ct=await zip.file('[Content_Types].xml').async('string');
  if(hasNotes) ct=ct.replace('</Types>','<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
  ct=ct.replace(/<Override PartName="\/([^"]+)"[^>]*\/>\s*/g,(m,p)=>zip.file(p)?m:'');
  const usedExt=new Set(Object.keys(zip.files).filter(n=>!zip.files[n].dir).map(n=>n.split('.').pop().toLowerCase()));
  ct=ct.replace(/<Default Extension="([^"]+)"[^>]*\/>/g,(m,e)=>(e==='rels'||usedExt.has(e.toLowerCase()))?m:'');
  zip.file('[Content_Types].xml',ct);
  zip.file('ppt/presentation.xml',pres);
  const mode=APP.deck.fontMode, F=APP.deck.fonts, LANG=APP.deck.lang||defaultLang();
  /* 母版 layout 也要走同一輪後製：adj 黃點、漸層、替代文字、超連結、字體全是在這裡注入的，
     漏掉的話母版上的圓角形狀會變直角、漸層會退回單色——畫布與匯出對不上。 */
  let MST_LAYOUT=null;
  if(useMasterLayout) for(const n of Object.keys(zip.files)){
    if(!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)) continue;
    if((await zip.file(n).async('string')).includes(`name="${MST_NAME}"`)){ MST_LAYOUT=n; break; }
  }
  for(const name of Object.keys(zip.files)){
    const isMstPart=(name===MST_LAYOUT);
    if(!isMstPart&&!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    let s=await zip.file(name).async('string');
    // 表格 graphicFrame 假外框 → 改寫為 gridCol/tr 實際總和（xlsx2pptx 踩坑 #9）
    s=s.replace(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g,blk=>{
      if(!blk.includes('<a:tbl>')) return blk;
      const cx=[...blk.matchAll(/<a:gridCol w="(\d+)"/g)].reduce((a,m)=>a+ +m[1],0);
      const cy=[...blk.matchAll(/<a:tr h="(\d+)"/g)].reduce((a,m)=>a+ +m[1],0);
      if(!cx||!cy) return blk;
      return blk.replace(/<a:ext cx="\d+" cy="\d+"\/>/,`<a:ext cx="${cx}" cy="${cy}"/>`);
    });
    // 形狀 adj 控點：注入原生 avLst gd（PptxGenJS 寫的是成對空標籤 <a:avLst></a:avLst>，需同時吃自閉合寫法）
    let pgA;
    if(isMstPart) pgA={elements:mstEls};
    else{ const sIdx=+name.match(/slide(\d+)\.xml/)[1]-1, p0=APP.deck.pages[sIdx];
          pgA=p0&&{...p0,elements:[...mstForPage(p0),...p0.elements]}; }
    if(pgA) for(const el of pgA.elements){
      // 沒動過 adj 就不注入——讓 PowerPoint 用 preset 自己的預設值，畫布也用同一組，兩邊自然一致
      if(el.hidden||el.type!=='shape'||!adjCustom(el)) continue;
      const vals=adjVals(el), av=(geomDef(el.shape)||[])[0]||[];
      // 全量注入：avLst 要嘛不寫、要寫就得含該 preset 的「全部」gd，缺一個 PowerPoint 就判形狀損毀
      const gds=av.map(([n],i)=>`<a:gd name="${n}" fmla="val ${Math.round(vals[i])}"/>`).join('');
      // 肘形連接線的 prstGeom 名是 bentConnector3（≠ shape key）；一般形狀則 key＝prst
      const prst=LINE_KINDS[el.shape]? LINE_KINDS[el.shape].pptx : el.shape;
      const reEmpty=new RegExp(`(name="${reEsc(el.id)}"[\\s\\S]*?<a:prstGeom prst="${prst}">)<a:avLst\\s*(?:/>|>\\s*</a:avLst>)`);
      if(reEmpty.test(s)) s=s.replace(reEmpty,`$1<a:avLst>${gds}</a:avLst>`);
      else{  // prstGeom 自閉合、無 avLst（連接線常見）→ 補上帶 gd 的 avLst
        const reSelf=new RegExp(`(name="${reEsc(el.id)}"[\\s\\S]*?)<a:prstGeom prst="${prst}"\\s*/>`);
        s=s.replace(reSelf,`$1<a:prstGeom prst="${prst}"><a:avLst>${gds}</a:avLst></a:prstGeom>`);
      }
    }
    /* 漸層填色：把錨點 solidFill 換成 <a:gradFill>。
       只能動 spPr 內、<a:ln> 之前的那一個 solidFill——外框顏色也是 solidFill，但它包在 <a:ln> 裡。 */
    if(pgA) for(const el of pgA.elements){
      if(el.hidden||!el.grad) continue;
      const re=new RegExp(`(name="${reEsc(el.id)}"[\\s\\S]*?<p:spPr[^>]*>)([\\s\\S]*?)(</p:spPr>)`);
      s=s.replace(re,(m,head,body,tail)=>{
        // ⚠ 邊界要寫成 <a:ln 後接空白或 '>'：custGeom 的路徑指令是 <a:lnTo>，
        //    用 indexOf('<a:ln') 會切在幾何內部，導致 custGeom 的漸層永遠注入不進去
        const i=(body.match(/<a:ln[\s>]/)||{index:-1}).index;
        const pre=i<0?body:body.slice(0,i), post=i<0?'':body.slice(i);
        if(!/<a:solidFill>/.test(pre)) return m;   // 沒有錨點就別亂插，維持原樣
        return head+pre.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/,gradXml(el.grad))+post+tail;
      });
    }
    /* (5) 一段多 run 時 <a:pPr> 被重複輸出 → 只留第一個
       PptxGenJS 3.12 的 genXmlTextBody 對「同一段落內的每個 run」都呼叫一次 genXmlParagraphProperties，
       只有全空的 pPr 會被丟掉；DeckJSON 每個 run 都帶 align，所以段內混排（粗體／變色／上下標／
       底線…）必然產生 <a:p><a:pPr/><a:r/><a:pPr/><a:r/>…。CT_TextParagraph 規定 pPr maxOccurs=1
       且必須是第一個子元素 → 違反 schema，是 PowerPoint「需要修復」的高風險寫法。
       第一個 pPr 已帶齊本段屬性（對齊／項目符號／段距皆由該段第一個 run 帶頭），故保留第一個、刪其餘。*/
    s=s.replace(/<a:p>[\s\S]*?<\/a:p>/g,blk=>{ let first=true;
      return blk.replace(/<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>|<a:pPr\b[^>]*\/>/g,m=>{
        if(first){ first=false; return m; } return ''; });
    });
    // (6) 圖片 descr：未填替代文字時 PptxGenJS 會把它的內部 path 塞進去（沒給 path 時是
    //     "preencoded.png"，給了去重鍵之後是雜湊檔名），一律清成空字串——TC-27 驗這條；
    //     文字／形狀／表格的 cNvPr 本來就沒有 descr 屬性（套件只支援圖片），有 alt 的補寫上去
    s=s.replace(/ descr="([^"]*)"/g,(m,v)=>isInternalMediaPath(v)?' descr=""':m);
    if(pgA) for(const el of pgA.elements){
      // 圖片／圖表／本機影片走 addImage，descr 已由 altText 寫好；線上影片的 cNvPr 沒有 descr，需在此補
      if(el.hidden||!el.alt||el.type==='image'||el.type==='chart'||(el.type==='video'&&el.mode==='local')) continue;
      s=s.replace(new RegExp(`(<p:cNvPr id="\\d+" name="${reEsc(el.id)}")(?![^>]*descr=)`),
        `$1 descr="${xmlAttr(el.alt)}"`);
    }
    /* 頁碼／日期佔位符：投影片這一份依模式決定寫實或寫空殼（見 injectHf 上方說明）。
       母版與版面配置那一份在迴圈外另外處理，永遠寫實座標。 */
    if(!isMstPart) s=injectHf(s,{inherit:mode==='inherit',lang:LANG,
      pageIdx:+name.match(/slide(\d+)\.xml/)[1]-1});
    // (7) cNvPr id 去重：單頁物件數多時佔位形狀有機會與元素撞號 → PowerPoint 判為毀損要求修復。
    //     重複者一律改號。（原本的元凶是 PptxGenJS 把頁碼佔位形狀的 id 寫死成 25，那條路已改為自寫。）
    {const all=[...s.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>+m[1]);
     let mx=all.length? Math.max(...all):0;          // 先掃完全部再發新號，避免補的號碼撞到後面既有的
     const used=new Set();
     s=s.replace(/<p:cNvPr id="(\d+)"/g,(m,d)=>{ const n=+d;
       if(!used.has(n)){ used.add(n); return m; }
       const nn=++mx; used.add(nn); return `<p:cNvPr id="${nn}"`; });}
    /* (8) 物件層級超連結：補 addText 這條路缺的 <a:hlinkClick> 與關聯（見 linkOpt 上方說明）。
       走 addImage／addShape 的元素（圖片／圖表／影片／線條）PptxGenJS 自己會註冊，不在此處理。
       hlinkClick 依 CT_NonVisualDrawingProps 必須是 cNvPr 的第一個子元素，故插在開頭標籤之後。*/
    if(pgA){
      const relName=(isMstPart?'ppt/slideLayouts/_rels/':'ppt/slides/_rels/')+name.split('/').pop()+'.rels';
      const relFile=zip.file(relName);
      if(relFile){
        const rels=await relFile.async('string');
        let maxR=Math.max(0,...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m=>+m[1]));
        let add='';
        for(const el of pgA.elements){
          if(el.hidden||!el.link||!isTextPath(el)) continue;
          const re=new RegExp(`(<p:cNvPr id="\\d+" name="${reEsc(el.id)}"[^>]*?)(\\/>|>)`);
          if(!re.test(s)) continue;                       // 找不到形狀就跳過，不留孤兒關聯
          const rid='rId'+(++maxR);
          if(el.link.url){
            add+=`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"`
               +` Target="${xmlAttr(el.link.url)}" TargetMode="External"/>`;
          }else{
            const n=Math.max(1,Math.min(APP.deck.pages.length,Math.round(el.link.slide)||1));
            add+=`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"`
               +` Target="slide${n}.xml"/>`;
          }
          const hl=`<a:hlinkClick r:id="${rid}"`
            +(el.link.url?'':' action="ppaction://hlinksldjump"')
            +(el.link.tooltip?` tooltip="${xmlAttr(el.link.tooltip)}"`:'')+'/>';
          s=s.replace(re,(m,head,close)=> close==='/>'? `${head}>${hl}</p:cNvPr>` : `${head}>${hl}`);
        }
        if(add) zip.file(relName,rels.replace('</Relationships>',add+'</Relationships>'));
      }
    }
    // 頁面轉場：schema 順序為 cSld, clrMapOvr, transition —— 插在 </p:sld> 前即合法
    if(pgA&&pgA.transition){
      const tx=transitionXml(pgA.transition);
      if(tx) s=s.replace(/<\/p:sld>\s*$/,tx+'</p:sld>');
    }
    // 字體：表格區塊 latin 用 fonts.tableLatin，其餘用 fonts.latin；ea 一律 fonts.ea（繼承模式則全走主題槽）
    const parts=s.split(/(<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>)/g);
    s=parts.map(seg=>{
      const isTbl=seg.startsWith('<p:graphicFrame>')&&seg.includes('<a:tbl>');
      return patchFonts(seg,isTbl?F.tableLatin:F.latin,mode,F,LANG);
    }).join('');
    zip.file(name,s);
  }
  /* ---- 母版與版面配置的後製 ----
     兩件事，都是 2026-08-04 使用者實測「貼進別人的簡報，頁碼還是卡在右下角」之後才查清楚的。 */
  for(const name of Object.keys(zip.files)){
    if(!/^ppt\/(slideMasters\/slideMaster|slideLayouts\/slideLayout)\d+\.xml$/.test(name)) continue;
    const isMst=/slideMasters\/slideMaster/.test(name);
    let s=await zip.file(name).async('string');
    /* (a) 版面配置要標成「空白」版面。
       PptxGenJS 寫的是 `<p:sldLayout preserve="1">`——**沒有 type 屬性**，而該屬性省略時等於
       `type="cust"`（自訂）。PowerPoint 在「使用目的地佈景主題」貼上時是**按 type 去配對**目的端的
       版面配置；配不到就把來源的版面配置連同母版整個匯進目的端——實測結果就是目的端多出一個
       名為 DEFAULT 的母版，投影片仍掛在我們自己的版面配置上，於是頁尾一步也不會動。
       改標 `type="blank"`（＝PowerPoint 的「空白」版面，每個佈景主題都有）即可配對成功。
       ⚠ 母版模式的那個版面配置維持自訂：它承載 Logo／頁尾條等真實內容，被配走就整組不見了。
       代價是該模式下頁尾也跟著配不走；要兩者兼得請改用「畫進每一頁」。 */
    if(!isMst&&name!==MST_LAYOUT){
      s=s.replace(/<p:sldLayout\b(?![^>]*\stype=)/,'<p:sldLayout type="blank"');
      s=s.replace(/(<p:cSld[^>]*\bname=")[^"]*(")/,'$1Blank$2');
    }
    /* (b) 頁尾佔位符：**座標只寫在母版，版面配置一律空殼**。
       這是照 PowerPoint 自製範本實測出來的形狀——拆開範本看，11 個版面配置的 dt／ftr／sldNum
       全都沒有 <a:xfrm> 也沒有 <a:lstStyle>，只有母版那一份帶座標。原本三層都寫滿座標是自己
       想當然耳，副作用是「版面配置壓過母版」：使用者在 PowerPoint 裡改母版的頁尾位置會沒有反應。
       先清掉既有的同型佔位符再插：同一個 spTree 內 type 重複會被 PowerPoint 判為毀損。
       （<p:sp> 不會巢狀，故用「中間不得再出現 <p:sp>」把匹配起點鎖在最近的那一個開標籤。） */
    if(APP.deck.pageNum||APP.deck.date){
      s=s.replace(/<p:sp>(?:(?!<p:sp>)[\s\S])*?<p:ph type="(?:sldNum|dt)"[\s\S]*?<\/p:sp>/g,'');
      s=injectHf(s,{inherit:!isMst,lang:LANG});
      /* <p:hf> 是母版層的「這些頁尾佔位符要不要出現」開關，PptxGenJS 寫死成全部 0。
         屬性省略時預設為 true，故這裡只留 hdr／ftr 兩個明確關掉（本工具不做這兩種），
         其餘交給預設——與 PowerPoint 自製範本寫的形狀一致。 */
      if(isMst) s=s.replace(/<p:hf\b[^>]*\/>/,'<p:hf hdr="0" ftr="0"/>');
    }
    zip.file(name,s);
  }
  const b64=await zip.generateAsync({type:'base64'});
  window.__lastPptxB64=b64;
  if(download){
    const a=document.createElement('a');
    a.href='data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,'+b64;
    a.download=APP.deck.title+'.pptx';
    a.click();
    // 待插入影片：匯出後彙總對話框（三路提示的主要管道；另兩路是替代文字與該頁備忘稿）
    if(pendList.length){
      $('#pendArea').value=pendList.join('\n');
      $('#pendModal').hidden=false;
    }
    // 原生圖表降級：勾選當下能過、之後改了 option 才會發生。必須明講，
    // 否則使用者拿到的是一張圖片卻以為是可編輯圖表。
    if(nvDowngrade.length){
      const pgOf=id=>APP.deck.pages.findIndex(p=>p.elements.some(e=>e.id===id))+1;
      alert(_t('以下圖表勾了「匯出為原生圖表」，但 option 目前映射不過，已改以 PNG 匯出：\n\n{0}',
        nvDowngrade.map(d=>_t('• 第 {0} 頁 {1}：{2}',pgOf(d.id),d.id,d.reason)).join('\n')));
    }
  }
  window.__lastPending=pendList;
  return b64.length;
}
$('#btnExport').onclick=()=>exportPptx(true);

