@echo off
cd /d "%~dp0"
set "SINKING_STAR_WORKSPACE=%~dp0workspace"
set "SINKING_STAR_USER_DATA="
set "SINKING_STAR_OPEN_PROJECT="
for %%D in ("release-public\win-unpacked" "release-v075\win-unpacked" "release\win-unpacked") do (
  for %%F in ("%~dp0%%~D\*.exe") do (
    if exist "%%~fF" (
      start "" "%%~fF"
      exit /b 0
    )
  )
)
call npm start
