@echo off
echo ========================================
echo   Stopping Distributed System Cluster
echo ========================================
echo.

echo Stopping all Node.js processes...
taskkill /F /IM node.exe 2>nul

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ All Node.js processes stopped
) else (
    echo.
    echo ℹ No Node.js processes were running
)

echo.
echo ========================================
echo   Cluster Stopped
echo ========================================
echo.
pause
