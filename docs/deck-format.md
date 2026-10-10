# Deck format (`deck.json`)

**English** | [繁體中文](deck-format.zh-TW.md)

What a slide, and each kind of element on it, looks like in JSON. This is what you pass to `DJ.add()`, `DJ.addPage()` and `DJ.replacePage()` (see [scripting-api.md](scripting-api.md)), what `DJ.get()` returns, and what the JSON panels in the editor show.

The fastest way to get a shape right is to copy one: `DJ.get(pageId, elementId)` on something that already looks the way you want. Every write returns `warnings` for fields DeckJSON does not recognise, so a misspelt or misplaced field is reported instead of silently doing nothing. `DJ.lint()` checks the whole deck.

## Units and conventions

| What | Unit |
|---|---|
| `x`, `y`, `w`, `h` | Pixels on the slide, origin at the top left. The default slide is 1280 × 720 (`DJ.info().stage`) |
| `sizePt`, `linePt`, `inset`, `spaceBefore`, `spaceAfter` | Points |
| Colours | Six hex digits **without** `#`: `"1F3A5F"`. Chart options are ECharts and use its own `"#1F3A5F"` form |
| `opacity` | Percent, 0–99; leave it out for fully opaque |
| `id` | Unique within a page. The same id on two pages is allowed and is how Morph pairs objects between slides |

## Deck and page

```json
{
  "title": "Quarterly review",
  "stage": {"w": 1280, "h": 720},
  "fonts": {"ea": "PingFang TC", "latin": "Arial"},
  "master": {"on": true, "elements": []},
  "pages": [
    {"id": "p1", "name": "Summary", "bg": "FFFFFF", "notes": "Speaker notes", "elements": []}
  ]
}
```

| Page field | Meaning |
|---|---|
| `id`, `name` | Page id (used by every `DJ` call) and a label |
| `bg` | Background colour. `bgImage` is a background picture (`@asset:…` or a `data:` URL) |
| `notes` | Speaker notes (plain text) |
| `section` | Starts a section at this page (exported as a PowerPoint section) |
| `skip` | `true` = hidden in the slide show. Templates use this for instruction and component pages |
| `noMaster` | `true` = this page does not show the master elements |
| `transition` | `{"type": "morph" \| "fade" \| "push" \| "wipe", "dur": 600}`; `dur` (ms) applies to Morph |

Page fields are changed with `DJ.patch(pageId, [{id: pageId, set: {…}}])`. The master (elements shared by every page) is addressed as page id `"master"`.

### Deck-level md settings

`"markdown": {"highlight": "E9C46A", "syntax": {"html": false}}` sets how the `md` shorthand is expanded: `highlight` is the colour of `==…==` and `<mark>` (default `FFFF00`), and `strike`, `mark`, `math` and `html` under `syntax` switch `~~`, `==`, `$$` equations and the HTML tags on or off (all `true` by default). Write only the keys that differ from the defaults; without the field, everything is default. Change it with `DJ.setDeck({markdown: {…}})` or in the editor under Deck settings → Markdown shorthand. The settings apply only to `md` written afterwards; existing text is not redrawn.

## Fields every element has

| Field | Meaning |
|---|---|
| `id`, `type` | `type` is `text`, `shape`, `image`, `table`, `chart` or `video` |
| `x`, `y`, `w`, `h` | Frame. Tables have no `w`/`h`; their size comes from `colW` and `rowH` |
| `rot` | Rotation in degrees, clockwise |
| `groupId` | Elements with the same `groupId` move together. Layout calls accept the group id in place of element ids |
| `hidden`, `locked` | `hidden`: not drawn and not exported. `locked`: cannot be moved or edited on the canvas |
| `alt` | Alternative text |
| `link` | `{"url": "https://…"}` or `{"slide": 3}`, optional `"tooltip"` |
| `shadow` | `{"blur": 8, "offset": 4, "angle": 270, "color": "808080", "opacity": 0.5}` |
| `lineSpacing` | Line spacing as a multiple of the font size (0.5–5) |

## Text box

```json
{"id": "t1", "type": "text", "x": 80, "y": 160, "w": 520, "h": 60,
 "paras": [
   {"md": "Revenue grew **18%** year on year", "align": "left"},
   {"md": "Driven by the new product line", "bullet": {"type": "bullet", "level": 0}}
 ],
 "valign": "top", "inset": 6}
```

| Field | Values |
|---|---|
| `paras` | Paragraphs, each with `runs` or the `md` shorthand (below) |
| `valign` | `top`, `middle`, `bottom` |
| `inset` | Inner margin in points |
| `nowrap` | `true` = do not wrap lines |
| `vert` | Vertical text: `eaVert` (CJK vertical), `vert`, `vert270`, `mongolianVert` |
| `fill`, `lineColor`, `linePt`, `dash` | Box fill and outline. `dash`: `sysDot`, `dash`, `lgDash`, `dashDot`, `lgDashDot` |
| `grad` | Gradient fill: `{"type": "linear" \| "radial", "angle": 90, "stops": [{"pos": 0, "color": "FFFFFF"}, {"pos": 100, "color": "1F3A5F"}]}` |

After writing or changing text, call `DJ.fit(pageId, [id])` to make the box exactly as tall as its text, and check `DJ.overflow()`.

### Paragraphs and runs

| Paragraph field | Values |
|---|---|
| `md` | One line of text with inline markdown, expanded into `runs` when applied; a line that is all `$$…$$` becomes an equation (see “Equations” below) |
| `math` | `true` = this paragraph is an equation, with the LaTeX in the `text` of its single run. When writing you can also give the string directly: `"math": "E=mc^2"` |
| `runs` | `[{"text": "…", "bold": true, "sizePt": 18, "color": "1A1A1A"}, …]`. Text without a size is 18 pt |
| `align` | `left`, `center`, `right`, `justify` |
| `bullet` | `{"type": "bullet" \| "number", "level": 0}`. Numbering follows PowerPoint: each level counts on its own, a deeper level starts from 1 and the outer level carries on after it, and a paragraph without a bullet (or a bullet paragraph at the same or an outer level) ends the list. A number may add `"startAt": 9` to start from 9; put it on the first item only, and the following items continue (10, 11, …) |
| `spaceBefore`, `spaceAfter` | Points |

Run fields: `text`, `bold`, `italic`, `underline`, `strike`, `sizePt`, `color`, `highlight` (colour), `fontFace`, `charSpacing` (points), `sub`, `sup`, `link` (`{"url"}` or `{"slide"}`), `outline` (`{"size", "color"}`), `glow` (`{"size", "color", "opacity"}`).

The `md` shorthand understands `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `<sub>subscript</sub>`, `<sup>superscript</sup>`, `<u>underline</u>`, `<mark>highlight</mark>`, `[text](https://…)` and `[text](#3)` (jump to slide 3), and the marks nest: `==**key point**==`, `**H<sub>2</sub>O**`. Put a backslash before a symbol to keep it literal: `\*`, `\=`, `\<`. An opening mark cannot be followed by a space and a closing mark cannot follow one, so `a * b * c` stays as typed. A single `~` is always literal (Markdown dialects disagree on what it means), and only those four HTML tags count, without attributes and in pairs. `~~`, `==`, `$$` and the HTML tags can be turned off and the highlight colour changed; see “Deck-level md settings” below. A backslash also keeps `$` literal: `\$$` stays as typed.

**Equations**: a paragraph written as `{"md": "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$"}` (the whole paragraph, only spaces around it) or `{"math": "…"}` is an equation: the canvas draws it with KaTeX and the export writes a PowerPoint equation you can click into and edit. It is saved as `{"math": true, "runs": [{"text": "the LaTeX", "sizePt": 24, "color": "C00000"}]}`; size and colour come from that run. `$$` in the middle of a paragraph stays literal, and table cells do not support equations. Broken LaTeX shows in red on the canvas, is listed by `DJ.lint()`, and is exported as its source text. While you edit on the canvas an equation shows as `$$source$$` and is laid out again when you leave; typing a whole paragraph as `$$…$$` also makes an equation. LibreOffice only understands an equation that has a text box to itself; in a box shared with other paragraphs it shows the LaTeX source instead (PowerPoint is not affected).

Runs written with `text` are always literal, so `**` inside them stays as typed. Run-level `sizePt` and `color` are not part of `md`; to change the text of an existing box and keep its styling, use `DJ.patch(page, [{id, md: "new text"}])` instead of replacing `paras` (it throws when one paragraph mixes colours or sizes; see [scripting-api.md](scripting-api.md)).

## Shape

```json
{"id": "s1", "type": "shape", "shape": "roundRect", "x": 80, "y": 300, "w": 240, "h": 90,
 "fill": "E8F0FA", "lineColor": "2E6DA4", "linePt": 1,
 "paras": [{"md": "**Step 1**", "align": "center"}], "valign": "middle"}
```

`shape` is a PowerPoint preset name: `rect`, `roundRect`, `ellipse`, `triangle`, `diamond`, `hexagon`, `chevron`, `homePlate`, `rightArrow`, `leftRightArrow`, `wedgeRectCallout`, `flowChartProcess`, `flowChartDecision`, `star5`, `cloudCallout`, and the rest of PowerPoint's set (the shape picker in the editor lists them all). A shape can hold text with the same fields as a text box. `adjs` holds the yellow-handle adjustments in OOXML units (100000 = 100%); `flipH`/`flipV` mirror it.

**Lines and arrows** are shapes too: `line`, `arrow`, `doubleArrow`, `elbow`, `elbowArrow`, `elbowDoubleArrow`. They run from the top-left to the bottom-right corner of the frame; `flipH`/`flipV` change the direction, and `h: 0` gives a horizontal line. There is no `endArrow` field; the arrowhead is part of the shape name.

```json
{"id": "a1", "type": "shape", "shape": "arrow", "x": 330, "y": 345, "w": 120, "h": 0, "lineColor": "2E6DA4", "linePt": 2}
```

`custGeom` with a `points` array draws a free-form shape; draw one in the editor and read it back with `DJ.get` rather than writing it by hand.

## Image

Add pictures with `DJ.addImage(pageId, src, {x, y, w, h})`: it reads the file, keeps the aspect ratio and stores the bytes once. Do not write `dataUrl` yourself. Fields you may change afterwards:

| Field | Values |
|---|---|
| `fit` | `"cover"` = fill the frame and crop the overflow; leave out to fit inside |
| `crop` | `{"l": 0.1, "t": 0, "r": 0.1, "b": 0}`, fractions of the picture cut from each side |
| `round` | `true` = circular crop |
| `flipH`, `flipV` | Mirror |

To reuse a picture already in the deck, pass its placeholder from `DJ.assets()` to `addImage`.

## Table

```json
{"id": "tb1", "type": "table", "x": 80, "y": 160,
 "colW": [360, 200, 200], "rowH": [40, 36, 36],
 "border": {"pt": 0.75, "color": "BFC8D6"},
 "cells": [
   [{"text": "Item", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"},
    {"text": "Q1", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"},
    {"text": "Q2", "bold": true, "color": "FFFFFF", "fill": "1F3A5F", "align": "center"}],
   [{"text": "Orders"}, {"text": "1,280", "align": "right"}, {"text": "1,516", "align": "right"}],
   [{"md": "**Total**"}, {"text": "1,280", "align": "right"}, {"text": "1,516", "align": "right"}]
 ]}
```

| Field | Meaning |
|---|---|
| `colW` | Column widths. Their sum is the table width |
| `rowH` | Minimum row heights. A row grows when its text does not fit, so read the drawn height from `DJ.outline()`, not by adding up `rowH` |
| `cells` | Rows of cell objects. Every row has one cell per column |
| `border` | Whole-table lines `{"pt", "color", "dash": true?}` |

Cell fields: `text`, `runs` or `md` for the content (text defaults to 12 pt dark grey, so set `sizePt` for slides meant to be read from a distance); `bold`, `italic`, `color`, `sizePt`, `fill`, `align`, `valign`, `lineSpacing`; `colspan`/`rowspan` for merged cells, with the cells they cover set to `{"covered": true}`; `border` per side, `{"t": {"pt": 1.5, "color": "1F3A5F"}, "b": null}` (`null` = no line on that side).

Cells have no top or bottom padding of their own. After writing a table, call `DJ.fitTable(pageId, [id])`, which sets each row to fit its text plus a little space.

## Chart

```json
{"id": "c1", "type": "chart", "x": 640, "y": 160, "w": 560, "h": 360,
 "option": {"xAxis": {"type": "category", "data": ["Q1", "Q2", "Q3"]}, "yAxis": {"type": "value"},
            "series": [{"type": "bar", "data": [120, 150, 180], "itemStyle": {"color": "#2E6DA4"}}]}}
```

`option` is an [ECharts](https://echarts.apache.org/en/option.html) option object. It exports as a picture; `"native": true` asks for a native, editable PowerPoint chart when the option can be mapped (common types such as bar, line, pie and scatter); otherwise it falls back to a picture and the editor says why.

## Video

`{"type": "video", "mode": "online", "embed": "https://www.youtube.com/watch?v=…"}` exports as an online video with a cover picture. Local video files are not embedded; they export as a cover picture with a note to insert the video in PowerPoint.
