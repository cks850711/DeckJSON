# DeckJSON

**English** | [繁體中文](README.zh-TW.md)

**v0.2.0**

Build slides in your browser and export **real PowerPoint files** — shapes, tables and text boxes are native OOXML objects, and every one of them stays editable in PowerPoint.

The deck itself is a JSON document: hand the whole thing to an AI to rework the layout or content, paste it back, and it takes effect (still being improved).

A single HTML file — download it and it works. No account, no server, no external domains; your slides never leave your computer.

---

## Getting started

1. Download **[`deckjson.html`](https://github.com/cks850711/DeckJSON/releases/latest/download/deckjson.html)** (always the latest version)
2. Open it in **Chrome** (needed for the full open / save / save as experience)
3. Start placing things on the canvas and build your slides
4. When you're done, press **Export pptx**

That's it — there is no step five.

The interface comes in English and Traditional Chinese. It follows your browser language on first launch; switch any time under **gear → Interface language** in the toolbar.

---

## Why this tool

**The exported pptx is real.** Yellow adjustment handles still drag, charts open with “Edit Data”, the master can follow the destination theme, sections collapse. Most “slides in the browser” tools export images or approximate layouts that you can look at but not edit.

**The deck is data.** `deck.json` is the entire presentation. You drag things on the canvas, the AI edits the JSON, and both work on the same data — which is where the name DeckJSON comes from.

**Every PowerPoint shape.** The 176 built-in shapes are evaluated live from OOXML preset geometry, so the outline on the canvas **is PowerPoint's native geometry itself**, not a hand-drawn approximation. For anything the list lacks, draw it with the built-in shape editor (pen, Béziers, holes), or write the coordinates and let an AI generate them.

**Tables pasted from Excel stay tables.** Copy a table in Excel or PowerPoint and press `Cmd/Ctrl+V` on the canvas: you get an editable native table — merged cells, fills, bold/italic and alignment all kept, not a screenshot.

<details>
<summary><b>Full feature list</b> (click to expand)</summary>

**Editing**
- Rich text editing in place: select a few characters and formatting applies to just those. Mixing bold, colors and sizes in one sentence still exports as one sentence in one text box
- Mixed formatting inside table cells: superscript, subscript, colors and sizes in the same cell
- Native text formatting: underline / strikethrough / highlight / character spacing / outline / glow, bulleted and numbered lists, space before/after, hyperlinks
- Vertical text and text direction: CJK vertical, rotate 90° / 270°, Mongolian vertical
- Gradient fills, native shadows, image cropping (drag to reframe, scroll to zoom) and circle crop
- Drafting-style grid and snapping: spacing in mm / px / pt / cm; moving snaps the top-left edges, resizing snaps all four
- Layers panel, opacity, soft groups, align and distribute, format painter, color swatches, template library, deck merging

**Deck structure**
- Master (“letterhead”): shared elements under every slide, written either to the slide layout or onto every slide
- Sections: exported as native PowerPoint sections; collapse and move whole sections in the thumbnail pane
- Morph transitions: elements are matched across slides by id; older PowerPoint falls back to a fade (live slideshow playback in progress)
- Automatic slide numbers (native field, updates when slides are inserted or deleted), slide background images, file properties
- Profiles: slide size, three font slots, language and reserved zones are all data you can carry around
- Two font modes: locked, or inherited from the master; CJK and Latin fonts set separately, with locked line spacing so layouts don't shift

**Charts and media**
- Chart data is an ECharts option (for now you write it yourself or have an AI produce the whole thing; this will improve over time). The “Visual editor” tab only adjusts appearance, with a live preview on the canvas
- Two chart outputs: a 3× resolution PNG, or a native PowerPoint chart whose data you can edit in PowerPoint. Every setting in the panel says whether it has a native equivalent; ones that don't are disabled rather than silently dropped
- Image compression: shrink to N× the display size before saving; the button shows the resulting pixel size and KB first
- Video: YouTube links export as native online videos; local videos keep one frame as a cover, and the export lists which slides still need the real video

**Saving**
- Autosave: about 1 second after each change the deck is saved in the browser and restored on reload. If it can't save (storage full, private window), it says why in red instead of failing silently
- There is **only one autosave, and it is global** — see “Advanced” below
- Don't rely on autosave; **save anything important as a `.deck` file**

</details>

---

## File format

A `.deck` is a zip container:

```
mimetype              first entry, stored uncompressed. Content: application/vnd.deckjson.deck
deck.json             the presentation itself — the whole structure lives here
assets/<hash>.<ext>   image bytes, content-addressed so identical images are stored once
```

`deck.json` is plain-text JSON: extract it, edit it, give it to an AI, diff it in git. Saving writes a `generator` field recording which version produced it.

`.deck` may not be DeckJSON's extension alone, so the container's first entry is a `mimetype` that lets the file identify itself — hand the tool someone else's `.deck` and it will tell you what format it is.

---

## Reporting problems

The **`?`** on the right of the toolbar opens the help, and **the version number is shown in its header**.

The single-file build has no auto-update — the copy you have could have been downloaded at any time — so please include the following when reporting a problem:

| What to include | Where to find it |
|---|---|
| **Version** | Help panel header, e.g. `v0.1.0` |
| Browser and version | Chrome's “About Chrome” |
| The `.deck` file that has the problem | If you'd rather not share it, the `generator` field in `deck.json` also records the version that wrote it |
| Steps to reproduce | What you did, what you expected, what actually happened |

Please open a [GitHub Issue](../../issues). If the exported pptx is the problem and you're able to, attaching that pptx speeds things up a lot.

---

## Advanced

<details>
<summary><b>Does saving write back to the original file or download a copy?</b></summary>

Opened in **Chrome** (double-clicking `deckjson.html` is fine; Edge and other Chromium browsers work too), `Cmd/Ctrl+S` **writes straight back to the file you opened**, like any other app. The toolbar shows the current file name, and `●` means there are unsaved changes.

**Safari and Firefox don't have this API**, so saving falls back to “download a copy to your Downloads folder”, and you move it back over the original yourself. The toolbar button's tooltip says so, so you won't think it was saved in place.

</details>

<details>
<summary><b>Can a script or an AI agent edit a deck in the editor?</b></summary>

Yes. The page exposes `window.DJ`, a small stable API for reading and editing the open deck by id — list pages, patch elements, fit text boxes to their text, find overflowing text, and get the `.deck` / `.pptx` back as a file. Every write is one undo step, so you can take back anything a script did with Cmd/Ctrl+Z.

See **[docs/scripting-api.md](docs/scripting-api.md)**.

</details>

<details>
<summary><b>⚠ Autosave is a single global slot; multiple builds overwrite each other</b></summary>

Autosave lives in the browser's IndexedDB at the fixed location `deckjson / autosave / current`.

The catch: **pages opened by double-clicking (`file://`) all share one storage area** — not one per file. Tested: copy the same page under two different file names, write in A, and B can read what A wrote.

So if you have **more than one build** (say the generic `deckjson.html` plus a personal build packaged with `--profile`), under `file://` they **share the same autosave**: what you edit in A shows up when you open B, and B's next save overwrites A's.

To keep them separate, serve each page from a different origin — `http://localhost:<its own port>`; each port is a separate storage area. On macOS, double-click `start-localhost.command` in the project root (defaults to `http://localhost:8110`); on other platforms any static server works, e.g. `python3 -m http.server 8110`.

⚠ If you go the localhost route, **don't change the port once chosen**: a new port is a new storage area, and the autosave will seem to vanish (it's still there under the old port). Autosaves under `file://` and `localhost` are also separate from each other.

**The simplest fix is still: save important work as a `.deck` file.** Autosave is meant as a lifeline for when the browser crashes.

</details>

---

## License

MIT License, see [LICENSE](LICENSE). License notices for the bundled third-party libraries are in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

## About this project

DeckJSON is developed by a human and an AI (Anthropic Claude) working together: the author leads requirements, interaction design, acceptance testing, and architecture and licensing decisions, reviewing every round, while Claude writes the code. Claude models keep being updated; the model version that actually worked on each commit is recorded in that commit's `Co-Authored-By` trailer.
