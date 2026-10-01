/* deckjson-server.js 的測試：真的啟動伺服器、真的送 HTTP，驗證安全限制與生命週期。
 *
 *     node tests/server-test.js
 *
 * 用另一段 port（47191～47195）與暫存資料夾當登記目錄，不碰正式的 47111～47115 與 ~/.deckjson。
 * 需要 repo 根目錄已有建好的 deckjson.html。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const {execFileSync, spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'deckjson-server.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-server-test-'));
const HOME = path.join(TMP, 'home');
const ENV = Object.assign({}, process.env, {DECKJSON_HOME: HOME, DECKJSON_PORTS: '47191-47195'});
const PORTS = [47191, 47192, 47193, 47194, 47195];
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) pass++;
  else { failures.push(name + (detail !== undefined ? ` → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '')); }
}

function cli(...args) {
  const r = spawnSync(process.execPath, [SERVER, ...args], {env: ENV, encoding: 'utf8', timeout: 15000});
  return {code: r.status, out: r.stdout, err: r.stderr};
}

function req(port, method, p, opt) {
  const o = opt || {};
  return new Promise(resolve => {
    const headers = Object.assign({Host: `127.0.0.1:${port}`}, o.headers || {});
    const body = o.body == null ? null : Buffer.isBuffer(o.body) ? o.body : Buffer.from(o.body);
    if (body) headers['Content-Length'] = body.length;
    const rq = http.request({host: '127.0.0.1', port, method, path: p, headers, timeout: 3000, agent: false}, rs => {
      const chunks = [];
      rs.on('data', c => chunks.push(c));
      rs.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch { /* 非 JSON */ }
        resolve({status: rs.statusCode, headers: rs.headers, buf, json});
      });
    });
    rq.on('timeout', () => rq.destroy());
    rq.on('error', e => resolve({status: 0, error: e.code}));
    if (body) rq.write(body);
    rq.end();
  });
}

const regFiles = () => { try { return fs.readdirSync(path.join(HOME, 'servers')).filter(n => n.endsWith('.json')).sort(); } catch { return []; } };
const ZIP = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(60, 1)]);

async function main() {
  const work = path.join(TMP, 'work');
  const outside = path.join(TMP, 'outside');
  fs.mkdirSync(path.join(work, 'sub'), {recursive: true});
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(work, 'a.deck'), '{"title":"A","pages":[]}');
  fs.writeFileSync(path.join(work, 'notes.md'), '# notes');
  fs.writeFileSync(path.join(work, '.secret'), 'x');
  fs.writeFileSync(path.join(outside, 'o.deck'), '{"title":"O"}');
  fs.symlinkSync(outside, path.join(work, 'link'));

  /* ---- 啟動、身分、port 分配 ---- */
  const s1 = cli('start', path.join(work, 'a.deck'), '--json');
  ok(s1.code === 0, 'start 成功', s1.err);
  const i1 = s1.code === 0 ? JSON.parse(s1.out) : {};
  ok(i1.port === 47191, 'start 取第一個 port', i1.port);
  ok(i1.open === 'a.deck' && /\?open=a\.deck$/.test(i1.url || ''), '給檔案時取所在資料夾並帶 ?open=', i1.url);
  ok(i1.folder === fs.realpathSync(work), 'folder 為實際路徑', i1.folder);
  const P = i1.port;

  const id = await req(P, 'GET', '/__deckjson');
  ok(id.status === 200 && id.json.app === 'deckjson-server' && id.json.pid === i1.pid, '/__deckjson 身分', id.json);
  ok(/^\d+\.\d+\.\d+$/.test(id.json && id.json.dj || ''), '/__deckjson 帶 DJ 版本', id.json && id.json.dj);
  ok(!id.headers['access-control-allow-origin'], '不送 CORS 標頭');
  const home = await req(P, 'GET', '/');
  ok(home.status === 200 && /window\.DJ=DJ/.test(home.buf.toString('utf8')), '/ 提供 deckjson.html');
  ok(home.headers['cache-control'] === 'no-cache', 'no-cache');
  ok(regFiles().includes('47191.json'), '寫入登記檔', regFiles());

  const more = [];
  for (let i = 0; i < 4; i++) more.push(cli('start', work, '--json'));
  ok(more.every(r => r.code === 0), '再開 4 個都成功', more.map(r => r.err).join(' '));
  ok(more.map(r => JSON.parse(r.out || '{}').port).join() === '47192,47193,47194,47195', '依序取 47192～47195', more.map(r => r.out));
  const s6 = cli('start', work);
  ok(s6.code === 1 && /all DeckJSON ports \(47191–47195\) are in use/.test(s6.err), '5 個滿了拒絕第 6 個', s6.err);
  ok(/47193: DeckJSON/.test(s6.err) && /stop <port>/.test(s6.err), '拒絕訊息列出佔用者與關閉方法', s6.err);

  const st = cli('status', '--json');
  ok(st.code === 0 && JSON.parse(st.out).servers.length === 5, 'status 列出 5 個', st.out);

  /* ---- Host、Origin ---- */
  const evil = await req(P, 'GET', '/__deckjson', {headers: {Host: 'evil.example:47191'}});
  ok(evil.status === 403, '錯的 Host 被擋', evil.status + ' ' + (evil.error || ''));
  ok((await req(P, 'GET', '/__deckjson', {headers: {Host: 'localhost:47191'}})).status === 200, 'localhost Host 可用');
  const cross = await req(P, 'POST', '/save?n=x.deck', {body: ZIP, headers: {Origin: 'https://evil.example'}});
  ok(cross.status === 403, '跨站 Origin 的 POST 被擋', cross.status);
  const otherPort = await req(P, 'POST', '/save?n=x.deck', {body: ZIP, headers: {Origin: 'http://127.0.0.1:47192'}});
  ok(otherPort.status === 403, '另一個 port 的 Origin 也被擋（不同網站）', otherPort.status);
  const sfs = await req(P, 'POST', '/save?n=x.deck', {body: ZIP, headers: {'Sec-Fetch-Site': 'cross-site'}});
  ok(sfs.status === 403, 'Sec-Fetch-Site: cross-site 被擋', sfs.status);
  const nullOrigin = await req(P, 'POST', '/save?n=x.deck', {body: ZIP, headers: {Origin: 'null'}});
  ok(nullOrigin.status === 403, 'Origin: null（file:// 等）被擋', nullOrigin.status);
  const stopCross = await req(P, 'POST', '/__stop', {headers: {Origin: 'https://evil.example'}});
  ok(stopCross.status === 403, '跨站關閉請求被擋', stopCross.status);
  ok(!fs.existsSync(path.join(work, 'x.deck')), '被擋的請求沒寫出檔案');

  /* ---- 讀檔 ---- */
  const rd = await req(P, 'GET', '/files/a.deck');
  ok(rd.status === 200 && rd.headers['content-type'] === 'application/x-deckjson', '讀 /files/a.deck', rd.status);
  ok((await req(P, 'GET', '/files/notes.md')).status === 200, '讀資料夾內其他檔');
  ok((await req(P, 'GET', '/files/.secret')).status === 404, '隱藏檔不給讀');
  ok((await req(P, 'GET', '/files/../outside/o.deck')).status === 404, '.. 不給讀');
  ok((await req(P, 'GET', '/files/%2e%2e/outside/o.deck')).status === 404, '編碼過的 .. 不給讀');
  ok((await req(P, 'GET', '/files/sub')).status === 404, '資料夾不列清單');
  ok((await req(P, 'GET', '/etc/passwd')).status === 404, '/files/ 以外的路徑 404');

  /* ---- 存檔：路徑與格式限制 ---- */
  const save = (n, body, extra) => req(P, 'POST', '/save?n=' + encodeURIComponent(n) + (extra || ''), {body, headers: {Origin: `http://127.0.0.1:${P}`}});
  ok((await save('../escape.deck', ZIP)).status === 400 && !fs.existsSync(path.join(TMP, 'escape.deck')), '不能用 .. 寫到資料夾外');
  ok((await save(path.join(outside, 'abs.deck'), ZIP)).status === 400, '絕對路徑被當成資料夾內的相對路徑（子資料夾不存在即拒絕）');
  ok(!fs.existsSync(path.join(outside, 'abs.deck')), '絕對路徑沒寫到外面');
  const viaLink = await save('link/o2.deck', ZIP);
  ok(viaLink.status === 403 && !fs.existsSync(path.join(outside, 'o2.deck')), '不能經捷徑（symlink）寫到外面', viaLink.json);
  ok((await save('note.txt', ZIP)).status === 400, '只收 .deck／.pptx');
  ok((await save('.hidden.deck', ZIP)).status === 400, '隱藏檔名不收');
  ok((await save('new.deck', '')).status === 400, '空本體不收');
  const blobStr = await save('new.deck', '[object Blob]');
  ok(blobStr.status === 400 && /not a \.deck file/.test(blobStr.json.error), '"[object Blob]" 不收', blobStr.json);
  ok((await save('new.pptx', '{"a":1}')).status === 400, '.pptx 必須是 zip');
  ok(!fs.existsSync(path.join(work, 'new.deck')) && !fs.existsSync(path.join(work, 'new.pptx')), '被拒的存檔沒留下檔案');

  /* ---- 存檔：成功與修改時間檢查 ---- */
  const n1 = await save('new.deck', ZIP);
  ok(n1.status === 200 && n1.json.saved === 'new.deck' && n1.json.bytes === ZIP.length, '新檔存檔成功', n1.json);
  ok(fs.readFileSync(path.join(work, 'new.deck')).equals(ZIP), '寫出的內容正確');
  ok((await save('sub/n.deck', '{"pages":[]}')).status === 200, '可存進子資料夾，純 JSON 的 .deck 也收');
  ok((await save('nodir/n.deck', ZIP)).status === 400, '子資料夾不存在就拒絕');
  ok((await save('new.deck', ZIP)).status === 200, '自己存過的檔可再存');
  const leftovers = fs.readdirSync(work).filter(n => n.includes('djtmp'));
  ok(!leftovers.length, '沒留下暫存檔', leftovers);

  fs.writeFileSync(path.join(work, 'b.deck'), '{"title":"B"}');
  const ex = await save('b.deck', ZIP);
  ok(ex.status === 409 && ex.json.code === 'exists', '沒經這裡讀過的既有檔要 force', ex.json);
  ok(fs.readFileSync(path.join(work, 'b.deck'), 'utf8') === '{"title":"B"}', '沒有覆蓋既有檔');
  await req(P, 'GET', '/files/b.deck');
  ok((await save('b.deck', ZIP)).status === 200, '讀過之後可存');
  await sleep(20);
  fs.writeFileSync(path.join(work, 'b.deck'), '{"title":"changed elsewhere"}');
  const ch = await save('b.deck', ZIP);
  ok(ch.status === 409 && ch.json.code === 'changed', '別處改過就拒絕', ch.json);
  ok(fs.readFileSync(path.join(work, 'b.deck'), 'utf8') === '{"title":"changed elsewhere"}', '拒絕時沒覆蓋');
  ok((await save('b.deck', ZIP, '&force=1')).status === 200, 'force=1 可覆蓋');

  /* ---- 分頁回報與狀態 ---- */
  const ping = b => req(P, 'POST', '/__ping', {body: JSON.stringify(b), headers: {Origin: `http://127.0.0.1:${P}`, 'Content-Type': 'text/plain'}});
  ok((await ping({tab: 't1', title: '我的簡報', file: 'a.deck'})).status === 204, 'ping 回 204');
  const id2 = (await req(P, 'GET', '/__deckjson')).json;
  ok(id2.tabs.length === 1 && id2.tabs[0].title === '我的簡報', '分頁出現在身分資訊', id2.tabs);
  const da = id2.decks.find(d => d.file === 'a.deck'), db = id2.decks.find(d => d.file === 'b.deck');
  ok(da && da.read === 1 && db && db.read === 1 && db.saved === 2, '讀存次數', id2.decks);
  await ping({tab: 't1', closed: true});
  ok((await req(P, 'GET', '/__deckjson')).json.tabs.length === 0, 'closed 移除分頁');
  const page = await req(P, 'GET', '/__status');
  ok(page.status === 200 && /DeckJSON servers/.test(page.buf.toString('utf8')), '/__status 狀態頁');
  const sj = (await req(P, 'GET', '/__status.json')).json;
  ok(sj.servers.length === 5 && sj.servers.filter(s => s.self).length === 1 && sj.servers.every(s => s.ok), '/__status.json 彙整 5 個', sj);

  /* ---- 關閉 ---- */
  const fwd = await req(P, 'POST', '/__stop?port=47195', {headers: {Origin: `http://127.0.0.1:${P}`}});
  ok(fwd.status === 200, '狀態頁可關另一個 port', fwd.json);
  ok((await req(P, 'POST', '/__stop?port=8111', {headers: {Origin: `http://127.0.0.1:${P}`}})).status === 404, '不轉給沒登記的 port');
  await sleep(400);
  ok((await req(47195, 'GET', '/__deckjson')).status === 0 && !regFiles().includes('47195.json'), '47195 已關並移除登記', regFiles());
  const so = cli('stop', '47194');
  ok(so.code === 0 && /stopped 47194/.test(so.out), 'stop 指令', so.err);

  // 孤兒：程序被 kill -9，登記檔還在 → status 查到程序已不在就清掉
  const pid193 = JSON.parse(fs.readFileSync(path.join(HOME, 'servers', '47193.json'), 'utf8')).pid;
  process.kill(pid193, 'SIGKILL');
  await sleep(300);
  ok(regFiles().includes('47193.json'), 'kill -9 留下登記檔');
  const st2 = JSON.parse(cli('status', '--json').out);
  ok(!st2.servers.some(s => s.port === 47193) && !regFiles().includes('47193.json'), 'status 清掉死掉程序的登記', regFiles());

  // 閒置結束：--idle 0.05 分鐘＝3 秒
  const si = cli('start', work, '--idle', '0.05', '--json');
  const ip = JSON.parse(si.out || '{}').port;
  ok(si.code === 0 && ip === 47193, '空出的 port 可再用', si.out + si.err);
  await sleep(1500);
  ok((await req(ip, 'GET', '/__deckjson')).status === 200, '閒置未滿時仍在');
  await sleep(3500);
  ok((await req(ip, 'GET', '/__deckjson')).status === 0 && !regFiles().includes(`${ip}.json`), '閒置後自行結束並移除登記', regFiles());

  // 自己關自己
  ok((await req(P, 'POST', '/__stop', {headers: {Origin: `http://127.0.0.1:${P}`}})).status === 200, '/__stop 關閉自己');
  ok(cli('stop', 'all').code === 0, 'stop all');
  await sleep(400);
  ok(regFiles().length === 0, '全部關閉後登記清空', regFiles());
  for (const p of PORTS) ok((await req(p, 'GET', '/__deckjson')).status === 0, `port ${p} 已釋放`);

  ok(cli('start', path.join(work, 'missing')).code === 1, '不存在的路徑拒絕');
  const sp = cli('start', work, '--open', '../x.deck');
  ok(sp.code === 1 && /--open must name a file inside/.test(sp.err), '--open 不能指到外面', sp.err);
}

main().then(() => {
  for (const f of failures) console.log('FAIL', f);
  console.log(`server-test: ${pass} pass, ${failures.length} fail`);
}).catch(e => { console.error(e); failures.push(String(e)); }).finally(() => {
  try { execFileSync(process.execPath, [SERVER, 'stop', 'all'], {env: ENV, stdio: 'ignore'}); } catch { /* 都已關 */ }
  fs.rmSync(TMP, {recursive: true, force: true});
  process.exitCode = failures.length ? 1 : 0;
});
