#!/bin/bash
# 打包給人下載的 build/DeckJSON.zip：解壓縮後雙擊安裝程式即可（說明見 README〈Install the DJ App〉）。
#   DeckJSON/deckjson.html              單檔版，雙擊就能用
#   DeckJSON/deckjson-server.js         伺服器與安裝程式本體（Node，不必安裝套件）
#   DeckJSON/Install DeckJSON.command   macOS 雙擊安裝
#   DeckJSON/Install DeckJSON.bat       Windows 雙擊安裝
#   DeckJSON/deckjson-skill.zip         給 AI 代理的 skill（安裝時一併複製到 ~/.deckjson/app/）
#   DeckJSON/README*.md、LICENSE、THIRD-PARTY-LICENSES.md
#
# 用法：bash tools/package-release.sh（會先重新打包 skill；deckjson.html 用 repo 裡現有的成品）
# zip 由 macOS／Linux 的 zip 產生，保留 .command 的執行權限，雙擊才跑得起來。
set -euo pipefail
cd "$(dirname "$0")/.."
bash tools/package-skill.sh >/dev/null
OUT=build/release/DeckJSON
rm -rf build/release build/DeckJSON.zip
mkdir -p "$OUT"
cp deckjson.html deckjson-server.js "Install DeckJSON.command" "Install DeckJSON.bat" \
   README.md README.zh-TW.md LICENSE THIRD-PARTY-LICENSES.md "$OUT/"
cp build/deckjson-skill.zip "$OUT/"
chmod +x "$OUT/Install DeckJSON.command"
(cd build/release && zip -qrX ../DeckJSON.zip DeckJSON)
echo "built: build/DeckJSON.zip ($(wc -c < build/DeckJSON.zip | tr -d ' ') bytes)"
