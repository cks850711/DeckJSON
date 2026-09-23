/* 繁體中文：原文語言。
 *
 * 介面字串直接寫在程式裡（_t() 的第一個參數就是中文原文），所以這裡沒有 ui 字典；
 * 形狀名也直接用 app/model/geom.js 的 SHAPE_META。
 *
 * 語言包的結構（其他語言照這個填）：
 *   xx.js        name（選單上顯示的名稱，用該語言自己寫）、html（<html lang>）、
 *                match（比對 navigator.language，第一次開啟時選語言用）、ui、shapes
 *   xx.help.js   help：說明面板本文（HTML 字串）
 *   xx.figs.js   figs：說明配圖（tools/figdeck.js 從 docs/user-manual.deck 產生）
 * 缺的部分一律退回中文。加一種語言＝新增這三個檔，並在 src/index.html 加上對應的 <script src>。
 *
 * 每個語言檔都用「var I18N_PACKS=I18N_PACKS||{};」開頭再各自登記，檔案之間不必講究載入順序。
 * 語言選單的排列順序是各語言第一次登記的順序，所以 zh.js 放在最前面。
 */
var I18N_PACKS=I18N_PACKS||{};
Object.assign(I18N_PACKS.zh=I18N_PACKS.zh||{},{
  name:'中文', html:'zh-Hant', match:/^zh\b/i,
});
