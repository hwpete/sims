@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "历史人生模拟器 API" /b "C:\Users\26317\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
start "历史人生模拟器服务器" /b "C:\Users\26317\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 4174
timeout /t 1 /nobreak >nul
start "历史人生模拟器" http://127.0.0.1:4174/frontend/index.html
