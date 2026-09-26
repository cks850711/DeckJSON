#!/bin/bash
# 把 skills/deckjson 打包成可安裝的 agent skill：
#   build/skill/deckjson/            SKILL.md ＋ references/（從 docs/ 複製，唯一來源在 docs/）
#   build/deckjson-skill.zip         上傳用，zip 內第一層就是 deckjson/ 資料夾（資料夾名須等於 skill 名）
#
# 用法：bash tools/package-skill.sh
# 安裝方式見 README〈Using DeckJSON with an AI agent〉。
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=deckjson
OUT=build/skill/$NAME
rm -rf build/skill build/$NAME-skill.zip
mkdir -p "$OUT/references"
cp skills/$NAME/SKILL.md "$OUT/"
cp docs/scripting-api.md docs/deck-format.md "$OUT/references/"
(cd build/skill && zip -qrX ../$NAME-skill.zip $NAME)
echo "built: build/skill/$NAME/ and build/$NAME-skill.zip ($(wc -c < build/$NAME-skill.zip | tr -d ' ') bytes)"
