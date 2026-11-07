@echo off
cd /d "%~dp0"
set "SINKING_STAR_WORKSPACE=%~dp0workspace"
set "SINKING_STAR_USER_DATA="
set "SINKING_STAR_OPEN_PROJECT="
for %%D in ("release-v0712-beta2\win-unpacked" "release-v0712\win-unpacked" "release-v0711\win-unpacked" "release-v0710\win-unpacked" "release-v079-beta3\win-unpacked" "release-v079-beta2\win-unpacked" "release-v079\win-unpacked" "release-v078\win-unpacked" "release-v077\win-unpacked" "release-public\win-unpacked" "release-v075\win-unpacked" "release\win-unpacked") do (
  for %%F in ("%~dp0%%~D\*.exe") do (
    if exist "%%~fF" (
      start "" "%%~fF"
      exit /b 0
    )
  )
)
call npm start
