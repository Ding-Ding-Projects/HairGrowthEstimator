@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HGE_SILENT=0"
if /I "%~1"=="/s" set "HGE_SILENT=1"
if /I "%~1"=="--silent" set "HGE_SILENT=1"
if /I "%SILENT%"=="1" set "HGE_SILENT=1"
set "HGE_ROOT=%~dp0"
set "HGE_STARTED=%TIME%"
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="

if "%HGE_SILENT%"=="0" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [installer] Requesting elevation before any packaging work.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/d','/s','/c','""%~f0"" /s' -Wait; exit $LASTEXITCODE } catch { Write-Error $_; exit 1 }"
    exit /b %ERRORLEVEL%
  )
)

echo [installer] Fetching and verifying dependencies.
call "%HGE_ROOT%download-dependencies.bat" /s
if errorlevel 1 exit /b %ERRORLEVEL%
pushd "%HGE_ROOT%" || exit /b 40
if exist dist\squirrel-windows rmdir /s /q dist\squirrel-windows
echo [installer] Building genuine unsigned Squirrel.Windows artifacts.
call npm.cmd run dist
if errorlevel 1 (
  popd
  exit /b 41
)
node scripts\core\validate-installer.mjs dist\squirrel-windows
if errorlevel 1 (
  popd
  exit /b 42
)
echo [installer] Unsigned installer complete. Unknown-publisher or SmartScreen warnings are expected.
echo [installer] Started %HGE_STARTED%, completed %TIME%.
popd
exit /b 0
