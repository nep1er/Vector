@echo off
chcp 65001 >nul
title Vector launcher

rem ====== ИЗМЕНИТЕ ЭТУ СТРОКУ ======
set "PROJECT=E:\Vector"
rem ==================================

if not exist "%PROJECT%\server\index.js" (
  echo Папка проекта не найдена: %PROJECT%
  pause
  exit /b 1
)

rem --- Если клиент (Vite, 5173) уже слушает - значит Vector запущен, останавливаем ---
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if not errorlevel 1 goto STOP

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден в PATH. Откройте cmd и введите: where node
  pause
  exit /b 1
)

if not exist "%PROJECT%\server\node_modules" (
  echo Устанавливаю зависимости сервера...
  pushd "%PROJECT%\server"
  call npm install
  popd
)
if not exist "%PROJECT%\client\node_modules" (
  echo Устанавливаю зависимости клиента...
  pushd "%PROJECT%\client"
  call npm install
  popd
)

echo Запускаю Vector в одном окне...
rem сервер - в этом же консольном окне, без отдельного окна (/b)
start "" /b /d "%PROJECT%\server" cmd /c "npm start"

rem браузер через 6 сек, скрыто
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 6; Start-Process 'http://localhost:5173'"

cd /d "%PROJECT%\client"
echo.
echo ============================================================
echo  Vector запущен. Логи сервера и клиента - в этом окне.
echo  Ctrl+C  - остановить всё.
echo  Крестик - закрыть окно и всё остановить.
echo ============================================================
echo.

call npm run dev

echo.
echo === Vector остановлен ===
pause
exit /b 0

:STOP
echo Останавливаю Vector...
taskkill /f /im node.exe >nul 2>&1
echo Готово. Все процессы Node остановлены.
timeout /t 3 >nul
exit /b 0