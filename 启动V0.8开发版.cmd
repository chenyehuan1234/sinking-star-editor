@echo off
cd /d "%~dp0"
set "SINKING_STAR_WORKSPACE=%~dp0workspace"
set "SINKING_STAR_USER_DATA="
set "SINKING_STAR_OPEN_PROJECT="
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron runtime is missing. Run npm install first.
  pause
  exit /b 1
)
if not exist "%~dp0dist\main\main.cjs" (
  echo Build is missing. Run npm run build first.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" .
