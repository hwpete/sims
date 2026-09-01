@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "历史人生模拟器 API" /b "%~dp0venv\Scripts\python.exe" backend\main.py
timeout /t 1 /nobreak >nul
start "历史人生模拟器" http://127.0.0.1:8000/
