@echo off
echo ===================================================
echo   Power Plant Graph - Verification Launcher
echo ===================================================
echo.
echo Opening index.html in your default browser...
echo.
echo [IMPORTANT]
echo If the chart is empty, it is due to browser security (CORS).
echo Please click the 'Open CSV' button in the top right
echo and select the 'data.csv' file from this folder.
echo.

start "" "index.html"

pause
