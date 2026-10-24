@echo off
REM Lance la surveillance et garde un journal dans surveillance.log
cd /d "%~dp0"
node surveiller.js >> surveillance.log 2>&1
