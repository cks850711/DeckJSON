# 腳本介面（`window.DJ`）

[English](scripting-api.md) | **繁體中文**

`window.DJ` 是用腳本驅動 DeckJSON 的穩定入口，適用於瀏覽器自動化、測試，或讓 AI 代理替你改簡報。頁面裡其他的一切都是內部實作，隨時可能改名；`DJ` 是不會變的那一層。

```js
DJ.list()                                        // 所有頁
DJ.outline('p-abc')                              // 某一頁的元素摘要
await DJ.patch('p-abc', [{id: 'tx-1', set: {y: 120}}])
await DJ.fit('p-abc', ['tx-1'])                  // 文字框縮放到剛好裝下文字
await DJ.fitTable('p-abc', ['tb-1'])             // 表格列高貼合文字
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
| `info()` | `{version, app, title, pages, page, stage:{w,h}, master, file, dirty}`；`page` 是畫面上那一頁 |
| `list()` | `[{n, id, name, els, section?, skip?, current?}]`，每頁一筆 |
| `outline(pageId)` | `[{id, type, x, y, w, h, text?, shape?, grid?, hidden?, locked?, group?, overflow?}]`；`text` 取前 40 字，`overflow: true` 表示文字框放不下文字。表格的 `h` 是畫出來的實際高度：`rowH` 只是下限，字放不下的列會自己長高，直接加總 `rowH` 會少算 |
| `get(pageId)` | 整頁完整 JSON。圖片位元組換成 `@asset:<雜湊>` 佔位（按圖片內容編號），寫入時自動還原 |
| `assets()` | `[{asset, type, kb, natW?, natH?, usedBy}]`，簡報裡的每張圖（含背景圖、影片封面）一筆，內容相同的只列一次。`asset` 就是佔位字串，`usedBy` 列出用到它的 `{page, id}` 或 `{page, field}` |
| `get(pageId, elementId)` | 單一元素的完整 JSON |

## 寫入

| 呼叫 | 作用 |
|---|---|
| `patch(pageId, changes)` | 套用一串修改。每筆是 `{id, set?, unset?, remove?, md?}`：`set` 淺層合併欄位（要改 `paras` 就整個陣列換掉，格式也一起換掉），`unset` 是要刪的鍵，`remove: true` 刪除元素，`md` 換掉文字框或形狀的文字**但保留格式**（見下文）。change 裡出現其他鍵一律報錯。`id` 等於頁 id 時改的是頁面欄位：`name`、`bg`、`bgImage`、`notes`、`section`、`skip`、`transition`、`noMaster`。回傳 `{page, changed, overflow}` |
| `add(pageId, elements)` | 把元素加到該頁最上層。沒給 id、或 id 已被該頁用掉的，自動配新的。回傳 `{page, ids, overflow}`，`ids` 是實際採用的 id，順序同輸入 |
| `addImage(pageId, src, opts?)` | 加一張圖，轉碼、讀原始尺寸、算不變形的框都由它做。見下文〈圖片〉。回傳 `{page, id, natW, natH, kb, overflow, warnings}` |
| `replacePage(pageId, json)` | 換掉該頁的元素（以及 `json` 裡有列出的頁面欄位）。沒列出的欄位沿用原值，頁 id 不變。`json` 也可以直接是元素陣列 |
| `addPage(json?, afterPageId?)` | 在 `afterPageId` 之後插入一頁（省略＝最後）。回傳 `{page, n, overflow}` |
| `removePage(pageId)` | 刪除一頁。只剩一頁時不能刪 |

## 版面

| 呼叫 | 作用 |
|---|---|
| `measure(pageId, elementId)` | `{id, w, h, needW, needH}`：文字框剛好裝下文字需要的尺寸。橫書比 `needH` 與 `h`，直書比 `needW` 與 `w`。不改任何東西 |
| `fit(pageId, ids)` | 把文字框縮放到剛好裝下文字：橫書調高（上緣不動），直書調寬（左緣不動）。`ids` 必填，免得刻意留高的卡片被一起收掉。等同編輯器裡的「貼合內容」。回傳 `{page, fitted:[{id, from, to}], overflow}` |
| `fitTable(pageId, ids, opts?)` | 把表格每一列設成剛好裝下文字的高度，再加 `pad`（預設 `10`）。儲存格上下沒有內距，不加的話字會貼著框線；10px 約等於 PowerPoint 表格預設的上下內距（各 0.05 吋）。列會變高也會變矮。任何頁都能量，不限畫面上這一頁。`opts`：`{pad}`。等同編輯器裡的「列高貼合內容」。回傳 `{page, fitted:[{id, rowH, was, h}]}` |
| `overflow(pageId?)` | 放不下文字的文字框 id，也就是畫布上畫紅色虛線框的那些。不給頁 id 時回 `{頁id: [ids]}`，只列有溢出的頁 |
| `lint(pageId?)` | 簡報裡既有的不認得欄位（寫入呼叫只檢查這次傳進來的東西），加上容易被換行拆開的寫法（見下文〈換行提醒〉）。可給單頁、`'master'`，省略則掃整份 |

## 檔案與輸出

| 呼叫 | 作用 |
|---|---|
| `fromTemplate(src, {pages?, title?})` | 從模板開新簡報：沿用模板的全部設定（投影片尺寸、預留區、字體、樣式模式、母版、頁碼…），只篩選頁面。`pages` 可為 `'shown'`（預設：沒有設為不放映的頁——模板慣例上會把說明頁、元件頁設為不放映）、`'all'`，或依想要順序排列的頁 id／頁名陣列。不沿用模板的標題，除非給 `title`。回傳 `{pages, dropped, warnings}`。和 `load` 一樣是一步復原，並清掉目前開啟的檔案 |
| `load(src)` | 載入簡報：`Blob`／`File`／`ArrayBuffer`（`.deck` 容器或純 JSON）、JSON 字串或物件。會清掉「目前開啟的檔案」，之後按 Cmd/Ctrl+S 才不會把它寫進先前開著的那個檔 |
| `toBlob()` | 整份簡報的 `.deck` 檔（`Blob`） |
| `snapshot(pageId, {scale?, format?})` | 單頁的 PNG（或 `format: 'jpeg'`）圖片，`Blob` |
| `exportPptx()` | 匯出的 `.pptx`（`Blob`），不觸發下載 |
| `show(pageId)` | 把編輯器切到那一頁給旁觀的人看。唯一會改變畫面的呼叫 |

存到磁碟由呼叫端負責：網頁不經使用者選位置，不能自己寫檔。開發用的 `tools/serve.py` 兩頭都包了：`--mount /前綴=資料夾` 把別的資料夾唯讀掛進來，頁面直接 fetch 那裡的圖和簡報；`--save 資料夾` 接收存檔。

```bash
python3 tools/serve.py 8111 . --mount /notes=~/notes --save ~/notes/out
```

```js
await DJ.load(await fetch('/notes/talk.deck').then(r => r.blob()))
await DJ.addImage(page, '/notes/figures/a.png', {x: 640, y: 120, w: 560, h: 420})
await fetch('/save?n=talk.deck', {method: 'POST', body: await DJ.toBlob()})
```

伺服器只聽 127.0.0.1、檢查 Host 與 Origin、不送 CORS 標頭，別的網站讀不到掛載的檔，也寫不進存檔資料夾。

## 換文字、不丟格式

用 `set` 換 `paras` 會連格式一起換掉：44pt 的彩色標題會變成預設的 18pt 黑字。只想換字就用 `md`：

```js
await DJ.patch(page, [{id: 'title', md: '新標題'}])
await DJ.patch(page, [{id: 'box', md: '第一行 **粗體部分**\n第二行'}])
```

每一行成為一個段落。第 *k* 行沿用原本第 *k* 段的段落設定（對齊、項目符號、段距）與文字最長的那個片段的字元樣式（段首若是粗體標籤，新段落不會整段變粗）；多出來的行沿用原本最後一段。行內 markdown（`**粗體**`、`*斜體*`、`==標記==`…）照樣疊加上去。

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
