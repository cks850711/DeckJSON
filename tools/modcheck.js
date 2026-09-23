#!/usr/bin/env node
/* 主程式分檔的靜態檢查
 *
 *   node tools/modcheck.js            檢查；有問題時離開碼 1
 *   node tools/modcheck.js --deps     另外列出各檔之間的依賴數
 *
 * 主程式以多個傳統 <script> 依序載入、共用同一個全域範圍（不是 ES module）。
 * 這種寫法只有一件事會在拆檔後出錯，而且只在開機當下發生，所以要靜態擋住：
 *   載入時執行的程式碼（不在函式本體內）引用了「後面的檔才宣告」的名稱。
 *   函式宣告的提升不跨 script，這種引用拆開後就是 ReferenceError。
 * 寫在函式本體內的引用不受影響：要等函式被呼叫時才解析，那時所有檔都已載入。
 *
 * 檔案清單的來源：
 *   src/index.html 裡有 <script src="app/…"> 時，照那份清單依序讀檔（＝瀏覽器的載入順序）。
 *   還沒拆檔時，改用 tools/modcheck.json 的切點把 index.html 的主程式切成同樣的單元。
 *
 * 分析只看名稱：區域變數與頂層名同名時會被當成引用（多報）；
 * window[名稱] 這類動態存取看不到（漏報），漏報由「開發版開機無錯誤」兜住。
 */
const fs=require('fs'), path=require('path');
const acorn=require(path.join(__dirname,'vendor','acorn.js'));
const SRC=path.join(__dirname,'..','src');
const CONF=JSON.parse(fs.readFileSync(path.join(__dirname,'modcheck.json'),'utf8'));

/* ---------- 取得單元：[{name, code, line0}]，line0＝該單元第 1 行在原檔的行號 ---------- */
function units(){
  const html=fs.readFileSync(path.join(SRC,'index.html'),'utf8');
  const srcs=[...html.matchAll(/<script src="(app\/[^"]+)"><\/script>/g)].map(m=>m[1]);
  if(srcs.length) return srcs.map(s=>({name:s.replace(/^app\/|\.js$/g,''),
    file:'src/'+s, code:fs.readFileSync(path.join(SRC,s),'utf8'), line0:1}));
  /* 未拆檔：取最後一個 <script>（主程式），依切點切開 */
  const lines=html.split('\n');
  const open=lines.lastIndexOf('<script>')+1, close=lines.lastIndexOf('</script>')+1;   // 1 起算
  if(open<1||close<=open) throw new Error('找不到主程式 <script>');
  const cuts=CONF.cuts;
  if(cuts[0][0]!==open+1) throw new Error(`第一個切點應為 ${open+1}（主程式第一行），設定是 ${cuts[0][0]}`);
  return cuts.map(([s,name],i)=>{ const e=i+1<cuts.length? cuts[i+1][0] : close;
    return {name, file:'src/index.html', code:lines.slice(s-1,e-1).join('\n'), line0:s}; });
}

/* ---------- AST 工具 ---------- */
function topNames(st){
  if(st.type==='FunctionDeclaration'||st.type==='ClassDeclaration') return [st.id.name];
  if(st.type!=='VariableDeclaration') return [];
  const out=[];
  const pat=p=>{ if(!p) return;
    if(p.type==='Identifier') out.push(p.name);
    else if(p.type==='ObjectPattern') p.properties.forEach(q=>pat(q.value||q.argument));
    else if(p.type==='ArrayPattern') p.elements.forEach(pat);
    else if(p.type==='AssignmentPattern') pat(p.left);
    else if(p.type==='RestElement') pat(p.argument); };
  st.declarations.forEach(d=>pat(d.id));
  return out;
}
/* 走訪識別符引用。eager＝載入當下會執行（不在函式本體或參數內）。
   宣告自己的名字、成員存取的屬性名、物件字面值的鍵都不是引用。 */
function refs(node,eager,cb){
  if(!node||typeof node.type!=='string') return;
  if(node.type==='Identifier'){ cb(node,eager); return; }
  const isFn=/Function/.test(node.type);
  for(const k in node){
    if(k==='loc'||k==='start'||k==='end') continue;
    if(isFn&&k==='id') continue;
    if((node.type==='VariableDeclarator'||node.type==='ClassDeclaration')&&k==='id') continue;
    if((node.type==='MemberExpression'||node.type==='PropertyDefinition'||node.type==='MethodDefinition')
       &&(k==='property'||k==='key')&&!node.computed) continue;
    if(node.type==='Property'&&k==='key'&&!node.computed) continue;
    const e2= eager && !(isFn&&(k==='body'||k==='params'));
    const v=node[k];
    if(Array.isArray(v)) v.forEach(x=>refs(x,e2,cb)); else if(v&&typeof v==='object') refs(v,e2,cb);
  }
}

/* ---------- 檢查 ---------- */
const U=units(), problems=[];
const decl=new Map();                       // 名稱 → 單元序號
U.forEach((u,i)=>{
  try{ u.ast=acorn.parse(u.code,{ecmaVersion:'latest',sourceType:'script',locations:true}); }
  catch(e){ problems.push(`${u.name}：單獨解析失敗（${e.message}）——切點落在敘述中間？`); return; }
  for(const st of u.ast.body) for(const n of topNames(st)){
    if(decl.has(n)&&decl.get(n)!==i) problems.push(`${u.name}：頂層名 ${n} 已在 ${U[decl.get(n)].name} 宣告過（跨 script 重複宣告是 SyntaxError）`);
    else decl.set(n,i);
  }
});
const at=(u,node)=>`${u.file}:${u.line0+node.loc.start.line-1}`;
const deps=new Map();
U.forEach((u,i)=>{ if(!u.ast) return;
  for(const st of u.ast.body) refs(st,true,(id,eager)=>{
    const j=decl.get(id.name); if(j===undefined||j===i) return;
    if(eager&&j>i) problems.push(`${at(u,id)}  ${u.name} 載入時就引用 ${id.name}，但它在後面的 ${U[j].name} 才宣告`);
    const k=u.name+' → '+U[j].name; deps.set(k,(deps.get(k)||0)+1);
  });
});

console.log(`${U.length} 個單元、${decl.size} 個頂層名（來源：${U[0].file==='src/index.html'?'index.html＋切點':'app/ 檔案清單'}）`);
if(process.argv.includes('--deps'))
  for(const [k,n] of [...deps].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
if(problems.length){ console.log(`\n■ 問題（${problems.length}）`); problems.forEach(p=>console.log('  '+p)); process.exit(1); }
console.log('OK');
