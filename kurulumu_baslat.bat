@echo off
title GOLD GYS - Veritabani Kurulumu
color 0E

echo ==========================================
echo   GOLD GYS - KRALIYET VERITABANI KURULUMU
echo ==========================================
echo.
echo [1/2] Gerekli kutuphaneler yukleniyor...
call npm install firebase-admin --save-dev
echo.

echo [2/2] Veritabani yapilandiriliyor...
node scripts/init-membership.js
echo.

echo ==========================================
echo   KURULUM TAMAMLANDI KAPTAN!
echo ==========================================
pause