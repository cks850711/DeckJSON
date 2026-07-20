# DeckJSON

人與 AI 協作設計簡報的本地單檔 HTML 工具。在 16:9 畫布上擺放文字／表格／圖片／形狀／圖表，匯出原生 `.pptx`——位置、大小、字體、格式如實呈現，不是把畫面截圖貼進投影片。

## 特色

- **單檔、離線、零安裝**：下載 `deckjson.html`，雙擊用瀏覽器打開就能用。不需要帳號、不需要伺服器，內容不會離開你的電腦。
- **原生 pptx 幾何保真**：形狀、表格、文字框都是真正的 OOXML 元件，不是圖片。匯出的 PowerPoint 黃色調整點（`adj`，如圓角、梯形斜度）仍然可以拖動。
- **JSON 是第一公民**：整份簡報就是一份 JSON。可以把 JSON 複製給 AI 助手，請它幫你調整版面或內容，再貼回工具套用；也可以直接在畫布上手動微調——兩者共用同一份資料，不會互相打架。
- **雙字體模式**：鎖定字體或依母版繼承，中西文分開指定，行距精確鎖定不跑版（貼上不同母版也不會位移）。
- 圖層面板、透明度、軟群組、對齊分佈、格式刷、色票系統、範本庫、Deck 合併、快照匯出（PNG/JPG）、講者備忘稿。

## 使用方式

1. 下載 `deckjson.html`
2. 用瀏覽器開啟（Chrome / Edge / Safari 皆可）
3. 在畫布上新增元素，或用「JSON」按鈕貼入既有簡報結構
4. 完成後按「匯出 pptx」，用 PowerPoint / Keynote / Google Slides 開啟即可繼續編輯

## 開發

原始碼在 `src/`：

- `src/index.html`：主程式（無框架、純 JS）
- `src/vendor/`：簽入版控的第三方函式庫（見 [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)）
- `src/build.sh`：打包腳本

```bash
bash src/build.sh   # 將 src/index.html 與 vendor/*.js 內聯打包，輸出（覆蓋）根目錄的 deckjson.html
```

## 授權

MIT License，見 [LICENSE](LICENSE)。內嵌第三方函式庫的授權聲明見 [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)。

## 關於這個專案

DeckJSON 是人與 AI（Anthropic Claude）協作開發的專案：需求定義、互動設計、驗收測試、架構與授權決策由作者主導並逐輪把關，程式碼實作由 Claude 完成。Claude 模型本身會持續更新，各次提交實際協作的模型版本記錄在對應 commit 的 `Co-Authored-By` 標註中。
