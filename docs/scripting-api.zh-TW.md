# 腳本介面（`window.DJ`）

[English](scripting-api.md) | **繁體中文**

`window.DJ` 是用腳本驅動 DeckJSON 的穩定入口，適用於瀏覽器自動化、測試，或讓 AI 代理替你改簡報。頁面裡其他的一切都是內部實作，隨時可能改名；`DJ` 是不會變的那一層。

元素的 JSON 怎麼寫（文字框、形狀、表格、圖表…）見 [deck-format.zh-TW.md](deck-format.zh-TW.md)。

```js
DJ.list()                                        // 所有頁
DJ.outline('p-abc')                              // 某一頁的元素摘要
await DJ.patch('p-abc', [{id: 'tx-1', set: {y: 120}}])
await DJ.fit('p-abc', ['tx-1'])                  // 文字框縮放到剛好裝下文字
await DJ.fitTable('p-abc', ['tb-1'])             // 表格列高貼合文字
await DJ.center('p-abc', ['tb-1', 'g-fig'], {area: {x: 19, y: 132, w: 1242, h: 548}})   // 整組置中於某個區域
await DJ.distribute('p-abc', ['c1', 'c2', 'c3'], {area: {x: 40, y: 0, w: 1200, h: 720}})   // 並排、間距相等
const blob = await DJ.toBlob()                   // .deck 檔，可直接存檔
```

## 保證

- **一律用 id 指定目標，不看「目前這一頁」。** 每個呼叫都指名要動哪一頁（與哪個元素）。除了 `show()`，沒有呼叫會改變使用者正在看的頁。
- **全有或全無。** 寫入先在副本上做完並驗證；任何一步失敗就拋例外，簡報原封不動。
- **可以復原。** 每次寫入都是一步復原，使用者按 Cmd/Ctrl+Z 就能撤銷。
- **回傳時版面已穩定。** 會重繪的呼叫是 `async`，等排版（與網頁字型）穩定才回傳，緊接著量測也是準的。
- **回傳值很小。** 讀取預設回摘要；需要完整 JSON 時才另外要。
- **錯誤**以 `Error` 拋出，訊息以 `DJ:` 開頭。
- **不認得的欄位只回報、不擋。** 每個寫入呼叫都回傳 `warnings`：這次傳入的 JSON 裡 DeckJSON 不認得的欄位——拼錯的名字、放錯層、或根本不存在的欄位。它們照樣寫入（不丟資料），但不會有任何效果，所以要看這份清單。

`DJ.version` 目前是 `1`，只在不相容的改動時變更；新增動詞不算。

## id

頁與元素都用 `id` 指定。頁 id 寫 `'master'` 代表母版（每頁共用的底層元素）。

同一個元素 id **可以出現在不同頁**——Morph 轉場就是靠它配對物件——所以元素 id 只在同一頁內唯一。這也是為什麼元素相關的呼叫一定要同時給頁 id。

## 讀取

| 呼叫 | 回傳 |
|---|---|
| `info()` | `{version, app, title, pages, page, stage:{w,h}, master, file, dirty, markdown, usedHighlight, host}`；`page` 是畫面上那一頁。`markdown` 是 `md` 簡寫目前的設定 `{highlight, syntax:{strike, mark, html}}`（見〈md 簡寫的設定〉），`usedHighlight` 是整份簡報最常用的螢光色（沒有螢光時為 `null`）。`host`：直接從硬碟開的頁面是 `null`，由 `deckjson-server.js` 提供時是 `{mode: 'server', port, folder}`，DJ App 裡是 `{mode: 'app', slot}` |
| `list()` | `[{n, id, name, els, section?, skip?, current?}]`，每頁一筆 |
| `outline(pageId)` | `[{id, type, x, y, w, h, text?, shape?, grid?, hidden?, locked?, group?, overflow?}]`；`text` 取前 40 字，`overflow: true` 表示文字框放不下文字。表格的 `h` 是畫出來的實際高度：`rowH` 只是下限，字放不下的列會自己長高，直接加總 `rowH` 會少算 |
| `get(pageId)` | 整頁完整 JSON。圖片位元組換成 `@asset:<雜湊>` 佔位（按圖片內容編號），寫入時自動還原 |
| `assets()` | `[{asset, type, kb, natW?, natH?, usedBy}]`，簡報裡的每張圖（含背景圖、影片封面）一筆，內容相同的只列一次。`asset` 就是佔位字串，`usedBy` 列出用到它的 `{page, id}` 或 `{page, field}` |
| `get(pageId, elementId)` | 單一元素的完整 JSON |

## 寫入

| 呼叫 | 作用 |
|---|---|
| `patch(pageId, changes)` | 套用一串修改。每筆是 `{id, set?, unset?, remove?, md?}`：`set` 淺層合併欄位（要改 `paras` 就整個陣列換掉，格式也一起換掉），`unset` 是要刪的鍵，`remove: true` 刪除元素，`md` 換掉文字框或形狀的文字並沿用原本的樣式（見下文〈換文字、留樣式〉；同一段裡有 md 寫不出來的樣式差異時會報錯）。change 裡出現其他鍵一律報錯。`id` 等於頁 id 時改的是頁面欄位：`name`、`bg`、`bgImage`、`notes`、`section`、`skip`、`transition`、`noMaster`。回傳 `{page, changed, overflow}` |
| `add(pageId, elements)` | 把元素加到該頁最上層。沒給 id、或 id 已被該頁用掉的，自動配新的。群組 id 照原樣保留，所以帶了該頁已有的 `groupId` 就會併進那一組（會回 warning；要複製一整組請用 `copy()`）。回傳 `{page, ids, overflow}`，`ids` 是實際採用的 id，順序同輸入 |
| `copy(fromPageId, ids, toPageId, opts?)` | 把元素複製到某一頁（同一頁也可以）。圖片直接帶位元組、不經佔位，複製完就與來源無關，之後可以刪掉來源頁。元素一律換新 id，群組 id 也換新：同一組複製兩次是兩組；只複製群組裡的一個成員，它就不再帶群組。`ids` 同 `center()`，保留來源頁的前後順序。`opts`：`{x, y}` 是複製後整組的左上角，或 `{dx, dy}` 位移；都不給＝原座標。回傳 `{page, ids, map: {舊: 新}, groups: {舊: 新}, overflow}` |
| `addImage(pageId, src, opts?)` | 加一張圖，轉碼、讀原始尺寸、算不變形的框都由它做。見下文〈圖片〉。回傳 `{page, id, natW, natH, kb, overflow, warnings}` |
| `compress(pageId, ids?, preset?)` | 把已經放上去的圖按顯示尺寸重編碼，框、裁切、群組都不動。見下文〈圖片〉 |
| `replacePage(pageId, json)` | 換掉該頁的元素（以及 `json` 裡有列出的頁面欄位）。沒列出的欄位沿用原值，頁 id 不變。`json` 也可以直接是元素陣列 |
| `addPage(json?, afterPageId?)` | 在 `afterPageId` 之後插入一頁（省略＝最後）。`json` 也可以直接是元素陣列。回傳 `{page, n, overflow}` |
| `removePage(pageId)` | 刪除一頁。只剩一頁時不能刪 |
| `setDeck(fields)` | 改簡報層的欄位，`fields` 是 `{欄位: 值}`：`title`、`author`、`company`、`subject`、`pageNum`、`date`、`markdown`。值整個換掉；給 `null` 刪掉該欄、回到預設。其他欄位一律報錯。回傳 `{changed, <各欄位的新值>, warnings}` |

## 版面

| 呼叫 | 作用 |
|---|---|
| `measure(pageId, elementId)` | `{id, w, h, needW, needH}`：文字框剛好裝下文字需要的尺寸。橫書比 `needH` 與 `h`，直書比 `needW` 與 `w`。不改任何東西 |
| `fit(pageId, ids)` | 把文字框縮放到剛好裝下文字：橫書調高（上緣不動），直書調寬（左緣不動）。`ids` 必填，免得刻意留高的卡片被一起收掉。等同編輯器裡的「貼合內容」。回傳 `{page, fitted:[{id, from, to}], overflow}` |
| `fitTable(pageId, ids, opts?)` | 把表格每一列設成剛好裝下文字的高度，再加 `pad`（預設 `10`）。儲存格上下沒有內距，不加的話字會貼著框線；10px 約等於 PowerPoint 表格預設的上下內距（各 0.05 吋）。列會變高也會變矮。任何頁都能量，不限畫面上這一頁。`opts`：`{pad}`。等同編輯器裡的「列高貼合內容」。回傳 `{page, fitted:[{id, rowH, was, h}]}` |
| `bbox(pageId, ids)` | `{x, y, w, h}`：這些元素與群組的共同外框。不改任何東西 |
| `center(pageId, ids, opts?)` | 整組一起平移，讓共同外框落在 `area` 的正中央（預設整張投影片）。彼此的相對位置不變，不縮放。`opts`：`{area: {x, y, w, h}, axis: 'both' \| 'x' \| 'y'}`。外框比 area 大時回 warning |
| `align(pageId, ids, edge)` | 每個元素或群組的某一邊，對齊到全體共同外框的同一邊，同 PowerPoint 的「對齊」。`edge`：`'left'`、`'center'`、`'right'`、`'top'`、`'middle'`、`'bottom'` |
| `stack(pageId, ids, opts?)` | 照給的順序一個接一個排：第一個不動，之後每個從前一個的結尾再隔 `gap` 開始。另一軸不動，要對齊另外呼叫 `align()`。`opts`：`{gap: 0, axis: 'y' \| 'x'}` |
| `distribute(pageId, ids, opts?)` | 照給的順序均分，相鄰之間的間距都相等（同 PowerPoint 的「均分」）。有 `area` 時第一個貼齊區域起點、最後一個貼齊終點；沒有時保留這組現有外框的兩端。另一軸不動。放不下（會重疊）時回 warning。`opts`：`{area: {x, y, w, h}, axis: 'x' \| 'y'}`（預設 `'x'`） |
| `overflow(pageId?)` | 放不下文字的文字框 id，也就是畫布上畫紅色虛線框的那些。不給頁 id 時回 `{頁id: [ids]}`，只列有溢出的頁 |
| `lint(pageId?)` | 簡報裡既有的不認得欄位（寫入呼叫只檢查這次傳進來的東西），加上容易被換行拆開的寫法（見下文〈換行提醒〉）。可給單頁、`'master'`，省略則掃整份 |

`bbox`、`center`、`align`、`stack`、`distribute` 的 `ids`，每一項可以是元素 id 或軟群組 id（`outline()` 的 `group` 欄位）。群組整組當一件移動，圖和圖說不會分開；給元素 id 只動那個元素，即使它屬於某個群組。同一個元素直接或透過群組列了兩次會報錯。外框不計旋轉，表格高度用畫出來的實際高度。四個會移動的動詞回傳 `{page, moved: [{id, dx, dy}], box, overflow, warnings}`。

## 檔案與輸出

| 呼叫 | 作用 |
|---|---|
| `fromTemplate(src, {pages?, title?})` | 從模板開新簡報：沿用模板的全部設定（投影片尺寸、預留區、字體、樣式模式、母版、頁碼…），只篩選頁面。`pages` 可為 `'shown'`（預設：沒有設為不放映的頁——模板慣例上會把說明頁、元件頁設為不放映）、`'all'`，或依想要順序排列的頁 id／頁名陣列。不沿用模板的標題，除非給 `title`。回傳 `{pages, dropped, warnings}`。和 `load` 一樣是一步復原，並清掉目前開啟的檔案 |
| `load(src)` | 載入簡報：`Blob`／`File`／`ArrayBuffer`（`.deck` 容器或純 JSON）、JSON 字串或物件。會清掉「目前開啟的檔案」，之後按 Cmd/Ctrl+S 才不會把它寫進先前開著的那個檔 |
| `toBlob()` | 整份簡報的 `.deck` 檔（`Blob`） |
| `save({force?, as?})` | 存回開著的那個檔，等同 Cmd/Ctrl+S，但不開任何對話框。回傳 `{file, saved: true}`。**由 `deckjson-server.js` 提供時**（見下），檔案由伺服器寫，不需要使用者按任何東西；`{as: '名稱.deck'}` 存成伺服器資料夾裡的新檔，之後的 `save()` 就存回它。**直接從硬碟開、或在 DJ App 裡**，做不到時拋錯並說明要請使用者做什麼：還沒開檔或還沒存過（請使用者按一次 Cmd/Ctrl+S 選位置）、重新整理後權限失效（請使用者按一次 Cmd/Ctrl+S）、瀏覽器不能就地寫檔（改用 `toBlob()`）。兩種情況下，硬碟上的檔在開啟後被別處改過都會拋錯，確定要覆蓋才給 `{force: true}` |
| `snapshot(pageId, {scale?, format?})` | 單頁的 PNG（或 `format: 'jpeg'`）圖片，`Blob` |
| `exportPptx()` | 匯出的 `.pptx`（`Blob`），不觸發下載 |
| `show(pageId)` | 把編輯器切到那一頁給旁觀的人看。唯一會改變畫面的呼叫 |

### DeckJSON 伺服器

網頁不經使用者親手選位置，不能自己寫檔。要讓腳本或 AI 代理自己讀寫檔案，用 `deckjson-server.js`（Node 18 以上，不必安裝套件）把 DeckJSON 連同一個資料夾一起提供：

```bash
node ~/.deckjson/app/deckjson-server.js start ~/notes/talk.deck   # 安裝過的話（README〈安裝 DJ App〉）
node deckjson-server.js start ~/notes                              # 或在 deckjson.html 旁邊執行
```

它在背景啟動，取 47111～47115 第一個空的 port（一個工作一個 port，自動存檔各自分開），印出網址就返回。給的是檔案時，網址結尾是 `?open=<檔名>`，頁面會載入它；檔名還不存在時開一份空白簡報，第一次存檔才建立。

```js
await DJ.addImage(page, '/files/figures/a.png', {x: 640, y: 120, w: 560, h: 420})   // 資料夾裡的任何檔
const notes = await fetch('/files/notes.md').then(r => r.text())
await DJ.save()                                     // 存回 talk.deck
await DJ.save({as: 'talk-v2.deck'})                 // 資料夾裡的新檔
await fetch('/save?n=talk.pptx', {method: 'POST', body: await DJ.exportPptx()})   // PowerPoint
```

`node deckjson-server.js status` 列出執行中的伺服器，`stop <port|all>` 關閉；`http://127.0.0.1:<port>/__status` 是同樣內容的網頁，另列出每個 port 讀過與存過哪些簡報、開著哪些分頁。15 分鐘沒有請求就自行結束（開著的頁面每 20 秒回報一次）。只聽 127.0.0.1、檢查 Host 與 Origin、不送 CORS 標頭，只寫資料夾裡的 `.deck` 與 `.pptx`；已存在的檔要先經伺服器讀過，或帶 `force` 才能覆蓋。

repo 裡的 `tools/serve.py` 是開發 DeckJSON 本身用的：它提供未打包的 `src/` 與 `tests/`。

## 換文字、留樣式

用 `set` 換 `paras` 會連格式一起換掉：44pt 的彩色標題會變成預設的 18pt 黑字。只想換字就用 `md`：

```js
await DJ.patch(page, [{id: 'title', md: '新標題'}])
await DJ.patch(page, [{id: 'box', md: '第一行 **粗體部分**\n第二行'}])
```

每一行成為一個段落。第 *k* 行沿用原本第 *k* 段的段落設定（對齊、項目符號、段距）與文字最長的那個片段的字元樣式（段首若是粗體標籤，新段落不會整段變粗）；多出來的行沿用原本最後一段。行內 markdown（`**粗體**`、`*斜體*`、`==標記==`…）照樣疊加上去。

**每一段只留一種字元樣式。** 粗斜體、刪除線、螢光、上下標、底線、連結寫得進 md，由你在 md 裡標回去；顏色、字級、字型寫不進 md。同一段裡有兩種以上這類樣式時（例如深色的段首標籤接灰色內文、一段裡夾著小字註腳），`md` 會報錯、不改任何東西，因為換下去只會剩一種。這種段落請用 `get()` 讀出 `paras`、改好 `runs` 的文字，再用 `set: {paras}` 寫回。

## md 簡寫的設定

`md` 簡寫怎麼展開由簡報層的 `markdown` 欄位決定，跟著簡報檔走（套範本時一起帶過去）。沒設就是預設值：

| 鍵 | 預設 | 作用 |
|---|---|---|
| `highlight` | `"FFFF00"` | `==螢光==` 與 `<mark>` 用的顏色 |
| `syntax.strike` | `true` | 認得 `~~刪除線~~` |
| `syntax.mark` | `true` | 認得 `==螢光==` |
| `syntax.html` | `true` | 認得 `<sub>`、`<sup>`、`<u>`、`<mark>` |

要讓新寫的螢光對齊簡報原本的顏色，先看 `DJ.info().usedHighlight`，再設進去：

```js
const {usedHighlight} = DJ.info()
if (usedHighlight) await DJ.setDeck({markdown: {highlight: usedHighlight}})
```

設定只影響**之後寫入**的 `md`：`md` 寫入時就展開成 `runs`，存檔裡只有色碼，所以改了 `highlight` 不會讓已經有的螢光變色。語法本身見 [deck-format.zh-TW.md](deck-format.zh-TW.md)。

要以模板裡的某一頁為起點，先複製再換字：`const {page} = await DJ.addPage(DJ.get(範例頁id), 範例頁id)`。

## 圖片

`addImage` 的 `src` 可以是 `Blob`／`File`、瀏覽器 fetch 得到的網址、`data:` URL，或 `assets()` 列出的佔位（重用簡報裡已有的圖）。`opts` 是 `{x, y, w, h, fit, compress, id, alt}`，其他鍵一律報錯：

| 給了什麼 | 結果 |
|---|---|
| `w` 和 `h` | 圖按比例放進這個框並置中，元素框就是縮好的圖，不留白 |
| `w`、`h` 加上 `fit: 'cover'` | 元素框就是這個框，圖放大填滿、超出的部分裁掉 |
| 只給 `w` 或 `h` | 另一邊按原圖比例算 |
| 都沒給 | 同編輯器的插入圖片：原圖一半，最多畫布的六成 |

`x`、`y` 是框的左上角，省略則置中於畫布。`compress: 'web'｜'std'｜'print'` 會按顯示尺寸重編碼（1.5、2、3 倍像素），與屬性面板的圖片壓縮是同一套，**不可逆**。沒壓縮而原圖遠大於顯示所需時，`warnings` 會提醒。抓回來的不是圖（例如 404 頁）就拋錯，不會把破圖放進簡報。

圖已經放上去、事後才看到警告時，用 `compress(pageId, ids?, preset?)`，不必刪掉重放：框、裁切、群組都不動。`ids` 省略＝該頁所有圖片元素（不含背景圖）；`preset` 是 `'web'`、`'std'`（預設）或 `'print'`。共用同一張圖、目標尺寸也相同的元素只編碼一次，壓完仍是同一份資產。回傳 `{page, preset, compressed: [{id, from, to}], skipped, kb: {before, after}}`；`skipped` 列出原本就不比需求大的圖。與屬性面板的壓縮一樣不可逆，只能用 Cmd/Ctrl+Z 復原。

```js
await DJ.addImage(page, '/figures/chart.png', {x: 640, y: 120, w: 560, h: 420, alt: '年度營收'})
const logo = DJ.assets().find(a => a.usedBy.some(u => u.page === 'master'))
await DJ.addImage(page, logo.asset, {x: 40, y: 640, h: 48})
```

JSON 裡的圖片以 `@asset:<雜湊>` 佔位出現，雜湊按圖片內容算：同一張圖在哪裡都是同一個佔位，也就是 `.deck` 檔裡 `assets/` 下的檔名。所以直接寫 `{type: 'image', dataUrl: '@asset:…', …}` 也能重用那張圖，`natW`／`natH` 可省。舊版的 `@asset:<元素id>` 佔位照樣能還原，但只在那個 id 全簡報只對應一張圖時。

## 不認得的欄位

每條警告寫明欄位、在哪一層發現，以及有的話附上提示：

```
tx-1.paras[0].runs[0].valign: unknown field on a text run — valid on a table cell, text/shape elements, not on a text run
added[0].endArrow: unknown field on shape element — arrowheads are a line kind: use shape:'arrow' or 'doubleArrow' (or 'elbowArrow')
tx-2.fil: unknown field on text element — did you mean "fill"?
```

同樣的檢查也能在瀏覽器外跑：`node tools/deck-lint.js <檔案.deck>` 列出已存檔案裡不認得的欄位（有的話離開碼 1；`--json` 輸出給程式讀）。它載入的是 app 自己的 `src/app/model/schema.js`，結果永遠和上面的警告一致。

## 換行提醒

換行位置由 Unicode 的換行規則決定：一般空白、en dash「–」、連字號「-」後面都可以換行，所以「2 GHz」「2–18」「F-42%」可能被拆到兩行。瀏覽器與 PowerPoint 的規則大致相同，但字型不同、每行寬度就不同，畫布上沒拆開不代表 PowerPoint 裡也沒拆開。pptx 沒有「這段不換行」的格式設定，擋得住的只有字元本身：

| 情況 | 寫法 |
|---|---|
| 數字＋單位 | 中間用不斷行空白 U+00A0 |
| 數字範圍 | 「2 至 18」並在「至」前後用 U+00A0，或用不斷行連字號 U+2011 當範圍符號（en dash、全形～、U+2060 都擋不住 PowerPoint 換行） |
| 字母與數字間的連字號 | 不斷行連字號 U+2011 |
| 比較符號（RL < −10 dB） | 兩側用 U+00A0 |

`lint()` 把這幾種寫法列成提醒（`頁id/元素id: "片段": a line can break …`），**只提醒、不修改**——要不要黏住是寫的人的判斷。命令列 `deck-lint` 也會列出，但不影響離開碼；`--json` 要加 `--breaks` 才會輸出（`{檔名: {fields, breaks}}`），不加時格式與以往相同。

在 DeckJSON 裡編輯文字（文字框與表格儲存格）時，<kbd>Cmd/Ctrl+Shift+空白</kbd> 打出不斷行空白、<kbd>Cmd/Ctrl+Shift+連字號</kbd> 打出不斷行連字號，按法同 Word。

## 測試

[`tests/dj-smoke.js`](../tests/dj-smoke.js) 會把每個動詞都呼叫一次，並只透過 `DJ` 與畫布 DOM 驗證上述保證。執行方式見該檔開頭的註解。
