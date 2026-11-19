@echo off
chcp 65001 >nul
title Vector launcher

rem ====== ИЗМЕНИТЕ ЭТУ СТРОКУ: путь к папке проекта (где лежат server и client) ======
set "PROJECT=E:\Vector"
rem ==================================================================================

if not exist "%PROJECT%\server\index.js" (
  echo Папка проекта не найдена: %PROJECT%
  echo Откройте этот .bat в блокноте и поправьте строку PROJECT.
  pause
  exit /b 1
)

where node >/dev/null 2>/dev/null || (
  echo Node.js не найден. Установите его с https://nodejs.org и запустите снова.
  pause
  exit /b 1
)

rem Первая установка зависимостей (только если ещё нет node_modules)
if not exist "%PROJECT%\server\node_modules" (
  echo Устанавливаю зависимости сервера...
  pushd "%PROJECT%\server" && call npm install && popd
)
if not exist "%PROJECT%\client\node_modules" (
  echo Устанавливаю зависимости клиента...
  pushd "%PROJECT%\client" && call npm install && popd
)

echo Запускаю сервер и сайт...
start "Vector — сервер" /D "%PROJECT%\server" cmd /k "npm start"
start "Vector — сайт" /D "%PROJECT%\client" cmd /k "npm run dev"

rem Ждём, пока Vite поднимется, затем открываем браузер
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"
exit
