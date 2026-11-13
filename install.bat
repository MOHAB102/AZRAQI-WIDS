@echo off
echo AZRAQI WIDS - تثبيت تلقائي
echo ==========================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] Node.js غير مثبت. حمّله من https://nodejs.org
    pause
    exit /b 1
)

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] Python غير مثبت. حمّله من https://python.org
    pause
    exit /b 1
)

echo [1/3] تثبيت حزم Node.js...
call npm install
if %errorlevel% neq 0 (
    echo [خطأ] فشل التثبيت. تأكد من تثبيت Visual Studio Build Tools 2022
    pause
    exit /b 1
)

echo [2/3] تثبيت متطلبات Python...
call pip install -r requirements.txt

echo [3/3] اكتمل التثبيت
echo.
echo للتشغيل: npm start
echo.
echo ملاحظة: على Windows يعمل الطرفية وفحص الأجهزة وفاحص الروابط فقط.
echo الرصد السلبي الكامل يحتاج Kali Linux.
pause