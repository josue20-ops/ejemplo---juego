@echo off
cd /d "%~dp0"
title CAOS Online

echo ======================================
echo   CAOS - Noche de supervivencia
 echo ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro Node.js.
  echo Instala Node.js 18 o superior desde https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias. Esto solo se hace la primera vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

echo.
echo Abre http://localhost:3000 en tu navegador.
echo Para probar online, abre esa direccion en dos ventanas con nombres distintos.
echo.
call npm start
pause
