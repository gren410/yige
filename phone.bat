@echo off
rem YiGe - let a phone on the same Wi-Fi open this app
rem 1) double click this file, keep the black window open
rem 2) open the http://192.168.x.x:8080 address it prints, on your phone
rem 3) close this window (or press Ctrl+C) to stop
cd /d "%~dp0"
"C:\Users\wscic\.workbuddy\binaries\python\versions\3.13.12\python.exe" tools\preview.py --host 0.0.0.0 --port 8080
pause
