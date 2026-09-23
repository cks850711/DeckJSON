#!/usr/bin/env python3
"""開發用的本機伺服器：與 python3 -m http.server 相同，但每個回應都帶 Cache-Control: no-cache。

    python3 tools/serve.py [port] [目錄]        預設 8111、repo 根目錄

為什麼不直接用 http.server：它不送任何快取標頭，Chrome 就用「啟發式新鮮度」自己決定舊檔還能
用多久（約為檔案年齡的一成）。主程式拆成 src/app/ 底下幾十個檔之後，重新整理只會向伺服器驗證
主頁面，其餘 script 可能直接拿快取——改過的檔拿到新版、沒被驗證到的拿到舊版，混在一起就是
「Identifier 'X' has already been declared」這類只在開發時出現的假錯誤（2026-09-23 實際踩到：
常數從 render/stage.js 搬到 model/deck.js 後，舊的 stage.js 仍從快取載入）。
no-cache 不是不快取，是每次用之前都要先問伺服器；沒改過的檔回 304，成本很低。

只聽 127.0.0.1，不讓區網內其他人連進來。
"""
import functools
import http.server
import pathlib
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8111
    root = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parent.parent
    handler = functools.partial(NoCacheHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'serving {root} at http://localhost:{port}/ (Cache-Control: no-cache)', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
