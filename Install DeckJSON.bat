@echo off
rem Double-click to install DeckJSON (Windows). 雙擊安裝 DeckJSON（Windows）。
rem   1. Checks that Node.js is installed
rem   2. Copies deckjson.html and deckjson-server.js to %USERPROFILE%\.deckjson\app\
rem   3. Opens Chrome (or Edge) at the page that installs the DJ App
rem If Windows SmartScreen warns about this file: More info -> Run anyway.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo DeckJSON needs Node.js ^(free^). Install the LTS version from https://nodejs.org, then double-click this file again.
  echo DeckJSON 需要 Node.js（免費）。請到 https://nodejs.org 下載 LTS 版安裝，再雙擊本檔一次。
  start "" https://nodejs.org/
  pause
  exit /b 1
)
node deckjson-server.js install
pause
