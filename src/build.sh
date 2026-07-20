#!/bin/bash
# 將「src/」的 index.html 與 vendor/*.js 打包成單一成品 HTML
# 輸出到專案根目錄的 deckjson.html（＝平常使用的那個檔），直接覆蓋更新
# 用法：bash build.sh
cd "$(dirname "$0")"
python3 - <<'EOF'
import re, pathlib
src = pathlib.Path('index.html').read_text(encoding='utf-8')

def inline(m):
    path = pathlib.Path(m.group(1))
    js = path.read_text(encoding='utf-8')
    # </script> 出現在字串常數中會提前終結標籤，防禦性斷開
    js = js.replace('</script>', '<\\/script>')
    return '<script>\n' + js + '\n</script>'

out = re.sub(r'<script src="(vendor/[^"]+)"></script>', inline, src)
dst = pathlib.Path('..') / 'deckjson.html'
dst.write_text(out, encoding='utf-8')
print(f'built: {dst.resolve()} ({dst.stat().st_size/1024/1024:.2f} MB)')
EOF
