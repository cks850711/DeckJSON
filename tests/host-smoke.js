/* 由 deckjson-server 提供時（AI 用的 port）的冒煙測試：DJ.save() 改走伺服器、save({as})、分頁回報。
 *
 * 和 dj-smoke.js 一樣只經由 DJ 與伺服器的公開網址驗證。伺服器只提供它指定的資料夾，
 * 所以把這個檔複製到一個空資料夾、用那個資料夾啟動伺服器（測試會在裡面建立 host-smoke-*.deck）：
 *
 *     mkdir -p /tmp/dj-host && cp tests/host-smoke.js /tmp/dj-host/
 *     node deckjson-server.js start /tmp/dj-host
 *
 * 在開出來的頁面 console 執行
 *
 *     await (await import('/files/host-smoke.js')).default()
 *
 * 回傳 {pass, fail, failures}；結束時把畫面上的簡報還原成測試前的內容。
 * DJ App（47121）的槽位要開兩個視窗才測得到，不在這裡，見 tests/README.md。
 */
export default async function hostSmoke() {
  let pass = 0;
  const failures = [];
  const ok = (cond, name, detail) => { if (cond) pass++; else failures.push(name + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); };
  const throws = async (fn, re, name) => {
    try { await fn(); failures.push(name + ' → did not throw'); }
    catch (e) { ok(re.test(e.message), name, e.message); }
  };

  const host = DJ.info().host;
  if (!host || host.mode !== 'server') return {pass: 0, fail: 1, failures: ['not served by deckjson-server (DJ.info().host is ' + JSON.stringify(host) + ')']};
  const before = await DJ.toBlob();
  const beforeFile = DJ.info().file;
  const name = `host-smoke-${Date.now()}.deck`;
  try {
    ok(typeof host.folder === 'string' && host.port > 0, 'info().host 帶資料夾與 port', host);

    await DJ.load({title: 'host smoke', pages: [{id: 'h1', elements: [
      {id: 't', type: 'text', x: 40, y: 40, w: 500, h: 60, paras: [{runs: [{text: 'one', sizePt: 24}]}]}]}]});
    ok(DJ.info().file === null, 'load() 清掉目前的檔案');
    await throws(() => DJ.save(), /no file is open; call save\(\{as/, '沒有檔案時 save() 指向 save({as})');

    const r1 = await DJ.save({as: name});
    ok(r1.saved && r1.file === name && r1.bytes > 0, 'save({as}) 存成資料夾裡的新檔', r1);
    ok(DJ.info().file === name && !DJ.info().dirty, 'save({as}) 之後目前檔案就是它', DJ.info());
    const disk = await fetch('/files/' + encodeURIComponent(name), {cache: 'no-store'}).then(r => r.blob());
    ok(disk.size === r1.bytes, '硬碟上的大小與回報相同', [disk.size, r1.bytes]);

    await DJ.patch('h1', [{id: 't', md: 'two'}]);
    ok(DJ.info().dirty && document.title.startsWith('● '), '修改後標成未存檔（標題也有 ●）', document.title);
    const r2 = await DJ.save();
    ok(r2.saved && r2.file === name && !DJ.info().dirty && !document.title.startsWith('● '), 'save() 存回同一個檔', r2);
    const reread = await DJ.load(await fetch('/files/' + encodeURIComponent(name), {cache: 'no-store'}).then(r => r.blob()));
    ok(reread.pages === 1 && DJ.outline('h1')[0].text === 'two', '存回的內容讀得回來', DJ.outline('h1'));

    await throws(() => DJ.save({as: 'x.pptx'}), /needs a \.deck file name/, 'save({as}) 只收 .deck');
    await throws(() => DJ.save({as: '../x.deck'}), /save: /, '資料夾外的路徑被伺服器拒絕');

    await new Promise(r => setTimeout(r, 300));
    const id = await fetch('/__deckjson').then(r => r.json());
    ok(id.tabs.some(t => t.title === 'host smoke'), '狀態頁看得到這個分頁', id.tabs);
    const d = id.decks.find(x => x.file === name);
    ok(d && d.saved === 2, '伺服器記下存檔次數', d);
  } catch (e) {
    failures.push('unexpected: ' + (e && e.message || e));
  } finally {
    await DJ.load(before);
    if (beforeFile) failures.push(`note: the page had "${beforeFile}" open; after the test it is detached from that file`);
  }
  return {pass, fail: failures.length, failures};
}
