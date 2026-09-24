# 腳本介面（`window.DJ`）

[English](scripting-api.md) | **繁體中文**

`window.DJ` 是用腳本驅動 DeckJSON 的穩定入口，適用於瀏覽器自動化、測試，或讓 AI 代理替你改簡報。頁面裡其他的一切都是內部實作，隨時可能改名；`DJ` 是不會變的那一層。

```js
DJ.list()                                        // 所有頁
DJ.outline('p-abc')                              // 某一頁的元素摘要
await DJ.patch('p-abc', [{id: 'tx-1', set: {y: 120}}])
await DJ.fit('p-abc', ['tx-1'])                  // 文字框縮放到剛好裝下文字
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
| `outline(pageId)` | `[{id, type, x, y, w, h, text?, shape?, grid?, hidden?, locked?, group?, overflow?}]`；`text` 取前 40 字，`overflow: true` 表示文字框放不下文字 |
| `get(pageId)` | 整頁完整 JSON。圖片位元組換成 `@asset:<id>` 佔位，`patch`／`replacePage` 會自動還原 |
| `get(pageId, elementId)` | 單一元素的完整 JSON |

## 寫入

| 呼叫 | 作用 |
|---|---|
| `patch(pageId, changes)` | 套用一串修改。每筆是 `{id, set?, unset?, remove?, md?}`：`set` 淺層合併欄位（要改 `paras` 就整個陣列換掉，格式也一起換掉），`unset` 是要刪的鍵，`remove: true` 刪除元素，`md` 換掉文字框或形狀的文字**但保留格式**（見下文）。change 裡出現其他鍵一律報錯。`id` 等於頁 id 時改的是頁面欄位：`name`、`bg`、`bgImage`、`notes`、`section`、`skip`、`transition`、`noMaster`。回傳 `{page, changed, overflow}` |
| `add(pageId, elements)` | 把元素加到該頁最上層。沒給 id、或 id 已被該頁用掉的，自動配新的。回傳 `{page, ids, overflow}`，`ids` 是實際採用的 id，順序同輸入 |
| `replacePage(pageId, json)` | 換掉該頁的元素（以及 `json` 裡有列出的頁面欄位）。沒列出的欄位沿用原值，頁 id 不變。`json` 也可以直接是元素陣列 |
| `addPage(json?, afterPageId?)` | 在 `afterPageId` 之後插入一頁（省略＝最後）。回傳 `{page, n, overflow}` |
| `removePage(pageId)` | 刪除一頁。只剩一頁時不能刪 |

## 版面

| 呼叫 | 作用 |
|---|---|
| `measure(pageId, elementId)` | `{id, w, h, needW, needH}`：文字框剛好裝下文字需要的尺寸。橫書比 `needH` 與 `h`，直書比 `needW` 與 `w`。不改任何東西 |
| `fit(pageId, ids)` | 把文字框縮放到剛好裝下文字：橫書調高（上緣不動），直書調寬（左緣不動）。`ids` 必填，免得刻意留高的卡片被一起收掉。等同編輯器裡的「貼合內容」。回傳 `{page, fitted:[{id, from, to}], overflow}` |
| `overflow(pageId?)` | 放不下文字的文字框 id，也就是畫布上畫紅色虛線框的那些。不給頁 id 時回 `{頁id: [ids]}`，只列有溢出的頁 |
| `lint(pageId?)` | 簡報裡既有的不認得欄位（寫入呼叫只檢查這次傳進來的東西）。可給單頁、`'master'`，省略則掃整份 |

## 檔案與輸出

| 呼叫 | 作用 |
|---|---|
| `fromTemplate(src, {pages?, title?})` | 從模板開新簡報：沿用模板的全部設定（投影片尺寸、預留區、字體、樣式模式、母版、頁碼…），只篩選頁面。`pages` 可為 `'shown'`（預設：沒有設為不放映的頁——模板慣例上會把說明頁、元件頁設為不放映）、`'all'`，或依想要順序排列的頁 id／頁名陣列。不沿用模板的標題，除非給 `title`。回傳 `{pages, dropped, warnings}`。和 `load` 一樣是一步復原，並清掉目前開啟的檔案 |
| `load(src)` | 載入簡報：`Blob`／`File`／`ArrayBuffer`（`.deck` 容器或純 JSON）、JSON 字串或物件。會清掉「目前開啟的檔案」，之後按 Cmd/Ctrl+S 才不會把它寫進先前開著的那個檔 |
| `toBlob()` | 整份簡報的 `.deck` 檔（`Blob`） |
| `snapshot(pageId, {scale?, format?})` | 單頁的 PNG（或 `format: 'jpeg'`）圖片，`Blob` |
| `exportPptx()` | 匯出的 `.pptx`（`Blob`），不觸發下載 |
| `show(pageId)` | 把編輯器切到那一頁給旁觀的人看。唯一會改變畫面的呼叫 |

存到磁碟由呼叫端負責：網頁不經使用者選位置，不能自己寫檔。常見做法是把 `toBlob()` POST 給一支本機的小型收檔程式。

## 換文字、不丟格式

用 `set` 換 `paras` 會連格式一起換掉：44pt 的彩色標題會變成預設的 18pt 黑字。只想換字就用 `md`：

```js
await DJ.patch(page, [{id: 'title', md: '新標題'}])
await DJ.patch(page, [{id: 'box', md: '第一行 **粗體部分**\n第二行'}])
```

每一行成為一個段落。第 *k* 行沿用原本第 *k* 段的段落設定（對齊、項目符號、段距）與第一個文字片段的字元樣式；多出來的行沿用原本最後一段。行內 markdown（`**粗體**`、`*斜體*`、`==標記==`…）照樣疊加上去。

要以模板裡的某一頁為起點，先複製再換字：`const {page} = await DJ.addPage(DJ.get(範例頁id), 範例頁id)`。

## 不認得的欄位

每條警告寫明欄位、在哪一層發現，以及有的話附上提示：

```
tx-1.paras[0].runs[0].valign: unknown field on a text run — valid on a table cell, text/shape elements, not on a text run
added[0].endArrow: unknown field on shape element — arrowheads are a line kind: use shape:'arrow' or 'doubleArrow' (or 'elbowArrow')
tx-2.fil: unknown field on text element — did you mean "fill"?
```

同樣的檢查也能在瀏覽器外跑：`node tools/deck-lint.js <檔案.deck>` 列出已存檔案裡不認得的欄位（有的話離開碼 1；`--json` 輸出給程式讀）。它載入的是 app 自己的 `src/app/model/schema.js`，結果永遠和上面的警告一致。

## 測試

[`tests/dj-smoke.js`](../tests/dj-smoke.js) 會把每個動詞都呼叫一次，並只透過 `DJ` 與畫布 DOM 驗證上述保證。執行方式見該檔開頭的註解。
