'use strict';
/* ================= 方程式：KaTeX 的 MathML → OMML =================
   PowerPoint 的方程式是 OMML（m: 命名空間，與 Word 同一套）。輸入只吃 KaTeX 產生的 MathML：
   結構固定、標記齊全（\left 輸出 fence="true"、\hat 輸出 accent="true"），所以只需處理 KaTeX 會產生的元素，
   不是通用的 MathML 轉換器。

   為什麼自己寫：Word 內附的 mathml2omml.xsl 不能散布；npm 上的 mathml2omml 是 LGPL，與本專案的 MIT
   不合。兩者也都有同一個缺口：括號轉成一般字元、不會伸縮（沒有產生 m:d）。

   三條容易做錯的規則：
   - ∑、∫ 後面的式子要收進 m:nary 的 m:e，否則 PowerPoint 留一段空隙、LibreOffice 畫空白方框。
     收到下一個關係符號或加減號為止（∑a+∑b 兩個各自收）
   - \left( … \right) 是第一個與最後一個子元素都是 fence 的 mrow，轉成 m:d；\middle| 轉成分隔字元
   - 斜正交給 m:sty／m:nor，run 的 a:rPr 不寫 i（寫了會蓋掉 \text 的正體）

   不認得的元素整段退回線性文字（照字面），整條方程式不失敗；退回時記在 warnings。 */
const OMML_NARY=new Set([...'∑∏∐∫∬∭∮∯∰⋃⋂⋁⋀⨁⨂⨀⨄⨆']);
// nary 本體收到這些符號前為止：關係符號、加減、逗號分號
const OMML_STOP=new Set([...'=≠<>≤≥≈≡∼≃≅∝→←↔⇒⇐⇔∈∉∋⊂⊃⊆⊇+−-±∓,;']);
// KaTeX 的重音字元 → OMML m:acc 用的組合字元（Word 的方程式編輯器也存組合字元）
const OMML_ACC={'^':'̂','~':'̃','ˉ':'̄','¯':'̄','˙':'̇','¨':'̈','´':'́',
  '`':'̀','˘':'̆','ˇ':'̌','→':'⃗','⃗':'⃗','←':'⃖','˚':'̊'};
const OMML_BAR=new Set(['‾','¯','ˉ','_','―']);
const OMML_BRACE=new Set(['⏞','⏟','⏜','⏝','⎴','⎵']);
const OMML_VARIANT={   // mathvariant → [m:sty, m:scr]
  'normal':['p'],'bold':['b'],'italic':['i'],'bold-italic':['bi'],
  'double-struck':['p','double-struck'],'script':['p','script'],'bold-script':['b','script'],
  'fraktur':['p','fraktur'],'bold-fraktur':['b','fraktur'],'sans-serif':['p','sans-serif'],
  'bold-sans-serif':['b','sans-serif'],'sans-serif-italic':['i','sans-serif'],'monospace':['p','monospace']};
const ommlEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/* mml：KaTeX renderToString(…,{output:'mathml'}) 的結果（外層 <span class="katex"> 可留著）。
   rPr：每個 m:r 裡要放的 <a:rPr …/>（字級、顏色、字型），由呼叫端依段落樣式組好。
   回傳 {omml:'<m:oMath>…</m:oMath>', warnings:[…]}；MathML 解析不了時 omml 為 null */
function mathmlToOmml(mml,rPr){
  const warnings=[];
  const src=String(mml).replace(/^[\s\S]*?(<math[\s>])/,'$1').replace(/(<\/math>)[\s\S]*$/,'$1');
  const doc=new DOMParser().parseFromString(src,'application/xml');
  if(doc.getElementsByTagName('parsererror').length||!doc.documentElement||doc.documentElement.localName!=='math')
    return {omml:null,warnings:['MathML could not be parsed']};
  const rp=rPr||'';
  const kids=n=>[...n.childNodes].filter(c=>c.nodeType===1&&c.localName!=='annotation'&&c.localName!=='annotation-xml');
  const txt=n=>(n.textContent||'').replace(/[⁡-⁤]/g,'');   // 函數套用、隱形乘號：PowerPoint 會畫成方框
  const isMo=(n,ch)=>!!n&&n.localName==='mo'&&(ch==null||(ch==='\u2061'? n.textContent : txt(n)).trim()===ch);
  const isFence=n=>isMo(n)&&n.getAttribute('fence')==='true';
  const run=(t,sty,scr,nor)=>{
    if(!t) return '';
    const mr= nor? '<m:rPr><m:nor/></m:rPr>'
      : (sty||scr)? `<m:rPr>${scr?`<m:scr m:val="${scr}"/>`:''}${sty?`<m:sty m:val="${sty}"/>`:''}</m:rPr>` : '';
    const sp=/^\s|\s$/.test(t)? ' xml:space="preserve"' : '';
    return `<m:r>${mr}${rp}<m:t${sp}>${ommlEsc(t)}</m:t></m:r>`;
  };
  const ctrl=rp? `<m:ctrlPr>${rp}</m:ctrlPr>` : '';
  const e=x=>`<m:e>${x}</m:e>`;
  const linear=(n,why)=>{ warnings.push(why); return run(txt(n),'p'); };
  // 有沒有 nary：本身是大型運算子，或上下標的底是大型運算子
  const naryOf=n=>{
    if(!n) return null;
    if(n.localName==='mo'&&OMML_NARY.has(txt(n).trim())) return {chr:txt(n).trim(),loc:'undOvr'};
    const k=kids(n), sub={msub:'subSup',msup:'subSup',msubsup:'subSup',munder:'undOvr',mover:'undOvr',munderover:'undOvr'}[n.localName];
    if(sub&&k[0]&&k[0].localName==='mo'&&OMML_NARY.has(txt(k[0]).trim())){
      const lo= /sub|under/.test(n.localName)? k[1] : null;
      const hi= n.localName==='msup'||n.localName==='mover'? k[1] : (n.localName==='msubsup'||n.localName==='munderover')? k[2] : null;
      return {chr:txt(k[0]).trim(),loc:sub,lo,hi};
    }
    return null;
  };
  const naryXml=(nr,body)=>
    `<m:nary><m:naryPr><m:chr m:val="${ommlEsc(nr.chr)}"/><m:limLoc m:val="${nr.loc}"/>`
    +(nr.lo?'':'<m:subHide m:val="on"/>')+(nr.hi?'':'<m:supHide m:val="on"/>')+`${ctrl}</m:naryPr>`
    +`<m:sub>${nr.lo?conv(nr.lo):''}</m:sub><m:sup>${nr.hi?conv(nr.hi):''}</m:sup>${e(body)}</m:nary>`;
  const delim=(open,close,parts)=>
    `<m:d><m:dPr><m:begChr m:val="${ommlEsc(open)}"/>${parts.seps.map(s=>`<m:sepChr m:val="${ommlEsc(s)}"/>`).join('')}`
    +`<m:endChr m:val="${ommlEsc(close)}"/>${ctrl}</m:dPr>${parts.items.map(x=>e(x)).join('')}</m:d>`;
  // 一串兄弟元素：處理 fence 群組與 nary 收本體，其餘逐一轉
  function seq(list){
    const ns=list.filter(n=>n.localName!=='annotation');
    if(ns.length>=2&&isFence(ns[0])){
      const last=ns[ns.length-1], closed=isFence(last);
      const inner=ns.slice(1,closed? -1 : undefined), parts={seps:[],items:[]};
      let cur=[];
      for(const n of inner){ if(isFence(n)){ parts.items.push(seq(cur)); parts.seps.push(txt(n).trim()); cur=[]; } else cur.push(n); }
      parts.items.push(seq(cur));
      // m:d 的多個分隔字元：sepChr 只能寫一個，Word 一律用同一個；不同的 \middle 只取第一個
      parts.seps=parts.seps.slice(0,1);
      return delim(txt(ns[0]).trim(),closed? txt(last).trim() : '',parts);
    }
    let out='';
    for(let i=0;i<ns.length;i++){
      /* \sin x：KaTeX 在函數名後放隱形的 U+2061（函數套用），txt() 會濾掉它，名字就跟引數黏成「sinx」。
         改寫成 m:func，PowerPoint 會在名字與引數之間留空。引數是「(」開頭時不必（tan(βl) 本來就分得開） */
      if(isMo(ns[i+1],'\u2061')&&ns[i+2]&&!isMo(ns[i+2],'(')){
        out+=`<m:func><m:funcPr>${ctrl}</m:funcPr><m:fName>${conv(ns[i])}</m:fName>${e(conv(ns[i+2]))}</m:func>`;
        i+=2; continue;
      }
      const nr=naryOf(ns[i]);
      if(nr){
        let k=i+1; while(k<ns.length&&!(ns[k].localName==='mo'&&OMML_STOP.has(txt(ns[k]).trim()))) k++;
        out+=naryXml(nr,seq(ns.slice(i+1,k))); i=k-1; continue;
      }
      out+=conv(ns[i]);
    }
    return out;
  }
  function conv(n){
    const k=kids(n), t=n.localName;
    switch(t){
      case 'math': case 'semantics': case 'mrow': case 'mstyle': case 'mpadded': case 'mtd':
        return seq(k);
      case 'mi': {
        const s=txt(n), v=n.getAttribute('mathvariant');
        if(v&&OMML_VARIANT[v]) return run(s,...OMML_VARIANT[v]);
        return run(s,[...s].length>1? 'p' : null);   // 多字母（sin、lim）照 MathML 規則是正體
      }
      case 'mn': return run(txt(n));
      case 'mo': {
        const v=n.getAttribute('mathvariant');
        return run(txt(n), v&&OMML_VARIANT[v]? OMML_VARIANT[v][0] : 'p');
      }
      case 'mtext': return run(txt(n),null,null,true);
      case 'ms': return run('"'+txt(n)+'"',null,null,true);
      case 'mspace': {
        const w=parseFloat(n.getAttribute('width')||'0');   // KaTeX 一律以 em 為單位
        if(!(w>0)) return '';
        const em=Math.floor(w), rest=w-em;
        return run(' '.repeat(em)+(rest>=0.25?' ':rest>=0.15?' ':rest>0.05?' ':''),null,null,true);
      }
      case 'mphantom': return '';
      case 'mfrac': {
        const noBar=/^0(\.0*)?(px|em|pt)?$/.test(n.getAttribute('linethickness')||'');
        return `<m:f><m:fPr>${noBar?'<m:type m:val="noBar"/>':''}${ctrl}</m:fPr><m:num>${conv(k[0])}</m:num><m:den>${conv(k[1])}</m:den></m:f>`;
      }
      case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="on"/>${ctrl}</m:radPr><m:deg/>${e(seq(k))}</m:rad>`;
      case 'mroot': return `<m:rad><m:radPr>${ctrl}</m:radPr><m:deg>${conv(k[1])}</m:deg>${e(conv(k[0]))}</m:rad>`;
      case 'msup': return `<m:sSup><m:sSupPr>${ctrl}</m:sSupPr>${e(conv(k[0]))}<m:sup>${conv(k[1])}</m:sup></m:sSup>`;
      case 'msub': return `<m:sSub><m:sSubPr>${ctrl}</m:sSubPr>${e(conv(k[0]))}<m:sub>${conv(k[1])}</m:sub></m:sSub>`;
      case 'msubsup': return `<m:sSubSup><m:sSubSupPr>${ctrl}</m:sSubSupPr>${e(conv(k[0]))}<m:sub>${conv(k[1])}</m:sub><m:sup>${conv(k[2])}</m:sup></m:sSubSup>`;
      case 'mover': case 'munder': {
        const top=t==='mover', mark=k[1], ch=mark&&mark.localName==='mo'? txt(mark).trim() : null;
        if(ch!=null&&OMML_BAR.has(ch)&&(n.getAttribute(top?'accent':'accentunder')==='true'||mark.getAttribute('stretchy')==='true'))
          return `<m:bar><m:barPr><m:pos m:val="${top?'top':'bot'}"/>${ctrl}</m:barPr>${e(conv(k[0]))}</m:bar>`;
        if(ch!=null&&OMML_BRACE.has(ch))
          return `<m:groupChr><m:groupChrPr><m:chr m:val="${ommlEsc(ch)}"/><m:pos m:val="${top?'top':'bot'}"/>`
            +`<m:vertJc m:val="${top?'bot':'top'}"/>${ctrl}</m:groupChrPr>${e(conv(k[0]))}</m:groupChr>`;
        if(top&&ch!=null&&n.getAttribute('accent')==='true'&&[...ch].length===1)
          return `<m:acc><m:accPr><m:chr m:val="${ommlEsc(OMML_ACC[ch]||ch)}"/>${ctrl}</m:accPr>${e(conv(k[0]))}</m:acc>`;
        const tag=top? 'limUpp' : 'limLow';
        return `<m:${tag}><m:${tag}Pr>${ctrl}</m:${tag}Pr>${e(conv(k[0]))}<m:lim>${conv(k[1])}</m:lim></m:${tag}>`;
      }
      case 'munderover': {
        const low=`<m:limLow><m:limLowPr>${ctrl}</m:limLowPr>${e(conv(k[0]))}<m:lim>${conv(k[1])}</m:lim></m:limLow>`;
        return `<m:limUpp><m:limUppPr>${ctrl}</m:limUppPr>${e(low)}<m:lim>${conv(k[2])}</m:lim></m:limUpp>`;
      }
      case 'mtable': {
        const rows=k.filter(r=>r.localName==='mtr'||r.localName==='mlabeledtr');
        const cols=Math.max(1,...rows.map(r=>kids(r).length));
        const al=(n.getAttribute('columnalign')||'').split(/\s+/).filter(Boolean);
        const jc=i=>({left:'left',right:'right'}[al[Math.min(i,al.length-1)]]||'center');
        let mcs='';
        for(let i=0;i<cols;i++) mcs+=`<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${jc(i)}"/></m:mcPr></m:mc>`;
        const body=rows.map(r=>{ const cs=kids(r); let x='';
          for(let i=0;i<cols;i++) x+=e(cs[i]? conv(cs[i]) : '');
          return `<m:mr>${x}</m:mr>`; }).join('');
        return `<m:m><m:mPr><m:baseJc m:val="center"/><m:plcHide m:val="on"/><m:mcs>${mcs}</m:mcs>${ctrl}</m:mPr>${body}</m:m>`;
      }
      case 'menclose': {
        if((n.getAttribute('notation')||'').split(/\s+/).includes('box'))
          return `<m:borderBox><m:borderBoxPr>${ctrl}</m:borderBoxPr>${e(seq(k))}</m:borderBox>`;
        warnings.push(`menclose notation="${n.getAttribute('notation')}" is drawn without its marks`);
        return seq(k);
      }
      case 'merror': return linear(n,'the LaTeX has an error; exported as plain text');
      default: return linear(n,`<${t}> is not supported; exported as plain text`);
    }
  }
  const root=doc.documentElement;
  const omml=`<m:oMath>${seq(kids(root))}</m:oMath>`;
  return {omml,warnings:[...new Set(warnings)]};
}
/* DJ.lint 用：每個方程式段落試轉一次，LaTeX 寫錯（匯出時會保留原文）或有元素退回純文字的，各回一行。
   位置格式同 breakCheck：「頁/元素: paragraph N: …」 */
function mathLint(els,path){
  const out=[];
  if(typeof katex==='undefined') return out;
  for(const e of Array.isArray(els)?els:[]){
    if(!e||e.hidden||!Array.isArray(e.paras)) continue;
    e.paras.forEach((p,i)=>{
      if(!p||!p.math) return;
      const where=`${path}/${e.id}: paragraph ${i+1}`;
      let mml;
      try{ mml=katex.renderToString(mathTex(p),{output:'mathml',displayMode:true,throwOnError:true}); }
      catch(err){ out.push(`${where}: the LaTeX cannot be parsed (${String(err.message||err).replace(/^KaTeX parse error: /,'')}); it is exported as plain text`); return; }
      for(const w of mathmlToOmml(mml,'').warnings) out.push(`${where}: ${w}`);
    });
  }
  return out;
}
