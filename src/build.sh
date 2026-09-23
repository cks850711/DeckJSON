#!/bin/bash
# 將「src/」的 index.html 與 app/、vendor/、i18n/ 打包成單一成品 HTML
# 輸出到專案根目錄的 deckjson.html（＝平常使用的那個檔），直接覆蓋更新
#
# 分兩步：
#   1. 組合：index.html 裡連續的 <link rel="stylesheet" href="css/…"> 組回單一 <style>，
#      連續的 <script src="app/…"> 清單組回單一 <script>
#      （第 2 個檔以後開頭的 'use strict'; 去掉），寫出 build/index.assembled.html。
#      這份與拆檔前的 src/index.html 逐位元相同——外掛的抽取腳本讀的是它。
#   2. 內聯：vendor/、i18n/ 的 <script src> 換成檔案內容，寫出成品。
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

STRICT = "'use strict';\n"
def assemble(src):
    tags = list(re.finditer(r'^<script src="(app/[^"]+)"></script>$', src, re.M))
    if not tags:
        return src
    for a, b in zip(tags, tags[1:]):
        if src[a.end():b.start()] != '\n':
            raise SystemExit(f'app/ 的 <script src> 必須連續：{a.group(1)} 與 {b.group(1)} 之間夾了別的東西')
    parts = []
    for i, m in enumerate(tags):
        js = pathlib.Path(m.group(1)).read_text(encoding='utf-8')
        if not js.startswith(STRICT):
            raise SystemExit(f'{m.group(1)} 第一行必須是 {STRICT.strip()}（每個檔各自是一個 script，strict 不會跨檔延續）')
        parts.append(js if i == 0 else js[len(STRICT):])
    return src[:tags[0].start()] + '<script>\n' + ''.join(parts) + '</script>' + src[tags[-1].end():]

def assemble_css(src):
    links = list(re.finditer(r'^<link rel="stylesheet" href="(css/[^"]+)">$', src, re.M))
    if not links:
        return src
    for a, b in zip(links, links[1:]):
        if src[a.end():b.start()] != '\n':
            raise SystemExit(f'css/ 的 <link> 必須連續：{a.group(1)} 與 {b.group(1)} 之間夾了別的東西')
    parts = []
    for m in links:
        t = pathlib.Path(m.group(1)).read_text(encoding='utf-8')
        # 每個 css/ 檔在開發版是各自獨立的樣式表：切點落在規則中間時，瀏覽器會把前半自動收尾、
        # 丟掉後半，組回單一 <style> 後卻又完整——逐位元相同的檢查看不出來（實際踩到：.modal 被切開，
        # 開發版所有彈窗失去置中）。所以每個檔的大括號必須自己平衡。
        bare = re.sub(r'/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', t, flags=re.S)
        depth = 0
        for ch in bare:
            depth += (ch == '{') - (ch == '}')
            if depth < 0:
                break
        if depth:
            raise SystemExit(f'{m.group(1)} 的大括號不平衡（{depth:+d}）：切點落在某條規則中間？')
        parts.append(t)
    css = ''.join(parts)
    return src[:links[0].start()] + '<style>\n' + css + '</style>' + src[links[-1].end():]

src = assemble(assemble_css(src))
asm = pathlib.Path('../build/index.assembled.html')
asm.parent.mkdir(exist_ok=True)
asm.write_text(src, encoding='utf-8')

def inline(m):
    path = pathlib.Path(m.group(1))
    js = path.read_text(encoding='utf-8')
    # </script> 出現在字串常數中會提前終結標籤，防禦性斷開
    js = js.replace('</script>', '<\\/script>')
    return '<script>\n' + js + '\n</script>'

out = re.sub(r'<script src="((?:vendor|i18n)/[^"]+)"></script>', inline, src)

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
