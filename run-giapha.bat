@echo off
chcp 65001 >nul
title Gia Pha Dai Gia Dinh Tuyen - Phan
echo ==============================================================
echo   KHOI DONG TRANG GIA PHA DAI GIA DINH TUYEN - PHAN (PORT 3001)
echo ==============================================================

where node >nul 2>nul
if %errorlevel%==0 (
    echo Dang chay bang Node.js...
    start http://localhost:3001
    node server.js
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo Dang chay bang Python...
    start http://localhost:3001
    python server.py
    goto :eof
)

echo Khong tim thay Node.js hoac Python. Dang mo truc tiep giao dien...
start public\index.html
pause
