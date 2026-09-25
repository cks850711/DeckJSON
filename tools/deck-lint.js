#!/usr/bin/env node
/* .deck 的檢查：列出不認得的欄位（寫錯名字、放錯層、自創的欄位），以及容易被換行拆開的寫法
 *
 *   node tools/deck-lint.js <檔案.deck|.json> [...]     逐檔列出；有不認得的欄位時離開碼 1
 *   node tools/deck-lint.js --json <檔案>               輸出 JSON：{檔名: [欄位警告…]}（給其他工具呼叫）
 *   node tools/deck-lint.js --json --breaks <檔案>      輸出 JSON：{檔名: {fields: [...], breaks: [...]}}
 *   … | node tools/deck-lint.js --json -                從 stdin 讀一份 deck JSON（不是 zip）
 *
 * 換行提醒（breaks）只是提醒：不影響離開碼，--json 不加 --breaks 時也不輸出——
 * 既有的呼叫端（例如 tests/README.md 所列的 check-deck.py）把 --json 的每一筆都當成欄位錯誤。
 *
 * 判定就是 app 裡的 schemaCheck()（src/app/model/schema.js）與 breakCheck()（textlint.js），
 * 這支只負責讀檔：在 node 裡載入那兩個檔再呼叫，所以與 DJ.lint() 的結果永遠一致。
 * .deck 容器（zip）用 src/vendor 的 JSZip 解開，與 app 開檔同一套。
 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const SRC=path.join(__dirname,'..','src');
const ctx={}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SRC,'app','model','schema.js'),'utf8')+'\n;this.schemaCheck=schemaCheck;',ctx);
vm.runInContext(fs.readFileSync(path.join(SRC,'app','model','textlint.js'),'utf8')+'\n;this.breakCheck=breakCheck;',ctx);
const JSZip=require(path.join(SRC,'vendor','jszip.min.js'));

async function deckText(file){
  const buf= file==='-'? fs.readFileSync(0) : fs.readFileSync(file);
  if(buf[0]!==0x50||buf[1]!==0x4b) return buf.toString('utf8');   // 不是 PK＝純 JSON
  const zip=await JSZip.loadAsync(buf), dj=zip.file('deck.json');
  if(!dj) throw new Error('zip without deck.json (not a DeckJSON container)');
  return dj.async('string');
}
(async()=>{
  const args=process.argv.slice(2), asJson=args.includes('--json'), withBreaks=args.includes('--breaks');
  const files=args.filter(a=>a!=='--json'&&a!=='--breaks');
  if(!files.length){ console.error('usage: node tools/deck-lint.js [--json [--breaks]] <file.deck>…  (use - for stdin)'); process.exit(2); }
  const out={}, hints={}; let total=0;
  for(const f of files){
    try{ const d=JSON.parse(await deckText(f)); out[f]=ctx.schemaCheck(d,'deck'); hints[f]=ctx.breakCheck(d,'deck'); }
    catch(e){ out[f]=['(cannot read) '+e.message]; hints[f]=[]; }
    total+=out[f].length;
  }
  if(asJson) process.stdout.write(JSON.stringify(withBreaks?
    Object.fromEntries(files.map(f=>[f,{fields:out[f],breaks:hints[f]}])) : out));
  else for(const f of files){
    const w=out[f], h=hints[f];
    console.log((w.length? '⚠ ' : '✓ ')+f+(w.length? '  '+w.length+' unknown field(s)' : '')+(h.length? '  '+h.length+' line-break hint(s)' : ''));
    for(const s of w) console.log('    '+s);
    for(const s of h) console.log('    ℹ '+s);
  }
  process.exit(total? 1 : 0);
})();
