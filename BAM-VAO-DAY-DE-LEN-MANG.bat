@echo off
chcp 65001 >nul
color 0A
title DUA TRANG WEB GIA PHA TUYEN - PHAN LEN INTERNET (TU DONG)

echo =========================================================================
echo   🌳 HE THONG TU DONG DUA GIA PHA DAI GIA DINH TUYEN - PHAN LEN MANG
echo   (Khong can dang nhap - Khong bi khoa mat khau)
echo =========================================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
    echo [BUOC 1] Dang khoi dong May chu Gia Pha (Node.js)...
    start /b node server.js
    goto :step2
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo [BUOC 1] Dang khoi dong May chu Gia Pha (Python)...
    start /b python server.py
    goto :step2
)

:step2
timeout /t 2 /nobreak >nul
echo.
echo [BUOC 2] Dang ket noi Internet de lay duong link cong khai cho gia dinh...
echo.
echo =========================================================================
echo 👉 NGAY KHI DONG CHU "tunneled with tls termination, https://....lhr.life"
echo    HIEN RA BEN DUOI, DO CHINH LA DUONG LINK TREN MANG CUA BAN!
echo 👉 Ban chi can Copy duong link https://....lhr.life do gui vao Zalo gia dinh
echo    la TAT CA MOI NGUOI vao thang duoc ngay ma KHONG HOI MAT KHAU!
echo =========================================================================
echo.

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3001 nokey@localhost.run

pause
