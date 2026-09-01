#!/bin/bash
# 以 http://localhost:8110 開啟 DeckJSON（雙擊本檔即可）。
#
# 為什麼需要這支：瀏覽器不讓 file:// 的頁面寫入你的硬碟，所以直接雙擊 deckjson.html
# 開啟時，「存檔」只能下載一份副本到下載資料夾。從 localhost 開就拿得到寫入授權，
# Cmd/Ctrl+S 可以直接覆寫你開啟的那個 .deck 檔。
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
