#!/usr/bin/env node
/* 主程式分檔的靜態檢查
 *
 *   node tools/modcheck.js            檢查；有問題時離開碼 1
 *   node tools/modcheck.js --deps     另外列出各檔之間的依賴數
 *   node tools/modcheck.js --allow    印出目前所有分層違規的白名單寫法（整理白名單用）
 *
 * 主程式以多個傳統 <script> 依序載入、共用同一個全域範圍（不是 ES module）。
 * 這種寫法只有一件事會在拆檔後出錯，而且只在開機當下發生，所以要靜態擋住：
 *   載入時執行的程式碼（不在函式本體內）引用了「後面的檔才宣告」的名稱。
 *   函式宣告的提升不跨 script，這種引用拆開後就是 ReferenceError。
 * 寫在函式本體內的引用不受影響：要等函式被呼叫時才解析，那時所有檔都已載入。
 *
 * 檔案清單照 src/index.html 的 <script src="app/…"> 依序讀（＝瀏覽器的載入順序）。
 *
 * 第二件事是分層（tools/modcheck.json 的 layers）：下層只准被上層引用，不准引用上層。
 * 這不是執行錯誤——單一全域範圍裡怎麼引用都跑得動——而是讓下層（資料模型、存取）能離開畫面
 * 單獨使用。以「模組 → 名稱」為單位計算；既有的違規列在 allow，新增的直接擋下。
 * allow 裡已經不再違規的項目也會報出來，白名單只准縮小。
 *
 * 分析只看名稱：區域變數與頂層名同名時會被當成引用（多報）；
 * window[名稱] 這類動態存取看不到（漏報），漏報由「開發版開機無錯誤」兜住。
 */
const fs=require('fs'), path=require('path');
const acorn=require(path.join(__dirname,'vendor','acorn.js'));
const SRC=path.join(__dirname,'..','src');
const CONF=JSON.parse(fs.readFileSync(path.join(__dirname,'modcheck.json'),'utf8'));

/* ---------- 取得單元：[{name, file, code}] ---------- */
function units(){
  const html=fs.readFileSync(path.join(SRC,'index.html'),'utf8');
  const srcs=[...html.matchAll(/<script src="(app\/[^"]+)"><\/script>/g)].map(m=>m[1]);
  if(!srcs.length) throw new Error('src/index.html 裡找不到 <script src="app/…">');
  return srcs.map(s=>({name:s.replace(/^app\/|\.js$/g,''), file:'src/'+s,
    code:fs.readFileSync(path.join(SRC,s),'utf8')}));
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
  catch(e){ problems.push(`${u.file}：解析失敗（${e.message}）`); return; }
  for(const st of u.ast.body) for(const n of topNames(st)){
    if(decl.has(n)&&decl.get(n)!==i) problems.push(`${u.name}：頂層名 ${n} 已在 ${U[decl.get(n)].name} 宣告過（跨 script 重複宣告是 SyntaxError）`);
    else decl.set(n,i);
  }
});
/* 模組所在的層：layers 由下往上列，每層是模組名或「資料夾/*」 */
const layerOf=name=>{
  const i=CONF.layers.findIndex(L=>L.some(p=>p===name||(p.endsWith('/*')&&name.startsWith(p.slice(0,-1)))));
  if(i<0) problems.push(`${name}：不在 modcheck.json 的任何一層`);
  return i;
};
const at=(u,node)=>`${u.file}:${node.loc.start.line}`;
const deps=new Map(), up=new Map();        // up：「模組 → 名稱」→ 第一個出現位置
U.forEach((u,i)=>{ if(!u.ast) return;
  const li=layerOf(u.name);
  for(const st of u.ast.body) refs(st,true,(id,eager)=>{
    const j=decl.get(id.name); if(j===undefined||j===i) return;
    if(eager&&j>i) problems.push(`${at(u,id)}  ${u.name} 載入時就引用 ${id.name}，但它在後面的 ${U[j].name} 才宣告`);
    const k=u.name+' → '+U[j].name; deps.set(k,(deps.get(k)||0)+1);
    const key=u.name+' → '+id.name;
    if(layerOf(U[j].name)>li&&!up.has(key)) up.set(key,`${at(u,id)}  ${u.name}（第 ${li} 層）引用 ${U[j].name}（第 ${layerOf(U[j].name)} 層）的 ${id.name}`);
  });
});
const allow=new Set(CONF.allow);
for(const [k,msg] of up) if(!allow.has(k)) problems.push(msg+'——下層不可引用上層；把它搬到下層，或確有必要時才加進 allow');
for(const k of allow) if(!up.has(k)) problems.push(`allow 的「${k}」已不再違規，從白名單刪掉`);

console.log(`${U.length} 個檔、${decl.size} 個頂層名；分層違規 ${up.size} 條（白名單 ${allow.size}）`);
if(process.argv.includes('--allow')) for(const k of [...up.keys()].sort()) console.log('    '+JSON.stringify(k)+',');
if(process.argv.includes('--deps'))
  for(const [k,n] of [...deps].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
if(problems.length){ console.log(`\n■ 問題（${problems.length}）`); problems.forEach(p=>console.log('  '+p)); process.exit(1); }
console.log('OK');
