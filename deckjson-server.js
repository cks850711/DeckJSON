#!/usr/bin/env node
/* DeckJSON 伺服器：給 AI 代理（以及需要的人）一個固定網址開 DeckJSON，並把簡報直接存回硬碟。
   只用 Node 內建模組，不必 npm install；放在 deckjson.html 旁邊即可。

     node deckjson-server.js start [資料夾或 .deck 檔] [--open 檔名] [--browser] [--idle 分鐘] [--json]
     node deckjson-server.js status [--json]
     node deckjson-server.js stop <port|all>
     node deckjson-server.js serve …   參數同 start，但在前景執行（關掉終端機即停止）

   start 會在背景啟動伺服器、印出網址後立刻返回，給不能長時間佔住終端機的 AI 工具用。
   port 從 47111～47115 取第一個空的：一個工作一個 port，每個 port 是獨立的網站，
   瀏覽器的自動存檔（IndexedDB）天生分開，同時開好幾份簡報也不會互相覆蓋。
   五個都佔滿就拒絕，請使用者從狀態頁（任一 port 的 /__status）或 stop 指令關一個。

   網址：
     /                 deckjson.html
     /files/<路徑>     啟動時指定的資料夾，唯讀。DJ.load(await fetch('/files/a.deck').then(r=>r.blob()))
     POST /save?n=<路徑>[&force=1]   把請求本體寫成資料夾內的 .deck／.pptx
     /__deckjson       身分檢查：確認對面是 DeckJSON 伺服器、哪個資料夾，再送存檔
     /__status         狀態頁：每個 port 的資料夾、讀過與存過的簡報、開著的分頁，可按關閉
     POST /__ping      頁面定時回報（分頁 id、標題、檔名），狀態頁據此列出開著的分頁
     POST /__stop[?port=N]  關閉這個（或登記檔裡另一個）伺服器

   安全限制（沿用 tools/serve.py，另加後四條）：
   - 只聽 127.0.0.1；檢查 Host 標頭擋 DNS rebinding；不送 CORS 標頭，別的網站讀不到回應
   - POST 檢查 Origin 與 Sec-Fetch-Site：瀏覽器對跨站的簡單 POST 不先問就直接送出，只靠 CORS 擋不住寫入
   - 只能寫啟動時指定的資料夾，且只收 .deck／.pptx；路徑不得含 ..、隱藏檔名，也不能經捷徑（symlink）寫到外面
   - 存檔前比對讀出時的修改時間，被別處改過就拒絕（同 DJ.save() 的 changed on disk），除非 force=1
   - 已存在但沒經這個伺服器讀過的檔，同樣要 force=1 才覆蓋，免得一個新簡報蓋掉同名的舊檔
   - 先寫暫存檔再改名，寫到一半中斷不會留下半個檔

   生命週期：每個伺服器在 ~/.deckjson/servers/<port>.json 登記 port、程序編號、資料夾、啟動時間，
   結束時移除。超過 --idle 分鐘（預設 15）沒有任何請求就自行結束——頁面開著時會定時回報，
   所以實際上是「分頁關掉 15 分鐘後結束」，不再留孤兒程序。程序被強制終止留下的登記，
   下次 status 或狀態頁查到程序已不在就清掉。
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {spawn} = require('child_process');
const {pipeline} = require('stream/promises');
const {Transform} = require('stream');

const SERVER_VERSION = '0.3.1';
const SCRIPT = path.resolve(__filename);
const HOME = process.env.DECKJSON_HOME || path.join(os.homedir(), '.deckjson');
const REG_DIR = path.join(HOME, 'servers');
const LOG_DIR = path.join(HOME, 'logs');
// 測試用：DECKJSON_PORTS=47191-47195 換一段 port，免得測試佔走正式的
const PORTS = (() => {
  const m = /^(\d+)-(\d+)$/.exec(process.env.DECKJSON_PORTS || '');
  const a = m ? +m[1] : 47111, b = m ? +m[2] : 47115;
  return Array.from({length: b - a + 1}, (_, i) => a + i);
})();
const RANGE = `${PORTS[0]}–${PORTS[PORTS.length - 1]}`;
const DEFAULT_IDLE_MIN = 15;
const TAB_TTL = 90e3;            // 分頁超過這麼久沒回報就不算開著（背景分頁的計時器最慢約一分鐘一次）
const MAX_BODY = 1024 ** 3;      // 存檔上限 1 GiB，邊收邊寫進暫存檔，不整份放記憶體
const SELF = `node ${path.basename(SCRIPT)}`;

/* ---------------- 共用 ---------------- */

function die(msg) { process.stderr.write(`deckjson-server: ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  const o = {_: []};
  const val = (i, name) => { if (i >= argv.length) die(`${name} needs a value`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') o.open = val(++i, a);
    else if (a === '--idle') o.idle = Number(val(++i, a));
    else if (a === '--port') o.port = Number(val(++i, a));
    else if (a === '--html') o.html = val(++i, a);
    else if (a === '--browser') o.browser = true;
    else if (a === '--json') o.json = true;
    else if (a === '--detached') o.detached = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) die(`unknown option ${a} (see: ${SELF} help)`);
    else o._.push(a);
  }
  if (o.idle != null && !(o.idle >= 0)) die('--idle needs a number of minutes (0 = never exit on idle)');
  if (o.port != null && !(Number.isInteger(o.port) && o.port >= 1024 && o.port <= 65535)) die('--port needs an integer 1024–65535');
  return o;
}

/* 路徑一律以 / 分段的相對路徑表示。擋掉 .、..、隱藏檔名（.git、.env…）與磁碟代號 */
function cleanRel(s) {
  if (typeof s !== 'string' || !s || s.includes('\0')) return null;
  const segs = s.split(/[\\/]+/).filter(Boolean);
  if (!segs.length || segs.some(x => x === '.' || x === '..' || x.startsWith('.'))) return null;
  if (/^[a-zA-Z]:$/.test(segs[0])) return null;
  return segs.join('/');
}

/* 啟動目標：資料夾，或某個檔（取它所在的資料夾，並把它當成要開的檔） */
function resolveTarget(o) {
  const p = path.resolve(o._[0] || '.');
  let st;
  try { st = fs.statSync(p); } catch { die(`not found: ${p}`); }
  let folder = p, open = o.open;
  if (st.isFile()) { folder = path.dirname(p); if (open == null) open = path.basename(p); }
  else if (!st.isDirectory()) die(`not a folder or file: ${p}`);
  folder = fs.realpathSync(folder);
  if (open != null) {
    const rel = cleanRel(path.isAbsolute(open) ? path.relative(folder, open) : open);
    if (!rel) die(`--open must name a file inside ${folder} (no "..", no hidden names)`);
    open = rel;
  }
  return {folder, open};
}

function readRegistry() {
  let names = [];
  try { names = fs.readdirSync(REG_DIR); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!/^\d+\.json$/.test(n)) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(REG_DIR, n), 'utf8'))); } catch { /* 寫到一半或壞檔：略過 */ }
  }
  return out.sort((a, b) => a.port - b.port);
}

/* 只刪自己（或確定已死的那個程序）的登記，免得刪到後來接手同一個 port 的伺服器 */
function removeRegistry(port, pid) {
  const f = path.join(REG_DIR, `${port}.json`);
  try { if (JSON.parse(fs.readFileSync(f, 'utf8')).pid === pid) fs.unlinkSync(f); } catch { /* 已不在 */ }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function request(port, method, p, timeout) {
  return new Promise(resolve => {
    const rq = http.request({host: '127.0.0.1', port, path: p, method, timeout: timeout || 1000, agent: false,
      headers: {Host: `127.0.0.1:${port}`}}, rs => {
      let s = '';
      rs.setEncoding('utf8');
      rs.on('data', c => { s += c; });
      rs.on('end', () => { try { resolve({status: rs.statusCode, json: JSON.parse(s)}); } catch { resolve({status: rs.statusCode, json: null}); } });
    });
    rq.on('timeout', () => rq.destroy());
    rq.on('error', () => resolve(null));
    rq.end();
  });
}

/* 逐一問登記檔裡的伺服器本人；程序已不在的登記順手清掉 */
async function survey(selfPort, selfInfo) {
  const out = [];
  for (const e of readRegistry()) {
    if (e.port === selfPort) { out.push(Object.assign({ok: true, self: true}, selfInfo())); continue; }
    const r = await request(e.port, 'GET', '/__deckjson', 800);
    if (r && r.json && r.json.app === 'deckjson-server' && r.json.pid === e.pid) out.push(Object.assign({ok: true}, r.json));
    else if (!pidAlive(e.pid)) removeRegistry(e.port, e.pid);
    else out.push({ok: false, port: e.port, pid: e.pid, folder: e.folder, started: e.started});
  }
  return out;
}

function urls(port, open) {
  const base = `http://127.0.0.1:${port}`;
  return {url: base + '/' + (open ? '?open=' + encodeURIComponent(open) : ''), status: base + '/__status'};
}

function describe(info) {
  const u = urls(info.port, info.open);
  return [
    `DeckJSON server ready on port ${info.port}`,
    `  open:   ${u.url}`,
    `  folder: ${info.folder}`,
    info.open ? `  file:   ${info.open}${info.openExists ? '' : '  (does not exist yet)'}` : null,
    `  save:   DJ.save(), or fetch('/save?n=<file>.deck', {method: 'POST', body: await DJ.toBlob()})`,
    `  status: ${u.status}`,
    `  stop:   ${SELF} stop ${info.port}` + (info.idleMin ? `  (stops by itself after ${info.idleMin} min with no page open)` : ''),
  ].filter(Boolean).join('\n');
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, {stdio: 'ignore', detached: true}).unref(); } catch { /* 開不了就算了，網址已印出 */ }
}

/* ---------------- 伺服器 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.zip': 'application/zip', '.deck': 'application/x-deckjson',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const isDeckFile = rel => /\.(deck|pptx)$/i.test(rel);

async function serve(o) {
  const {folder, open} = resolveTarget(o);
  const htmlPath = path.resolve(o.html || path.join(path.dirname(SCRIPT), 'deckjson.html'));
  let djVersion = null;
  try {
    const m = /const APP_VERSION='([^']+)'/.exec(fs.readFileSync(htmlPath, 'utf8'));
    djVersion = m && m[1];
  } catch { fail(`deckjson.html not found next to the server (${htmlPath}); build it with src/build.sh or pass --html`); }
  const idleMin = o.idle != null ? o.idle : DEFAULT_IDLE_MIN;
  const started = new Date().toISOString();
  const decks = {};               // 相對路徑 → {read, lastRead, saved, lastSaved, mtimeMs}
  const tabs = new Map();         // 分頁 id → {title, file, lastSeen}
  let lastActive = Date.now(), port = 0, logOut = process.stdout, closing = false;

  function fail(msg) {
    if (o.detached && process.send) { process.send({ok: false, error: msg}); process.disconnect(); process.exit(1); }
    die(msg);
  }
  const log = msg => { try { logOut.write(`${new Date().toISOString()} ${msg}\n`); } catch { /* 終端機已關 */ } };

  const info = () => {
    const now = Date.now();
    for (const [id, t] of tabs) if (now - t.lastSeen > TAB_TTL) tabs.delete(id);
    return {
      app: 'deckjson-server', version: SERVER_VERSION, dj: djVersion, port, pid: process.pid, folder, started,
      open: open || null, idleMin, lastActive: new Date(lastActive).toISOString(),
      decks: Object.entries(decks).map(([file, d]) => ({file, read: d.read, lastRead: d.lastRead, saved: d.saved, lastSaved: d.lastSaved})),
      tabs: [...tabs].map(([id, t]) => ({id, title: t.title, file: t.file, lastSeen: new Date(t.lastSeen).toISOString()})),
    };
  };
  const deckRec = rel => decks[rel] || (decks[rel] = {read: 0, lastRead: null, saved: 0, lastSaved: null, mtimeMs: null});

  const send = (res, status, body, type, extra) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, Object.assign({'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'}, extra || {}));
    res.end(buf);
  };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
  const jerr = (res, status, error, extra) => json(res, status, Object.assign({error}, extra || {}));

  const hostOk = req => {
    const h = (req.headers.host || '').toLowerCase();
    return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  };
  // 沒有 Origin 的是 curl、Node 這類非瀏覽器的本機程式——它們本來就碰得到硬碟，擋了也沒有意義
  const originOk = req => {
    const sfs = req.headers['sec-fetch-site'], og = req.headers.origin;
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') return false;
    return og == null || og === `http://127.0.0.1:${port}` || og === `http://localhost:${port}`;
  };
  const inside = p => p === folder || p.startsWith(folder + path.sep);

  function readSmall(req, limit) {
    return new Promise((resolve, reject) => {
      let s = '';
      req.setEncoding('utf8');
      req.on('data', c => { s += c; if (s.length > limit) { reject(new Error('too large')); req.destroy(); } });
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });
  }

  function serveFile(req, res, rel) {
    const abs = path.join(folder, rel);
    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) return jerr(res, 404, `not found in the served folder: ${rel}`);
      if (isDeckFile(rel) && req.method === 'GET') {
        const d = deckRec(rel);
        d.read++; d.lastRead = new Date().toISOString(); d.mtimeMs = st.mtimeMs;
      }
      res.writeHead(200, {'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'});
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  }

  async function save(req, res, u) {
    const rel = cleanRel(u.searchParams.get('n') || '');
    if (!rel) return jerr(res, 400, 'need ?n=<file name inside the served folder>, e.g. ?n=talk.deck (no "..", no hidden names)');
    if (!isDeckFile(rel)) return jerr(res, 400, 'only .deck and .pptx files can be saved');
    const abs = path.join(folder, rel);
    let dir;
    try { dir = fs.realpathSync(path.dirname(abs)); } catch { return jerr(res, 400, `folder does not exist: ${path.posix.dirname(rel)}`); }
    if (!inside(dir)) return jerr(res, 403, 'that path leads outside the served folder');
    let st = null;
    try { st = fs.lstatSync(abs); } catch { /* 新檔 */ }
    if (st && !st.isFile()) return jerr(res, 409, `"${rel}" is not a regular file`);
    const force = u.searchParams.get('force') === '1', d = decks[rel];
    if (st && !force) {
      if (!d || d.mtimeMs == null)
        return jerr(res, 409, `"${rel}" already exists and was not opened through this server; load it from /files/ first, or add force=1 to overwrite`, {code: 'exists'});
      if (st.mtimeMs !== d.mtimeMs)
        return jerr(res, 409, `"${rel}" was changed on disk since it was opened or last saved; reload it, or add force=1 to overwrite`, {code: 'changed'});
    }
    const tmp = path.join(dir, `.${path.basename(abs)}.djtmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let n = 0, head = Buffer.alloc(0);
    const count = new Transform({transform(c, _, cb) {
      n += c.length;
      if (head.length < 8) head = Buffer.concat([head, c]).subarray(0, 8);
      cb(n > MAX_BODY ? Object.assign(new Error('too large'), {status: 413}) : null, c);
    }});
    try {
      await pipeline(req, count, fs.createWriteStream(tmp, {flags: 'wx'}));
      // 擋最常見的誤用：送出 "[object Blob]"、空字串或 HTML 錯誤頁，把原本的簡報蓋成垃圾
      const zip = head[0] === 0x50 && head[1] === 0x4b;
      const jsonish = /^(﻿)?\s*\{/.test(head.toString('utf8'));
      if (!n) throw Object.assign(new Error('empty body; send the file, e.g. body: await DJ.toBlob()'), {status: 400});
      if (!(zip || (jsonish && /\.deck$/i.test(rel))))
        throw Object.assign(new Error(`body is not a ${path.extname(rel)} file (send await DJ.toBlob() or await DJ.exportPptx(), not a string)`), {status: 400});
      fs.renameSync(tmp, abs);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* 沒建成 */ }
      if (!res.headersSent) jerr(res, e.status || 500, e.status ? e.message : `could not write ${rel}: ${e.message}`);
      if (e.status === 413) req.destroy();
      return;
    }
    const rec = deckRec(rel), after = fs.statSync(abs);
    rec.saved++; rec.lastSaved = new Date().toISOString(); rec.mtimeMs = after.mtimeMs;
    log(`saved ${rel} (${n} bytes)`);
    json(res, 200, {saved: rel, path: abs, bytes: n, mtime: after.mtime.toISOString()});
  }

  async function handle(req, res) {
    if (!hostOk(req)) return jerr(res, 403, 'Host not allowed (use http://127.0.0.1:' + port + '/)');
    let u;
    try { u = new URL(req.url, `http://127.0.0.1:${port}`); } catch { return jerr(res, 400, 'bad URL'); }
    const p = u.pathname;
    // 狀態頁與身分檢查不算活動：狀態頁開著不該讓所有伺服器都不結束
    if (!p.startsWith('/__') || p === '/__ping') lastActive = Date.now();

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (p === '/' || p === '/deckjson.html') {
        return fs.readFile(htmlPath, (err, buf) => err ? jerr(res, 500, 'deckjson.html is missing') :
          send(res, 200, req.method === 'HEAD' ? Buffer.alloc(0) : buf, 'text/html; charset=utf-8'));
      }
      if (p === '/__deckjson') return json(res, 200, info());
      if (p === '/__status.json') return json(res, 200, {range: RANGE, self: port, servers: await survey(port, info)});
      if (p === '/__status') return send(res, 200, statusPage(), 'text/html; charset=utf-8');
      if (p === '/favicon.ico') return send(res, 204, '', 'text/plain');
      if (p.startsWith('/files/')) {
        let s;
        try { s = decodeURIComponent(p.slice(7)); } catch { return jerr(res, 400, 'bad URL encoding'); }
        const rel = cleanRel(s);
        if (!rel) return jerr(res, 404, 'not found (no "..", no hidden names)');
        return serveFile(req, res, rel);
      }
      return jerr(res, 404, 'not found; files in the served folder are under /files/');
    }
    if (req.method !== 'POST') return jerr(res, 405, 'method not allowed');
    if (!originOk(req)) return jerr(res, 403, 'Origin not allowed');

    if (p === '/save') return save(req, res, u);
    if (p === '/__ping') {
      let b;
      try { b = JSON.parse(await readSmall(req, 8192) || '{}'); } catch { return jerr(res, 400, 'ping body must be small JSON'); }
      const id = String(b.tab || '').slice(0, 64);
      if (!id) return jerr(res, 400, 'ping needs {tab}');
      if (b.closed) tabs.delete(id);
      else tabs.set(id, {title: String(b.title || '').slice(0, 200), file: String(b.file || '').slice(0, 300), lastSeen: Date.now()});
      return send(res, 204, '', 'text/plain');
    }
    if (p === '/__stop') {
      const target = Number(u.searchParams.get('port') || port);
      if (target === port) {
        json(res, 200, {stopping: port});
        return setImmediate(() => shutdown('stopped by request'));
      }
      // 只轉給登記檔裡的伺服器，不替任意 port 送請求
      if (!readRegistry().some(e => e.port === target)) return jerr(res, 404, `no DeckJSON server registered on port ${target}`);
      const r = await request(target, 'POST', '/__stop', 1500);
      return r && r.status === 200 ? json(res, 200, {stopping: target}) : jerr(res, 502, `port ${target} did not respond`);
    }
    return jerr(res, 404, 'not found');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => { log(`error ${req.method} ${req.url}: ${e.stack || e}`); if (!res.headersSent) jerr(res, 500, String(e.message || e)); });
  });

  const tryListen = p => new Promise(resolve => {
    const onErr = e => { server.removeListener('listening', onOk); resolve(e.code || 'ERR'); };
    const onOk = () => { server.removeListener('error', onErr); resolve(null); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(p, '127.0.0.1');
  });
  const candidates = o.port ? [o.port] : PORTS;
  for (const c of candidates) { if (!(await tryListen(c))) { port = c; break; } }
  if (!port) {
    const reg = readRegistry();
    const who = candidates.map(c => { const e = reg.find(r => r.port === c);
      return `  ${c}: ${e ? `DeckJSON, ${e.folder} (pid ${e.pid})` : 'another program'}`; }).join('\n');
    const live = reg.find(r => candidates.includes(r.port));
    fail(`${o.port ? `port ${o.port} is` : `all DeckJSON ports (${RANGE}) are`} in use:\n${who}\n` +
      `Ask the user to stop one they no longer need: ${SELF} stop <port>` + (live ? `, or the status page http://127.0.0.1:${live.port}/__status` : ''));
  }

  fs.mkdirSync(REG_DIR, {recursive: true});
  const regFile = path.join(REG_DIR, `${port}.json`);
  const regTmp = regFile + `.${process.pid}.tmp`;
  fs.writeFileSync(regTmp, JSON.stringify({app: 'deckjson-server', port, pid: process.pid, folder, started, version: SERVER_VERSION}));
  fs.renameSync(regTmp, regFile);

  function shutdown(why) {
    if (closing) return;
    closing = true;
    log(`stopping: ${why}`);
    removeRegistry(port, process.pid);
    server.close();
    server.closeAllConnections && server.closeAllConnections();
    setTimeout(() => process.exit(0), 100).unref();
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
  process.on('exit', () => removeRegistry(port, process.pid));
  if (idleMin > 0) {
    const ms = idleMin * 60e3;
    setInterval(() => { if (Date.now() - lastActive > ms) shutdown(`idle for ${idleMin} min`); }, Math.min(30e3, Math.max(500, ms / 4))).unref();
  }

  const ready = {port, folder, open: open || null, openExists: !!open && fs.existsSync(path.join(folder, open)), idleMin,
    pid: process.pid, ...urls(port, open)};
  if (o.detached && process.send) {
    fs.mkdirSync(LOG_DIR, {recursive: true});
    logOut = fs.createWriteStream(path.join(LOG_DIR, `${port}.log`), {flags: 'w'});
    log(`started pid ${process.pid}, folder ${folder}`);
    process.send({ok: true, info: ready});
    process.disconnect();
  } else {
    process.stdout.write(describe(ready) + '\n(press Ctrl+C to stop)\n');
    if (o.browser) openBrowser(ready.url);
  }
}

/* ---------------- 狀態頁 ---------------- */

function statusPage() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeckJSON servers</title>
<style>
:root{--bg:#131418;--panel:#1c1e24;--raised:#262a33;--line:#2b2e37;--fg:#e6e8ec;--dim:#8b909c;--mute:#5d626d;
  --accent:#4d9de0;--danger:#e0625d;--ok:#5fbf7f;--r:6px;--r-lg:9px;
  --ui:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme: light){:root{--bg:#f4f5f7;--panel:#fff;--raised:#eef0f3;--line:#dfe2e7;--fg:#1d2026;--dim:#5d6470;--mute:#8b909c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 var(--ui)}
main{max-width:920px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:18px;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:12px}
.head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.port{font:600 15px var(--mono)}
.badge{font-size:12px;padding:1px 8px;border-radius:999px;background:var(--raised);color:var(--dim)}
.badge.self{color:var(--accent)}
.badge.bad{color:var(--danger)}
.grow{flex:1}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
button{font:inherit;color:var(--fg);background:var(--raised);border:1px solid var(--line);border-radius:var(--r);padding:3px 12px;cursor:pointer}
button:hover{border-color:var(--danger);color:var(--danger)}
.folder{font:12.5px var(--mono);color:var(--dim);margin:6px 0 2px;word-break:break-all}
.meta{color:var(--mute);font-size:12.5px}
h2{font-size:12.5px;color:var(--dim);font-weight:600;margin:12px 0 4px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:3px 8px 3px 0;border-top:1px solid var(--line);vertical-align:top}
td.n{white-space:nowrap;color:var(--dim)}
@media (max-width:640px){td.n{white-space:normal}td{overflow-wrap:anywhere}}
.file{font-family:var(--mono);word-break:break-all}
.none{color:var(--mute);font-size:13px}
.empty{color:var(--dim);text-align:center;padding:40px 0}
</style></head><body><main>
<h1 id="t"></h1><p class="sub" id="s"></p><div id="list"></div>
</main><script>
'use strict';
const STR={
 zh:{title:'DeckJSON 伺服器',sub:'AI 可用的 port：{r}，已使用 {n} 個。每個 port 是一份獨立的工作，暫存互不干擾。',
  self:'本頁',bad:'沒有回應',open:'開 DeckJSON',stop:'關閉',started:'啟動於 {t}',idle:'沒有分頁開著時，閒置 {m} 分鐘後自行結束',
  noIdle:'不會自行結束',tabs:'開著的分頁',noTabs:'沒有分頁回報',decks:'讀過與存過的簡報',noDecks:'還沒有讀寫簡報',
  read:'讀 {n} 次',saved:'存 {n} 次',last:'最後 {t}',untitled:'（未命名）',empty:'目前沒有執行中的 DeckJSON 伺服器。',
  down:'這個伺服器已經關閉，狀態無法更新。請從另一個 port 的 /__status 查看。'},
 en:{title:'DeckJSON servers',sub:'Ports for AI agents: {r}; {n} in use. Each port is a separate job with its own autosave.',
  self:'this page',bad:'not responding',open:'Open DeckJSON',stop:'Stop',started:'started {t}',idle:'stops by itself after {m} min with no page open',
  noIdle:'never stops by itself',tabs:'Open tabs',noTabs:'no tab has reported',decks:'Decks read and saved',noDecks:'no deck read or saved yet',
  read:'read {n}×',saved:'saved {n}×',last:'last {t}',untitled:'(untitled)',empty:'No DeckJSON server is running.',
  down:'This server has stopped, so this page can no longer update. Open /__status on another port.'}};
const q=new URLSearchParams(location.search).get('lang');
const lang=q? (q.startsWith('zh')?'zh':'en') : ((navigator.language||'').startsWith('zh')?'zh':'en');
const L=STR[lang], f=(s,o)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>o[k]);
const time=t=>t? new Date(t).toLocaleString(lang==='zh'?'zh-TW':'en',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
function h(tag,props,...kids){ const e=document.createElement(tag); Object.assign(e,props||{});
  for(const k of kids.flat()) if(k!=null) e.append(k); return e; }
document.documentElement.lang=lang==='zh'?'zh-Hant':'en';
document.title=L.title; t.textContent=L.title;
async function stop(port){ await fetch('/__stop?port='+port,{method:'POST'}).catch(()=>{}); setTimeout(tick,600); }
function card(sv,self){
  const head=h('div',{className:'head'},
    h('span',{className:'port'},':'+sv.port),
    sv.self? h('span',{className:'badge self',textContent:L.self}) : null,
    sv.ok? null : h('span',{className:'badge bad',textContent:L.bad}),
    h('span',{className:'grow'}),
    sv.ok? h('a',{href:'http://127.0.0.1:'+sv.port+'/',target:'_blank',textContent:L.open}) : null,
    h('button',{textContent:L.stop,onclick:()=>stop(sv.port)}));
  const kids=[head,h('div',{className:'folder',textContent:sv.folder||''})];
  if(sv.ok){
    kids.push(h('div',{className:'meta',textContent:f(L.started,{t:time(sv.started)})+' · '+(sv.idleMin? f(L.idle,{m:sv.idleMin}) : L.noIdle)}));
    kids.push(h('h2',{textContent:L.tabs}));
    kids.push(sv.tabs.length? h('table',null,h('tbody',null,sv.tabs.map(tb=>h('tr',null,
      h('td',{textContent:tb.title||L.untitled}),h('td',{className:'file',textContent:tb.file||''}),h('td',{className:'n',textContent:time(tb.lastSeen)})))))
      : h('div',{className:'none',textContent:L.noTabs}));
    kids.push(h('h2',{textContent:L.decks}));
    kids.push(sv.decks.length? h('table',null,h('tbody',null,sv.decks.map(d=>h('tr',null,
      h('td',{className:'file',textContent:d.file}),
      h('td',{className:'n',textContent:d.read? f(L.read,{n:d.read})+' · '+f(L.last,{t:time(d.lastRead)}) : ''}),
      h('td',{className:'n',textContent:d.saved? f(L.saved,{n:d.saved})+' · '+f(L.last,{t:time(d.lastSaved)}) : ''})))))
      : h('div',{className:'none',textContent:L.noDecks}));
  }
  return h('div',{className:'card'},kids);
}
async function tick(){
  let d;
  try{ d=await (await fetch('/__status.json',{cache:'no-store'})).json(); }
  catch(e){ list.replaceChildren(h('div',{className:'empty',textContent:L.down})); s.textContent=''; return; }
  s.textContent=f(L.sub,{r:d.range,n:d.servers.length});
  list.replaceChildren(...(d.servers.length? d.servers.map(card) : [h('div',{className:'empty',textContent:L.empty})]));
}
tick(); setInterval(tick,3000);
</script></body></html>`;
}

/* ---------------- 指令 ---------------- */

function start(o) {
  const {folder, open} = resolveTarget(o);
  const args = [SCRIPT, 'serve', folder, '--detached'];
  if (open) args.push('--open', open);
  if (o.idle != null) args.push('--idle', String(o.idle));
  if (o.port) args.push('--port', String(o.port));
  if (o.html) args.push('--html', path.resolve(o.html));
  const child = spawn(process.execPath, args, {detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true});
  const timer = setTimeout(() => { child.kill(); die('server did not start within 10 s'); }, 10e3);
  child.once('message', m => {
    clearTimeout(timer);
    child.removeAllListeners('exit');
    if (child.connected) child.disconnect();
    child.unref();
    if (!m.ok) die(m.error);
    process.stdout.write((o.json ? JSON.stringify(m.info) : describe(m.info)) + '\n');
    if (o.browser) openBrowser(m.info.url);
  });
  child.once('exit', code => { clearTimeout(timer); die(`server exited during start (code ${code})`); });
}

async function status(o) {
  const list = await survey(0, null);
  if (o.json) return process.stdout.write(JSON.stringify({range: RANGE, servers: list}, null, 2) + '\n');
  if (!list.length) return process.stdout.write(`No DeckJSON server is running (ports ${RANGE}).\n`);
  for (const s of list) {
    process.stdout.write(`${s.port}  ${s.ok ? 'running' : 'NOT RESPONDING'}  pid ${s.pid}  ${s.folder}\n`);
    if (!s.ok) continue;
    for (const t of s.tabs) process.stdout.write(`      tab   ${t.title || '(untitled)'}${t.file ? '  ' + t.file : ''}\n`);
    for (const d of s.decks) process.stdout.write(`      deck  ${d.file}  read ${d.read}, saved ${d.saved}\n`);
  }
  process.stdout.write(`Status page: http://127.0.0.1:${list.find(s => s.ok)?.port || PORTS[0]}/__status\n`);
}

async function stop(o) {
  const want = o._[0];
  if (!want) die(`usage: ${SELF} stop <port|all>`);
  const reg = readRegistry();
  const targets = want === 'all' ? reg : reg.filter(e => e.port === Number(want));
  if (!targets.length) die(want === 'all' ? 'no DeckJSON server is running' : `no DeckJSON server registered on port ${want}`);
  let bad = 0;
  for (const e of targets) {
    const r = await request(e.port, 'POST', '/__stop', 1500);
    if (r && r.status === 200) { process.stdout.write(`stopped ${e.port}\n`); continue; }
    if (!pidAlive(e.pid)) { removeRegistry(e.port, e.pid); process.stdout.write(`${e.port} was already gone; cleared its entry\n`); continue; }
    bad++; process.stderr.write(`port ${e.port} (pid ${e.pid}) did not respond\n`);
  }
  process.exitCode = bad ? 1 : 0;
}

const HELP = `DeckJSON server ${SERVER_VERSION}

  ${SELF} start [FOLDER|FILE.deck] [--open FILE] [--browser] [--idle MIN] [--json]
      Start a server in the background on the first free port ${RANGE} and print its URL.
      FOLDER is readable under /files/ and is the only place POST /save can write.
  ${SELF} serve ...     Same options, but stay in the foreground (Ctrl+C stops it).
  ${SELF} status [--json]
  ${SELF} stop <PORT|all>

  --open FILE   file to open, relative to FOLDER (URL gets ?open=FILE)
  --browser     also open the URL in the default browser
  --idle MIN    stop after MIN minutes with no request (default ${DEFAULT_IDLE_MIN}; 0 = never)
  --port N      use exactly this port instead of ${RANGE}
  --html PATH   deckjson.html to serve (default: next to this script)
`;

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = parseArgs(rest);
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help' || o.help) return process.stdout.write(HELP);
  if (cmd === 'start') return start(o);
  if (cmd === 'serve') return serve(o);
  if (cmd === 'status') return status(o);
  if (cmd === 'stop') return stop(o);
  die(`unknown command "${cmd}" (see: ${SELF} help)`);
})();
