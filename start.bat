@echo off
rem YiGe local preview server - double click to start
rem Close this window to stop the server, or press Ctrl+C
cd /d "%~dp0"
"C:\Users\wscic\.workbuddy\binaries\python\versions\3.13.12\python.exe" tools\preview.py
pause
