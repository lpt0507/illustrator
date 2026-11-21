@echo off
setlocal

call :ResolvePowerShell
if errorlevel 1 goto :PowerShellMissing

set "LINKFORGE_INSTALL_SCRIPT=%~dp0scripts\install.ps1"
"%LINKFORGE_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LINKFORGE_INSTALL_SCRIPT%" -Uninstall
if not errorlevel 1 (
  set "LINKFORGE_EXIT=0"
  goto :Done
)

echo Standard uninstall failed. Retrying once with administrator rights...
"%LINKFORGE_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath $env:LINKFORGE_PS -Verb RunAs -Wait -PassThru -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',$env:LINKFORGE_INSTALL_SCRIPT,'-Uninstall'); exit $p.ExitCode"
set "LINKFORGE_EXIT=%ERRORLEVEL%"
goto :Done

:ResolvePowerShell
set "LINKFORGE_PS="
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "LINKFORGE_PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
if not defined LINKFORGE_PS if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "LINKFORGE_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not defined LINKFORGE_PS if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "LINKFORGE_PS=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined LINKFORGE_PS exit /b 1
exit /b 0

:PowerShellMissing
echo ERROR: Windows PowerShell or PowerShell 7 was not found.
echo Checked the Windows system directories directly; PATH is not required.
set "LINKFORGE_EXIT=1"

:Done
echo.
pause
endlocal & exit /b %LINKFORGE_EXIT%
