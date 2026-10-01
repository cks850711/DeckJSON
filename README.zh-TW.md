# DeckJSON

[English](README.md) | **繁體中文**

**v0.3.0**

在瀏覽器裡做簡報，匯出**真正的 PowerPoint 檔**——形狀、表格、文字框都是原生 OOXML 元件，開啟後每一個都還能在 PowerPoint 裡繼續編輯。

簡報內容就是一份 JSON：你可以把它整包丟給 AI 改版面、改內容，貼回來就生效（功能持續改進中）。

單檔 HTML，下載就能用。不需要帳號、不需要伺服器、不連任何外部網域，簡報內容不會離開你的電腦。

---

## 開始使用

1. 下載 **[`deckjson.html`](https://github.com/cks850711/DeckJSON/releases/latest/download/deckjson.html)**（永遠指向最新版）
2. 用 **Chrome** 開啟（才能使用完整的讀檔、存檔、另存新檔等操作）
3. 開始在畫布上擺東西，做簡報
4. 完成後按「**匯出 pptx**」

就這樣，沒有第五步。

介面有繁體中文與英文兩種，第一次開啟時依瀏覽器語言自動選擇，之後可在工具列的**齒輪 → 介面語言**切換。

---

## 安裝 DJ App（可選）

雙擊 `deckjson.html` 就能用，不裝也沒關係。想要以下這些再安裝 DJ App：

- **雙擊任何 `.deck` 就用 DeckJSON 開啟**，有自己的視窗，Dock／開始選單也有自己的圖示
- **Cmd/Ctrl+S 直接存回那個檔**，不跳選檔視窗，連第一次都不用
- **5 個槽位，各自保留自動存檔**：兩個視窗開兩份簡報，自動存檔不會互相覆蓋
- 不連網也能用

需要 **Chrome 或 Edge**（Safari、Firefox 不能把網頁裝成 App），安裝程式另外需要 **[Node.js](https://nodejs.org)**（免費，下載 LTS 版）。

1. 下載 **[`DeckJSON.zip`](https://github.com/cks850711/DeckJSON/releases/latest/download/DeckJSON.zip)** 並解壓縮，裡面的檔案要放在同一個資料夾
2. 雙擊 **`Install DeckJSON.command`**（macOS）或 **`Install DeckJSON.bat`**（Windows）
   - macOS 可能說無法驗證開發者：在檔案上按右鍵 →「**打開**」，或到「**系統設定 → 隱私權與安全性**」按「**強制打開**」。Windows 的 SmartScreen 可能警告：按「**其他資訊 → 仍要執行**」
   - 也可以在終端機執行：`node deckjson-server.js install`
3. Chrome 會打開安裝頁，照著做完：按「**安裝 DeckJSON**」，再雙擊一個 `.deck`。第一次瀏覽器會問要不要在這個 App 裡開啟——**勾「記住我的選擇」**再按「**開啟**」，接著選一個槽位

安裝程式會把 `deckjson.html` 與 `deckjson-server.js` 複製到 `~/.deckjson/app/`，只在安裝與更新時需要，App 本身不靠它執行。**更新**：執行新版的安裝程式。**移除**：在 App 視窗的選單（⋮）選「**解除安裝 DeckJSON**」，再執行 `node ~/.deckjson/app/deckjson-server.js uninstall`。

---

## 為什麼是這個工具

**匯出的 pptx 是真的。** 黃色調整點還能拖、圖表能按「編輯資料」改數字、母版能跟隨目標佈景、章節能摺疊。市面上多數「網頁做簡報」的工具匯出的是圖片或近似版面，打開只能看不能改。

**簡報即資料。** `deck.json` 就是簡報的全部。人在畫布上拖，AI 在 JSON 上改，兩邊共用同一份資料——這也是這個工具叫 DeckJSON 的原因。

**PowerPoint 的形狀，一個不少。** 176 種內建形狀由 OOXML 的 preset 幾何即時求值，畫布上的輪廓**就是 PowerPoint 的原生幾何本身**，不是手畫的近似路徑。清單裡沒有的，用內建的圖形編輯器畫（鋼筆、貝茲、挖洞），或直接寫座標交給 AI 產生。

**從 Excel 貼過來還是表格。** 在 Excel 或 PowerPoint 複製一張表，`Cmd/Ctrl+V` 貼進畫布，得到的是可編輯的原生表格——合併儲存格、底色、粗斜體、對齊全部保留，不是一張截圖。

<details>
<summary><b>完整功能清單</b>（點開）</summary>

**編輯**
- 就地富文本編輯：反白幾個字，格式就只套那幾個字。同一句話裡混用粗體、顏色、字級，匯出後仍是同一個文字框裡的一句話
- 表格格內混排：同一格裡同時有上標、下標、變色、變字級
- 原生文字格式：底線／刪除線／高亮／字距／描邊／輝光、項目符號與編號清單、段前後間距、超連結
- 直書與文字方向：中日韓直書、旋轉 90°／270°、蒙文直書
- 漸層填色、原生陰影、圖片裁切（拖曳構圖、滾輪縮放）與圓形裁切
- 製圖式格線與吸附：格距可設 mm／px／pt／cm，移動吸左上緣、縮放吸四邊
- 圖層面板、透明度、軟群組、對齊分佈、格式刷、色票系統、範本庫、Deck 合併

**簡報結構**
- 母版（信紙）：共用元素墊在每頁底下，可選擇寫進版面配置或畫進每一頁
- 章節：匯出為 PowerPoint 原生章節，縮圖窗格可整段摺疊搬動
- Morph 平滑轉場：依元素 id 跨頁配對，舊版 PPT 自動退回淡出（實時播放投影開發中）
- 自動頁碼（原生欄位，插刪頁自動更新）、頁面背景圖、檔案屬性
- 環境設定檔（profile）：尺寸、字體三槽、語言、預留區都是資料，可帶著走
- 雙字體模式：鎖定或依母版繼承，中西文分開指定，行距鎖定不跑版

**圖表與媒體**
- 圖表資料就是 ECharts option（目前得自己寫或整份丟給 AI 輸出，未來會逐漸完善這個功能）；「視覺編輯」分頁只調外觀，面板頂端即時預覽
- 圖表雙輸出：3 倍解析度 PNG，或匯出為 PowerPoint 原生圖表（PPT 內可編輯資料）。面板上每個設定都標清楚有沒有原生對應，沒有的會直接停用而不是讓它靜靜消失
- 圖片壓縮：縮到顯示尺寸的 N 倍再存，按鈕上先標出會變成幾×幾、幾 KB
- 影片：YouTube 連結匯出為原生線上影片；本機影片抓一格當封面，匯出後列出待插入清單

**存檔**
- 自動存檔：每次改動後約 1 秒存進瀏覽器，重新整理會自動還原。存不進去（容量滿、無痕模式）一律轉紅字明講原因，不靜默失敗
- 自動存檔**只有一份，而且是全域的**——詳見〈進階〉的說明
- 勿依賴自動存檔，**任何重要進度請另存成 `.deck` 檔**

</details>

---

## 檔案格式

`.deck` 是一個 zip 容器：

```
mimetype              第一個 entry，未壓縮。內容為 application/vnd.deckjson.deck
deck.json             簡報本體。整份結構就在這裡
assets/<雜湊>.<副檔名>   圖片位元組，以內容定址，相同的圖只存一份
```

`deck.json` 是 JSON 純文字，可取出讀寫、丟給 AI 修改、進 git diff。存檔時會寫入 `generator`，記錄產生它的版本。

`.deck` 這個副檔名可能不只 DeckJSON 在用，所以容器的第一個 entry 放了 `mimetype` 讓檔案認得出自己——拿到別家的 `.deck`，工具會確認那是什麼格式。

---

## 讓 AI 代理替你做簡報

AI 代理可以在編輯器裡直接做簡報、改簡報，你在旁邊看得到每一步。它走的是 `window.DJ` 這組精簡而穩定的介面，每一次修改都是一步復原。怎麼連上、怎麼存檔，看代理能做什麼：

| 代理能… | 怎麼運作 |
|---|---|
| **在你的電腦上執行指令**（例如 Claude Code） | 它用一個資料夾啟動 DeckJSON 伺服器——裝過的話是 `node ~/.deckjson/app/deckjson-server.js start <資料夾或 .deck 檔>`，沒裝就在解壓縮的資料夾執行 `node deckjson-server.js start …`——打開它印出的網址，用 `DJ.save()` 直接存進硬碟，不用你按任何東西。每個工作各用一個 port（47111～47115），自動存檔也各自分開；`http://127.0.0.1:<port>/__status` 列出每個 port 讀過與存過哪些簡報、開著哪些分頁，也能關閉。伺服器只聽你自己的電腦、只能寫那個資料夾裡的 `.deck`／`.pptx`，沒有頁面開著 15 分鐘後會自己結束。 |
| **只能操作瀏覽器分頁**（例如透過瀏覽器擴充功能） | 用 Chrome 開 `deckjson.html`，開啟你的 `.deck`（或開新簡報），再請代理動手。要讓它能存檔，請你自己先按一次 **Cmd/Ctrl+S**（第一次會問存在哪裡）；之後代理就能存回同一個檔。瀏覽器只允許網頁寫入使用者親手選過的檔，所以這一下必須由你來按。 |

**安裝 DeckJSON skill**，代理就知道怎麼連上編輯器、JSON 怎麼寫、怎麼排版、怎麼存檔：

1. 從最新版下載 **[`deckjson-skill.zip`](https://github.com/cks850711/DeckJSON/releases/latest/download/deckjson-skill.zip)**（或從原始碼執行 `bash tools/package-skill.sh` 自己打包）
2. 放到代理讀取 skill 的位置：

| 代理 | 放在哪裡 |
|---|---|
| Claude Code | 解壓縮到 `~/.claude/skills/`（所有專案都用得到）或 `<你的專案>/.claude/skills/`，讓檔案落在 `skills/deckjson/SKILL.md` |
| Claude app（網頁版與桌面版） | **自訂（Customize）→ Skills → ＋ → 上傳 skill**，直接選這個 zip |
| 其他代理 | 把 `SKILL.md` 和 `references/` 裡的兩個檔當成指示給它 |

skill 附的參考文件也在這裡：[docs/scripting-api.zh-TW.md](docs/scripting-api.zh-TW.md)（每個呼叫）與 [docs/deck-format.zh-TW.md](docs/deck-format.zh-TW.md)（每種元素的 JSON）。

---

## 回報問題

工具列右側的 **`?`** 開啟使用說明，**版本號就標在它的標頭上**。

單檔成品沒有自動更新機制——你手上那份可能是任何時候下載的，所以回報問題時請一併附上：

| 附上什麼 | 在哪裡找 |
|---|---|
| **版本號** | 說明面板標頭，如 `v0.1.0` |
| 瀏覽器與版本 | Chrome 的「關於 Chrome」 |
| 出問題的 `.deck` 檔 | 若不便提供，`deck.json` 裡的 `generator` 欄位也記錄了產生它的版本 |
| 重現步驟 | 做了什麼、預期什麼、實際發生什麼 |

請開 [GitHub Issue](../../issues)。匯出的 pptx 有問題時，若允許，附上那個 pptx 會讓排查快很多。

---

## 進階

<details>
<summary><b>存檔是寫回原檔，還是下載副本</b></summary>

用 **Chrome** 開啟（雙擊 `deckjson.html` 即可，Edge 等 Chromium 系瀏覽器同樣可以），`Cmd/Ctrl+S` **直接寫回你開啟的那個檔**，跟一般軟體一樣。工具列會顯示目前的檔名，`●` 代表有還沒存的變更。

**Safari 與 Firefox 沒有這個 API**，存檔會退回「下載一份副本到下載資料夾」，要自己搬回原位覆蓋。工具列按鈕的提示文字會直接寫明這件事，不會讓你以為存進去了。

</details>

<details>
<summary><b>可以讓腳本或 AI 代理直接在編輯器裡改簡報嗎</b></summary>

可以。頁面提供 `window.DJ`，一組精簡而穩定的介面，用 id 讀取與修改目前開著的簡報：列出頁面、修改元素、把文字框貼合內容、找出放不下的文字，並把 `.deck`／`.pptx` 以檔案形式取回。每次寫入都是一步復原，腳本做了什麼，按 Cmd/Ctrl+Z 都能撤銷。

每個呼叫見 **[docs/scripting-api.zh-TW.md](docs/scripting-api.zh-TW.md)**，每種元素的 JSON 見 **[docs/deck-format.zh-TW.md](docs/deck-format.zh-TW.md)**；或安裝〈[讓 AI 代理替你做簡報](#讓-ai-代理替你做簡報)〉一節的 skill。

</details>

<details>
<summary><b>⚠ 自動存檔是全域一份，多個成品會互相覆蓋</b></summary>

自動存檔放在瀏覽器的 IndexedDB，位置是固定的 `deckjson / autosave / current`。

問題在於**雙擊開啟的頁面（`file://`）全部共用同一個儲存空間**——不是每個檔案各自一份。實測：把同一個頁面複製成兩個不同檔名，在 A 寫入，B 讀得到 A 寫的東西。

所以如果你手上有**兩份以上的成品**（例如通用版 `deckjson.html`，加上用 `--profile` 打包的個人版），在 `file://` 下它們**共用同一筆自動存檔**：在 A 編輯的內容，開 B 會看到；B 一存又蓋掉 A 的。

要讓它們各自獨立，得讓頁面走不同的 origin——從 `http://localhost:<各自的 port>` 開啟，每個 port 是一個獨立的儲存空間。macOS 可直接雙擊專案根的 `start-localhost.command`（預設 `http://localhost:8110`），其他平台用任意靜態伺服器即可，例如 `python3 -m http.server 8110`。

⚠ 走 localhost 的話**port 定了就別改**：換 port 等於換一個儲存空間，自動存檔會像消失一樣（其實留在舊 port 那邊）。`file://` 與 `localhost` 兩種開法的自動存檔也是各自獨立的。

**DJ App**（見〈[安裝 DJ App](#安裝-dj-app可選)〉）沒有這些問題：它有 5 個各自分開的槽位，AI 用的每個伺服器 port 也各是一塊獨立的儲存空間。

**但最簡單的辦法還是：重要進度另存成 `.deck` 檔。** 自動存檔的定位是「瀏覽器當掉時的救命索」。

</details>

---

## 授權

MIT License，見 [LICENSE](LICENSE)。內嵌第三方函式庫的授權聲明見 [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)。

## 關於這個專案

DeckJSON 是人與 AI（Anthropic Claude）協作開發的專案：需求定義、互動設計、驗收測試、架構與授權決策由作者主導並逐輪把關，程式碼實作由 Claude 完成。Claude 模型本身會持續更新，各次提交實際協作的模型版本記錄在對應 commit 的 `Co-Authored-By` 標註中。
