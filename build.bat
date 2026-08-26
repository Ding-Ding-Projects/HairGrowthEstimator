@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HGE_SILENT=0"
if /I "%~1"=="/s" set "HGE_SILENT=1"
if /I "%~1"=="--silent" set "HGE_SILENT=1"
if /I "%SILENT%"=="1" set "HGE_SILENT=1"
set "HGE_ROOT=%~dp0"
set "HGE_STARTED=%TIME%"

if "%HGE_SILENT%"=="0" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [build] Requesting elevation before any build work.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/d','/s','/c','""%~f0"" /s' -Wait; exit $LASTEXITCODE } catch { Write-Error $_; exit 1 }"
    exit /b %ERRORLEVEL%
  )
)

echo [build] Fetching and verifying dependencies.
call "%HGE_ROOT%download-dependencies.bat" /s
if errorlevel 1 exit /b %ERRORLEVEL%
pushd "%HGE_ROOT%" || exit /b 30
echo [build] Generating artifact provenance and validated application icons.
call npm.cmd run prepack
if errorlevel 1 (
  popd
  exit /b 31
)
echo [build] Validating locally bundled hair image assets.
node scripts\core\validate-hair-assets.mjs
if errorlevel 1 (
  popd
  exit /b 32
)
echo [build] Application source is ready to run with npm start.
echo [build] Started %HGE_STARTED%, completed %TIME%.
if "%HGE_SILENT%"=="0" (
  choice /C YN /N /M "Run Hair Growth Estimator now? [Y/N] "
  if errorlevel 2 goto build_done
  start "Hair Growth Estimator" /B npm.cmd start
)
:build_done
popd
exit /b 0
