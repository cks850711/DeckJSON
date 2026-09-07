#!/usr/bin/env node
/* 說明配圖 ⇄ 說明簡報
 *
 *   node tools/figdeck.js export   src/index.html docs/help-figures.deck
 *   node tools/figdeck.js import   docs/help-figures.deck src/index.html [--lang=zh|en]
 *
 * 為什麼要有這個：說明配圖的座標由人在畫布上調最準，不該由 AI 盲寫。
 * 簡報一頁一張圖，左半中文、右半英文，兩區用同一份幾何——校對時中英並排看得到。
 * export 是一次性的 bootstrap（把手寫的 HELP_FIGS 倒進簡報）；此後簡報是源頭，
 * 用 import 把它變回 HELP_FIGS。
 *
 * 版面約定（舞台 1280×720）：
 *   標題      y  28..68     圖名，就是 HELP_FIGS 的鍵
 *   欄標      y  70..94     「中文」/「English」
 *   圖區      y  96..396    左 x 40..620、右 x 660..1240，各 580×300
 *   圖說      y 406..446    同上分左右
 * 圖區固定 580×300：全部圖同一個尺度，標註字級才會一致（11pt ≒ 輸出後的 11px）。
 */
const fs=require('fs'), vm=require('vm');
const ZH={x:40,y:96,w:580,h:300}, EN={x:660,y:96,w:580,h:300};
const PROSE={y:452,h:248};                       // 說明文字區（左右各 580 寬）
const uid=p=>p+'-'+Math.random().toString(36).slice(2,8);

/* ── 說明文字：HTML → 簡報段落 ────────────────────────────
   單向。說明本文的正本永遠是 src/index.html——它有 <code>、巢狀清單與
   摺疊區，簡報的文字框裝不下這些結構，能往返的話遲早掉格式。
   這裡只是把它「印」進簡報，讓這份檔案本身就是一份看得懂的說明文件。 */
function htmlToRuns(html,base){
  const runs=[]; let bold=false, code=false, i=0;
  /* color 一定要寫。沒寫的話畫布不是給黑色，而是繼承 app 的介面前景色
     （近白），在白底投影片上等於隱形——實際踩過。 */
  const push=t=>{ if(!t) return;
    const r={text:t,sizePt:base,color:'1A1A1A'};
    if(bold) r.bold=true;
    if(code){ r.fontFace='Menlo'; r.color='2E6DA4'; }
    runs.push(r); };
  while(i<html.length){
    const lt=html.indexOf('<',i);
    if(lt<0){ push(decode(html.slice(i))); break; }
    push(decode(html.slice(i,lt)));
    const gt=html.indexOf('>',lt);
    if(gt<0) break;
    const tag=html.slice(lt+1,gt).toLowerCase().replace(/\s.*$/,'');
    if(tag==='b'||tag==='strong') bold=true;
    else if(tag==='/b'||tag==='/strong') bold=false;
    else if(tag==='code') code=true;
    else if(tag==='/code') code=false;
    else if(tag==='br') push(' ');
    i=gt+1;
  }
  return runs.length?runs:[{text:'',sizePt:base}];
}
function decode(t){
  return t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
          .replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
}
/* 圖與文字的對應：<div data-fig="X"> 後面緊接的那個 <ul> 就是它在講的東西。 */
function proseFor(html,figName){
  const ph='data-fig="'+figName+'"';
  const a=html.indexOf(ph); if(a<0) return [];
  const us=html.indexOf('<ul',a); if(us<0) return [];
  const ue=html.indexOf('</ul>',us);
  const seg=html.slice(us,ue);
  const out=[];
  const re=/<li>([\s\S]*?)<\/li>/g; let m;
  while((m=re.exec(seg))) out.push(m[1]);
  return out;
}
function proseEl(x,items,muted){
  return {id:uid('pr'),type:'text',x,y:PROSE.y,w:580,h:PROSE.h,valign:'top',
    fill:null,lineColor:null,
    paras:items.map(h=>({align:'left',bullet:{type:'char',level:0,code:'2022'},
      spaceAfter:4,
      runs:htmlToRuns(h,10).map(r=>muted?Object.assign({},r,{color:'AAAAAA'}):r)}))};
}

function readFigs(htmlPath){
  const s=fs.readFileSync(htmlPath,'utf8');
  let a=s.indexOf('const _hc=(t,o)=>');                 // bootstrap 期的手寫版帶輔助函式
  if(a<0) a=s.indexOf('const HELP_FIGS=');               // 產生版是純資料
  const b=s.indexOf('\n};', s.indexOf('const HELP_FIGS='))+3;
  if(a<0||b<3) throw new Error('在 '+htmlPath+' 找不到 HELP_FIGS 區塊');
  const ctx={};
  vm.createContext(ctx);
  new vm.Script(s.slice(a,b)+'\n;__out=HELP_FIGS;').runInContext(ctx);
  return ctx.__out;
}

function toDeck(figs,helpHtml){
  const conv=(fig,R)=>{
    const v=fig.view||[0,0,1280,720];
    const k=Math.min(R.w/v[2], R.h/v[3]);
    const X=n=>Math.round(R.x+(n-v[0])*k), Y=n=>Math.round(R.y+(n-v[1])*k);
    const S=n=>Math.max(1,Math.round(n*k));
    const out=[{id:uid('bg'),type:'shape',shape:'rect',x:R.x,y:R.y,w:R.w,h:R.h,
                fill:'FFFFFF',lineColor:'C9CDD4',linePt:1}];
    for(const el of (fig.els||[])){
      const e=JSON.parse(JSON.stringify(el));
      e.id=uid('e'); e.x=X(el.x); e.y=Y(el.y);
      if(e.colW) e.colW=el.colW.map(S);
      if(e.rowH) e.rowH=el.rowH.map(S);
      if(el.w) e.w=S(el.w);
      if(el.h) e.h=S(el.h);
      if(e.cells) e.cells.forEach(r=>r.forEach(c=>{c.sizePt=Math.max(6,Math.round((c.sizePt||12)*k));}));
      out.push(e);
    }
    for(const n of (fig.notes||[])){
      if(n.box) out.push({id:uid('bx'),type:'shape',shape:'rect',x:X(n.box[0]),y:Y(n.box[1]),
        w:S(n.box[2]),h:S(n.box[3]),fill:null,lineColor:'4D9DE0',linePt:1,dash:'sysDash'});
      if(n.dot) out.push({id:uid('dt'),type:'shape',shape:'rect',x:X(n.dot[0])-3,y:Y(n.dot[1])-3,
        w:6,h:6,fill:'4D9DE0',lineColor:null});
      if(n.arrow) out.push({id:uid('ar'),type:'shape',shape:'arrow',
        x:Math.min(X(n.arrow[0]),X(n.arrow[2])), y:Math.min(Y(n.arrow[1]),Y(n.arrow[3])),
        w:Math.max(2,Math.abs(X(n.arrow[2])-X(n.arrow[0]))),
        h:Math.max(2,Math.abs(Y(n.arrow[3])-Y(n.arrow[1]))),
        flipH:X(n.arrow[2])<X(n.arrow[0]), flipV:Y(n.arrow[3])<Y(n.arrow[1]),
        fill:null,lineColor:'E0A93E',linePt:1.5});
      if(n.cursor) out.push({id:uid('cu'),type:'shape',shape:'rightArrow',
        x:X(n.cursor[0]),y:Y(n.cursor[1]),w:14,h:10,rot:35,
        fill:'FFFFFF',lineColor:'111111',linePt:1});
      if(n.label) out.push({id:uid('lb'),type:'text',
        x:(n.anchor==='end'? X(n.label[0])-150 : X(n.label[0])),
        y:Y(n.label[1])-18,w:150,h:18,valign:'bottom',fill:null,lineColor:null,
        paras:[{align:(n.anchor==='end'?'right':'left'),
          runs:[{text:n.label[2],sizePt:11,bold:true,color:'8A6A12'}]}]});
    }
    return out;
  };
  const txt=(x,y,w,h,t,o)=>({id:uid('x'),type:'text',x,y,w,h,valign:(o&&o.valign)||'middle',
    fill:null,lineColor:null,paras:[{align:'left',
      runs:[{text:t,sizePt:(o&&o.sz)||11,bold:!!(o&&o.b),color:(o&&o.c)||'666666'}]}]});
  const pages=Object.keys(figs).map((name,i)=>({
    id:'p'+(i+1), name,
    elements:[
      txt(40,28,1200,40,name,{sz:20,b:true,c:'1F3A5F'}),
      txt(40,70,580,24,'中文',{sz:12,b:true,c:'8E9AAF'}),
      txt(660,70,580,24,'English',{sz:12,b:true,c:'8E9AAF'}),
      ...conv(figs[name],ZH), ...conv(figs[name],EN),
      txt(40,406,580,40,(figs[name].cap||'').replace(/<[^>]+>/g,''),{valign:'top'}),
      txt(660,406,580,40,'(caption — to translate)',{valign:'top',c:'AAAAAA'}),
      ...(()=>{ const items=proseFor(helpHtml,name);
        if(!items.length) return [];
        /* 英文那半先放同一份中文、字色壓灰——翻譯時直接覆蓋，
           結構與長度都對得上，也一眼看得出還沒翻。 */
        return [proseEl(40,items,false), proseEl(660,items,true)]; })(),
    ]}));
  return {format:'deckjson',version:1,title:'DeckJSON 說明配圖',stage:{w:1280,h:720},pages};
}

/* ── import：簡報 → HELP_FIGS ──────────────────────────────
   圖區內的元素原樣取出，view 就是圖區矩形本身（座標系不變，不必換算）。
   底圖白矩形排除掉——說明面板那邊的 .helpFig 已經有白底與外框。 */
function fromDeck(deck,lang){
  const R = lang==='en' ? EN : ZH;
  const inR = e => {
    const w=e.w!=null?e.w:(e.colW||[]).reduce((a,b)=>a+b,0);
    const h=e.h!=null?e.h:(e.rowH||[]).reduce((a,b)=>a+b,0);
    return e.x>=R.x-2 && e.y>=R.y-2 && e.x+(w||0)<=R.x+R.w+2 && e.y+(h||0)<=R.h+R.y+2;
  };
  const isBg = e => e.type==='shape' && e.shape==='rect' &&
    Math.abs(e.x-R.x)<2 && Math.abs(e.y-R.y)<2 && Math.abs(e.w-R.w)<2 && Math.abs(e.h-R.h)<2;
  const capOf = pg => {
    const c=pg.elements.find(e=>e.type==='text' && Math.abs(e.y-406)<4 && Math.abs(e.x-R.x)<4);
    if(!c) return '';
    return (c.paras||[]).map(pa=>(pa.runs||[]).map(r=>r.text).join('')).join(' ').trim();
  };
  const figs={};
  for(const pg of deck.pages){
    const els=pg.elements.filter(e=>inR(e)&&!isBg(e));
    figs[pg.name]={view:[R.x,R.y,R.w,R.h], els, cap:capOf(pg)};
  }
  return figs;
}
function writeFigs(htmlPath,figs){
  const s=fs.readFileSync(htmlPath,'utf8');
  const a=s.indexOf('const HELP_FIGS=');
  const b=s.indexOf('\n};',a)+3;
  if(a<0) throw new Error('找不到 HELP_FIGS');
  const body=Object.keys(figs).map(k=>{
    const f=figs[k];
    return '  '+JSON.stringify(k)+':{view:'+JSON.stringify(f.view)+','
      +(f.cap?'cap:'+JSON.stringify(f.cap)+',':'')
      +'els:'+JSON.stringify(f.els)+'}';
  }).join(',\n');
  const out='const HELP_FIGS={   /* 由 tools/figdeck.js 從 docs/help-figures.deck 產生，勿手改 */\n'
    +body+'\n};';
  fs.writeFileSync(htmlPath, s.slice(0,a)+out+s.slice(b));
  return out.length;
}

/* ── prose：只更新簡報下半的說明文字，圖完全不動 ──────────
   圖歸簡報（人調），文字歸 HTML（正本）。這支就是把後者印進前者。
   舊的文字元素靠 id 前綴 pr- 辨識後整批換掉，不會累積。 */
function refreshProse(deckPath,htmlPath){
  const deck=JSON.parse(fs.readFileSync(deckPath,'utf8'));
  const html=fs.readFileSync(htmlPath,'utf8');
  let n=0, empty=[];
  for(const pg of deck.pages){
    pg.elements=pg.elements.filter(e=>!/^pr-/.test(e.id));
    const items=proseFor(html,pg.name);
    if(!items.length){ empty.push(pg.name); continue; }
    pg.elements.push(proseEl(40,items,false), proseEl(660,items,true));
    n+=items.length;
  }
  fs.writeFileSync(deckPath, JSON.stringify(deck,null,1));
  return {n,empty};
}

const [,,cmd,inp,outp,...rest]=process.argv;
const lang=(rest.find(a=>a.startsWith('--lang='))||'--lang=zh').split('=')[1];
if(cmd==='prose'){
  const r=refreshProse(inp,outp);
  console.log('寫入 '+r.n+' 條說明文字 → '+inp);
  if(r.empty.length) console.log('  （找不到對應文字的圖：'+r.empty.join('、')+'）');
}else if(cmd==='import'){
  const deck=JSON.parse(fs.readFileSync(inp,'utf8'));
  const figs=fromDeck(deck,lang);
  const n=writeFigs(outp,figs);
  console.log('匯入 '+Object.keys(figs).length+' 張圖（'+lang+'）→ '+outp+'（HELP_FIGS '+n+' 位元組）');
  for(const k in figs) console.log('  '+k.padEnd(16)+String(figs[k].els.length).padStart(3)+' 個元素');
}else if(cmd==='export'){
  const figs=readFigs(inp);
  const deck=toDeck(figs, fs.readFileSync(inp,'utf8'));
  fs.writeFileSync(outp, JSON.stringify(deck,null,1));
  console.log('匯出 %d 頁 → %s（%d 位元組）',deck.pages.length,outp,fs.statSync(outp).size);
  for(const p of deck.pages) console.log('  '+p.name.padEnd(16)+String(p.elements.length).padStart(3)+' 個元素');
}else{
  console.log('用法：\n'
    +'  node tools/figdeck.js prose  <deck> <index.html>      只更新簡報內的說明文字\n'
    +'  node tools/figdeck.js import <deck> <index.html> [--lang=zh|en]   簡報 → HELP_FIGS\n'
    +'  node tools/figdeck.js export <index.html> <deck>      一次性 bootstrap（會蓋掉人工調過的圖）');
  process.exit(1);
}
