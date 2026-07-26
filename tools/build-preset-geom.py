#!/usr/bin/env python3
"""把 OOXML 的 presetShapeDefinitions.xml 轉成 DeckJSON 用的精簡 JS 資料檔。

來源檔（Apache POI，Apache License 2.0）：
  https://raw.githubusercontent.com/apache/poi/trunk/poi/src/main/resources/org/apache/poi/sl/draw/geom/presetShapeDefinitions.xml

用法：
  python3 tools/build-preset-geom.py [來源.xml]        # 有檔就讀檔
  python3 tools/build-preset-geom.py --download        # 沒檔就抓一份回來

輸出：src/vendor/preset-geom.js（定義 window.PRESET_GEOM）

輸出格式（每個形狀一個陣列，尾端為空一律省略）：
  [ avLst, gdLst, ahLst, pathLst, rect ]

  avLst   [[名稱, 預設值], …]                    ← 調整值與其預設；同時界定「共有幾個 gd」
  gdLst   [[名稱, 運算子, 引數…], …]             ← 依序求值，後面的可引用前面的
  ahLst   [[型別, …], …]                         ← 'xy' 或 'p'(olar) 兩種黃點
  pathLst [[指令陣列, w, h, fill, stroke], …]    ← 多子路徑；w/h 為該路徑自有座標空間
  rect    [l, t, r, b]                           ← 文字區（形狀內文字的擺放範圍）

  指令：m 移動 / l 直線 / c 三次貝茲 / q 二次貝茲 / a 圓弧 / z 封閉
  引數為數字或 guide 名稱（字串）。
"""
import json, pathlib, re, sys, urllib.request
import xml.etree.ElementTree as ET

URL = ('https://raw.githubusercontent.com/apache/poi/trunk/poi/src/main/'
       'resources/org/apache/poi/sl/draw/geom/presetShapeDefinitions.xml')
NS = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'vendor' / 'preset-geom.js'

CMD = {'moveTo': 'm', 'lnTo': 'l', 'cubicBezTo': 'c', 'quadBezTo': 'q',
       'arcTo': 'a', 'close': 'z'}
# 命令 → 要取的 pt 數（arcTo 走屬性，close 無引數）
PTS = {'m': 1, 'l': 1, 'c': 3, 'q': 2}


def tag(e):
    return e.tag.replace(NS, '')


def val(v):
    """數字就轉 int，否則保留為 guide 名稱字串。"""
    if v is None:
        return 0
    return int(v) if re.fullmatch(r'-?\d+', v) else v


def conv(src: str):
    root = ET.fromstring(src)
    out = {}
    for shape in root:
        av, gd, ah, paths, rect = [], [], [], [], None
        for sec in shape:
            n = tag(sec)
            if n == 'avLst':
                for g in sec:
                    f = g.get('fmla', '').split()
                    # avLst 實測 300/300 都是 "val N"，非 val 就是資料變了，要停下來看
                    assert f[0] == 'val', (tag(shape), g.get('fmla'))
                    av.append([g.get('name'), int(f[1])])
            elif n == 'gdLst':
                for g in sec:
                    f = g.get('fmla', '').split()
                    gd.append([g.get('name'), f[0]] + [val(a) for a in f[1:]])
            elif n == 'ahLst':
                for a in sec:
                    pos = a.find(NS + 'pos')
                    px, py = val(pos.get('x')), val(pos.get('y'))
                    if tag(a) == 'ahXY':
                        ah.append(['xy',
                                   a.get('gdRefX') or 0, val(a.get('minX')), val(a.get('maxX')),
                                   a.get('gdRefY') or 0, val(a.get('minY')), val(a.get('maxY')),
                                   px, py])
                    else:
                        ah.append(['p',
                                   a.get('gdRefAng') or 0, val(a.get('minAng')), val(a.get('maxAng')),
                                   a.get('gdRefR') or 0, val(a.get('minR')), val(a.get('maxR')),
                                   px, py])
            elif n == 'rect':
                rect = [val(sec.get(k)) for k in ('l', 't', 'r', 'b')]
            elif n == 'pathLst':
                for p in sec:
                    cmds = []
                    for c in p:
                        k = CMD[tag(c)]
                        if k == 'z':
                            cmds.append(['z'])
                        elif k == 'a':
                            cmds.append(['a', val(c.get('wR')), val(c.get('hR')),
                                         val(c.get('stAng')), val(c.get('swAng'))])
                        else:
                            row = [k]
                            for pt in c.findall(NS + 'pt')[:PTS[k]]:
                                row += [val(pt.get('x')), val(pt.get('y'))]
                            cmds.append(row)
                    entry = [cmds,
                             int(p.get('w') or 0), int(p.get('h') or 0),
                             p.get('fill') or 0, 0 if p.get('stroke') != 'false' else 1]
                    while len(entry) > 1 and not entry[-1]:
                        entry.pop()
                    paths.append(entry)
        rec = [av, gd, ah, paths, rect or 0]
        while len(rec) > 1 and not rec[-1]:
            rec.pop()
        out[tag(shape)] = rec
    return out


def main():
    args = [a for a in sys.argv[1:]]
    if '--download' in args or not args:
        src = urllib.request.urlopen(URL, timeout=60).read().decode('utf-8')
    else:
        src = pathlib.Path(args[0]).read_text(encoding='utf-8')
    data = conv(src)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(
        '// 由 tools/build-preset-geom.py 產生，請勿手改。\n'
        '// 資料來源：OOXML presetShapeDefinitions.xml（取自 Apache POI，Apache License 2.0）\n'
        '// 格式說明見該腳本檔頭。\n'
        'window.PRESET_GEOM=' + body + ';\n', encoding='utf-8')
    print(f'{len(data)} shapes → {OUT} ({OUT.stat().st_size/1024:.0f} KB)')


if __name__ == '__main__':
    main()
