#!/usr/bin/env node
/* .deck 的欄位檢查：列出不認得的欄位（寫錯名字、放錯層、自創的欄位）
 *
 *   node tools/deck-lint.js <檔案.deck|.json> [...]     逐檔列出，有警告時離開碼 1
 *   node tools/deck-lint.js --json <檔案>               輸出 JSON：{檔名: [警告…]}（給其他工具呼叫）
 *   … | node tools/deck-lint.js --json -                從 stdin 讀一份 deck JSON（不是 zip）
 *
 * 判定就是 app 裡的 schemaCheck()（src/app/model/schema.js），這支只負責讀檔：
 * 在 node 裡載入那個檔再呼叫，所以畫布上 DJ 回報的 warnings 與這裡的輸出永遠一致。
 * .deck 容器（zip）用 src/vendor 的 JSZip 解開，與 app 開檔同一套。
 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const SRC=path.join(__dirname,'..','src');
const ctx={}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SRC,'app','model','schema.js'),'utf8')+'\n;this.schemaCheck=schemaCheck;',ctx);
const JSZip=require(path.join(SRC,'vendor','jszip.min.js'));

async function deckText(file){
  const buf= file==='-'? fs.readFileSync(0) : fs.readFileSync(file);
  if(buf[0]!==0x50||buf[1]!==0x4b) return buf.toString('utf8');   // 不是 PK＝純 JSON
  const zip=await JSZip.loadAsync(buf), dj=zip.file('deck.json');
  if(!dj) throw new Error('zip without deck.json (not a DeckJSON container)');
  return dj.async('string');
}
(async()=>{
  const args=process.argv.slice(2), asJson=args.includes('--json'), files=args.filter(a=>a!=='--json');
  if(!files.length){ console.error('usage: node tools/deck-lint.js [--json] <file.deck>…  (use - for stdin)'); process.exit(2); }
  const out={}; let total=0;
  for(const f of files){
    try{ out[f]=ctx.schemaCheck(JSON.parse(await deckText(f)),'deck'); }
    catch(e){ out[f]=['(cannot read) '+e.message]; }
    total+=out[f].length;
  }
  if(asJson) process.stdout.write(JSON.stringify(out));
  else for(const [f,w] of Object.entries(out)){
    console.log((w.length? '⚠ ' : '✓ ')+f+(w.length? '  '+w.length+' unknown field(s)' : ''));
    for(const s of w) console.log('    '+s);
  }
  process.exit(total? 1 : 0);
})();
