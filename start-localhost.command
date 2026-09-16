#!/bin/bash
# 以 http://localhost:8110 開啟 DeckJSON（雙擊本檔即可）。
#
# 為什麼需要這支：固定的 origin 等於固定的儲存空間。自動存檔（IndexedDB）與格線等偏好設定
# （localStorage）都以 origin 為範圍，從固定的 localhost:8110 進來才會每次都看到同一份。
#
# 注意：直接雙擊 deckjson.html（file://）**也能就地覆寫存檔**——2026-09-16 實測，Chrome 會跳
# 一次「file:/// 將可編輯 xxx.deck」的授權提示，允許後 Cmd/Ctrl+S 正常寫回原檔。本註解原本
# 宣稱 file:// 不能寫入硬碟，那是錯的，已更正。所以這支不是「能不能存檔」的分野，是儲存空間
# 穩定性的分野；file:// 的儲存空間隔離行為尚未查證。
#
# ⚠ 不要改 PORT。瀏覽器以 origin（含 port）隔離儲存空間，換一個 port 等於換一個
# 儲存空間，工具內的「自動存檔」與格線設定會像消失一樣（其實是留在舊 port 那邊）。
#
# 關閉這個終端機視窗＝停止服務。
set -u
cd "$(dirname "$0")" || exit 1
PORT=8110
URL="http://localhost:$PORT/deckjson.html"

if [ ! -f deckjson.html ]; then
  echo "找不到 deckjson.html——請先執行 src/build.sh 產生成品。"
  read -r -p "按 Enter 關閉…" _; exit 1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT 已經有服務在跑，直接開啟頁面。"
  open "$URL"; exit 0
fi

# --bind 127.0.0.1：只聽本機，不讓同一個區網的其他人連進來
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null' EXIT INT TERM

sleep 1
if ! kill -0 "$SRV" 2>/dev/null; then
  echo "服務啟動失敗（port $PORT 可能被占用）。"
  read -r -p "按 Enter 關閉…" _; exit 1
fi

echo "DeckJSON 執行中 → $URL"
echo "（關閉這個視窗即停止服務）"
open "$URL"
wait "$SRV"
