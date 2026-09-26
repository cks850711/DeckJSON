# 簡報格式（`deck.json`）

[English](deck-format.md) | **繁體中文**

一張投影片、以及上面每一種元素在 JSON 裡長什麼樣。傳給 `DJ.add()`、`DJ.addPage()`、`DJ.replacePage()` 的就是這個格式（見 [scripting-api.zh-TW.md](scripting-api.zh-TW.md)），`DJ.get()` 回傳的、編輯器 JSON 面板顯示的也是它。

最快寫對的方法是照抄：對一個已經長成你要的樣子的元素呼叫 `DJ.get(頁id, 元素id)`。每個寫入呼叫都會回傳 `warnings`，列出 DeckJSON 不認得的欄位，拼錯或放錯層不會默默沒效果。`DJ.lint()` 檢查整份。

## 單位與慣例

| 項目 | 單位 |
|---|---|
| `x`、`y`、`w`、`h` | 投影片上的像素，原點在左上角。預設投影片 1280 × 720（`DJ.info().stage`） |
| `sizePt`、`linePt`、`inset`、`spaceBefore`、`spaceAfter` | 點（pt） |
| 顏色 | 六位十六進位、**不加** `#`：`"1F3A5F"`。圖表的 option 是 ECharts 的格式，用它自己的 `"#1F3A5F"` |
| `opacity` | 百分比 0–99；完全不透明就省略 |
| `id` | 同一頁內唯一。不同頁可以同 id，Morph 轉場就是靠它配對物件 |

## 簡報與頁面

```json
{
  "title": "季度檢討",
  "stage": {"w": 1280, "h": 720},
  "fonts": {"ea": "PingFang TC", "latin": "Arial"},
  "master": {"on": true, "elements": []},
  "pages": [
    {"id": "p1", "name": "摘要", "bg": "FFFFFF", "notes": "講者備忘", "elements": []}
  ]
}
```

| 頁面欄位 | 意義 |
|---|---|
| `id`、`name` | 頁 id（每個 `DJ` 呼叫都用它）與頁名 |
| `bg` | 背景色。`bgImage` 是背景圖（`@asset:…` 或 `data:` 網址） |
| `notes` | 備忘稿（純文字） |
| `section` | 從這一頁開始一個章節（匯出為 PowerPoint 章節） |
| `skip` | `true`＝放映時隱藏。模板的說明頁、元件頁用它 |
| `noMaster` | `true`＝這一頁不顯示母版元素 |
| `transition` | `{"type": "morph" \| "fade" \| "push" \| "wipe", "dur": 600}`；`dur`（毫秒）用於 Morph |

改頁面欄位用 `DJ.patch(頁id, [{id: 頁id, set: {…}}])`。母版（每頁共用的元素）的頁 id 寫 `"master"`。

## 每種元素都有的欄位

| 欄位 | 意義 |
|---|---|
| `id`、`type` | `type` 是 `text`、`shape`、`image`、`table`、`chart` 或 `video` |
| `x`、`y`、`w`、`h` | 外框。表格沒有 `w`／`h`，大小由 `colW` 與 `rowH` 決定 |
| `rot` | 旋轉角度，順時針 |
| `groupId` | 同一個 `groupId` 的元素一起移動。版面類呼叫可以直接給群組 id |
| `hidden`、`locked` | `hidden`：不畫也不匯出。`locked`：畫布上不能移動或編輯 |
| `alt` | 替代文字 |
| `link` | `{"url": "https://…"}` 或 `{"slide": 3}`，可加 `"tooltip"` |
| `shadow` | `{"blur": 8, "offset": 4, "angle": 270, "color": "808080", "opacity": 0.5}` |
| `lineSpacing` | 行距，字級的倍數（0.5–5） |

## 文字框

```json
{"id": "t1", "type": "text", "x": 80, "y": 160, "w": 520, "h": 60,
 "paras": [
   {"md": "營收年增 **18%**", "align": "left"},
   {"md": "主要來自新產品線", "bullet": {"type": "bullet", "level": 0}}
 ],
 "valign": "top", "inset": 6}
```

| 欄位 | 值 |
|---|---|
| `paras` | 段落，每段用 `runs` 或 `md` 簡寫（見下） |
| `valign` | `top`、`middle`、`bottom` |
| `inset` | 內距（點） |
| `nowrap` | `true`＝不換行 |
| `vert` | 直書：`eaVert`（中日韓直書）、`vert`、`vert270`、`mongolianVert` |
| `fill`、`lineColor`、`linePt`、`dash` | 框的底色與外框。`dash`：`sysDot`、`dash`、`lgDash`、`dashDot`、`lgDashDot` |
| `grad` | 漸層：`{"type": "linear" \| "radial", "angle": 90, "stops": [{"pos": 0, "color": "FFFFFF"}, {"pos": 100, "color": "1F3A5F"}]}` |

寫完或改過文字後，呼叫 `DJ.fit(頁id, [id])` 把框調成剛好裝下文字，並確認 `DJ.overflow()`。

### 段落與文字片段

| 段落欄位 | 值 |
|---|---|
| `md` | 一行文字，可用行內 markdown，套用時展開成 `runs` |
| `runs` | `[{"text": "…", "bold": true, "sizePt": 18, "color": "1A1A1A"}, …]`。沒設字級的文字是 18 點 |
| `align` | `left`、`center`、`right`、`justify` |
| `bullet` | `{"type": "bullet" \| "number", "level": 0}`；編號可加 `"startAt": 1` |
| `spaceBefore`、`spaceAfter` | 點 |

文字片段（run）的欄位：`text`、`bold`、`italic`、`underline`、`strike`、`sizePt`、`color`、`highlight`（顏色）、`fontFace`、`charSpacing`（點）、`sub`、`sup`、`link`（`{"url"}` 或 `{"slide"}`）、`outline`（`{"size", "color"}`）、`glow`（`{"size", "color", "opacity"}`）。

`md` 簡寫認得 `**粗體**`、`*斜體*`、`~~刪除線~~`、`==高亮==`、`[文字](https://…)` 與 `[文字](#3)`（跳到第 3 頁）。用 `text` 寫的片段一律是字面文字，裡面的 `**` 照原樣保留。字級與顏色不在 `md` 裡；要換掉既有文字框的字**又不丟格式**，用 `DJ.patch(頁, [{id, md: "新文字"}])`，不要整個換掉 `paras`。

## 形狀

```json
{"id": "s1", "type": "shape", "shape": "roundRect", "x": 80, "y": 300, "w": 240, "h": 90,
 "fill": "E8F0FA", "lineColor": "2E6DA4", "linePt": 1,
 "paras": [{"md": "**步驟一**", "align": "center"}], "valign": "middle"}
```

`shape` 是 PowerPoint 的預設形狀名：`rect`、`roundRect`、`ellipse`、`triangle`、`diamond`、`hexagon`、`chevron`、`homePlate`、`rightArrow`、`leftRightArrow`、`wedgeRectCallout`、`flowChartProcess`、`flowChartDecision`、`star5`、`cloudCallout`，以及 PowerPoint 其餘的形狀（編輯器的形狀庫全部列得出來）。形狀裡可以放文字，欄位同文字框。`adjs` 是黃色控點的調整值，OOXML 單位（100000＝100%）；`flipH`／`flipV` 鏡像。

**線條與箭頭**也是形狀：`line`、`arrow`、`doubleArrow`、`elbow`、`elbowArrow`、`elbowDoubleArrow`。從外框左上角畫到右下角；`flipH`／`flipV` 改方向，`h: 0` 是水平線。沒有 `endArrow` 這個欄位，箭頭是形狀名的一部分。

```json
{"id": "a1", "type": "shape", "shape": "arrow", "x": 330, "y": 345, "w": 120, "h": 0, "lineColor": "2E6DA4", "linePt": 2}
```

`custGeom` 加上 `points` 陣列是自由形狀；在編輯器裡畫好再用 `DJ.get` 讀回來，比手寫容易。

## 圖片

放圖一律用 `DJ.addImage(頁id, 來源, {x, y, w, h})`：它讀檔、保持長寬比、位元組只存一份。不要自己寫 `dataUrl`。之後可以改的欄位：

| 欄位 | 值 |
|---|---|
| `fit` | `"cover"`＝填滿外框、超出裁掉；省略＝完整放進框內 |
| `crop` | `{"l": 0.1, "t": 0, "r": 0.1, "b": 0}`，各邊裁掉原圖的比例 |
| `round` | `true`＝圓形裁切 |
| `flipH`、`flipV` | 鏡像 |

要重用簡報裡已有的圖，把 `DJ.assets()` 列出的佔位傳給 `addImage`。

## 表格

```json
{"id": "tb1", "type": "table", "x": 80, "y": 160,
 "colW": [360, 200, 200], "rowH": [40, 36, 36],
 "border": {"pt": 0.75, "color": "BFC8D6"},
 "cells": [
   [{"text": "項目", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"},
    {"text": "第一季", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"},
    {"text": "第二季", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"}],
   [{"text": "訂單"}, {"text": "1,280", "align": "right"}, {"text": "1,516", "align": "right"}],
   [{"md": "**合計**"}, {"text": "1,280", "align": "right"}, {"text": "1,516", "align": "right"}]
 ]}
```

| 欄位 | 意義 |
|---|---|
| `colW` | 欄寬，加總就是表格寬 |
| `rowH` | 列高下限。字放不下的列會自己長高，所以表格實際高度看 `DJ.outline()`，不要加總 `rowH` |
| `cells` | 一列一個陣列，每列的格數等於欄數 |
| `border` | 整張表的框線 `{"pt", "color", "dash": true?}` |

儲存格欄位：內容用 `text`、`runs` 或 `md`（預設 12 點深灰字，要讓遠處看得清楚就設 `sizePt`）；`bold`、`italic`、`color`、`sizePt`、`fill`、`align`、`valign`、`lineSpacing`；合併用 `colspan`／`rowspan`，被蓋住的格設 `{"covered": true}`；逐邊框線 `border`，例如 `{"t": {"pt": 1.5, "color": "1F3A5F"}, "b": null}`（`null`＝那一邊不畫線）。

儲存格本身沒有上下內距。寫完表格後呼叫 `DJ.fitTable(頁id, [id])`，把每一列設成剛好裝下文字再留一點空間。

## 圖表

```json
{"id": "c1", "type": "chart", "x": 640, "y": 160, "w": 560, "h": 360,
 "option": {"xAxis": {"type": "category", "data": ["Q1", "Q2", "Q3"]}, "yAxis": {"type": "value"},
            "series": [{"type": "bar", "data": [120, 150, 180], "itemStyle": {"color": "#2E6DA4"}}]}}
```

`option` 是 [ECharts](https://echarts.apache.org/zh/option.html) 的 option 物件，匯出為圖片；加 `"native": true` 會在對應得過去時（長條、折線、圓餅、散布等常見圖型）匯出成 PowerPoint 可編輯的原生圖表，對應不過去就退回圖片，編輯器會說明原因。

## 影片

`{"type": "video", "mode": "online", "embed": "https://www.youtube.com/watch?v=…"}` 匯出為線上影片加封面圖。本機影片檔不會嵌入，匯出時只有封面圖，並附註請在 PowerPoint 裡插入影片。
