@echo off
where node >nul 2>nul
if errorlevel 1 (
    echo Install Node.js 18 or later, then open this launcher again.
    pause
    exit /b 1
)
node "%~dp0launch.mjs" %*
exit /b %errorlevel%
