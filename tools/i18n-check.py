#!/usr/bin/env python3
"""介面字串的多語言覆蓋檢查。

    python3 tools/i18n-check.py            # 列出問題，有問題時離開碼 1
    python3 tools/i18n-check.py --keys     # 另外印出所有 _t() 鍵（除錯用）

語言包照 src/index.html 的 <script src="i18n/…"> 依序載入（結構見 src/i18n/zh.js），
中文是原文，其餘每個語言各檢查一輪：

  1. JS 裡含中文、卻沒包進 _t() 的字串字面值——漏翻的介面文字（與語言無關，只查一次）。
     註解、正規表示式、console.* 的參數不算（那是 L2，只有開原始碼的人看得到）。
     刻意保留中文的資料（字型名、解析中文輸入用的樣式）在字面值正前方加 /*zh*/。
  2. _t() 的鍵在該語言包的 ui 找不到——翻了一半。
  3. HTML 靜態區（說明面板以外）含中文的文字節點與 title／placeholder 屬性，
     在該語言包的 ui 找不到——開機時 i18nStatic() 會照原文留著。
  4. 形狀名：SHAPE_META 的每個 preset 在該語言包的 shapes 都要有名稱。
  5. 說明面板不走字典：每個語言各一份完整 HTML，與中文版的 data-tab 分頁數、
     data-fig 配圖順序必須一一對得上。

加一種語言時不用改這支：它照 index.html 的清單找語言包。

為什麼是掃描器而不是執行期警告：漏翻的字串多半藏在不常走到的分支（錯誤訊息、
邊界情況的 alert），執行期只抓得到有人點過的那幾條。
"""
import json, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'index.html'
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
    # 以字串本身為鍵：多個檔輪流掃時，前一個字串被回收後 id() 可能被重用
    if s not in _cache:
        _cache[s] = [m.start() for m in re.finditer('\n', s)]
    import bisect
    return bisect.bisect_right(_cache[s], pos) + 1


def js_units(html):
    """主程式，依 index.html 的 <script src="app/…"> 清單（＝瀏覽器的載入順序）：(標示, 全文, [(起點, js)])。"""
    srcs = re.findall(r'<script src="(app/[^"]+)"></script>', html)
    if not srcs:
        sys.exit('src/index.html 裡找不到 <script src="app/…">')
    for s in srcs:
        t = (SRC.parent / s).read_text(encoding='utf-8')
        yield 'src/' + s, t, [(0, t)]


def js_text(html):
    return '\n'.join(t for _, t, _ in js_units(html))


def js_keys_and_leaks(html):
    keys, leaks = [], []
    for label, full, pieces in js_units(html):
        for base, js in pieces:
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
                        keys.append(('%s:%d' % (label, line_of(full, base + t.pos)), key))
                        continue
                    if CJK.search(t.val) and not in_console(t.pos) and t.pos not in keep_at:
                        leaks.append(('%s:%d' % (label, line_of(full, base + t.pos)), 'str', t.val))
                elif t.kind == 'tplstart':
                    if is_arg0:
                        leaks.append(('%s:%d' % (label, line_of(full, base + t.pos)), '_t(`…`)',
                                      '模板字面值不能當鍵，改用 {0} 參數'))
                elif t.kind == 'tplchunk':
                    if CJK.search(t.val) and not in_console(t.pos):
                        # 模板的開頭 token 帶 /*zh*/ 標記時整個模板豁免
                        st = next((x for x in reversed(toks[:toks.index(t)]) if x.kind == 'tplstart'), None)
                        if st is not None and st.pos in keep_at:
                            continue
                        leaks.append(('%s:%d' % (label, line_of(full, base + t.pos)), 'tpl', t.val.strip()))
    return keys, leaks


def unescape_js(s):
    return (s.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n')
             .replace('\\t', '\t').replace('\\\\', '\\'))


def load_packs():
    """照 index.html 的 <script src="i18n/…"> 依序在 node 裡執行語言包，
    回傳 {語言: {'name', 'ui': 鍵集合, 'shapes': 鍵集合, 'help': HTML 或 None}}（依登記順序）。"""
    html = SRC.read_text(encoding='utf-8')
    files = re.findall(r'<script src="(i18n/[^"]+)"></script>', html)
    code = '\n;\n'.join((SRC.parent / f).read_text(encoding='utf-8') for f in files)
    js = code + (';\nprocess.stdout.write(JSON.stringify(Object.entries(I18N_PACKS).map(([l,p])=>'
                 '[l,{name:p.name||l,ui:Object.keys(p.ui||{}),shapes:Object.keys(p.shapes||{}),'
                 'help:typeof p.help==="string"?p.help:null}])));')
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if out.returncode:
        sys.exit('語言包無法載入（%s）：\n%s' % ('、'.join(files), out.stderr))
    return {l: {'name': p['name'], 'ui': set(p['ui']), 'shapes': set(p['shapes']), 'help': p['help']}
            for l, p in json.loads(out.stdout)}


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
    # data-i18n：整段 innerHTML 是一個鍵（見 app/core/i18n.js 的 i18nStatic）。假設區塊內沒有同名巢狀標籤
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


def help_literal_problems():
    """說明本文用 String.raw`…` 包住：反引號會提早結束字串，「${」會被當成程式碼執行並悄悄
    換掉內容。兩者都不會在語言包載入時報錯（後者甚至完全正常執行），所以要照原始檔文字檢查。"""
    html = SRC.read_text(encoding='utf-8')
    probs = []
    for f in re.findall(r'<script src="(i18n/[^"]+\.help\.js)"></script>', html):
        t = (SRC.parent / f).read_text(encoding='utf-8')
        a, b = t.find('String.raw`'), t.rfind('`;')
        if a < 0 or b < a:
            probs.append('%s：找不到 String.raw`…`; 的說明本文' % f)
            continue
        body = t[a + len('String.raw`'):b]
        for bad, why in (('`', '反引號'), ('${', '「${」')):
            if bad in body:
                probs.append('%s：說明本文含%s（第 %d 行）' % (f, why, t[:a + len('String.raw`') + body.index(bad)].count('\n') + 1))
    return probs


def help_parity(zh, other, name):
    if other is None:
        return ['%s：沒有說明本文（會退回中文）' % name]
    probs = []
    tz, te = re.findall(r'data-tab="', zh), re.findall(r'data-tab="', other)
    if len(tz) != len(te):
        probs.append('%s：分頁數與中文不同：中 %d／%s %d' % (name, len(tz), name, len(te)))
    fz, fe = re.findall(r'data-fig="([^"]+)"', zh), re.findall(r'data-fig="([^"]+)"', other)
    if fz != fe:
        probs.append('%s：配圖順序與中文不同：\n    中 %s\n    %s %s' % (name, fz, name, fe))
    return probs


def main():
    html = SRC.read_text(encoding='utf-8')
    packs = load_packs()
    keys, leaks = js_keys_and_leaks(html)
    static = html_static(html)
    shapes = shape_keys(js_text(html))
    zh_help = packs.get('zh', {}).get('help') or ''
    bad = 0
    lit = help_literal_problems()
    if lit:
        print('■ 說明本文的字面值問題')
        for p in lit:
            print('  ' + p)
        bad += len(lit)
    if leaks:
        print('■ 含中文但沒包 _t() 的字面值（%d）' % len(leaks))
        for ln, kind, v in leaks:
            print('  %s  %-8s %s' % (ln, kind, v[:90].replace('\n', '⏎')))
        bad += len(leaks)
    for lang, pack in packs.items():
        if lang == 'zh':
            continue
        name, ui = pack['name'], pack['ui']
        missing = sorted({unescape_js(k) for _, k in keys} - ui)
        if missing:
            print('■ %s：_t() 鍵在語言包的 ui 找不到（%d）' % (name, len(missing)))
            where = {}
            for ln, k in keys:
                where.setdefault(unescape_js(k), ln)
            for k in missing:
                print('  %s  %s' % (where[k], k[:90].replace('\n', '⏎')))
            bad += len(missing)
        st = [(ln, kd, v) for ln, kd, v in static if v not in ui]
        if st:
            print('■ %s：HTML 靜態中文在語言包的 ui 找不到（%d）' % (name, len(st)))
            for ln, kd, v in st:
                print('  src/index.html:%d  %-11s %s' % (ln, kd, v[:90]))
            bad += len(st)
        sm = sorted(shapes - pack['shapes'])
        if sm:
            print('■ %s：語言包的 shapes 缺形狀名（%d）' % (name, len(sm)))
            print('  ' + ' '.join(sm))
            bad += len(sm)
        hp = help_parity(zh_help, pack['help'], name)
        if hp:
            print('■ 說明面板與中文不對稱')
            for p in hp:
                print('  ' + p)
            bad += len(hp)
        used = {unescape_js(k) for _, k in keys} | {v for _, _, v in static}
        unused = sorted(ui - used)
        if unused:
            # 不算錯：可能是動態組出來的鍵，只是提醒
            print('□ %s：語言包裡沒被引用到的鍵（%d，僅提醒）' % (name, len(unused)))
            for k in unused[:40]:
                print('         ' + k[:90].replace('\n', '⏎'))
    if '--keys' in sys.argv:
        for ln, k in keys:
            print('%s  %s' % (ln, k))
    print('%s：%s' % ('、'.join(p['name'] for p in packs.values()), 'OK' if not bad else '共 %d 項待處理' % bad))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
