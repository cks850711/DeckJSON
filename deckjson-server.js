#!/usr/bin/env node
/* DeckJSON 伺服器：給 AI 代理（以及需要的人）一個固定網址開 DeckJSON，並把簡報直接存回硬碟；
   也負責安裝人類用的 DJ App。只用 Node 內建模組，不必 npm install；放在 deckjson.html 旁邊即可。

     node deckjson-server.js install       安裝到 ~/.deckjson/app/，並開 Chrome 引導安裝 DJ App
     node deckjson-server.js uninstall     關掉所有伺服器並移除 ~/.deckjson
     node deckjson-server.js start [資料夾或 .deck 檔] [--open 檔名] [--browser] [--idle 分鐘] [--json]
     node deckjson-server.js status [--json]
     node deckjson-server.js stop <port|all>
     node deckjson-server.js serve …   參數同 start，但在前景執行（關掉終端機即停止）
     node deckjson-server.js app [--browser]   只啟動 DJ App 的安裝伺服器（47121）

   人類與 AI 分開兩套（見下），各自的暫存一個蘿蔔一個坑：
   - AI：47111～47115，一個工作一個 port。
   - 人類：47121 的 DJ App。Chrome／Edge 把它安裝成 App 後，雙擊 .deck 就以 App 開啟、Cmd/Ctrl+S 寫回原檔；
     App 內分 5 個槽位各自自動存檔。App 的程式由 service worker 快取，這個伺服器只在安裝與更新時需要，
     平常沒在跑也能開。

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
const {spawn, spawnSync} = require('child_process');
const {pipeline} = require('stream/promises');
const {Transform} = require('stream');

const SERVER_VERSION = '0.3.2';
const SCRIPT = path.resolve(__filename);
const HOME = process.env.DECKJSON_HOME || path.join(os.homedir(), '.deckjson');
const REG_DIR = path.join(HOME, 'servers');
const LOG_DIR = path.join(HOME, 'logs');
const INSTALL_DIR = path.join(HOME, 'app');
const APP_PORT = Number(process.env.DECKJSON_APP_PORT) || 47121;
const APP_IDLE_MIN = 10;
if (+process.versions.node.split('.')[0] < 18) {
  process.stderr.write(`deckjson-server: needs Node.js 18 or newer (this is ${process.version}); get the LTS version from https://nodejs.org\n`);
  process.exit(1);
}
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
    else if (a === '--no-browser') o.browser = false;
    else if (a === '--app') o.app = true;
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
  if (info.mode === 'app') return [
    `DJ App server ready on port ${info.port}`,
    `  install page: ${info.url}  (open it in Chrome or Edge)`,
    `  stops by itself after ${info.idleMin} min idle; the installed App keeps working without it`,
  ].join('\n');
  const u = urls(info.port, info.open);
  return [
    `DeckJSON server ready on port ${info.port}`,
    `  open:   ${u.url}`,
    `  folder: ${info.folder}`,
    info.open ? `  file:   ${info.open}${info.openExists ? '' : '  (does not exist yet)'}` : null,
    `  save:   DJ.save() writes the open file back; DJ.save({as: 'name.deck'}) saves a new file into the folder`,
    `  status: ${u.status}`,
    `  stop:   ${SELF} stop ${info.port}` + (info.idleMin ? `  (stops by itself after ${info.idleMin} min with no page open)` : ''),
  ].filter(Boolean).join('\n');
}

/* 安裝頁要用 Chrome／Edge 開（Safari、Firefox 不能把網頁裝成 App），找不到才用預設瀏覽器 */
function openInstallBrowser(url) {
  const tryRun = (cmd, args) => spawnSync(cmd, args, {stdio: 'ignore'}).status === 0;
  if (process.platform === 'darwin') {
    if (tryRun('open', ['-a', 'Google Chrome', url]) || tryRun('open', ['-a', 'Microsoft Edge', url])) return true;
  } else if (process.platform === 'win32') {
    if (tryRun('cmd', ['/c', 'start', '', 'chrome', url]) || tryRun('cmd', ['/c', 'start', '', 'msedge', url])) return true;
  } else {
    for (const b of ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'chromium']) {
      try { spawn(b, [url], {stdio: 'ignore', detached: true}).on('error', () => {}).unref(); return true; } catch { /* 下一個 */ }
    }
  }
  openBrowser(url);
  return false;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, {stdio: 'ignore', detached: true}).unref(); } catch { /* 開不了就算了，網址已印出 */ }
}

/* ---------------- DJ App（PWA）的檔案 ---------------- */

/* 伺服器送出 deckjson.html 時在 <head> 開頭注入 window.DJ_HOST，DJ 開機就同步知道自己由誰提供、
   要不要走伺服器存檔或槽位——不必先送一個請求去問。直接雙擊開的 deckjson.html 沒有這段，行為不變。
   App 模式另外掛上 manifest：Chrome 要在頁面上看到它才會提供「安裝」。 */
function injectHost(html, host, app) {
  const js = JSON.stringify(host).replace(/</g, '\\u003c');
  const tags = (app ? '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#131418">' +
    '<link rel="icon" href="/icon-192.png">' : '') + `<script>window.DJ_HOST=${js};</script>`;
  const i = html.indexOf('<head>');
  return i < 0 ? tags + html : html.slice(0, i + 6) + tags + html.slice(i + 6);
}

const MANIFEST = JSON.stringify({
  id: '/', name: 'DeckJSON', short_name: 'DeckJSON', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#131418', theme_color: '#131418',
  icons: [
    {src: '/icon-192.png', sizes: '192x192', type: 'image/png'},
    {src: '/icon-512.png', sizes: '512x512', type: 'image/png'},
    {src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
  ],
  // multiple-clients：每次雙擊各開一個視窗，各自選槽位。2026-10-01 原型實測：Chrome 154／macOS 會把 .deck
  // 登記進 App 殼的文件類型，第一次雙擊問一次「要在這個網頁應用程式中開啟並編輯嗎」，之後拿到的把手已可寫
  file_handlers: [{action: '/', accept: {'application/x-deckjson': ['.deck']}, launch_type: 'multiple-clients'}],
}, null, 1);

/* service worker：只攔 DJ App 自己的幾個檔，其餘（安裝頁、狀態頁、別的程式）一律放行。
   先問伺服器、問不到才用快取：伺服器在跑時（安裝或更新）拿到新版，沒在跑時照樣開得起來。
   回應要帶 X-DeckJSON: app 才收進快取——日後 47121 被別的程式佔走，也不會把它的頁面當成 DJ 存起來。 */
const SW = `'use strict';
const CACHE = 'deckjson-app-${SERVER_VERSION}';
const FILES = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('deckjson-app-') && k !== CACHE)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const key = u.pathname === '/deckjson.html' ? '/' : u.pathname;
  if (!FILES.includes(key)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(key, {cache: 'no-store', signal: ctl.signal});
      clearTimeout(t);
      if (r.ok && r.headers.get('X-DeckJSON') === 'app') { await cache.put(key, r.clone()); return r; }
    } catch (err) { /* 伺服器沒在跑 */ }
    return (await cache.match(key)) || Response.error();
  })());
});
`;

/* 圖示用程式畫，不另外放圖檔：藍底圓角方塊上一張投影片（標題列、兩行字、一個色塊）。
   maskable 版滿版無圓角、內容縮進中央安全區，給 Android／Windows 自己裁形狀用。 */
function iconPng(size, maskable) {
  const box = (x, y, bx, by, bw, bh, r) => {
    if (x < bx || y < by || x > bx + bw || y > by + bh) return false;
    const dx = Math.max(bx + r - x, 0, x - (bx + bw - r)), dy = Math.max(by + r - y, 0, y - (by + bh - r));
    return dx * dx + dy * dy <= r * r;
  };
  const c0 = maskable ? 0.25 : 0.19, cw = 1 - 2 * c0;              // 內容區
  const sx = c0, sy = 0.5 - cw * 0.33, sw = cw, sh = cw * 0.66;     // 投影片
  const rel = (x, y, w, h) => [sx + x * sw, sy + y * sh, w * sw, h * sh];
  const parts = [
    [rel(0.1, 0.17, 0.56, 0.14), [28, 30, 36]],
    [rel(0.1, 0.45, 0.8, 0.08), [154, 163, 175]],
    [rel(0.1, 0.62, 0.58, 0.08), [154, 163, 175]],
    [rel(0.74, 0.62, 0.16, 0.2), [242, 184, 75]],
  ];
  const color = (x, y) => {
    if (!maskable && !box(x, y, 0, 0, 1, 1, 0.22)) return null;
    if (box(x, y, sx, sy, sw, sh, 0.035)) {
      for (const [[px, py, pw, ph], c] of parts) if (box(x, y, px, py, pw, ph, 0.012)) return c;
      return [255, 255, 255];
    }
    return [43, 123, 208];
  };
  const raw = Buffer.alloc((size * 4 + 1) * size), S = 3;          // 每像素 3×3 取樣做反鋸齒
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const c = color((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; raw[o + 3] = 255 * a / (S * S); }
    }
  }
  const crcT = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const v of buf) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), cs = Buffer.alloc(4);
    len.writeUInt32BE(data.length); cs.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;   // 8 位元 RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', require('zlib').deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const appAssetCache = {};
function appAsset(p) {
  const make = {
    '/manifest.webmanifest': () => ({body: MANIFEST, type: 'application/manifest+json'}),
    '/sw.js': () => ({body: SW, type: 'text/javascript; charset=utf-8'}),
    '/icon-192.png': () => ({body: iconPng(192, false), type: 'image/png'}),
    '/icon-512.png': () => ({body: iconPng(512, false), type: 'image/png'}),
    '/icon-maskable.png': () => ({body: iconPng(512, true), type: 'image/png'}),
  }[p];
  return make ? (appAssetCache[p] = appAssetCache[p] || make()) : null;
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
  const app = !!o.app;            // DJ App 的安裝伺服器：沒有資料夾，不收存檔
  const {folder, open} = app ? {folder: null, open: null} : resolveTarget(o);
  const htmlPath = path.resolve(o.html || path.join(path.dirname(SCRIPT), 'deckjson.html'));
  let djVersion = null;
  try {
    const m = /const APP_VERSION='([^']+)'/.exec(fs.readFileSync(htmlPath, 'utf8'));
    djVersion = m && m[1];
  } catch { fail(`deckjson.html not found next to the server (${htmlPath}); build it with src/build.sh or pass --html`); }
  const idleMin = o.idle != null ? o.idle : app ? APP_IDLE_MIN : DEFAULT_IDLE_MIN;
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
      app: 'deckjson-server', mode: app ? 'app' : 'server', version: SERVER_VERSION, dj: djVersion, port, pid: process.pid, folder, started,
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
        return fs.readFile(htmlPath, 'utf8', (err, html) => {
          if (err) return jerr(res, 500, 'deckjson.html is missing');
          const body = req.method === 'HEAD' ? '' : injectHost(html, app ? {mode: 'app', port, version: SERVER_VERSION}
            : {mode: 'server', port, folder, open: open || null, version: SERVER_VERSION}, app);
          send(res, 200, body, 'text/html; charset=utf-8', app ? {'X-DeckJSON': 'app'} : null);
        });
      }
      if (app) {
        const a = appAsset(p);
        if (a) return send(res, 200, req.method === 'HEAD' ? '' : a.body, a.type, {'X-DeckJSON': 'app'});
        if (p === '/install') return send(res, 200, installPage(), 'text/html; charset=utf-8');
      }
      if (p === '/__deckjson') return json(res, 200, info());
      if (p === '/__status.json') return json(res, 200, {range: RANGE, self: port, servers: await survey(port, info)});
      if (p === '/__status') return send(res, 200, statusPage(), 'text/html; charset=utf-8');
      if (p === '/favicon.ico') return send(res, 204, '', 'text/plain');
      if (p.startsWith('/files/') && !app) {
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

    if (p === '/save' && !app) return save(req, res, u);
    if (p === '/__ping' && !app) {
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
  const candidates = o.port ? [o.port] : app ? [APP_PORT] : PORTS;
  for (const c of candidates) { if (!(await tryListen(c))) { port = c; break; } }
  if (!port) {
    const reg = readRegistry();
    const who = candidates.map(c => { const e = reg.find(r => r.port === c);
      return `  ${c}: ${e ? `DeckJSON, ${e.folder} (pid ${e.pid})` : 'another program'}`; }).join('\n');
    const live = reg.find(r => candidates.includes(r.port));
    if (app) fail(`port ${candidates[0]} for the DJ App is used by another program; close it and try again`);
    fail(`${o.port ? `port ${o.port} is` : `all DeckJSON ports (${RANGE}) are`} in use:\n${who}\n` +
      `Ask the user to stop one they no longer need: ${SELF} stop <port>` + (live ? `, or the status page http://127.0.0.1:${live.port}/__status` : ''));
  }

  fs.mkdirSync(REG_DIR, {recursive: true});
  const regFile = path.join(REG_DIR, `${port}.json`);
  const regTmp = regFile + `.${process.pid}.tmp`;
  fs.writeFileSync(regTmp, JSON.stringify({app: 'deckjson-server', mode: app ? 'app' : 'server', port, pid: process.pid, folder, started, version: SERVER_VERSION}));
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

  const ready = app ? {mode: 'app', port, idleMin, pid: process.pid, url: `http://127.0.0.1:${port}/install`}
    : {mode: 'server', port, folder, open: open || null, openExists: !!open && fs.existsSync(path.join(folder, open)), idleMin,
      pid: process.pid, ...urls(port, open)};
  if (o.detached && process.send) {
    fs.mkdirSync(LOG_DIR, {recursive: true});
    logOut = fs.createWriteStream(path.join(LOG_DIR, `${port}.log`), {flags: 'w'});
    log(`started pid ${process.pid}, ${app ? 'DJ App' : 'folder ' + folder}`);
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
  down:'這個伺服器已經關閉，狀態無法更新。請從另一個 port 的 /__status 查看。',
  appBadge:'DJ App 安裝伺服器',appDesc:'提供 DJ App 的安裝與更新；App 裝好後不需要它在跑。',install:'安裝頁'},
 en:{title:'DeckJSON servers',sub:'Ports for AI agents: {r}; {n} in use. Each port is a separate job with its own autosave.',
  self:'this page',bad:'not responding',open:'Open DeckJSON',stop:'Stop',started:'started {t}',idle:'stops by itself after {m} min with no page open',
  noIdle:'never stops by itself',tabs:'Open tabs',noTabs:'no tab has reported',decks:'Decks read and saved',noDecks:'no deck read or saved yet',
  read:'read {n}×',saved:'saved {n}×',last:'last {t}',untitled:'(untitled)',empty:'No DeckJSON server is running.',
  down:'This server has stopped, so this page can no longer update. Open /__status on another port.',
  appBadge:'DJ App installer',appDesc:'Serves DJ App installs and updates; the installed app does not need it running.',install:'Install page'}};
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
    sv.mode==='app'? h('span',{className:'badge',textContent:L.appBadge}) : null,
    sv.self? h('span',{className:'badge self',textContent:L.self}) : null,
    sv.ok? null : h('span',{className:'badge bad',textContent:L.bad}),
    h('span',{className:'grow'}),
    sv.ok? h('a',{href:'http://127.0.0.1:'+sv.port+(sv.mode==='app'?'/install':'/'),target:'_blank',textContent:sv.mode==='app'?L.install:L.open}) : null,
    h('button',{textContent:L.stop,onclick:()=>stop(sv.port)}));
  if(sv.mode==='app') return h('div',{className:'card'},head,h('div',{className:'meta',textContent:L.appDesc}));
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
  s.textContent=f(L.sub,{r:d.range,n:d.servers.filter(x=>x.mode!=='app').length});
  list.replaceChildren(...(d.servers.length? d.servers.map(card) : [h('div',{className:'empty',textContent:L.empty})]));
}
tick(); setInterval(tick,3000);
</script></body></html>`;
}

/* ---------------- 安裝頁 ---------------- */

/* 人類第一次看到的說明書：install 指令開 Chrome 到這一頁，逐步帶過安裝、第一次雙擊、槽位與之後的事。
   頁面本身也掛 manifest 並註冊 service worker，Chrome 才會在這一頁提供安裝。 */
function installPage() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#131418"><link rel="icon" href="/icon-192.png">
<title>Install DeckJSON</title>
<style>
:root{--bg:#131418;--panel:#1c1e24;--raised:#262a33;--line:#2b2e37;--fg:#e6e8ec;--dim:#8b909c;--mute:#5d626d;
  --accent:#4d9de0;--danger:#e0625d;--warn:#e0b34d;--ok:#5fbf7f;--r:6px;--r-lg:9px;
  --ui:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme: light){:root{--bg:#f4f5f7;--panel:#fff;--raised:#eef0f3;--line:#dfe2e7;--fg:#1d2026;--dim:#5d6470;--mute:#8b909c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 var(--ui)}
main{max-width:720px;margin:0 auto;padding:32px 16px 56px}
header{display:flex;gap:14px;align-items:center;margin-bottom:8px}
header img{width:52px;height:52px}
h1{font-size:22px;margin:0}
.sub{color:var(--dim);margin:0 0 24px}
.step{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 18px;margin-bottom:12px}
.step h2{font-size:15px;margin:0 0 6px;display:flex;gap:10px;align-items:center}
.num{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--raised);font-size:13px;flex:none}
.done .num{background:var(--ok);color:#10301c}
.step p{margin:6px 0;color:var(--dim)}
.step p b{color:var(--fg);font-weight:600}
.msg{margin:8px 0 0;padding:8px 12px;border-radius:var(--r);background:var(--raised);font-size:14px}
.msg.ok{color:var(--ok)}.msg.warn{color:var(--warn)}.msg.bad{color:var(--danger)}
button{font:600 15px var(--ui);color:#fff;background:var(--accent);border:0;border-radius:var(--r);padding:8px 18px;cursor:pointer;margin-top:6px}
button[disabled]{opacity:.45;cursor:default}
code{font:13px var(--mono);background:var(--raised);padding:1px 6px;border-radius:4px;word-break:break-all}
details{margin-top:6px;color:var(--dim)}
summary{cursor:pointer}
a{color:var(--accent)}
[hidden]{display:none!important}
</style></head><body><main>
<header><img src="/icon-192.png" alt=""><h1 data-k="title"></h1></header>
<p class="sub" data-k="sub"></p>
<div class="step" id="s1"><h2><span class="num">1</span><span data-k="s1"></span></h2><div id="browserMsg" class="msg"></div></div>
<div class="step" id="s2"><h2><span class="num">2</span><span data-k="s2"></span></h2>
  <p data-k="s2p"></p><button id="btnInstall" disabled data-k="install"></button>
  <div id="installMsg" class="msg" hidden></div>
  <details><summary data-k="s2more"></summary><p data-k="s2manual"></p></details></div>
<div class="step"><h2><span class="num">3</span><span data-k="s3"></span></h2><p data-k="s3p"></p>
  <details><summary data-k="s3more"></summary><p data-k="s3mac"></p><p data-k="s3win"></p></details></div>
<div class="step"><h2><span class="num">4</span><span data-k="s4"></span></h2><p data-k="s4p"></p>
  <details><summary data-k="s4more"></summary><p data-k="s4tab"></p></details></div>
<div class="step"><h2><span class="num">5</span><span data-k="s5"></span></h2><p data-k="s5p"></p>
  <details><summary data-k="s5more"></summary><p data-k="s5un"></p></details></div>
</main><script>
'use strict';
const STR={
 zh:{title:'安裝 DeckJSON App',
  sub:'裝好之後，雙擊 .deck 就會用 DeckJSON 開啟，按 Cmd/Ctrl+S 直接存回原檔。程式和簡報都留在你的電腦裡，不連網也能用。',
  s1:'用 Chrome 或 Edge 打開這一頁',okBrowser:'✓ 這個瀏覽器可以安裝。',
  badBrowser:'這個瀏覽器不能把網頁裝成 App（Safari、Firefox 都不行）。請把這一頁的網址 <code>http://127.0.0.1:${APP_PORT}/install</code> 貼到 Chrome 或 Edge 打開。',
  inApp:'✓ 你已經在 DeckJSON App 裡了。<a href="/">開始使用</a>',
  s2:'安裝',s2p:'按下面的按鈕，瀏覽器會問一次要不要安裝，按「安裝」。',install:'安裝 DeckJSON',
  waiting:'按鈕沒有亮起來？可能已經裝過了，或瀏覽器還在準備。也可以看下面的手動方式。',
  installed:'✓ 已安裝。Dock（Windows 是開始選單）多了 DeckJSON 圖示，可以接著做第 3 步。',
  dismissed:'這次沒有安裝。準備好時再按一次按鈕。',
  s2more:'按鈕一直沒亮？',
  s2manual:'按網址列右邊的「安裝」圖示（一個螢幕加箭頭的符號），或打開瀏覽器選單（⋮）找「安裝」相關的選項。如果選單裡顯示的是「開啟 DeckJSON」，代表已經裝好了。',
  s3:'雙擊一個 .deck 檔',
  s3p:'第一次會問「要在這個網頁應用程式中開啟並編輯…嗎？」。<b>勾「記住我對以下檔案類型的選擇」</b>再按「開啟」，以後雙擊就不再問。接著選一個槽位（見第 4 步）。',
  s3more:'雙擊後被別的程式打開？',
  s3mac:'<b>macOS：</b>在 .deck 上按右鍵 →「打開檔案的應用程式」→ DeckJSON。想每次都用它開：選檔案 →「取得資訊」→「打開檔案的應用程式」選 DeckJSON →「全部更改」。',
  s3win:'<b>Windows：</b>在 .deck 上按右鍵 →「開啟檔案」→「選擇其他應用程式」→ DeckJSON，勾「一律使用此應用程式」。',
  s4:'槽位',
  s4p:'App 有 <b>5 個槽位</b>，各自保留一份自動存檔：當機、誤關視窗都救得回來。同一個槽位不能在兩個視窗同時開；要同時編兩份簡報，就開在不同槽位。直接從 Dock 打開 App 時，可以選一個槽位接著做。',
  s4more:'想開在 Chrome 分頁，不要另開視窗？',
  s4tab:'在 Chrome 網址列打開 <code>chrome://app-settings/lnglegmncciaelonbmmmhehgdbccjmdd</code>（DeckJSON 的設定頁），關掉「<b>在視窗中開啟</b>」。雙擊 .deck 照樣會用 DeckJSON 開，只是開在 Chrome 的分頁裡；槽位與 Cmd/Ctrl+S 存回原檔都不變。',
  s5:'之後',
  s5p:'裝好後這個安裝程式可以關掉（閒置 10 分鐘也會自己結束），App 照樣能開。要更新 DeckJSON，下載新版後再執行一次安裝程式。',
  s5more:'怎麼移除？',
  s5un:'在 App 視窗右上角的選單（⋮）選「解除安裝 DeckJSON」，勾「同時清除資料」會一併刪掉槽位裡的自動存檔。再在終端機執行 <code>node ~/.deckjson/app/deckjson-server.js uninstall</code> 移除其餘檔案。'},
 en:{title:'Install the DeckJSON App',
  sub:'Once installed, double-clicking a .deck opens it in DeckJSON, and Cmd/Ctrl+S saves straight back to the file. The app and your decks stay on your computer and work offline.',
  s1:'Open this page in Chrome or Edge',okBrowser:'✓ This browser can install it.',
  badBrowser:'This browser cannot install web apps (Safari and Firefox cannot). Paste this address into Chrome or Edge: <code>http://127.0.0.1:${APP_PORT}/install</code>',
  inApp:'✓ You are already in the DeckJSON App. <a href="/">Start</a>',
  s2:'Install',s2p:'Press the button below. The browser asks once whether to install; choose “Install”.',install:'Install DeckJSON',
  waiting:'Button still grey? It may already be installed, or the browser is still getting ready. See the manual way below.',
  installed:'✓ Installed. DeckJSON now has an icon in the Dock (the Start menu on Windows). Go on to step 3.',
  dismissed:'Not installed this time. Press the button again when ready.',
  s2more:'Button never turns on?',
  s2manual:'Click the “Install” icon at the right end of the address bar (a screen with an arrow), or look for an install item in the browser menu (⋮). If the menu says “Open DeckJSON”, it is already installed.',
  s3:'Double-click a .deck file',
  s3p:'The first time, the browser asks whether to open and edit it in this web app. <b>Tick “Remember my choice for this file type”</b>, then choose “Open”; later double-clicks will not ask. Then pick a slot (step 4).',
  s3more:'Opens in another program?',
  s3mac:'<b>macOS:</b> right-click the .deck → Open With → DeckJSON. To make it the default: select the file → Get Info → Open with: DeckJSON → Change All.',
  s3win:'<b>Windows:</b> right-click the .deck → Open with → Choose another app → DeckJSON, and tick “Always use this app”.',
  s4:'Slots',
  s4p:'The app has <b>5 slots</b>, each with its own autosave, so a crash or a closed window loses nothing. One slot cannot be open in two windows at once; to edit two decks side by side, use two slots. Opening the app from the Dock lets you pick a slot to continue.',
  s4more:'Rather open decks in Chrome tabs than in separate windows?',
  s4tab:'Open <code>chrome://app-settings/lnglegmncciaelonbmmmhehgdbccjmdd</code> (the DeckJSON settings page) in the address bar and turn off “<b>Open in window</b>”. Double-clicking a .deck still opens it in DeckJSON, just in a Chrome tab; slots and Cmd/Ctrl+S saving back to the file stay the same.',
  s5:'Afterwards',
  s5p:'You can close this installer now (it also stops by itself after 10 idle minutes); the app keeps working without it. To update DeckJSON, download the new version and run the installer again.',
  s5more:'How do I remove it?',
  s5un:'In the app window menu (⋮) choose “Uninstall DeckJSON”; ticking “Also clear data” deletes the slot autosaves too. Then run <code>node ~/.deckjson/app/deckjson-server.js uninstall</code> in a terminal to remove the remaining files.'}};
const q=new URLSearchParams(location.search).get('lang');
const lang=q? (q.startsWith('zh')?'zh':'en') : ((navigator.language||'').startsWith('zh')?'zh':'en');
const L=STR[lang];
document.documentElement.lang=lang==='zh'?'zh-Hant':'en';
document.title=L.title;
for(const e of document.querySelectorAll('[data-k]')) e.innerHTML=L[e.dataset.k];
const msg=(id,cls,html)=>{ const e=document.getElementById(id); e.hidden=false; e.className='msg '+cls; e.innerHTML=html; };
const brands=(navigator.userAgentData&&navigator.userAgentData.brands||[]).map(b=>b.brand).join(' ');
const capable=/Google Chrome|Microsoft Edge|Chromium/.test(brands);
if(matchMedia('(display-mode: standalone)').matches) msg('browserMsg','ok',L.inApp);
else if(capable){ msg('browserMsg','ok',L.okBrowser); document.getElementById('s1').classList.add('done'); }
else msg('browserMsg','bad',L.badBrowser);
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
let prompt=null;
const btn=document.getElementById('btnInstall');
addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); prompt=e; btn.disabled=false; document.getElementById('installMsg').hidden=true; });
addEventListener('appinstalled',()=>{ btn.disabled=true; msg('installMsg','ok',L.installed); document.getElementById('s2').classList.add('done'); });
btn.onclick=async()=>{ if(!prompt) return; prompt.prompt(); const r=await prompt.userChoice; prompt=null; btn.disabled=true;
  if(r.outcome!=='accepted') msg('installMsg','warn',L.dismissed); };
if(capable) setTimeout(()=>{ if(!prompt&&btn.disabled&&document.getElementById('installMsg').hidden) msg('installMsg','warn',L.waiting); },4000);
</script></body></html>`;
}

/* ---------------- 指令 ---------------- */

/* 在背景啟動一個 serve 程序，等它回報 port 再返回 */
function spawnServer(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, 'serve', ...args, '--detached'],
      {detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true});
    const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start within 10 s')); }, 10e3);
    child.once('message', m => {
      clearTimeout(timer);
      child.removeAllListeners('exit');
      if (child.connected) child.disconnect();
      child.unref();
      m.ok ? resolve(m.info) : reject(new Error(m.error));
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited during start (code ${code})`)); });
  });
}

async function start(o) {
  const {folder, open} = resolveTarget(o);
  const args = [folder];
  if (open) args.push('--open', open);
  if (o.idle != null) args.push('--idle', String(o.idle));
  if (o.port) args.push('--port', String(o.port));
  if (o.html) args.push('--html', path.resolve(o.html));
  let info;
  try { info = await spawnServer(SCRIPT, args); } catch (e) { die(e.message); }
  process.stdout.write((o.json ? JSON.stringify(info) : describe(info)) + '\n');
  if (o.browser) openBrowser(info.url);
}

/* DJ App 的安裝伺服器：47121 已經是 DeckJSON 的 App 伺服器就沿用（換新版時先關舊的） */
async function startApp(script, o, replace) {
  const r = await request(APP_PORT, 'GET', '/__deckjson', 800);
  const ours = r && r.json && r.json.app === 'deckjson-server' && r.json.mode === 'app';
  if (ours && replace) {
    await request(APP_PORT, 'POST', '/__stop', 1500);
    for (let i = 0; i < 20 && await request(APP_PORT, 'GET', '/__deckjson', 300); i++) await new Promise(res => setTimeout(res, 100));
  } else if (ours) {
    return {mode: 'app', port: APP_PORT, idleMin: r.json.idleMin, pid: r.json.pid, url: `http://127.0.0.1:${APP_PORT}/install`};
  }
  const args = ['--app'];
  if (o.idle != null) args.push('--idle', String(o.idle));
  if (o.html) args.push('--html', path.resolve(o.html));
  return spawnServer(script, args);
}

async function appCmd(o) {
  let info;
  try { info = await startApp(SCRIPT, o, false); } catch (e) { die(e.message); }
  process.stdout.write((o.json ? JSON.stringify(info) : describe(info)) + '\n');
  if (o.browser) openInstallBrowser(info.url);
}

/* 安裝：把 deckjson.html 與這支伺服器複製到固定位置 ~/.deckjson/app/。
   固定位置的用處是讓 AI 與 skill 寫得出路徑（node ~/.deckjson/app/deckjson-server.js start …），
   不必知道使用者把下載的 zip 解壓到哪。再執行一次就是更新。 */
async function install(o) {
  const srcDir = path.dirname(SCRIPT), html = path.join(srcDir, 'deckjson.html');
  if (!fs.existsSync(html)) die(`deckjson.html is missing next to ${path.basename(SCRIPT)}; keep the two files in the same folder`);
  const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const same = real(srcDir) === real(INSTALL_DIR);   // macOS 的 /var 是 /private/var 的捷徑，比字串會誤判
  if (!same) {
    fs.mkdirSync(INSTALL_DIR, {recursive: true});
    for (const f of ['deckjson.html', 'deckjson-server.js']) {
      const tmp = path.join(INSTALL_DIR, `.${f}.tmp`);
      fs.copyFileSync(path.join(srcDir, f), tmp);
      fs.renameSync(tmp, path.join(INSTALL_DIR, f));
    }
    const skill = path.join(srcDir, 'deckjson-skill.zip');
    if (fs.existsSync(skill)) fs.copyFileSync(skill, path.join(INSTALL_DIR, 'deckjson-skill.zip'));
  }
  const installed = path.join(INSTALL_DIR, 'deckjson-server.js');
  let info;
  try { info = await startApp(installed, o, true); } catch (e) { die(e.message); }
  const opened = o.browser === false ? false : openInstallBrowser(info.url);
  const nodeCmd = `node ${path.join(INSTALL_DIR, 'deckjson-server.js').replace(os.homedir(), '~')}`;
  process.stdout.write([
    same ? `DeckJSON ${SERVER_VERSION} is already in ${INSTALL_DIR}` : `Installed DeckJSON ${SERVER_VERSION} to ${INSTALL_DIR}`,
    ``,
    o.browser === false ? `Next: open this page in Chrome or Edge to install the DJ App:`
      : `Next: install the DJ App in the browser page that just opened${opened ? '' : ' (if it is not Chrome or Edge, paste the address into one)'}:`,
    `  ${info.url}`,
    ``,
    `For AI agents: ${nodeCmd} start <folder or file.deck>`,
    `Remove later:  ${nodeCmd} uninstall`,
  ].join('\n') + '\n');
}

async function uninstall() {
  for (const e of readRegistry()) await request(e.port, 'POST', '/__stop', 1500);
  for (const d of [INSTALL_DIR, REG_DIR, LOG_DIR]) fs.rmSync(d, {recursive: true, force: true});
  try { fs.rmdirSync(HOME); } catch { /* 還有別的東西就留著 */ }
  process.stdout.write([
    `Stopped all DeckJSON servers and removed ${INSTALL_DIR}.`,
    `To remove the DJ App itself: open it, then in the window menu (⋮) choose "Uninstall DeckJSON"`,
    `(tick "Also clear data" to delete the slot autosaves).`,
  ].join('\n') + '\n');
}

async function status(o) {
  const list = await survey(0, null);
  if (o.json) return process.stdout.write(JSON.stringify({range: RANGE, servers: list}, null, 2) + '\n');
  if (!list.length) return process.stdout.write(`No DeckJSON server is running (ports ${RANGE}).\n`);
  for (const s of list) {
    process.stdout.write(`${s.port}  ${s.ok ? 'running' : 'NOT RESPONDING'}  pid ${s.pid}  ${s.mode === 'app' ? '(DJ App installer)' : s.folder}\n`);
    if (s.mode === 'app') continue;
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

  ${SELF} install [--no-browser]
      Copy DeckJSON to ${INSTALL_DIR.replace(os.homedir(), '~')} and open the page that installs the DJ App
      (Chrome or Edge). Run it again to update.
  ${SELF} uninstall     Stop all servers and remove ${HOME.replace(os.homedir(), '~')}
  ${SELF} app [--browser]   Only start the DJ App install server on port ${APP_PORT}

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
  if (cmd === 'install') return install(o);
  if (cmd === 'uninstall') return uninstall();
  if (cmd === 'app') return appCmd(o);
  if (cmd === 'start') return start(o);
  if (cmd === 'serve') return serve(o);
  if (cmd === 'status') return status(o);
  if (cmd === 'stop') return stop(o);
  die(`unknown command "${cmd}" (see: ${SELF} help)`);
})();
