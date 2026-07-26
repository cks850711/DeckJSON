# 第三方套件授權

`deckjson.html` 為單檔封裝成品，內嵌以下第三方函式庫（原始檔位於 `src/vendor/`）。各套件著作權歸原作者所有，授權條款如下列出，依各授權條款要求保留聲明。

## PptxGenJS

- 版本：3.12.0
- 授權：MIT License
- 版權：Copyright (c) 2015-present Brent Ely (gitbrent) and PptxGenJS contributors
- 專案：https://github.com/gitbrent/PptxGenJS

## JSZip

- 版本：3.10.1
- 授權：雙授權 MIT License 或 GPLv3（本專案採 MIT 條款使用）
- 版權：Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso
- 專案：https://github.com/Stuk/jszip
- 附帶套件：JSZip 內部使用 pako（MIT License）：https://github.com/nodeca/pako

## html2canvas

- 版本：1.4.1
- 授權：MIT License
- 版權：Copyright (c) 2022 Niklas von Hertzen
- 專案：https://github.com/niklasvh/html2canvas

## OOXML Preset Shape Definitions

- 檔案：`src/vendor/preset-geom.js`（由 `tools/build-preset-geom.py` 從下列來源轉換而成）
- 來源：Apache POI 的 `presetShapeDefinitions.xml`
  （`poi/src/main/resources/org/apache/poi/sl/draw/geom/presetShapeDefinitions.xml`）
- 授權：Apache License, Version 2.0
- 版權：Copyright (c) The Apache Software Foundation
- 專案：https://github.com/apache/poi

  內容為 ECMA-376（Office Open XML）所定義的內建形狀幾何（調整值、公式、控點、輪廓路徑）。
  DeckJSON 只做格式轉換與精簡（去除連接點、壓縮鍵名），幾何資料本身未經修改。

## Apache ECharts

- 授權：Apache License, Version 2.0
- 版權：Copyright (c) Apache Software Foundation
- 專案：https://github.com/apache/echarts

---

## MIT License 全文（適用於 PptxGenJS、JSZip、html2canvas）

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

Apache License 2.0 全文請見 https://www.apache.org/licenses/LICENSE-2.0
