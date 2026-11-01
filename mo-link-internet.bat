@echo off
chcp 65001 >nul
title Tao Link Internet Cong Khai - Gia Pha Tuyen Phan
echo =====================================================================
echo   🌐 DANG KHOI DONG GIA PHA VA TAO DUONG LINK INTERNET CONG KHAI
echo   (Khong can dang nhap Gmail hay tai khoan)
echo =====================================================================
echo.

where node >nul 2>nul
if %errorlevel%==0 (
    echo [1/2] Dang bat may chu Gia Pha bang Node.js tai cong 3001...
    start /b node server.js
    goto :tunnel
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo [1/2] Dang bat may chu Gia Pha bang Python tai cong 3001...
    start /b python server.py
    goto :tunnel
)

:tunnel
timeout /t 2 /nobreak >nul
echo.
echo [2/2] Dang tao duong link HTTPS cong khai tren Internet...
echo 👉 Hay copy duong link bat dau bang https://...lhr.life o ben duoi de gui cho gia dinh!
echo =====================================================================
ssh -o StrictHostKeyChecking=no -R 80:localhost:3001 nokey@localhost.run
pause
