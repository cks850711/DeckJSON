# Scripting API (`window.DJ`)

**English** | [繁體中文](scripting-api.zh-TW.md)

`window.DJ` is the stable entry point for driving DeckJSON from a script: browser automation, tests, or an AI agent editing a deck on your behalf. Everything else in the page is internal and may be renamed at any time; `DJ` is what stays put.

```js
DJ.list()                                        // pages
DJ.outline('p-abc')                              // elements on one page, summarized
await DJ.patch('p-abc', [{id: 'tx-1', set: {y: 120}}])
await DJ.fit('p-abc', ['tx-1'])                  // shrink/grow the text box to fit its text
await DJ.fitTable('p-abc', ['tb-1'])             // set table rows to fit their text
await DJ.center('p-abc', ['tb-1', 'g-fig'], {area: {x: 19, y: 132, w: 1242, h: 548}})   // center the group in an area
const blob = await DJ.toBlob()                   // the .deck file, ready to save
```

## Guarantees

- **Targets are ids, never "the current page".** Every call names the page (and element) it acts on. Nothing except `show()` changes the page the user is looking at.
- **All or nothing.** A write is prepared on a copy and validated; if any part fails, it throws and the deck is untouched.
- **Undoable.** Each write is one undo step, so the person at the keyboard can press Cmd/Ctrl+Z.
- **Settled on return.** Calls that re-render are `async` and resolve after layout (and web fonts) have settled, so a measurement taken right after is accurate.
- **Small results.** Reads return summaries by default; ask for full JSON only when you need it.
- **Errors** are thrown as `Error` with a message starting `DJ:`.
- **Unknown fields are reported, not rejected.** Every write returns `warnings`: fields in the JSON you passed that DeckJSON doesn't recognize — a misspelled name, a field on the wrong level, or one that doesn't exist. They're still written (nothing is dropped), but they have no effect, so read the list.

`DJ.version` is `1`. It changes only on incompatible changes; new verbs don't bump it.

## Ids

Pages and elements are addressed by `id`. Use `'master'` as the page id to address the master (shared background) elements.

The same element id **may appear on different pages** — that is how Morph transitions pair objects — so element ids are only unique within a page. That is why element calls always take the page id too.

## Reading

| Call | Returns |
|---|---|
| `info()` | `{version, app, title, pages, page, stage:{w,h}, master, file, dirty}` — `page` is the one on screen |
| `list()` | `[{n, id, name, els, section?, skip?, current?}]`, one per page |
| `outline(pageId)` | `[{id, type, x, y, w, h, text?, shape?, grid?, hidden?, locked?, group?, overflow?}]` — `text` is the first 40 characters; `overflow: true` marks a text box too small for its text. A table's `h` is its drawn height: `rowH` is only a minimum, and a row whose text doesn't fit grows, so adding up `rowH` can come out short |
| `get(pageId)` | The full page JSON. Image bytes are replaced by `@asset:<hash>` placeholders (named after the image content), which writes resolve back |
| `assets()` | `[{asset, type, kb, natW?, natH?, usedBy}]`: one entry per distinct image in the deck (including page backgrounds and video covers). `asset` is the placeholder string; `usedBy` lists the `{page, id}` or `{page, field}` that use it |
| `get(pageId, elementId)` | One element's full JSON |

## Writing

| Call | Does |
|---|---|
| `patch(pageId, changes)` | Applies a list of changes. Each change is `{id, set?, unset?, remove?, md?}`: `set` merges fields shallowly (to change `paras`, pass the whole array — and its formatting with it), `unset` is a list of keys to delete, `remove: true` deletes the element, and `md` replaces the text of a text box or shape **while keeping its formatting** (see below). Any other key in a change is an error. When `id` is the page's own id, the change applies to page fields: `name`, `bg`, `bgImage`, `notes`, `section`, `skip`, `transition`, `noMaster`. Returns `{page, changed, overflow}` |
| `add(pageId, elements)` | Adds elements on top of the page. Missing ids, or ids already used on that page, get a fresh one. Returns `{page, ids, overflow}` with the ids actually used, in input order |
| `addImage(pageId, src, opts?)` | Adds a picture, doing the decoding, intrinsic size and undistorted box for you. See “Images” below. Returns `{page, id, natW, natH, kb, overflow, warnings}` |
| `compress(pageId, ids?, preset?)` | Re-encodes pictures already on the slide down to what they are shown at; frame, crop and group stay as they are. See “Images” |
| `replacePage(pageId, json)` | Replaces the page's elements (and any page fields present in `json`). Fields not given keep their current values; the page id never changes. `json` may also be a bare elements array |
| `addPage(json?, afterPageId?)` | Inserts a page after `afterPageId` (default: at the end). Returns `{page, n, overflow}` |
| `removePage(pageId)` | Deletes a page. The last remaining page can't be removed |

## Layout

| Call | Does |
|---|---|
| `measure(pageId, elementId)` | `{id, w, h, needW, needH}` — the size the text box needs to hold its text exactly. Horizontal text: compare `needH` with `h`. Vertical text: compare `needW` with `w`. Changes nothing |
| `fit(pageId, ids)` | Resizes text boxes to fit their text — height for horizontal text (top edge stays), width for vertical text (left edge stays). `ids` is required, so a card deliberately taller than its text isn't collapsed by accident. Same as **Fit to text** in the editor. Returns `{page, fitted:[{id, from, to}], overflow}` |
| `fitTable(pageId, ids, opts?)` | Sets each row of the tables to the smallest height that holds its text, plus `pad` (default `10`). Cells have no top or bottom padding, so without it the text touches the borders; 10px is about PowerPoint's default cell padding (0.05 in above and below). Rows can grow or shrink. Works on any page, not just the one on screen. `opts`: `{pad}`. Same as **Fit rows to content** in the editor. Returns `{page, fitted:[{id, rowH, was, h}]}` |
| `bbox(pageId, ids)` | `{x, y, w, h}` — the box around the given elements and groups. Changes nothing |
| `center(pageId, ids, opts?)` | Moves the elements and groups together so the box around them sits in the middle of `area` (default: the whole slide). They keep their positions relative to each other; nothing is resized. `opts`: `{area: {x, y, w, h}, axis: 'both' \| 'x' \| 'y'}`. Warns when the box is bigger than the area |
| `align(pageId, ids, edge)` | Lines up one edge of each element or group with the same edge of the box around all of them, as PowerPoint's Align does. `edge`: `'left'`, `'center'`, `'right'`, `'top'`, `'middle'`, `'bottom'` |
| `stack(pageId, ids, opts?)` | Places them one after another in the order given: the first stays put, each next one starts `gap` after the previous one ends. The other axis is left alone; use `align()` for that. `opts`: `{gap: 0, axis: 'y' \| 'x'}` |
| `overflow(pageId?)` | Ids of text boxes whose text doesn't fit — the ones drawn with a red dashed frame. Without a page id: `{pageId: [ids]}` for every page that has any |
| `lint(pageId?)` | Unknown fields already in the deck (writes only check what you pass in), plus text likely to be split across lines (see “Line-break hints” below). One page, `'master'`, or the whole deck when omitted |

In `bbox`, `center`, `align` and `stack`, each entry of `ids` is an element id or a soft-group id (the `group` field in `outline()`). A group moves as one piece, so a figure and its caption stay together; an element id moves only that element, even if it is in a group. Listing an element twice, directly or through its group, is an error. Boxes ignore rotation, and a table's height is its drawn height. The three movers return `{page, moved: [{id, dx, dy}], box, overflow, warnings}`.

## Files and output

| Call | Does |
|---|---|
| `fromTemplate(src, {pages?, title?})` | Starts a new deck from a template: keeps all of the template's settings (slide size, reserved zones, fonts, style mode, master, page numbers…) and only filters its pages. `pages` is `'shown'` (default: pages not marked "skip" — templates conventionally hide their instruction and component pages), `'all'`, or an array of page ids/names in the order you want. The template's title is not reused unless you pass `title`. Returns `{pages, dropped, warnings}`. Like `load`, it is one undo step and clears the currently open file |
| `load(src)` | Loads a deck from a `Blob`/`File`/`ArrayBuffer` (`.deck` container or plain JSON), a JSON string, or an object. Clears the "currently open file", so a later Cmd/Ctrl+S can't overwrite the file that was open before |
| `toBlob()` | The deck as a `.deck` file (`Blob`) |
| `snapshot(pageId, {scale?, format?})` | A PNG (or `format: 'jpeg'`) image of one page as a `Blob` |
| `exportPptx()` | The exported `.pptx` as a `Blob`, without triggering a download |
| `show(pageId)` | Switches the editor to that page, for the person watching. The only call that changes the view |

Saving to disk is up to the caller: a browser page can't write files on its own without the user picking a location. The development server `tools/serve.py` covers both directions: `--mount /PREFIX=DIR` mounts another folder read-only so the page can fetch pictures and decks from it, and `--save DIR` accepts saved files.

```bash
python3 tools/serve.py 8111 . --mount /notes=~/notes --save ~/notes/out
```

```js
await DJ.load(await fetch('/notes/talk.deck').then(r => r.blob()))
await DJ.addImage(page, '/notes/figures/a.png', {x: 640, y: 120, w: 560, h: 420})
await fetch('/save?n=talk.deck', {method: 'POST', body: await DJ.toBlob()})
```

The server listens on 127.0.0.1 only, checks the Host and Origin headers and sends no CORS headers, so other websites can neither read the mounted files nor write into the save folder.

## Changing text without losing its formatting

Replacing `paras` through `set` replaces the formatting too: a 44 pt colored title becomes default 18 pt black text. To change only the words, use `md`:

```js
await DJ.patch(page, [{id: 'title', md: 'New title'}])
await DJ.patch(page, [{id: 'box', md: 'First line **bold part**\nSecond line'}])
```

Each line becomes a paragraph. Line *k* takes the paragraph settings (alignment, bullet, spacing) and the character style of the longest run of the old paragraph *k* (so a bold label at the start of a paragraph doesn't make the whole new paragraph bold); extra lines reuse the last old paragraph. Inline markdown (`**bold**`, `*italic*`, `==highlight==`…) still applies on top.

To start a page from a template page, copy it and then replace its text: `const {page} = await DJ.addPage(DJ.get(examplePageId), examplePageId)`.

## Images

`addImage`'s `src` can be a `Blob`/`File`, a URL the browser can fetch, a `data:` URL, or a placeholder listed by `assets()` (to reuse a picture already in the deck). `opts` is `{x, y, w, h, fit, compress, id, alt}`; any other key is an error:

| Given | Result |
|---|---|
| `w` and `h` | The picture is scaled to fit inside that box and centered; the element's frame is the scaled picture, with no empty margin |
| `w`, `h` and `fit: 'cover'` | The element's frame is the box; the picture is enlarged to fill it and the overflow is cropped |
| only `w` or only `h` | The other side follows the picture's aspect ratio |
| neither | Same as Insert Image in the editor: half the original size, at most 60% of the slide |

`x`, `y` are the box's top-left corner; omitted, the box is centered on the slide. `compress: 'web'|'std'|'print'` re-encodes to the displayed size (1.5×, 2×, 3× the pixels) using the same code as the image compression in the properties panel — **this can't be undone**. Without it, `warnings` tells you when the picture is far larger than it is shown. If what comes back isn't an image (a 404 page, say) the call throws instead of putting a broken picture on the slide.

For a picture that is already placed — when the warning showed up after the fact — use `compress(pageId, ids?, preset?)` instead of removing and re-adding it: the frame, crop and group stay put. `ids` omitted means every image element on that page (backgrounds are not included); `preset` is `'web'`, `'std'` (default) or `'print'`. Elements sharing the same picture at the same size are encoded once, so they still share one asset afterwards. Returns `{page, preset, compressed: [{id, from, to}], skipped, kb: {before, after}}`; `skipped` lists pictures already no bigger than needed. Like the panel's compression it can't be undone except with Cmd/Ctrl+Z.

```js
await DJ.addImage(page, '/figures/chart.png', {x: 640, y: 120, w: 560, h: 420, alt: 'Annual revenue'})
const logo = DJ.assets().find(a => a.usedBy.some(u => u.page === 'master'))
await DJ.addImage(page, logo.asset, {x: 40, y: 640, h: 48})
```

In JSON, pictures appear as `@asset:<hash>` placeholders. The hash is taken from the picture's content, so the same picture has the same placeholder everywhere — and it is the file name under `assets/` in the `.deck` file. Writing `{type: 'image', dataUrl: '@asset:…', …}` therefore reuses that picture too, and `natW`/`natH` may be left out. Older `@asset:<element id>` placeholders still resolve, but only while that id refers to a single picture across the deck.

## Unknown fields

A warning names the field, the level it was found on, and a hint when one is available:

```
tx-1.paras[0].runs[0].valign: unknown field on a text run — valid on a table cell, text/shape elements, not on a text run
added[0].endArrow: unknown field on shape element — arrowheads are a line kind: use shape:'arrow' or 'doubleArrow' (or 'elbowArrow')
tx-2.fil: unknown field on text element — did you mean "fill"?
```

The same check runs outside the browser: `node tools/deck-lint.js <file.deck>` lists unknown fields in a saved file (exit code 1 if there are any; `--json` for machine-readable output). It loads the app's own `src/app/model/schema.js`, so it always agrees with the warnings above.

## Line-break hints

Where a line may break is decided by Unicode's line-breaking rules: a line can break after an ordinary space, an en dash “–” or a hyphen “-”, so “2 GHz”, “2–18” or “F-42%” can end up split across two lines. Browsers and PowerPoint follow much the same rules, but with different fonts the lines have different widths — text that stays together on the canvas may still be split in PowerPoint. A pptx has no “keep this together” formatting; only the characters themselves can prevent the break:

| Case | Write |
|---|---|
| number + unit | a no-break space U+00A0 between them |
| number range | a no-break hyphen U+2011 as the range sign, or a word with no-break spaces on both sides (en dash, full-width ～ and U+2060 do not stop PowerPoint from breaking) |
| hyphen between a letter and a number | a no-break hyphen U+2011 |
| comparison sign (RL < −10 dB) | no-break spaces U+00A0 on both sides |

`lint()` lists these as hints (`pageId/elementId: "snippet": a line can break …`). They are **hints only; nothing is changed** — whether a phrase must stay together is the writer's call. The `deck-lint` command lists them too, without affecting the exit code; with `--json` they are only included when you add `--breaks` (`{file: {fields, breaks}}`), so the plain `--json` output is unchanged.

When editing text in DeckJSON (text boxes and table cells), <kbd>Cmd/Ctrl+Shift+Space</kbd> types a no-break space and <kbd>Cmd/Ctrl+Shift+Hyphen</kbd> a no-break hyphen, as in Word.

## Testing

[`tests/dj-smoke.js`](../tests/dj-smoke.js) calls every verb and checks the guarantees above, using only `DJ` and the canvas DOM. See the comment at the top of that file for how to run it.
