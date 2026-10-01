#!/bin/bash
# Double-click to install DeckJSON (macOS). 雙擊安裝 DeckJSON（macOS）。
#
# What it does / 做什麼：
#   1. Checks that Node.js is installed / 確認裝了 Node.js
#   2. Copies deckjson.html and deckjson-server.js to ~/.deckjson/app/ / 複製到 ~/.deckjson/app/
#   3. Opens Chrome (or Edge) at the page that installs the DJ App / 開 Chrome（或 Edge）到 DJ App 的安裝頁
#
# If macOS says it cannot verify this file: right-click it -> Open, or allow it in
# System Settings -> Privacy & Security -> "Open Anyway". The same thing from Terminal:
#   node "<this folder>/deckjson-server.js" install
# macOS 說無法驗證這個檔時：按右鍵 →「打開」，或到「系統設定 → 隱私權與安全性」按「強制打開」。
# 也可以在終端機執行上面那行，效果相同。
cd "$(dirname "$0")" || exit 1
pause() { echo; read -r -p "Press Enter to close / 按 Enter 關閉 " _; }
if ! command -v node >/dev/null 2>&1; then
  echo "DeckJSON needs Node.js (free). Install the LTS version from https://nodejs.org, then double-click this file again."
  echo "DeckJSON 需要 Node.js（免費）。請到 https://nodejs.org 下載 LTS 版安裝，再雙擊本檔一次。"
  open "https://nodejs.org/"
  pause; exit 1
fi
node deckjson-server.js install
code=$?
pause
exit $code
