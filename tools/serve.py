#!/usr/bin/env python3
"""開發用的本機伺服器：與 python3 -m http.server 相同，但每個回應都帶 Cache-Control: no-cache，
並可選擇掛載其他資料夾（唯讀）與接收存檔。

    python3 tools/serve.py [port] [目錄] [--mount /前綴=資料夾 ...] [--save 資料夾]

    port、目錄       預設 8111、repo 根目錄
    --mount /x=DIR   把 DIR 唯讀掛在 /x/ 底下，可重複。讓頁面直接 fetch 別處的檔，例如
                     DJ.addImage(page, '/x/figures/a.png') 或 DJ.load(await fetch('/x/a.deck').then(r => r.blob()))，
                     不必先把檔案搬進網站根目錄
    --save DIR       接受 POST /save?n=<檔名>，把請求本體寫成 DIR/<檔名>（只取檔名、不含路徑）。
                     例：fetch('/save?n=a.deck', {method: 'POST', body: await DJ.toBlob()})

為什麼不直接用 http.server：它不送任何快取標頭，Chrome 就用「啟發式新鮮度」自己決定舊檔還能
用多久（約為檔案年齡的一成）。主程式拆成 src/app/ 底下幾十個檔之後，重新整理只會向伺服器驗證
主頁面，其餘 script 可能直接拿快取——改過的檔拿到新版、沒被驗證到的拿到舊版，混在一起就是
「Identifier 'X' has already been declared」這類只在開發時出現的假錯誤（2026-09-23 實際踩到：
常數從 render/stage.js 搬到 model/deck.js 後，舊的 stage.js 仍從快取載入）。
no-cache 不是不快取，是每次用之前都要先問伺服器；沒改過的檔回 304，成本很低。

掛載與存檔讓瀏覽器碰得到本機的其他檔案，所以只給同一個網站用：
- 只聽 127.0.0.1，區網內其他人連不進來
- 檢查 Host 標頭：只接受 localhost／127.0.0.1。擋 DNS rebinding——別的網站把自己的網域
  解析到 127.0.0.1，就能以「同源」身分讀這裡的檔
- 不送 CORS 標頭：別的網站的頁面讀不到回應內容
- POST 檢查 Origin：瀏覽器對跨站的簡單 POST 不先問就直接送出，只靠 CORS 擋不住寫入
"""
import argparse
import functools
import http.server
import json
import os
import pathlib
import urllib.parse


class Handler(http.server.SimpleHTTPRequestHandler):
    mounts = []        # [(前綴, 資料夾)]，長的前綴先比
    save_dir = None
    port = 0

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def host_ok(self):
        host = (self.headers.get('Host') or '').lower()
        return host in (f'localhost:{self.port}', f'127.0.0.1:{self.port}')

    def translate_path(self, path):
        p = urllib.parse.urlsplit(path).path
        for prefix, root in self.mounts:
            if p == prefix or p.startswith(prefix + '/'):
                # 交給父類別處理百分比編碼與 ..／. 的剔除，只把根目錄換成掛載的資料夾
                saved = self.directory
                self.directory = root
                try:
                    return super().translate_path(path[len(prefix):] or '/')
                finally:
                    self.directory = saved
        return super().translate_path(path)

    def send_head(self):
        if not self.host_ok():
            self.send_error(403, 'Host not allowed')
            return None
        return super().send_head()

    def do_POST(self):
        if not self.host_ok():
            return self.send_error(403, 'Host not allowed')
        origin = self.headers.get('Origin')
        if origin is not None and origin not in (f'http://localhost:{self.port}', f'http://127.0.0.1:{self.port}'):
            return self.send_error(403, 'Origin not allowed')
        u = urllib.parse.urlsplit(self.path)
        if u.path != '/save' or not self.save_dir:
            return self.send_error(404, 'POST /save is not enabled (start with --save DIR)')
        name = os.path.basename(urllib.parse.parse_qs(u.query).get('n', [''])[0])
        if not name or name.startswith('.'):
            return self.send_error(400, 'need ?n=<file name>')
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        (self.save_dir / name).write_bytes(body)
        out = json.dumps({'saved': str(self.save_dir / name), 'bytes': len(body)}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    ap = argparse.ArgumentParser(description='DeckJSON dev server (no-cache, optional read-only mounts and save endpoint)')
    ap.add_argument('port', nargs='?', type=int, default=8111)
    ap.add_argument('root', nargs='?', default=str(pathlib.Path(__file__).resolve().parent.parent))
    ap.add_argument('--mount', action='append', default=[], metavar='/PREFIX=DIR')
    ap.add_argument('--save', metavar='DIR')
    a = ap.parse_args()
    mounts = []
    for m in a.mount:
        prefix, sep, d = m.partition('=')
        prefix = '/' + prefix.strip('/')
        d = pathlib.Path(d).expanduser().resolve()
        if not sep or prefix == '/' or not d.is_dir():
            ap.error(f'--mount needs /PREFIX=EXISTING_DIR, got {m!r}')
        mounts.append((prefix, str(d)))
    Handler.mounts = sorted(mounts, key=lambda m: -len(m[0]))
    if a.save:
        Handler.save_dir = pathlib.Path(a.save).expanduser().resolve()
        if not Handler.save_dir.is_dir():
            ap.error(f'--save needs an existing directory, got {a.save!r}')
    Handler.port = a.port
    root = pathlib.Path(a.root).resolve()
    handler = functools.partial(Handler, directory=str(root))
    with http.server.ThreadingHTTPServer(('127.0.0.1', a.port), handler) as httpd:
        print(f'serving {root} at http://localhost:{a.port}/ (Cache-Control: no-cache)', flush=True)
        for prefix, d in Handler.mounts:
            print(f'  {prefix}/ -> {d} (read-only)', flush=True)
        if Handler.save_dir:
            print(f'  POST /save?n=<name> -> {Handler.save_dir}/', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
