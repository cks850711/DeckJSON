---
name: deckjson
description: Build and edit slide decks in DeckJSON, a single-file browser editor that exports native PowerPoint (.pptx), by driving its window.DJ scripting API in a browser page. Use when the user asks to make, edit, lay out, check or save a DeckJSON deck (.deck file), or to turn notes or a document into slides with DeckJSON.
---

# DeckJSON

DeckJSON is a slide editor that runs entirely in one HTML page. A deck is JSON (saved as a `.deck` file) and exports to `.pptx`. You edit it by running JavaScript in the page through its stable scripting API, `window.DJ`, while the user watches the same page.

Reference files (read them when you need details):

- `references/scripting-api.md`: every `DJ` call, its arguments and what it returns
- `references/deck-format.md`: what each element (text box, shape, table, image, chart) looks like in JSON

If the `references/` folder is missing, the same files are in the DeckJSON repository under `docs/`: <https://github.com/cks850711/DeckJSON/tree/main/docs>.

## 1. Connect to the editor

You need a browser tab with DeckJSON open and a way to run JavaScript in it (a browser extension or automation tool that can evaluate scripts in the page). Two setups work:

| Setup | How the page is opened | Reading files | Saving |
|---|---|---|---|
| The user's own browser | The user opens `deckjson.html` (downloaded from the Releases page) in Chrome or Edge, and opens their `.deck` there | Only what the page can fetch: web pictures whose server allows cross-origin reads (CORS), and pictures already in the deck. For files on the user's disk, ask the user to insert them, or use the development server | `DJ.save()` writes back to the file the user opened (see §6) |
| Local development server | From a clone of the repository: `python3 tools/serve.py 8111 . --mount /files=<folder> --save <folder>`, then open `http://localhost:8111/src/index.html` | `fetch('/files/<path>')` reads anything in the mounted folder | `fetch('/save?n=<name>.deck', {method: 'POST', body: await DJ.toBlob()})` |

First check that the page is ready:

```js
typeof DJ === 'object' ? DJ.info() : 'DJ missing'
```

`DJ.info()` returns the title, page count, the page on screen, the open file name and whether there are unsaved changes. If `DJ` is missing, the page is not DeckJSON or the build is older than 0.3.0: ask the user to open the latest `deckjson.html`. If `DJ.save` is missing, the build predates it; use the other saving routes in §6.

Script results must be plain JSON. A `Blob` (from `toBlob`, `snapshot`, `exportPptx`) cannot be returned through most tools; use it inside the same script.

## 2. Ground rules

- **Only call `DJ`.** Never call the page's internal functions or edit its internal state. They change between versions, and some of them act on whichever page is on screen rather than the one you mean.
- **Address everything by page id and element id.** Get them from `DJ.list()` and `DJ.outline(pageId)`. Element ids are unique only within a page.
- **Work on the deck the user has open.** `DJ.load()` and `DJ.fromTemplate()` replace the whole deck and detach it from the user's file; call them only when the user asked for a new or different deck.
- **Read `warnings` on every write.** A misspelt or misplaced field is still written but does nothing; `warnings` is the only place that says so.
- **Every write is one undo step** (Cmd/Ctrl+Z), and a failed call changes nothing. Errors start with `DJ:` and say what was wrong.
- **Do not move the user's view** unless it helps them: `DJ.show(pageId)` is the only call that changes the page on screen.
- **Read summaries, not dumps.** `DJ.outline(pageId)` gives each element's id, type, frame and first 40 characters. Use `DJ.get(pageId)` only when you need the full JSON of a page.
- **Stay faithful to the source.** When the slides are made from the user's notes or document, every fact, figure and claim on them must come from that source. You may derive from it — shorten, reword, regroup, total a column, turn a list into a table — but list each derived item when you hand back, so the user can check it. Do not add facts the source does not contain (a subtitle, a statistic, a date, a tagline); if a slide seems to need one, leave a visible placeholder and say so.

## 3. Build content

| Task | Call |
|---|---|
| New page | `DJ.addPage({name, elements: [...]}, afterPageId)`; to reuse a layout, `DJ.addPage(DJ.get(examplePageId), afterPageId)` and change its text |
| Replace a page's content | `DJ.replacePage(pageId, {elements: [...]})` |
| Add elements | `DJ.add(pageId, [...])`; it returns the ids actually used |
| Change text, keep formatting | `DJ.patch(pageId, [{id, md: 'New title'}])`. Do not replace `paras` just to change words; that resets size and colour |
| Change fields | `DJ.patch(pageId, [{id, set: {...}}, {id, unset: ['fill']}, {id, remove: true}])` |
| Page settings (notes, background, hidden) | `DJ.patch(pageId, [{id: pageId, set: {notes: '...'}}])` |
| Pictures | `DJ.addImage(pageId, url, {x, y, w, h, alt})`: keeps the aspect ratio. Never write `dataUrl` yourself. If it warns the picture is much larger than needed, `DJ.compress(pageId, [id])` |
| Copy elements or a whole group to another page | `DJ.copy(fromPageId, ids, toPageId, {x, y})` |

Element JSON is in `references/deck-format.md`. The short version: coordinates in pixels on a 1280 × 720 slide, font sizes in points, colours as six hex digits without `#`, paragraphs as `{md: 'text with **bold**'}`, arrows as `{type: 'shape', shape: 'arrow', ...}`.

### Starting from a template

`DJ.fromTemplate(templateBlob, {title})` starts a new deck with the template's slide size, fonts, master and settings, keeping only its pages that are shown in the slide show. Templates often keep their rules in a hidden page's speaker notes and reusable components on hidden pages; read those first. To bring a component along, keep its page with `{pages: [...]}` and use `DJ.copy` with the component's group id, then `DJ.removePage` the component page. Do not use `get` + `add` to move components: pictures would stay placeholders and group ids would not be renewed.

## 4. Lay out

Let DeckJSON measure; do not compute text heights or positions by hand.

1. **Size first.** `DJ.fit(pageId, [ids])` makes text boxes exactly as tall as their text. `DJ.fitTable(pageId, [ids])` sets table rows to fit their text (cells have no padding of their own). Run them again after changing text, font size or column widths. Do not refit boxes whose size is meant to be fixed, such as a template's title box.
2. **Then position.** `DJ.stack(pageId, ids, {gap})` places items one after another; `DJ.distribute(pageId, ids, {area: {x, y, w, h}})` spreads side-by-side cards evenly across an area (add `axis: 'y'` for a column), so you never compute `x = left + i × step` yourself; `DJ.align(pageId, ids, 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom')` lines them up; `DJ.center(pageId, ids, {area: {x, y, w, h}})` centres the whole group in the content area. `ids` may include group ids, so a picture and its caption move together.
3. A warning that a group is larger than the area means the content does not fit: shorten it or split the page.

## 5. Check

- `DJ.overflow()` should return `{}`. Anything listed is a text box whose text does not fit.
- `DJ.lint()` should return `[]` at the end. It lists unknown fields and spots where a line break could split a number from its unit.
- **Look at every page you changed.** `DJ.show(pageId)` and take a screenshot, or render it with `DJ.snapshot(pageId)` if you can view the image.

### Keep numbers and units together

Line breaks follow Unicode rules in both the browser and PowerPoint, and PowerPoint's fonts may wrap at different places than the canvas. Glue these with invisible characters, written by code rather than typed:

| Case | Write |
|---|---|
| Number and unit (`5 mm`, `20 °C`) | No-break space U+00A0 between them |
| Range | `2 to 18` with U+00A0 around `to`, or a non-breaking hyphen U+2011 as the dash (an en dash can break) |
| Hyphen between letters and digits (`F-42`) | Non-breaking hyphen U+2011 |
| Comparison (`x < 5`) | U+00A0 on both sides of the sign |

## 6. Save

| Situation | What to do |
|---|---|
| User's browser, file opened or saved before | `await DJ.save()` writes it back. If the file changed on disk since it was opened, it throws; ask before using `{force: true}` |
| `DJ.save()` throws "no file is open" or "no write permission" | The browser needs the user's own click once. Ask them to press Cmd/Ctrl+S (the first time, choose where to save); after that `DJ.save()` works |
| Local development server | `await fetch('/save?n=<name>.deck', {method: 'POST', body: await DJ.toBlob()})` |
| PowerPoint file wanted | `DJ.exportPptx()` returns the `.pptx` as a Blob. On the development server, POST it to `/save?n=<name>.pptx`; in the user's browser, ask them to use the Export button |

Do not trigger downloads or open file dialogs from script: they either fail silently or leave files the user did not ask for. The editor also keeps an automatic backup in the browser, but that is not a saved file.

## 7. Hand back

Tell the user which pages you changed, anything you could not do (with the `DJ:` error text), and whether the deck is saved. If it is not saved, say what they need to press.

If the slides came from a source, also list what you derived rather than copied (for example "slide 3: the total row is the sum of the four rows above", "slide 1: subtitle shortened from the first paragraph") and any placeholder you left for missing facts.
