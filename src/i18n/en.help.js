/* 英文說明面板本文（HTML）。結構要與中文版逐節對應：data-tab 分頁數、data-fig 配圖順序相同，
   tools/i18n-check.py 會核對。開啟說明時整份放進 #helpBody，再由 applyHelpTabs() 切分頁。
   用 String.raw 包住，反斜線照字面保留；但內文不可出現反引號與「${」（i18n-check.py 會擋）。 */
var I18N_PACKS=I18N_PACKS||{};
(I18N_PACKS.en=I18N_PACKS.en||{}).help=String.raw`
      <h4 data-tab="Basics">What this is</h4>
      <p>A <b>single-file tool</b> for designing slides together with an AI: place text, tables, images, shapes, ECharts charts and videos on a canvas and export a <b>native PPTX</b>, with positions, sizes and formatting carried over faithfully. <b>Everything runs on your own computer and nothing connects to outside websites</b> — fonts come from what is installed on your machine; no web fonts are downloaded.</p>
      <h4>What's on screen</h4>
      <div data-fig="ui-layout"></div>
      <ul>
        <li><b>Toolbar at the top</b>: new / open / save / save as, undo and redo, insert (text, table, image, shape, chart, video); the right half has layers, JSON, snapshot, deck settings, the gear, export and help.</li>
        <li><b>Slide list on the left</b>: slide thumbnails you can drag to reorder, with “New slide” and “Master” at the bottom.</li>
        <li><b>Canvas in the middle</b>: the slide itself. Things dragged past the edge stay there, semi-transparent; they don't disappear.</li>
        <li><b>Properties panel on the right</b>: its content follows <b>what you selected</b> — an element shows its settings; with nothing selected it shows the slide's properties.</li>
        <li><b>Floating bar at the bottom right of the canvas</b>: zoom, fit width / height, grid and snapping. This bar holds <b>view settings</b> and doesn't travel with the deck file.</li>
      </ul>
      <h4>Saving</h4>
      <ul>
        <li><b>Autosave</b>: about 1 second after every change the deck is saved in the browser (IndexedDB), and <b>it is restored automatically when you reload or reopen the tab</b>; the status bar at the bottom shows the save time. If it can't save (storage full, private window), it says why <b>in red</b> instead of failing silently.</li>
        <li><b>New</b> (the leftmost toolbar group): clears everything; it asks you to <b>press twice to confirm</b>, and <kbd>Cmd/Ctrl+Z</kbd> can still take it back. <b>Open</b> / <b>Save</b> / <b>Save as</b> (same group): read and write <code>.deck</code> files (the content is still JSON, and old <code>.deck.json</code> files open as well). <b><kbd>Cmd/Ctrl+S</kbd></b> writes back to the file you opened, <b><kbd>Cmd/Ctrl+Shift+S</kbd></b> saves to a new location; the status bar shows the current file name, and <b>●</b> means there are unsaved changes. <b>Overwriting in place needs the page opened from <code>http://localhost</code></b> (use <code>start-localhost.command</code> in the project root) — browsers don't grant write access to a page opened by double-clicking, so saving falls back to “download a copy to your Downloads folder”, and the hint bar says so.</li>
        <li>There is only one autosave, and it lives only in this browser. <b>Save anything important as a file</b> — that is the form you can back up, move and paste to an AI.</li>
      </ul>
      <h4 data-tab="Editing">Selecting and moving</h4>
      <div data-fig="edit-select"></div>
      <ul>
        <li><b>One item</b>: just click it. Drag to move (it snaps magnetically near the slide's center lines and edges), resize with the eight handles on the corners and edge midpoints, nudge with the arrow keys (hold <kbd>Shift</kbd> for 10px steps), <kbd>Delete</kbd> removes it, <kbd>Cmd/Ctrl+D</kbd> duplicates it.</li>
        <li><b>Several items</b>: <kbd>Shift</kbd>- or Cmd-click to add and remove, or drag on empty space to <b>marquee-select</b> — everything the box touches gets selected.</li>
        <li>With several selected, dragging a <b>corner</b> scales the whole set proportionally, positions, sizes and text sizes included; dragging the body moves them together. The right panel takes a scale percentage directly and can align them too.</li>
        <li>Objects dragged off the slide don't disappear; they <b>stay there, semi-transparent</b>, ready to be dragged back. That area is just a parking lot: export writes them at their coordinates and gives you a <b>runs off the slide</b> warning.</li>
        <li>Every element except tables has a <b>faint dashed outline</b> showing the box's real size — especially useful for text boxes with no fill, where you otherwise can't tell how big they are.</li>
        <li>Undo and redo: <kbd>Cmd/Ctrl+Z</kbd> and <kbd>Cmd/Ctrl+Shift+Z</kbd>, 60 steps.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: which axis proportional scaling follows</summary>
        <ul>
          <li>Proportional scaling has only one ratio, so when dragging a corner of a multi-selection, <b>the axis the pointer moved further along</b> wins.</li>
          <li>With a single selection, “Scale %” in the right panel scales proportionally, keeping size, text size, column widths, row heights and line widths in step; decimals are fine.</li>
        </ul>
      </details>
      <h4>Aligning, distributing and snapping</h4>
      <div data-fig="edit-snap"></div>
      <ul>
        <li><b>Align and distribute</b>: with several selected, the right panel offers left / center / right and top / middle / bottom alignment, plus horizontal and vertical distribution — distributing needs three or more; the first and last stay put and the rest are spaced evenly.</li>
        <li><b>Grid</b>: toggled with the “Grid” button in the floating bar at the canvas's bottom right. Three levels make distances readable — dashed every cell, a thin solid line every 5 cells, a thick solid line every 10, origin at the slide's top left, 5mm spacing by default.</li>
        <li>Spacing, the thin and thick line intervals and the color (default <code>#ADB5BD</code>) are all set in <b>the small arrow on the right half of the grid button</b>. The switch and its settings live together, not in the right panel.</li>
        <li><b>Snap</b>: with “Snap” in the same bar turned on, <b>moving snaps only the left and top edges</b>; resizing with the white square handles snaps all four edges, and so do table column/row handles and line end points. Moving a group snaps the bounding box's top-left corner; positions inside the group don't change.</li>
        <li><b>Guides beat the grid</b>: snapping to the slide's center lines, edges and reserved zone borders is always on and takes priority over the grid.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: why moving snaps only two edges, and when snapping is off</summary>
        <ul>
          <li>If all four edges snapped, elements whose width isn't a whole number of grid cells would get pulled back and forth between two sets of snap points, which feels sticky; so moving snaps only the left and top edges.</li>
          <li>The grid is dense enough to snap almost anywhere; without priority for guides you could never hit a center line again.</li>
          <li>Rotated elements and proportionally locked resizes don't snap — their edges aren't parallel to the grid, so snapping wouldn't line them up anyway.</li>
          <li>The grid lives only on the canvas: it isn't exported, isn't in snapshots and isn't written to the <code>.deck</code> file; its settings are stored in this browser.</li>
        </ul>
      </details>
      <h4 data-tab="Groups &amp; layers">Soft groups</h4>
      <div data-fig="edit-group"></div>
      <ul>
        <li>Select several items and press “Group”. From then on, clicking any member <b>selects the whole group</b>, which moves and scales as one; <b>double-click to go inside</b> and edit a single member. To split it up, press “Ungroup” in the single- or multi-selection panel.</li>
        <li><b>A group has no coordinates of its own</b>; its members stay independent. So the X / Y / Width / Height in the right panel describe the <b>bounding box</b>: changing X / Y moves the whole group, changing width / height scales the group from the box's top-left corner, with an optional ratio lock and optional text scaling.</li>
        <li>On export, groups are flattened into separate elements — PowerPoint doesn't see a group, but positions and sizes are exactly the same.</li>
      </ul>
      <h4>Layers</h4>
      <div data-fig="edit-layers"></div>
      <ul>
        <li>The <b>Layers</b> panel on the right side of the toolbar (you can drag it around) lists every element on this slide, <b>top row = frontmost</b>. Drag rows to change the stacking order.</li>
        <li>The eye button shows / hides, the lock button locks. Locked elements can't be clicked or dragged on the canvas, but can still be selected from the panel — handy when something else covers them.</li>
        <li><b>Hidden elements are neither rendered nor exported.</b></li>
        <li>Clicking a row selects that element; if it belongs to a group, the whole group is selected.</li>
      </ul>
      <h4>Format painter, scaling and opacity</h4>
      <ul>
        <li><b>Format painter</b>: select the source element and arm <b>Copy style</b> (the brush icon) at the bottom of the right panel — the cursor turns into a copy cursor and a hint shows at the top — then click targets to give them the source's font, color, alignment, fill, border and opacity. <b>Content and size stay as they are.</b> You can apply it to many in a row; <kbd>Esc</kbd> cancels.</li>
        <li><b>Scale</b>: the right-panel slider goes from 0.1 to 2.0×, with detents at 0.5 / 0.8 / 1.0 / 1.2 / 1.5; “Incl. text” next to it is on by default. It springs back to 1.0 when released. “Lock ratio” and “Scale text” next to width and height are off by default and affect what typing numbers and dragging handles do.</li>
        <li><b>Opacity</b>: a 0–100% slider in the right panel, exported as PowerPoint's native <code>transparency</code>. Works for images, shape fills, borders and table fills.</li>
        <li>Images and shapes also have an <b>angle</b>, a one-click <b>90° clockwise</b>, and <b>horizontal / vertical flip</b>. After rotating, the selection box and handles rotate too, and resizing is converted for the angle, so dragging still behaves correctly.</li>
      </ul>
      <h4>How the right panel is organized</h4>
      <p class="hWhere">The right panel's tabs <b>change with what you selected</b>. If you can't find a setting, first check that you selected the right thing.</p>
      <div class="tblWrap"><table>
        <tr><th>Selection</th><th>Right-panel tabs</th></tr>
        <tr><td>Text box</td><td>Layout / <b>Text</b> / <b>Paragraph</b> / Effects</td></tr>
        <tr><td>Shape</td><td>Layout / <b>Shape</b> / Effects</td></tr>
        <tr><td>Image</td><td>Layout / <b>Image</b> / Effects</td></tr>
        <tr><td>Table</td><td>Layout / <b>Table</b> / <b>Cells</b> (no Effects tab)</td></tr>
        <tr><td>Several items or a group</td><td>No tabs: position &amp; size (bounding box), layout, align &amp; distribute, group &amp; actions</td></tr>
        <tr><td>Nothing</td><td>No tabs: slide style, section, speaker notes, templates &amp; merge</td></tr>
      </table></div>
      <ul>
        <li>The <b>Layout</b> tab always has three parts: position &amp; size, transform, arrange. Above X you can switch units between px / pt / cm; px is the default.</li>
        <li>The <b>Effects</b> tab holds hyperlinks and shadows. Tables don't have it — empty tabs are removed rather than left as a shell with nothing inside.</li>
        <li>The <b>actions</b> row is pinned to the very bottom of the right panel: format painter, duplicate, slide JSON, delete. It isn't part of any tab and is always there.</li>
        <li>Whole-deck settings (slide size, fonts, page number, reserved zones, profile) aren't in the right panel but under <b>“Deck settings”</b> in the toolbar; the grid is a view setting of this browser, next to the grid button.</li>
      </ul>
      <h4 data-tab="Text">Editing in place</h4>
      <div data-fig="txt-inline"></div>
      <ul>
        <li><b>Double-click</b> a text box or shape to start typing; bold, colors and highlights are <b>visible and editable</b>. Double-clicking a table cell edits its content; double-clicking a chart edits its option.</li>
        <li><b>Select a few characters and the formatting buttons in the right panel apply to just those</b>; with no selection they apply to the whole text box.</li>
        <li>Clicking buttons in the right panel while editing <b>doesn't end the editing</b>, and your selection stays — set one thing, then the next.</li>
        <li>The <b>plain-text box</b> in the right panel is a shortcut for “replace the whole box” and clears mixed formatting inside it. When it detects mixed formatting it asks first. To keep formatting, edit in place on the canvas.</li>
      </ul>
      <h4>Character styles</h4>
      <p class="hWhere">In the right panel's <b>“Text” tab</b> (text style) and <b>“Paragraph” tab</b> (advanced character). These two tabs only appear with a text box selected.</p>
      <div data-fig="txt-run"></div>
      <ul>
        <li>Besides bold and italic there are <b>U underline</b>, <b>S strikethrough</b>, <b>highlight</b> (a highlighter-style background), superscript and subscript.</li>
        <li>“Advanced character” has <b>spacing</b>, a <b>custom font</b> (overrides this one element only; leave it empty to follow the global font settings), <b>outline</b> and <b>glow</b>.</li>
        <li><b>Every one of these can apply to just the selected characters.</b> Mixing bold, colors and sizes within one sentence is fine.</li>
        <li>After export, that sentence is still <b>one sentence in one text box</b> in PowerPoint; it isn't cut into several text boxes.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: export mapping</summary>
        <ul>
          <li>All of the above are written as native PowerPoint character properties, not drawn effects.</li>
          <li>Line spacing is locked to an exact value on export (<code>spcPts</code>), so it doesn't drift with the destination's fonts; line spacing of a single cell can be fine-tuned in the JSON.</li>
        </ul>
      </details>
      <h4>Paragraphs</h4>
      <div data-fig="txt-para"></div>
      <ul>
        <li><b>Bullets and numbering</b>: the “Paragraph” section switches between <b>none</b>, <b>• bullets</b> and <b>1. numbers</b>; <b>−</b> and <b>＋</b> change the indent level. Each level is 18pt, PowerPoint's default 0.25 inch, as a hanging indent — wrapped lines align with the text of the first line, not under the bullet.</li>
        <li>Exported as native lists (<code>buChar</code> / <code>buAutoNum</code>), so they're real lists in PowerPoint, not typed symbols.</li>
        <li><b>Space before and after</b> is separate from line spacing: line spacing sets the height of each line within a paragraph; space before/after sets the gap between paragraphs.</li>
        <li><b>Line spacing</b> is measured in “× size”, for both text boxes and tables.</li>
      </ul>
      <h4>Hyperlinks, vertical text and padding</h4>
      <ul>
        <li><b>Hyperlinks</b>: enter a URL, or <code>#3</code> to jump to slide 3 of this deck. Linked text gets an underline automatically; the color stays the text color you set.</li>
        <li><b>Vertical text and text direction</b>: text boxes and shapes can use <b>vertical (CJK)</b>, <b>rotate 90° / 270°</b> or <b>vertical (Mongolian)</b>. The <b>text turns inside the box; the box itself doesn't</b> — use “Rotate” to turn the whole box. In vertical mode CJK characters stand upright and Latin text lies on its side, as in PowerPoint; editing in place still works.</li>
        <li><b>Text box padding</b>: keeps text off the edge of filled, card-style text boxes. <b>No wrap</b> suits one-line labels; the box grows with the text.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: export mapping for these</summary>
        <ul>
          <li>The link underline is the <code>u="sng"</code> PptxGenJS always adds; the canvas shows it too, so the preview is the result.</li>
          <li>Vertical text exports as a native <code>&lt;a:bodyPr vert&gt;</code>; padding as <code>lIns/tIns/rIns/bIns</code>; no wrap as <code>wrap="none"</code>.</li>
        </ul>
      </details>
      <h4>Shorthand for AI</h4>
      <ul>
        <li>A paragraph in the JSON can use <code>"md"</code> instead of <code>runs</code>, supporting <code>**bold**</code>, <code>*italic*</code>, <code>~~strikethrough~~</code>, <code>==highlight==</code> and <code>[text](url)</code>, where <code>[text](#3)</code> jumps to slide 3.</li>
        <li>When applied it is expanded into proper <code>runs</code> and <code>md</code> is removed, so <b>no markdown is left in the saved file</b>.</li>
        <li>The <code>text</code> field is <b>always literal text and never parsed</b>, so content that happens to contain <code>**</code> won't get mangled.</li>
      </ul>
      <h4 data-tab="Tables">Columns, rows and merging</h4>
      <div data-fig="tbl-handles"></div>
      <ul>
        <li><b>Column widths and row heights</b>: with the table selected, blue handles appear along the top and left edges; drag them. To add a column or row, use “＋ Column” / “＋ Row” under Structure in the right panel's <b>“Table” tab</b>.</li>
        <li><b>Deleting a whole column or row</b>: the grey segments between the handles turn red on hover; click to delete. Merged cells shrink automatically, and other column widths and row heights are unaffected.</li>
      </ul>
      <h4>Merging cells</h4>
      <p class="hWhere">Merging uses a button that pops up on the canvas, not the right panel. The “Merge” section of the right panel's <b>“Table” tab</b> only holds instructions, no button.</p>
      <div data-fig="tbl-merge"></div>
      <ul>
        <li><b>How to merge</b>: drag across the cells to select the ones to merge, then press “Merge cells”, which pops up next to the selection.</li>
        <li><b>Existing merges are never cut</b>: if the selection only covers half of a merged cell, it grows outward to include the whole block before merging.</li>
        <li><b>Unmerge</b>: select a single merged cell and the button becomes “Unmerge”; pressing it splits it back into the original cells.</li>
        <li><b>Grab the outer rim to move the whole table</b>: the inside of the cells is taken by drag-selection, so move the table by its outermost border (about 16px wide). To change a cell's text, double-click it.</li>
      </ul>
      <h4 data-tab="Table styles">Styling just some cells</h4>
      <p class="hWhere">Everything in this section is under the right panel's <b>“Cells” tab</b>. With a table selected the right panel shows three tabs, <b>Layout / Table / Cells</b>: Layout handles the table's position and size on the slide, Table handles the column/row structure and merging, Cells handles the style and borders inside the cells.</p>
      <div data-fig="tbl-range"></div>
      <ul>
        <li>Drag to select a few cells and the size, line spacing, bold/italic, text color, alignment, fill and borders under “Cell style” apply only to them.</li>
        <li>The first line of that section says where changes go — the whole table, or the selected cells (and which ones) — so you never have to guess.</li>
        <li><b>No selection means the whole table.</b> Click elsewhere on the canvas to clear the selection and go back to the whole table.</li>
      </ul>
      <h4>Borders</h4>
      <p class="hWhere">Also in the <b>“Cells” tab</b>, the section below “Cell style”.</p>
      <div data-fig="tbl-border"></div>
      <ul>
        <li><b>Set the pen, then pick the edges</b>: set the width and color with “Border pen” in the right panel, then click All, Outside, Inside, or a single side (top, bottom, left, right). “None” clears borders.</li>
        <li>The range works as with styles: with a selection only those cells, otherwise the whole table.</li>
        <li><b>Dashed</b>: tick “dashed” next to the pen before pressing, and the border is drawn dashed. Solid and dashed can be mixed cell by cell and side by side.</li>
        <li>Each side of every cell is independent; shared edges between neighbouring cells stay in sync automatically, so what you see on the canvas is what gets exported.</li>
      </ul>
      <h4>Changing just a few characters in a cell</h4>
      <p class="hWhere">Still the <b>“Cells” tab</b>. The “Text in cell (selection)” section <b>only appears while characters inside a cell are selected</b>; without a selection the whole section is hidden, so if you can't find it, you probably haven't selected anything yet.</p>
      <div data-fig="tbl-run"></div>
      <ul>
        <li>Double-click into a cell and select a few characters, and size, bold, italic and text color under “Cell style” apply only to them. Clear the selection to go back to the whole cell.</li>
        <li>With a selection, an extra “Text in cell (selection)” row appears: superscript, subscript, underline, strikethrough, highlight, and “Clear formatting”, which returns the selection to the cell's own style.</li>
        <li><b>Superscript and subscript only come this way</b>: there are no cell-level switches for them, so chemical formulas and scientific notation are set from this row.</li>
        <li><b>Keys while editing a cell</b>: <kbd>Enter</kbd> adds a line break inside the cell, as in PowerPoint; <kbd>Esc</kbd> ends editing. <kbd>Tab</kbd> doesn't move to the next cell; double-click the target cell instead.</li>
      </ul>
      <h4>Pasting tables from other software</h4>
      <ul>
        <li>Copy a table from <b>Excel, PowerPoint, Word or a web page</b> and press <kbd>Cmd/Ctrl+V</kbd> on the canvas: it becomes an <b>editable native table</b>, not a picture. Merged cells, fills, text colors, bold/italic, alignment, super/subscript and in-cell highlights are kept, and column widths follow the source.</li>
        <li><b>Text size is always reset to 12pt</b> rather than inherited. Source text sizes are usually shrunk to squeeze the table into someone else's layout — their compromise, not the content's hierarchy. To resize everything, select the whole table and drag a handle with “Lock ratio” and “Scale text” on — column widths, row heights and text sizes shrink together and the structure holds.</li>
        <li><b>Cells with no fill in the source become white.</b> Pasted text is usually dark, and a transparent table on a dark background would vanish. To let the background show through, turn off “White” under the gear (Preferences); for a table already pasted, select the whole table and change it in one go under “Cells → Fill” in the right panel.</li>
        <li><b>Images inside cells become separate image elements</b>, bound to the table as a soft group. They follow when the group is moved or scaled proportionally, but not when you drag a single column's width. That's not a shortcut: PowerPoint cells can't hold images either, and its own “insert picture in a cell” is also a separate object floating over the table.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: source differences and export mapping</summary>
        <ul>
          <li>Office also puts an image version on the clipboard when copying; this tool deliberately prefers the table. If you really want the image, paste it somewhere else and take a screenshot.</li>
          <li>Markdown tables need to be turned into HTML tables before pasting — any tool that puts a Markdown table on the clipboard as <code>text/html</code> works. Images only come along as embedded <code>data:</code> URIs; images at remote URLs are skipped.</li>
          <li>Borders aren't inferred from the source, because Excel writes gridlines as borders too. A thin border is applied to the whole table; adjust it afterwards if needed.</li>
          <li>Only images with embedded bytes (<code>data:</code>) are taken. Images at remote URLs, as on web pages, can't travel with the deck, so they are skipped and you're told how many.</li>
          <li>Each side of every cell has its own color and width, as with PowerPoint cell borders. Shared edges are written on both sides and kept in sync, so what you see on the canvas is what gets exported.</li>
          <li>Dashed borders export as <code>prstDash sysDash</code>.</li>
        </ul>
      </details>
      <h4 data-tab="Shapes">Inserting and adjusting</h4>
      <ul>
        <li>Press <b>“＋ Shape”</b> to open the gallery: <b>176 shapes</b> in nine groups — lines, rectangles, basic shapes, arrows, equations, flowchart, stars and banners, callouts and action buttons — the same as PowerPoint's full built-in list. Search at the top by name or by OOXML key.</li>
        <li>The outline you see on the canvas <b>is PowerPoint's native geometry itself</b> — computed live from the OOXML preset definitions, not a look-alike.</li>
        <li><b>Lines</b> (line, arrow, double arrow, elbow) change direction by dragging <b>the round points at both ends</b>, horizontally, vertically or at any angle.</li>
      </ul>
      <h4>Yellow handles</h4>
      <div data-fig="shp-adj"></div>
      <ul>
        <li>Select an adjustable shape and <b>yellow handles</b> appear on the canvas; drag them to change corner radius, slant, head length, shaft width, callout tail, angles or elbow bends — the same feel as PowerPoint, with a percentage shown while dragging.</li>
        <li>The sliders in the right panel refine down to decimals. <b>114 of the 176 shapes have yellow handles</b>; they're the ones with a yellow mark in the gallery thumbnail's corner.</li>
        <li>Handles you haven't touched <b>aren't written to the file</b>; PowerPoint uses its own defaults for them.</li>
      </ul>
      <h4>Where text sits inside a shape</h4>
      <div data-fig="shp-text"></div>
      <ul>
        <li>Text in a shape <b>doesn't fill the whole bounding box</b>; it uses the text area each OOXML preset defines — a star's text sits in its core, an arrow's on its shaft, a trapezoid's between its parallel sides — and it <b>moves with the yellow handles</b>.</li>
        <li><b>137 of the 187</b> shapes have a text area smaller than the whole box. Overlong text overflows the text area as it does in PowerPoint; it isn't clipped.</li>
        <li>This is a <b>fix to the canvas preview</b>: the exported pptx has always followed the preset; it was the canvas that was off. Existing decks export exactly as before.</li>
      </ul>
      <h4>Dash types and gradients</h4>
      <ul>
        <li><b>Dash type</b>: shape outlines, lines and text box borders can be solid, round dot, dash, long dash, dash dot or long dash dot. Table borders have their own solid/dashed switch.</li>
        <li><b>Gradient fill</b>: tick “Gradient fill” on a text box or shape to choose <b>linear</b> (adjustable angle, 0° is left to right) or <b>radial</b>, with 2 to 6 stops, each with its own color and position percentage.</li>
        <li>With a gradient ticked, “Fill” has no effect — an OOXML fill can only be one kind at a time; that's a limit of the format itself.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: export mapping</summary>
        <ul>
          <li>Dash types export as native <code>prstDash</code>; gradients as a native <code>&lt;a:gradFill&gt;</code> you can keep adjusting in PowerPoint.</li>
          <li>Yellow handles export as PowerPoint's native <code>avLst</code>.</li>
        </ul>
      </details>
      <h4 data-tab="Custom geometry">Custom geometry (custGeom)</h4>
      <div data-fig="shp-pen"></div>
      <ul>
        <li>The last group in the gallery is <b>custom geometry</b>, for shapes the list doesn't have — irregular blobs, custom polylines, infographic blocks. Inserting one <b>opens the shape editor right away</b>.</li>
        <li>For an existing custom geometry, select it and press <b>Open shape editor</b> under Shape → Geometry in the right panel.</li>
        <li><b>To change just a corner or two of a built-in shape</b>, you don't need to redraw it: press <b>Convert to editable points</b> under Shape → Geometry, and the shape breaks into points in place and opens in the editor, <b>looking exactly the same</b> (all 187 checked; largest deviation 0.04px).</li>
        <li>Like PowerPoint's “Edit Points”, the conversion is <b>one-way</b>: yellow handles go away and it can't become the built-in shape again. If parts of the shape had different fills or outlines (action buttons, bordered callouts and the like), only one fill remains afterwards; a dialog tells you first.</li>
      </ul>
      <h4>Shape editor</h4>
      <ul>
        <li><b>Pen</b>: click for a corner point, click and drag for a smooth point with a curve, click the yellow start point to close. After <kbd>Esc</kbd> or a double-click, the next click starts a new subpath.</li>
        <li><b>Edit points</b>: drag anchors to move them, drag control handles to adjust curves (hold <kbd>Alt</kbd> to split both sides into a corner), click a segment to insert a node at its middle, double-click an anchor to toggle straight/curved, <kbd>Delete</kbd> removes a point.</li>
        <li>There's also grid snapping (with selectable spacing) and an editor-only <kbd>Cmd/Ctrl+Z</kbd> — undoing in the editor doesn't touch anything else on the canvas.</li>
        <li>The editor <b>doesn't block the canvas and can be dragged by its title bar</b>, so you can compare the shape's size and position against the whole slide.</li>
        <li><b>Holes</b>: draw another subpath inside the outer one and it becomes hollow. <b>Winding direction doesn't matter</b>; PowerPoint uses the even-odd fill rule.</li>
        <li><b>Custom geometry scales with the shape</b>: coordinates live in the shape's own path coordinate space, so resizing scales the drawing proportionally, just like built-in shapes.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: drawing with JSON or an AI</summary>
        <ul>
          <li>Edit <code>points</code> in the JSON panel; commands are <code>moveTo</code>, straight lines, quadratic and cubic Béziers, arcs and <code>close</code>.</li>
          <li>The path coordinate space is <code>pathW</code> / <code>pathH</code>, not pixels.</li>
        </ul>
      </details>
      <h4 data-tab="Images &amp; video">Inserting images</h4>
      <ul>
        <li>Press “＋ Image” to pick a file, <b>drag an image file onto the canvas</b>, or <b>paste an image from the clipboard</b>. Scaling is always proportional, so images never stretch.</li>
        <li><b>Object hyperlinks</b>: shapes, images, charts and lines can get a link that makes the whole object clickable — an external URL or <code>#3</code> to jump to a slide — plus an optional tooltip shown on hover. For links on individual words in a text box, use “Text style → Hyperlink”.</li>
        <li><b>Alt text</b>: once filled in, it exports as the accessibility description (<code>descr</code>).</li>
      </ul>
      <h4>Cropping</h4>
      <div data-fig="img-crop"></div>
      <ul>
        <li>The default is <b>“Fit”</b> — the whole image fits in the frame, always proportional.</li>
        <li><b>Double-click the image</b> (or press “Crop…”) to enter crop mode: <b>drag</b> to reframe, <b>scroll</b> to zoom, <b><kbd>Enter</kbd></b> to finish.</li>
        <li>The cropped-away part <b>is dimmed rather than hidden</b>, so you can see what you're throwing out.</li>
        <li>In crop mode, <b>pulling the frame only moves the crop window; the image stays pinned</b>, as in PowerPoint.</li>
        <li>You <b>can drag the image past the frame to leave blank space</b>, for margins on one side or all around. At least a tenth always overlaps, so you never end up with an empty frame and no image in sight.</li>
        <li><b>The cropped part is only hidden; the full original stays in the file</b>, and “Fit” brings it back anytime. There's also a <b>circle crop</b>.</li>
        <li>The framing is stored as ratios for the four sides and exports as a native <code>srcRect</code> you can keep adjusting in PowerPoint.</li>
      </ul>
      <h4>Shadows</h4>
      <ul>
        <li>Tick the “Shadow” section of a text box, shape, image or chart to adjust <b>color, blur, distance, angle and opacity</b>.</li>
        <li>The export is a PowerPoint <b>native shadow</b> (<code>outerShdw</code>), not a shadow painted into an image, so it stays adjustable in PowerPoint.</li>
        <li>The canvas previews it with a CSS filter, so <b>PNG snapshots don't include shadows</b> — html2canvas doesn't support filters; the setting still works.</li>
      </ul>
      <h4>Compression</h4>
      <ul>
        <li>The properties panel lists three levels: 1.5, 2 and 3× the display size (about 144, 192 and 288 PPI). Each button <b>shows the resulting pixel size and KB</b>, and levels the original isn't big enough for are disabled.</li>
        <li>Images without transparency become JPEG; images with transparency stay PNG. <b>WebP and AVIF are deliberately not used</b> — older PowerPoint versions can't read them.</li>
        <li>The operation is <b>irreversible</b> (though Undo works), and only runs when you press the button; saving never does it behind your back.</li>
      </ul>
      <h4>Video</h4>
      <ul>
        <li><b>YouTube link</b>: exported as a native PowerPoint online video. The pptx holds only the cover image and the video is an external link, so <b>playback needs an internet connection</b>.</li>
        <li><b>Local video</b>: <b>no video bytes are embedded</b>; one frame is grabbed as a cover and the file name and duration are recorded. After export a “Videos to insert” list pops up; insert the real videos over those frames in PowerPoint.</li>
        <li>The same note is written into the element's <b>alt text</b> and the slide's <b>speaker notes</b>, so the information stays in the file even after the list is closed.</li>
        <li>You can swap the cover for your own image anytime.</li>
      </ul>
      <h4 data-tab="Charts">Charts</h4>
      <ul>
        <li>A chart is stored as an <b>ECharts option spec, not a frozen picture</b> — change the data and it recalculates anytime.</li>
        <li>The split: <b>data belongs to the JSON</b> (write it yourself or have an AI produce it); <b>appearance is tuned in the “Visual editor” tab</b>.</li>
        <li>The panel <b>doesn't block the canvas and can be dragged by its title bar</b>; changes show immediately on the chart itself on the canvas — there's no separate mini preview; what you see is the result.</li>
        <li>Two buttons at the bottom: <b>Apply</b> writes and keeps the panel open (only matters in the option JSON tab); <b>Confirm</b> writes and closes.</li>
        <li>The panel only writes its own fields, so <b>advanced settings you wrote by hand are never overwritten</b>.</li>
      </ul>
      <details class="hAdv">
        <summary>What the visual editor can adjust</summary>
        <ul>
          <li>Chart type; chart and axis titles (size, color); axis lines and ticks (color, weight); axis labels (size, color, tilt).</li>
          <li>Value axis range and tick interval, reversal; major gridlines (color, width, dashed); legend; data labels (position, size, color).</li>
          <li>Series colors and borders, bar width, line width, markers; pie inner radius and start angle; plot area margin; chart background.</li>
        </ul>
      </details>
      <h4>Native chart or PNG</h4>
      <ul>
        <li>A chart can export as a <b>native PowerPoint chart</b> (data editable in PowerPoint, follows the destination master) or stay a <b>PNG</b> (looks exactly like the canvas).</li>
        <li>Settings with no native PowerPoint equivalent (rounded bar corners, minor gridlines, hidden value axis labels) are marked “<b>PNG only</b>”. With “Export as native chart” ticked they are <b>disabled outright</b>, so you can't set a value that would vanish on export.</li>
      </ul>
      <h4 data-tab="Slides">Per-slide settings</h4>
      <p class="hWhere">In the right panel — when <b>nothing on the canvas is selected</b>, the right panel shows the slide's properties (slide style, section, speaker notes, templates &amp; merge).</p>
      <ul>
        <li><b>Slide background image</b>: pick an image under “Slide → Background”; it's stretched to fill and sits under all elements. For partial crops or showing just a corner, use a regular image element covering the slide.</li>
        <li><b>Hide this slide in slideshow</b>: ticked under “Slide style”, the slide stays in the file but is skipped in slideshow. Its thumbnail is dimmed and marked so you don't forget you hid it.</li>
        <li><b>Speaker notes</b>: written under “Slide → Speaker notes” and exported into the pptx, visible in PowerPoint's notes pane.</li>
        <li><b>Snapshot</b>: “Snapshot” on the right of the toolbar exports this slide or all slides as PNG / JPG (all slides are packed into a zip), at 1 to 3× resolution.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: export mapping</summary>
        <ul>
          <li>The background image is a native <code>&lt;p:bg&gt;</code>; hiding is <code>&lt;p:sld show="0"&gt;</code>.</li>
        </ul>
      </details>
      <h4 data-tab="Sections &amp; templates">Sections</h4>
      <div data-fig="pg-section"></div>
      <ul>
        <li>Tick <b>“Start a new section here”</b> under “Slide → Section”, and the slides from here up to the next section start belong to one section; a divider appears in the slide list on the left.</li>
        <li>Exported as native PowerPoint sections: in the thumbnail pane you can <b>collapse, move, hide or start a slideshow from a whole section</b>.</li>
        <li><b>It only affects navigation while editing; slide content and slideshow are unchanged.</b></li>
        <li>Section names <b>must be unique</b>; duplicates get “(2)” appended automatically — PowerPoint identifies sections by name.</li>
        <li>If sections only start at slide 5, the first four slides are put into a section named after the deck title, so no slide is left without a section.</li>
      </ul>
      <h4>Templates and merging</h4>
      <ul>
        <li><b>Templates</b>: “Slide → Templates &amp; merge” inserts layouts such as a title slide, two columns or a chart slide; their text carries <code>role</code> markers so an AI can tell which box is the title.</li>
        <li><b>Merge deck</b>: “⧉ Merge deck” appends another <code>.deck</code> as following slides.</li>
        <li><b>Swatches</b>: every color picker opens the same three-tab panel — designer picks (5 colors per set), Open Color (14×10) and a full-gamut picker.</li>
      </ul>
      <h4 data-tab="Deck settings">Whole-deck settings</h4>
      <p class="hWhere">In the “Deck settings” button <b>to the left of the gear</b> in the toolbar, not in the right panel. The rule: <b>what travels with the deck JSON goes here</b>; preferences stored only in this browser (interface language, white fill for pasted tables) go under <b>the gear</b>; view settings (grid, master element marks) go in <b>the floating bar at the canvas's bottom right</b>.</p>
      <ul>
        <li><b>Slide size</b>: 16:9, 4:3, 16:10 or custom px. Changing the size <b>does not move existing elements</b>; rearrange them yourself.</li>
        <li><b>Fonts</b>: three slots — CJK, Latin and table Latin; enter the names of fonts <b>installed on your computer</b>. The canvas updates immediately and export writes the same names. When a font isn't installed, a notice at the top says “previewing with a substitute font; the export still uses the original font name” — so an inaccurate preview doesn't mean a wrong export.</li>
        <li><b>Language</b>: written into every text run; decides which language PowerPoint spell-checks in. Defaults to the browser's language. (This is the language of the deck's text, not of this interface.)</li>
        <li><b>File info</b>: author, company and subject, together with the title, go into the pptx file properties, visible in Finder or PowerPoint's Info. Empty fields aren't written.</li>
        <li><b>Page number and date</b>: once ticked, each can be placed bottom left, center or right, with its own size, color and “hide on first slide”. The date can also be <b>updated automatically</b> (recalculated on opening) or <b>fixed text</b>.</li>
        <li>They export as native PowerPoint footer placeholders, and <b>the page number is an updating field</b> that follows inserted or deleted slides. On the canvas both are previews and can't be clicked or selected.</li>
        <li><b>Reserved zones</b>: areas of the master that shouldn't be covered (logo spot, footer), which you add and remove yourself. They're <b>only canvas guides and snap targets</b>: elements that overlap turn red as a warning but aren't blocked, and they're <b>not written to the pptx</b>. There are none by default.</li>
        <li><b>Profile</b>: exports all the settings in this panel as a <code>.profile.json</code>, or loads and applies one; “Set as default for new decks” remembers it in this browser. The same settings are also stored in the deck JSON, so they survive a round trip through an AI.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: export mapping of page number and date</summary>
        <ul>
          <li>An automatically updated date is <code>&lt;a:fld type="datetime1"&gt;</code>; the footer placeholders are <code>&lt;p:ph type="sldNum"&gt;</code> and <code>type="dt"</code>.</li>
          <li>The language is written in each run's <code>lang</code>.</li>
        </ul>
      </details>
      <h4 data-tab="Master">Master (letterhead)</h4>
      <div data-fig="set-master"></div>
      <ul>
        <li>Enter it with <b>“Master” at the bottom of the slide list</b> (if the master isn't enabled yet, that button enables it too). The canvas switches into master editing: an orange frame all around and an orange hint bar at the bottom, so you always know what you're editing.</li>
        <li>Elements placed here appear on <b>every slide</b>; change them once and every slide follows. All the usual tools work — text, shapes, images, charts, gradients, shadows, hyperlinks, custom geometry.</li>
        <li>A single slide can tick <b>“Don't use master on this slide”</b>, which covers often need.</li>
        <li><b>Two export modes</b>; switching only flips a flag and doesn't touch the master content, so you can compare back and forth anytime:
          <ul>
            <li><b>On the master</b>: written to PowerPoint's slide layout, for the smallest file. The cost: <b>when a single slide is copied into another presentation, the master content doesn't come along</b>.</li>
            <li><b>Drawn on every slide</b>: on export the master content is actually drawn onto each slide, so <b>slides travel intact</b>. The cost: image bytes are stored once per slide and the file gets bigger.</li>
          </ul>
        </li>
        <li>Master element ids must not clash with slide element ids; on a clash the slide's id is changed automatically.</li>
      </ul>
      <h4>Style mode</h4>
      <div data-fig="set-stylemode"></div>
      <p>One switch governs two things: <b>fonts</b> and <b>footer placeholders (page number / date)</b>. Both involve the same trade-off — either “looks the same wherever it's pasted” or “when in Rome, do as the Romans do”.</p>
      <ul>
        <li><b>Locked</b> (default): fonts are written as the three font names you set, and page number and date get fixed positions and sizes. <b>The preview is the output</b>, and line breaks are the most reliable.</li>
        <li><b>Inherit from master</b>: fonts reference theme slots, and page number and date are written as <b>empty placeholders without coordinates</b>. Pasted onto any master, that master takes over the fonts and the footer positions and sizes; the cost is that line breaks shift with the destination's fonts.</li>
        <li>In inherit mode, the file <b>still looks right when opened on its own</b> — the full coordinates are in its own master, and whatever the slide and layout don't specify is looked up one level higher.</li>
        <li><b>⚠ Inherit mode doesn't work with “On the master”</b>: in that mode the slide layout carries your logo and footer bar and must stay custom so it isn't replaced by the destination's layout on pasting — which means the page number and date can't inherit either. To get both, use “Drawn on every slide”.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: theme slots and lang</summary>
        <ul>
          <li>Inherited fonts are written as <code>+mn-lt</code> / <code>+mn-ea</code> theme slot references.</li>
          <li>Neither mode splits runs by language, and the whole document uses one <code>lang</code> — so there are no odd line breaks where CJK and Latin text meet (those come from splitting runs to dodge line-breaking rules).</li>
        </ul>
      </details>
      <h4 data-tab="Working with AI">Two JSON entry points</h4>
      <div data-fig="ai-json"></div>
      <ul>
        <li><b>“JSON” at the top right</b> is <b>the whole deck plus global settings</b> (title, style mode, fonts, language, slide size, reserved zones). Copy it to an AI to discuss, paste the edited version back and press “Apply”. The environment settings travel with the JSON, so nothing is lost on the way.</li>
        <li><b>“Slide JSON” at the bottom of the right panel</b> is a floating panel you can drag around, showing only the current slide. While it's open, <b>clicking any element on the canvas scrolls to and selects that element's JSON block</b> — good for fine-tuning one thing.</li>
      </ul>
      <h4>How images are handled</h4>
      <ul>
        <li>Images in the JSON show as <code>@asset:element-id</code> placeholders so base64 doesn't flood the window. They're turned back into bytes automatically when you press “Apply”.</li>
        <li>Add new images with the tool's insert button rather than pasting base64 into the JSON yourself. Files saved as <code>.deck</code> still contain the full images.</li>
      </ul>
      <h4>When pasting into external tools</h4>
      <ul>
        <li><b>“Copy (with base64)”</b> in the slide JSON panel copies without masking images, for <b>external tools</b> that read deck JSON.</li>
        <li><code>@asset</code> placeholders <b>can only be turned back into bytes by this deck itself</b>; pasted elsewhere they become broken images, so external tools need this button.</li>
        <li>Note that it's still a <b>single-slide fragment</b>: without <code>stage</code>, <code>fonts</code> or <code>master</code>, the external tool applies its own defaults.</li>
      </ul>
      <h4>What details an AI can write</h4>
      <ul>
        <li>Mixed bold, colors, super/subscript, underline, highlight and per-paragraph bullets inside a text box or <b>table cell</b>, per-cell fills, merged cells — an AI can write all of these straight into the JSON.</li>
        <li>The same things can also be changed in place on the canvas by selecting a few characters. <b>Both routes edit the same data</b>, so there's no separate “written by AI” and “edited by hand” format.</li>
      </ul>
      <h4 data-tab="Export">Export behavior</h4>
      <ul>
        <li>Each slide becomes one PowerPoint slide. Text boxes have autofit turned off and line spacing locked to an exact 1.2× text size; tables are <b>native PPTX tables</b>; images embed their original bytes; charts are embedded as 3× resolution PNGs (or as native charts, see “Charts”).</li>
        <li><b>How to use it</b>: open the exported .pptx and copy whole slides into your target presentation. The target presentation <b>must have the same slide size as set here</b>, or the slides get scaled.</li>
        <li>Each element's shape name in the pptx is its JSON id; Morph transitions use it to match elements across slides.</li>
      </ul>
      <details class="hAdv">
        <summary>Advanced: what gets fixed after export</summary>
        <ul>
          <li>PptxGenJS 3.12 has several structural defects that make PowerPoint report the file as damaged and offer to repair it; they're all fixed after export: a repeated <code>&lt;a:pPr&gt;</code> in paragraphs with mixed runs, clashing shape ids, object hyperlinks written as a dangling <code>rIdundefined</code> without a registered relationship, and malformed speaker notes scaffolding.</li>
          <li>Footer placeholders (page number / date) are written separately, not through PptxGenJS — it can only write the fixed-position version, which can't inherit the destination master.</li>
        </ul>
      </details>
      <h4 data-tab="Known limits">What isn't done yet</h4>
      <p class="dim">This tab lists what <b>can't be done yet or hasn't been verified</b>; it isn't a how-to. If you run into something odd, check here first.</p>
      <h4>Master and style mode</h4>
      <ul class="dim">
        <li>In inherit mode, line breaks are decided by the destination's fonts, so <b>leave some slack in text box widths</b>.</li>
        <li>Inherited page number and date <b>don't work in “On the master” mode</b>; see “Style mode” for why.</li>
        <li>If the destination hasn't ticked the date under Insert → Header &amp; Footer, a pasted date is hidden by the destination — that's not a bug.</li>
        <li>The master only covers the “shared elements” layer (logo, footer, decoration) and <b>has no content placeholders</b> (PowerPoint's “Click to add title” holes). Content placeholders inherit position and size from the slide layout and jump around when slides are pasted into another presentation, which clashes with this tool's what-you-see-is-what-you-get premise. <b>Page number and date are the exception</b>: they are supposed to follow the destination's footer, so they're real placeholders, and “Style mode” lets you choose whether they inherit. Footer text (<code>ftr</code>) isn't done yet.</li>
        <li>When exporting “On the master”, master content <b>doesn't come along when a single slide is copied into another presentation</b> — master objects don't belong to any slide. To take it along, choose “Drawn on every slide” instead. <b>Neither mode has been opened in real PowerPoint yet.</b></li>
      </ul>
      <h4>Shapes and gradients</h4>
      <ul class="dim">
        <li>Gradients are <b>linear and radial</b> only, with up to 6 stops. PowerPoint's path gradients and gradient outlines aren't supported.</li>
        <li><b>On 3D-looking shapes (cube, can), a gradient replaces the shading of the faces</b> — an OOXML fill can only be one kind.</li>
        <li>The shading of 3D-looking shapes on the canvas is <b>only approximate</b>. Export uses native geometry, and PowerPoint computes the actual shading itself.</li>
        <li><b>Custom geometry has no yellow handles in PowerPoint and can't go back to a built-in shape</b> — that's how the OOXML format works; “Edit Points” on a built-in shape in PowerPoint does the same. <b>If the list has the shape you need, don't use custom geometry.</b></li>
        <li>A custom geometry is a single path, so different regions of one shape can't have different colors; the limit is 400 points; an arc sweeps at most one full turn; coordinates may extend past the path frame, but by no more than the frame's own size (callout tails and brackets rely on this).</li>
        <li>Holes from subpaths and negative coordinates past the frame have been verified at the canvas and export XML levels, but <b>haven't been opened in real PowerPoint yet</b>.</li>
        <li>Opening a shape in the shape editor <b>turns arcs into Bézier curves</b> (error under 0.01px, but after OK they can't go back to arcs). To avoid that, don't open it in the editor; edit the JSON instead.</li>
      </ul>
      <h4>Charts, video and shadows</h4>
      <ul class="dim">
        <li>ECharts options must be pure JSON, <b>without functions</b>.</li>
        <li>Native charts only cover chart types with an OOXML equivalent (column, bar, line, area, pie, doughnut, scatter). Sankey, gauge, heatmap and the like always use PNG. In native mode PowerPoint decides the layout inside the frame, so it won't match the canvas exactly, and shadows and hyperlinks aren't supported.</li>
        <li><b>Local videos aren't embedded</b>; the export only has a cover image as a placeholder, which you must swap for the real video in PowerPoint by hand. That's deliberate — video bytes would break the “paste the whole JSON to an AI” workflow.</li>
        <li><b>Online video playback needs an internet connection</b>, and support in Keynote, Google Slides and LibreOffice <b>hasn't been tested</b>; they may only show the cover image.</li>
        <li>Shadows don't show in <b>PNG snapshots</b> (html2canvas doesn't support CSS filters). Exported pptx files aren't affected.</li>
      </ul>
      <h4>Text and tables</h4>
      <ul class="dim">
        <li>A custom font <b>overrides the whole element</b>; to mix fonts run by run within one text box, use the JSON.</li>
        <li>Mixed formatting inside a table cell (bold/italic, color, size, super/subscript, underline, strikethrough, highlight) can go through <code>runs</code> in the JSON (the <code>md</code> shorthand works too), or double-click into the cell, select a few characters and use the right panel. <b>Super/subscript has no cell-level equivalent</b>; it can only be set from the “Text in cell” row after selecting.</li>
        <li>Applying to a whole cell (no selection) clears every run's override of that property, which matches PowerPoint's behavior.</li>
      </ul>
      <h4>Saving and browsers</h4>
      <ul class="dim">
        <li>Autosave is stored in <b>this browser on this computer</b> (IndexedDB). Switching browsers or computers, or clearing browsing data, loses it, and <b>only the latest copy is kept</b>, with no version history. Save as a file to keep or move your work.</li>
        <li>Private windows usually block storage; a red notice at the top says so instead of failing silently.</li>
        <li>Editing in place has only been tested in <b>Chrome</b>; Safari and Firefox <b>haven't been tested yet</b> and may behave differently.</li>
      </ul>
      <h4>Transitions</h4>
      <ul class="dim">
        <li>Morph, fade, push and wipe are supported, set in the slide properties and played when entering that slide.</li>
        <li>Morph matches elements across slides by id; that's why “Duplicate this slide” keeps element ids.</li>
        <li><b>Element entrance/exit animations aren't supported.</b></li>
      </ul>
`;
