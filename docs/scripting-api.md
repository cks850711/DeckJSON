# Scripting API (`window.DJ`)

**English** | [繁體中文](scripting-api.zh-TW.md)

`window.DJ` is the stable entry point for driving DeckJSON from a script: browser automation, tests, or an AI agent editing a deck on your behalf. Everything else in the page is internal and may be renamed at any time; `DJ` is what stays put.

```js
DJ.list()                                        // pages
DJ.outline('p-abc')                              // elements on one page, summarized
await DJ.patch('p-abc', [{id: 'tx-1', set: {y: 120}}])
await DJ.fit('p-abc', ['tx-1'])                  // shrink/grow the text box to fit its text
const blob = await DJ.toBlob()                   // the .deck file, ready to save
```

## Guarantees

- **Targets are ids, never "the current page".** Every call names the page (and element) it acts on. Nothing except `show()` changes the page the user is looking at.
- **All or nothing.** A write is prepared on a copy and validated; if any part fails, it throws and the deck is untouched.
- **Undoable.** Each write is one undo step, so the person at the keyboard can press Cmd/Ctrl+Z.
- **Settled on return.** Calls that re-render are `async` and resolve after layout (and web fonts) have settled, so a measurement taken right after is accurate.
- **Small results.** Reads return summaries by default; ask for full JSON only when you need it.
- **Errors** are thrown as `Error` with a message starting `DJ:`.

`DJ.version` is `1`. It changes only on incompatible changes; new verbs don't bump it.

## Ids

Pages and elements are addressed by `id`. Use `'master'` as the page id to address the master (shared background) elements.

The same element id **may appear on different pages** — that is how Morph transitions pair objects — so element ids are only unique within a page. That is why element calls always take the page id too.

## Reading

| Call | Returns |
|---|---|
| `info()` | `{version, app, title, pages, page, stage:{w,h}, master, file, dirty}` — `page` is the one on screen |
| `list()` | `[{n, id, name, els, section?, skip?, current?}]`, one per page |
| `outline(pageId)` | `[{id, type, x, y, w, h, text?, shape?, grid?, hidden?, locked?, group?, overflow?}]` — `text` is the first 40 characters; `overflow: true` marks a text box too small for its text |
| `get(pageId)` | The full page JSON. Image bytes are replaced by `@asset:<id>` placeholders, which `patch`/`replacePage` resolve back |
| `get(pageId, elementId)` | One element's full JSON |

## Writing

| Call | Does |
|---|---|
| `patch(pageId, changes)` | Applies a list of changes. Each change is `{id, set?, unset?, remove?}`: `set` merges fields shallowly (to change `paras`, pass the whole array), `unset` is a list of keys to delete, `remove: true` deletes the element. When `id` is the page's own id, the change applies to page fields: `name`, `bg`, `bgImage`, `notes`, `section`, `skip`, `transition`, `noMaster`. Returns `{page, changed, overflow}` |
| `add(pageId, elements)` | Adds elements on top of the page. Missing ids, or ids already used on that page, get a fresh one. Returns `{page, ids, overflow}` with the ids actually used, in input order |
| `replacePage(pageId, json)` | Replaces the page's elements (and any page fields present in `json`). Fields not given keep their current values; the page id never changes. `json` may also be a bare elements array |
| `addPage(json?, afterPageId?)` | Inserts a page after `afterPageId` (default: at the end). Returns `{page, n, overflow}` |
| `removePage(pageId)` | Deletes a page. The last remaining page can't be removed |

## Layout

| Call | Does |
|---|---|
| `measure(pageId, elementId)` | `{id, w, h, needW, needH}` — the size the text box needs to hold its text exactly. Horizontal text: compare `needH` with `h`. Vertical text: compare `needW` with `w`. Changes nothing |
| `fit(pageId, ids)` | Resizes text boxes to fit their text — height for horizontal text (top edge stays), width for vertical text (left edge stays). `ids` is required, so a card deliberately taller than its text isn't collapsed by accident. Same as **Fit to text** in the editor. Returns `{page, fitted:[{id, from, to}], overflow}` |
| `overflow(pageId?)` | Ids of text boxes whose text doesn't fit — the ones drawn with a red dashed frame. Without a page id: `{pageId: [ids]}` for every page that has any |

## Files and output

| Call | Does |
|---|---|
| `load(src)` | Loads a deck from a `Blob`/`File`/`ArrayBuffer` (`.deck` container or plain JSON), a JSON string, or an object. Clears the "currently open file", so a later Cmd/Ctrl+S can't overwrite the file that was open before |
| `toBlob()` | The deck as a `.deck` file (`Blob`) |
| `snapshot(pageId, {scale?, format?})` | A PNG (or `format: 'jpeg'`) image of one page as a `Blob` |
| `exportPptx()` | The exported `.pptx` as a `Blob`, without triggering a download |
| `show(pageId)` | Switches the editor to that page, for the person watching. The only call that changes the view |

Saving to disk is up to the caller: a browser page can't write files on its own without the user picking a location. A typical script posts `toBlob()` to a small local receiver.

## Testing

[`tests/dj-smoke.js`](../tests/dj-smoke.js) calls every verb and checks the guarantees above, using only `DJ` and the canvas DOM. See the comment at the top of that file for how to run it.
