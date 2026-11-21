@echo off
setlocal

set "LINKFORGE_PS="
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "LINKFORGE_PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
if not defined LINKFORGE_PS if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "LINKFORGE_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not defined LINKFORGE_PS if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "LINKFORGE_PS=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined LINKFORGE_PS (
  echo ERROR: Windows PowerShell or PowerShell 7 was not found.
  pause
  exit /b 1
)

"%LINKFORGE_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-native.ps1"
set "LINKFORGE_EXIT=%ERRORLEVEL%"
if not "%LINKFORGE_EXIT%"=="0" pause
endlocal & exit /b %LINKFORGE_EXIT%
