#!/usr/bin/env python3
"""介面字串的英文化覆蓋檢查。

    python3 tools/i18n-check.py            # 列出問題，有問題時離開碼 1
    python3 tools/i18n-check.py --keys     # 另外印出所有 _t() 鍵（除錯用）

檢查三件事：

  1. JS 裡含中文、卻沒包進 _t() 的字串字面值——漏翻的介面文字。
     註解、正規表示式、console.* 的參數不算（那是 L2，只有開原始碼的人看得到）。
     刻意保留中文的資料（字型名、解析中文輸入用的樣式）在字面值正前方加 /*zh*/。
  2. _t() 的鍵在 src/i18n/en.js 找不到英文——翻了一半。
  3. HTML 靜態區（說明面板以外）含中文的文字節點與 title／placeholder 屬性，
     在 en.js 找不到英文——開機時 i18nStatic() 會照原文留著。

說明面板不走字典：中英各一份完整 HTML（#helpBody 與 #helpBodyEn），
兩邊的 data-tab 分頁數與 data-fig 配圖必須一一對得上，這裡也一併檢查。

為什麼是掃描器而不是執行期警告：漏翻的字串多半藏在不常走到的分支（錯誤訊息、
邊界情況的 alert），執行期只抓得到有人點過的那幾條。
"""
import json, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'index.html'
EN = ROOT / 'src' / 'i18n' / 'en.js'
CJK = re.compile(r'[㐀-鿿　-〿！-～]')
REGEX_PREV_KW = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
                 'void', 'throw', 'instanceof', 'yield', 'await'}


class Tok:
    __slots__ = ('kind', 'val', 'pos', 'end')

    def __init__(self, kind, val, pos, end):
        self.kind, self.val, self.pos, self.end = kind, val, pos, end


def tokenize(s, i=0, stop_at_brace=False):
    """回傳 (tokens, 結束位置)。模板字面值的 ${…} 遞迴處理，
    內層 token 攤平進同一個串列，模板的靜態片段以 'tplchunk' 表示。"""
    toks = []
    n = len(s)
    depth = 0

    def prev_sig():
        for t in reversed(toks):
            if t.kind != 'comment':
                return t
        return None

    while i < n:
        c = s[i]
        if c in ' \t\r\n':
            i += 1
            continue
        if s.startswith('//', i):
            j = s.find('\n', i)
            j = n if j < 0 else j
            toks.append(Tok('comment', s[i:j], i, j))
            i = j
            continue
        if s.startswith('/*', i):
            j = s.find('*/', i + 2) + 2
            toks.append(Tok('comment', s[i:j], i, j))
            i = j
            continue
        if c in '\'"':
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == '\\' else 1
            toks.append(Tok('str', s[i + 1:j], i, j + 1))
            i = j + 1
            continue
        if c == '`':
            start = i
            j = i + 1
            chunk_start = j
            toks.append(Tok('tplstart', '', start, start + 1))
            while j < n and s[j] != '`':
                if s[j] == '\\':
                    j += 2
                    continue
                if s.startswith('${', j):
                    toks.append(Tok('tplchunk', s[chunk_start:j], chunk_start, j))
                    inner, j = tokenize(s, j + 2, stop_at_brace=True)
                    toks.extend(inner)
                    chunk_start = j
                    continue
                j += 1
            toks.append(Tok('tplchunk', s[chunk_start:j], chunk_start, j))
            toks.append(Tok('tplend', '', j, j + 1))
            i = j + 1
            continue
        if c == '/':
            p = prev_sig()
            is_re = (p is None or (p.kind == 'punct' and p.val not in ')]}')
                     or (p.kind == 'ident' and p.val in REGEX_PREV_KW)
                     or (p.kind == 'punct' and p.val == '}'))
            if is_re:
                j = i + 1
                in_cls = False
                while j < n:
                    if s[j] == '\\':
                        j += 2
                        continue
                    if s[j] == '[':
                        in_cls = True
                    elif s[j] == ']':
                        in_cls = False
                    elif s[j] == '/' and not in_cls:
                        break
                    elif s[j] == '\n':
                        break
                    j += 1
                j += 1
                while j < n and s[j].isalpha():
                    j += 1
                toks.append(Tok('regex', s[i:j], i, j))
                i = j
                continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (s[j].isalnum() or s[j] in '_$'):
                j += 1
            toks.append(Tok('ident', s[i:j], i, j))
            i = j
            continue
        if stop_at_brace:
            if c == '{':
                depth += 1
            elif c == '}':
                if depth == 0:
                    return toks, i + 1
                depth -= 1
        toks.append(Tok('punct', c, i, i + 1))
        i += 1
    return toks, i


def line_of(s, pos, _cache={}):
    key = id(s)
    if key not in _cache:
        _cache[key] = [m.start() for m in re.finditer('\n', s)]
    import bisect
    return bisect.bisect_right(_cache[key], pos) + 1


def script_ranges(html):
    """主程式的 inline <script>（不含 src= 的 vendor）。"""
    for m in re.finditer(r'<script>(.*?)</script>', html, re.S):
        yield m.start(1), m.group(1)


def js_keys_and_leaks(html):
    keys, leaks = [], []
    for base, js in script_ranges(html):
        toks, _ = tokenize(js)
        sig = [t for t in toks if t.kind != 'comment']
        # console.*( … ) 的範圍：L2，不報
        console_spans = []
        for k, t in enumerate(sig):
            if (t.kind == 'ident' and t.val == 'console' and k + 3 < len(sig)
                    and sig[k + 1].val == '.' and sig[k + 3].val == '('):
                d = 0
                for m in range(k + 3, len(sig)):
                    if sig[m].val == '(' and sig[m].kind == 'punct':
                        d += 1
                    elif sig[m].val == ')' and sig[m].kind == 'punct':
                        d -= 1
                        if d == 0:
                            console_spans.append((sig[k].pos, sig[m].end))
                            break
        # HELP_FIGS／HELP_FIGS_EN 是 tools/figdeck.js 從說明簡報產生的資料，中英各一份，不走字典
        # SHAPE_META 的形狀名同理：英文走 SHAPE_NAMES_EN（以 preset 名為鍵），另由 shape_keys() 核對
        for m in re.finditer(r'const (HELP_FIGS(_EN)?|SHAPE_META)=', js):
            console_spans.append((m.start(), js.find('\n};', m.start()) + 3))
        in_console = lambda p: any(a <= p < b for a, b in console_spans)
        # /*zh*/ 標記：刻意保留的中文資料
        keep_at = set()
        for k, t in enumerate(toks):
            if t.kind == 'comment' and t.val == '/*zh*/' and k + 1 < len(toks):
                keep_at.add(toks[k + 1].pos)
        consumed = set()
        for k, t in enumerate(sig):
            if k in consumed:
                continue
            is_arg0 = (k >= 2 and sig[k - 1].val == '(' and sig[k - 2].kind == 'ident'
                       and sig[k - 2].val == '_t'
                       and (k < 3 or sig[k - 3].val != '.'))
            if t.kind == 'str':
                if is_arg0:
                    # 長句跨行寫成 _t('…'+'…') 時，整串相加的字面值才是鍵
                    key, m = t.val, k + 1
                    while m + 1 < len(sig) and sig[m].val == '+' and sig[m + 1].kind == 'str':
                        key += sig[m + 1].val
                        consumed.add(m + 1)
                        m += 2
                    keys.append((line_of(html, base + t.pos), key))
                    continue
                if CJK.search(t.val) and not in_console(t.pos) and t.pos not in keep_at:
                    leaks.append((line_of(html, base + t.pos), 'str', t.val))
            elif t.kind == 'tplstart':
                if is_arg0:
                    leaks.append((line_of(html, base + t.pos), '_t(`…`)',
                                  '模板字面值不能當鍵，改用 {0} 參數'))
            elif t.kind == 'tplchunk':
                if CJK.search(t.val) and not in_console(t.pos):
                    # 模板的開頭 token 帶 /*zh*/ 標記時整個模板豁免
                    st = next((x for x in reversed(toks[:toks.index(t)]) if x.kind == 'tplstart'), None)
                    if st is not None and st.pos in keep_at:
                        continue
                    leaks.append((line_of(html, base + t.pos), 'tpl', t.val.strip()))
    return keys, leaks


def unescape_js(s):
    return (s.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n')
             .replace('\\t', '\t').replace('\\\\', '\\'))


def load_en():
    """回傳 (I18N_EN 的鍵, SHAPE_NAMES_EN 的鍵)。"""
    if not EN.exists():
        return set(), set()
    code = EN.read_text(encoding='utf-8')
    js = code + ('\nprocess.stdout.write(JSON.stringify([Object.keys(I18N_EN),'
                 'typeof SHAPE_NAMES_EN==="undefined"?[]:Object.keys(SHAPE_NAMES_EN)]));')
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if out.returncode:
        sys.exit('en.js 無法載入：\n' + out.stderr)
    a, b = json.loads(out.stdout)
    return set(a), set(b)


def shape_keys(html):
    a = html.find('const SHAPE_META={')
    b = html.find('\n};', a)
    return set(re.findall(r'^\s*([A-Za-z0-9]+):\[', html[a:b], re.M))


def html_static(html):
    """說明面板與 <script>/<style>/<template> 以外的 HTML：中文文字節點與屬性。"""
    s = html
    a = s.find('id="helpBody"')
    b = s.find('<!--/helpBody-->', a)
    if 0 <= a < b:
        # 說明面板整段略過——它不走字典。要在剝註解之前找，結束標記本身就是註解
        s = s[:a] + '\n' * s[a:b].count('\n') + s[b:]
    s = re.sub(r'<(script|style|template)\b.*?</\1>', lambda m: '\n' * m.group(0).count('\n'),
               s, flags=re.S)
    s = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    # translate="no" 的元素不翻（例如語言切換鈕上的「中文」「English」）——只剝它的內容，保留標籤本身的屬性
    s = re.sub(r'(<(\w+)\b[^>]*\stranslate="no"[^>]*>)(.*?)(</\2>)',
               lambda m: m.group(1) + '\n' * m.group(3).count('\n') + m.group(4), s, flags=re.S)
    found = []
    # data-i18n：整段 innerHTML 是一個鍵（見 index.html 的 i18nStatic）。假設區塊內沒有同名巢狀標籤
    def block(m):
        inner = m.group(2)
        if CJK.search(inner):
            found.append((s.count('\n', 0, m.start()) + 1, 'data-i18n', ' '.join(inner.split())))
        return m.group(0).replace(inner, '\n' * inner.count('\n'))
    s = re.sub(r'<(\w+)\b[^>]*\sdata-i18n\b[^>]*>(.*?)</\1>', block, s, flags=re.S)
    for m in re.finditer(r'\s(title|placeholder|aria-label|alt)="([^"]*)"', s):
        if CJK.search(m.group(2)):
            found.append((s.count('\n', 0, m.start()) + 1, m.group(1), m.group(2)))
    for m in re.finditer(r'>([^<>]+)<', s):
        txt = m.group(1).strip()
        if CJK.search(txt):
            found.append((s.count('\n', 0, m.start()) + 1, 'text', ' '.join(txt.split())))
    return found


def help_parity(html):
    def seg(tag_id):
        a = html.find('id="' + tag_id + '"')
        if a < 0:
            return None
        b = html.find('<!--/' + tag_id + '-->', a)
        return html[a:b] if b > a else None
    zh, en = seg('helpBody'), seg('helpBodyEn')
    if en is None:
        return ['找不到 #helpBodyEn（英文說明面板）']
    probs = []
    tz, te = re.findall(r'data-tab="', zh), re.findall(r'data-tab="', en)
    if len(tz) != len(te):
        probs.append('分頁數不同：中 %d／英 %d' % (len(tz), len(te)))
    fz, fe = re.findall(r'data-fig="([^"]+)"', zh), re.findall(r'data-fig="([^"]+)"', en)
    if fz != fe:
        probs.append('配圖順序不同：\n    中 %s\n    英 %s' % (fz, fe))
    return probs


def main():
    html = SRC.read_text(encoding='utf-8')
    en, shape_en = load_en()
    keys, leaks = js_keys_and_leaks(html)
    bad = 0
    if leaks:
        print('■ 含中文但沒包 _t() 的字面值（%d）' % len(leaks))
        for ln, kind, v in leaks:
            print('  %5d  %-8s %s' % (ln, kind, v[:90].replace('\n', '⏎')))
        bad += len(leaks)
    missing = sorted({unescape_js(k) for _, k in keys} - en, key=lambda k: k)
    if missing:
        print('■ _t() 鍵在 en.js 沒有英文（%d）' % len(missing))
        where = {}
        for ln, k in keys:
            where.setdefault(unescape_js(k), ln)
        for k in missing:
            print('  %5d  %s' % (where[k], k[:90].replace('\n', '⏎')))
        bad += len(missing)
    st = [(ln, kd, v) for ln, kd, v in html_static(html) if v not in en]
    if st:
        print('■ HTML 靜態中文在 en.js 沒有英文（%d）' % len(st))
        for ln, kd, v in st:
            print('  %5d  %-11s %s' % (ln, kd, v[:90]))
        bad += len(st)
    sm = sorted(shape_keys(html) - shape_en)
    if sm:
        print('■ SHAPE_NAMES_EN 缺形狀英文名（%d）' % len(sm))
        print('  ' + ' '.join(sm))
        bad += len(sm)
    hp = help_parity(html)
    if hp:
        print('■ 說明面板中英不對稱')
        for p in hp:
            print('  ' + p)
        bad += len(hp)
    used = {unescape_js(k) for _, k in keys} | {v for _, _, v in html_static(html)}
    unused = sorted(en - used)
    if unused:
        # 不算錯：可能是動態組出來的鍵（見 en.js 的說明），只是提醒
        print('□ en.js 裡沒被引用到的鍵（%d，僅提醒）' % len(unused))
        for k in unused[:40]:
            print('         ' + k[:90].replace('\n', '⏎'))
    if '--keys' in sys.argv:
        for ln, k in keys:
            print('%5d  %s' % (ln, k))
    print('OK' if not bad else '共 %d 項待處理' % bad)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
