/* 自動存檔還原的回歸測試。還原發生在頁面載入時，dj-smoke.js 在同一個頁面裡跑，碰不到這一段，所以另外寫。
 *
 * 執行：用本機伺服器提供 repo 根目錄（例如 python3 tools/serve.py 8131），開一個不是 DeckJSON 的頁面
 * （例如 /tests/ 的目錄列表），在 console 執行
 *
 *     await (await import('/tests/dj-autosave.js')).default()
 *
 * 要測別的建置版就把網址傳進去：default('/某個建置.html')。回傳 {pass, fail, failures}。
 *
 * 測試會改寫這個網址的自動存檔（IndexedDB 的 deckjson／autosave／current），結束時放回原本那一筆；
 * **不要在平常編簡報的網址上跑**，換一個 port。頁面放在 iframe 裡載入，載入前先攔住 alert／confirm／prompt
 * 與帶 download 的連結點擊（confirm 預設回答「確定」，測「開新簡報」時逐道指定），整個過程不跳視窗、不下載檔案。
 */
const DB = 'deckjson', STORE = 'autosave', KEY = 'current';

function idb(mode, fn) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const db = rq.result, tx = db.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); res(r.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    };
  });
}
const getRec = () => idb('readonly', st => st.get(KEY));
const putRec = rec => idb('readwrite', st => st.put(rec, KEY));
const delRec = () => idb('readwrite', st => st.delete(KEY));
const tick = ms => new Promise(r => setTimeout(r, ms));

const GUARD = '<script>window.__al=[];window.__dl=[];'
  + 'window.alert=m=>window.__al.push(String(m));window.confirm=m=>(window.__al.push(String(m)),true);window.prompt=()=>null;'
  + '(function(){const c=HTMLAnchorElement.prototype.click;'
  + 'HTMLAnchorElement.prototype.click=function(){if(this.hasAttribute("download")){window.__dl.push(this.download);return;}return c.call(this);};'
  + 'document.addEventListener("click",e=>{const a=e.target.closest&&e.target.closest("a[download]");'
  + 'if(a){e.preventDefault();window.__dl.push(a.download);}},true);})();<\/script>';

/* 以 srcdoc 載入：開機時的還原會跳 alert，必須在頁面的程式跑之前就攔住，onload 之後才換掉 alert 已經太晚。
   srcdoc 的文件與本頁同源，讀寫的是同一個 IndexedDB。 */
async function boot(page) {
  const html = await (await fetch(page, {cache: 'no-store'})).text();
  const at = html.indexOf('<head>') + '<head>'.length;
  const f = document.createElement('iframe');
  f.style.cssText = 'width:1280px;height:800px;border:0';
  const loaded = new Promise(r => { f.onload = r; });
  f.srcdoc = html.slice(0, at) + GUARD + html.slice(at);
  document.body.prepend(f);
  await loaded;
  const w = f.contentWindow;
  await w.DJ.ready();
  return {f, w};
}

const TEXT = (id, text) => ({id, type: 'text', x: 40, y: 40, w: 300, h: 40, paras: [{runs: [{text, sizePt: 18}]}]});

export default async function autosaveTest(page = '/deckjson.html') {
  const results = [];
  const ok = (name, cond, info) => results.push({name, pass: !!cond, info});
  const keep = await getRec();
  // 兩段各自 try：一段拋錯時另一段照跑，修正前的版本才看得出兩邊各錯在哪
  const part = async (name, fn) => {
    try { await fn(); } catch (e) { ok(name + ': unexpected exception', false, e.stack || String(e)); }
    for (const fr of document.querySelectorAll('iframe')) fr.remove();
  };
  try {
    await part('unknown type', async () => {
      // ---- 型別不認得的元素：還原得回來、畫布不畫、存檔與匯出前後都還在 ----
      const UNK = {id: 'c1', type: 'connector', x: 10, y: 20, from: 'a', to: 'b', extra: {deep: [1, 2]}};
      await putRec({deck: {title: 'autosave unknown', pages: [
        {id: 'p1', elements: [TEXT('a', 'one'), UNK]}, {id: 'p2', elements: [TEXT('b', 'two')]}]},
        page: 'p1', at: Date.now(), handle: null, srv: null, dirty: false});
      const {w} = await boot(page);
      ok('unknown type: the autosave is restored with both slides', w.DJ.list().length === 2, w.DJ.list().length);
      ok('unknown type: the element keeps every field', JSON.stringify(w.DJ.get('p1', 'c1')) === JSON.stringify(UNK), w.DJ.get('p1', 'c1'));
      ok('unknown type: not drawn on the canvas', !w.document.querySelector('#stage [data-id="c1"]'));
      ok('unknown type: the restore names the element', w.__al.some(m => m.includes('c1') && m.includes('connector')), w.__al);
      await w.DJ.patch('p1', [{id: 'a', set: {x: 99}}]);
      await tick(1800);   // 自動存檔排程 1.2 秒
      const r1 = await getRec();
      ok('unknown type: the next autosave still has both slides and the element',
        r1 && r1.deck.pages.length === 2 && JSON.stringify(r1.deck.pages[0].elements.find(e => e.id === 'c1')) === JSON.stringify(UNK),
        r1 && r1.deck.pages.map(p => p.elements.map(e => e.id)));
      await w.DJ.load(await w.DJ.toBlob());
      ok('unknown type: survives a save and reopen', JSON.stringify(w.DJ.get('p1', 'c1')) === JSON.stringify(UNK), w.DJ.get('p1', 'c1'));
      const zip = await w.JSZip.loadAsync(await (await w.DJ.exportPptx()).arrayBuffer());
      const s1 = await zip.file('ppt/slides/slide1.xml').async('string');
      ok('unknown type: left out of the exported slide', !s1.includes('name="c1"') && s1.includes('name="a"'));
      ok('unknown type: nothing was downloaded', w.__dl.length === 0, w.__dl);
    });
    await part('failed restore', async () => {
      // ---- 還原失敗：記錄保住、警告一直看得到、確認文字照實講，並有一條要確認的出路 ----
      const BAD = {deck: {title: 'autosave broken', pages: [{id: 'p1', elements: [TEXT('a', 'one')]},
        {id: 'p2', elements: [{id: 't', type: 'table', x: 0, y: 0}]}]},   // 表格缺 colW／rowH／cells，normalizeDeck 會拋錯
        page: 'p1', at: Date.now(), handle: null, srv: null, dirty: false};
      await putRec(BAD);
      const want = JSON.stringify(await getRec());
      const {w} = await boot(page);
      const hint = w.document.querySelector('#saveHint'), warn = hint.textContent;
      // 「開新簡報」的幾道確認依序回答 answers；問過什麼記在 asked
      const newDeck = async answers => {
        const asked = [];
        w.confirm = m => { asked.push(String(m)); return answers.length ? answers.shift() : false; };
        w.document.querySelector('#btnNew').click();
        await tick(500);
        return asked;
      };
      ok('failed restore: the page opens on a blank deck', w.DJ.list().length === 1, w.DJ.list().length);
      ok('failed restore: the save hint turns into a warning', hint.classList.contains('bad') && warn.length > 0, warn);
      await w.DJ.add(w.DJ.list()[0].id, [TEXT('n', 'new work')]);
      await tick(1800);
      ok('failed restore: editing afterwards leaves the record untouched', JSON.stringify(await getRec()) === want);
      // 開新簡報但不放棄記錄：前兩道確定、第三道取消
      const asked = await newDeck([true, true, false]);
      ok('failed restore: the new-deck confirm does not claim the autosave is cleared',
        asked.length > 0 && !/一併清除|and the autosave too/.test(asked[0]), asked[0]);
      ok('failed restore: new deck asks separately whether to drop the unreadable record', asked.length === 3, asked);
      ok('failed restore: keeping it leaves the record untouched', JSON.stringify(await getRec()) === want);
      ok('failed restore: the warning stays visible after other hints', hint.classList.contains('bad') && hint.textContent.includes(warn),
        hint.textContent);
      // 這次確認放棄：記錄刪掉、自動存檔恢復，新簡報接著自動存檔
      await newDeck([true, true, true]);
      await tick(1800);
      const after = await getRec();
      ok('failed restore: dropping it resumes autosave with the new deck',
        !!after && JSON.stringify(after) !== want && after.deck.pages.length === 1, after && after.deck.title);
      ok('failed restore: the warning goes away once autosave resumes', !hint.classList.contains('bad'), hint.textContent);
    });
  } finally {
    if (keep === undefined) await delRec(); else await putRec(keep);
  }
  const failures = results.filter(r => !r.pass);
  return {pass: results.length - failures.length, fail: failures.length, failures};
}
