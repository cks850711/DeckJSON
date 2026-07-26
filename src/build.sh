#!/bin/bash
# 將「src/」的 index.html 與 vendor/*.js 打包成單一成品 HTML
# 輸出到專案根目錄的 deckjson.html（＝平常使用的那個檔），直接覆蓋更新
#
# 用法：
#   bash build.sh                          # 中性通用版（無任何個人／公司母版設定）
#   bash build.sh --profile my.profile.json  # 把該 profile 內嵌為出廠預設
#   bash build.sh --profile my.profile.json --out ../deckjson-mine.html
#
# --profile 只改寫 BUILD_PROFILE 這一個常數，原始碼本身不分岔：
# 同一份 src 可產出「個人版」與「公開通用版」兩個成品。
cd "$(dirname "$0")"
PROFILE=""
OUT="../deckjson.html"
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2;;
    --out)     OUT="$2";     shift 2;;
    *) echo "未知參數：$1" >&2; exit 1;;
  esac
done
if [ -n "$PROFILE" ] && [ ! -f "$PROFILE" ]; then echo "找不到 profile 檔：$PROFILE" >&2; exit 1; fi
PROFILE="$PROFILE" OUT="$OUT" python3 - <<'EOF'
import re, json, os, pathlib
src = pathlib.Path('index.html').read_text(encoding='utf-8')

def inline(m):
    path = pathlib.Path(m.group(1))
    js = path.read_text(encoding='utf-8')
    # </script> 出現在字串常數中會提前終結標籤，防禦性斷開
    js = js.replace('</script>', '<\\/script>')
    return '<script>\n' + js + '\n</script>'

out = re.sub(r'<script src="(vendor/[^"]+)"></script>', inline, src)

prof = os.environ.get('PROFILE') or ''
if prof:
    data = json.loads(pathlib.Path(prof).read_text(encoding='utf-8'))
    lit = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    lit = lit.replace('</', '<\\/')      # 同上：不讓內容提前終結 <script>
    new, n = re.subn(r'const BUILD_PROFILE=null;',
                     'const BUILD_PROFILE=' + lit + ';', out, count=1)
    if n != 1:
        raise SystemExit('找不到 BUILD_PROFILE=null 這一行，無法內嵌 profile')
    out = new
    print(f'embedded profile: {prof} (name={data.get("name")!r})')

dst = pathlib.Path(os.environ.get('OUT') or '../deckjson.html')
dst.write_text(out, encoding='utf-8')
print(f'built: {dst.resolve()} ({dst.stat().st_size/1024/1024:.2f} MB)')
EOF
