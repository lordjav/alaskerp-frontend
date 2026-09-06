@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if not errorlevel 1 (
  if not exist node_modules call npm install || exit /b 1
  call npm run dev
  exit /b %errorlevel%
)

set "ALASKA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "ALASKA_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if not exist "%ALASKA_NODE%" goto :missing
if not exist node_modules (
  if not exist "%ALASKA_PNPM%" goto :missing
  call "%ALASKA_PNPM%" install --lockfile=false --store-dir .pnpm-store || exit /b 1
)

"%ALASKA_NODE%" node_modules\vite\bin\vite.js --configLoader native
exit /b %errorlevel%

:missing
echo No se encontro npm ni el runtime local de Codex.
echo Instala Node.js LTS desde https://nodejs.org/ y abre una terminal nueva.
exit /b 1
