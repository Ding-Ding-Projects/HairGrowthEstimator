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
    echo [bootstrap] Requesting elevation before any installation work.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/d','/s','/c','""%~f0"" /s' -Wait; exit $LASTEXITCODE } catch { Write-Error $_; exit 1 }"
    exit /b %ERRORLEVEL%
  )
)

echo [bootstrap] Checking Node.js 22 or newer.
where node.exe >nul 2>&1
if errorlevel 1 goto install_node
node -e "const major=Number(process.versions.node.split('.')[0]);process.exit(major>=22?0:1)"
if errorlevel 1 goto install_node
for /f "delims=" %%V in ('node -p "process.version"') do echo [bootstrap] Found Node.js %%V.
goto node_ready

:install_node
echo [bootstrap] Node.js 22 or newer is missing. Trying canonical winget package OpenJS.NodeJS.LTS with user scope.
where winget.exe >nul 2>&1
if errorlevel 1 (
  echo [bootstrap] ERROR: Node.js ^>=22 is required. winget.exe is unavailable, and no verified portable fallback is recorded in dependencies.manifest.json.
  echo [bootstrap] Attempted source: Windows Package Manager package OpenJS.NodeJS.LTS.
  exit /b 20
)
winget.exe install --id OpenJS.NodeJS.LTS --exact --scope user --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
if errorlevel 1 (
  echo [bootstrap] ERROR: winget could not install OpenJS.NodeJS.LTS with user scope.
  exit /b 21
)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%ProgramFiles%\nodejs;%PATH%"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo [bootstrap] ERROR: Node.js installation completed but node.exe is not discoverable in this process.
  exit /b 22
)

:node_ready
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [bootstrap] ERROR: npm.cmd did not accompany Node.js.
  exit /b 23
)

pushd "%HGE_ROOT%" || exit /b 24
if not exist package-lock.json (
  echo [bootstrap] ERROR: package-lock.json is missing. A reproducible clean install cannot proceed.
  popd
  exit /b 25
)
echo [bootstrap] Installing exact npm dependencies from package-lock.json.
call npm.cmd ci --ignore-scripts=false --no-audit --no-fund
if errorlevel 1 (
  echo [bootstrap] ERROR: npm clean install failed against package-lock.json.
  popd
  exit /b 26
)
if not exist node_modules\electron\dist\electron.exe (
  echo [bootstrap] Electron package metadata is present but its runtime binary is missing. Running the package's pinned installer.
  node node_modules\electron\install.js
  if errorlevel 1 (
    echo [bootstrap] ERROR: electron 44.0.0 runtime acquisition failed.
    popd
    exit /b 28
  )
)
if not exist node_modules\electron\dist\electron.exe (
  echo [bootstrap] ERROR: electron 44.0.0 installer returned without electron.exe.
  popd
  exit /b 29
)
pushd node_modules\electron-winstaller
node script\select-7z-arch.js
if errorlevel 1 (
  echo [bootstrap] ERROR: electron-winstaller 26.15.3 could not select its bundled x64 7-Zip binary.
  popd
  popd
  exit /b 30
)
popd
for %%A in (node_modules\electron-winstaller\vendor\7z.exe) do set "HGE_7Z_BYTES=%%~zA"
for %%A in (node_modules\electron-winstaller\vendor\7z-x64.exe) do set "HGE_7Z_X64_BYTES=%%~zA"
if not "%HGE_7Z_BYTES%"=="%HGE_7Z_X64_BYTES%" (
  echo [bootstrap] ERROR: active electron-winstaller 7-Zip binary does not match its bundled x64 binary.
  popd
  exit /b 31
)
call npm.cmd ls electron@44.0.0 electron-builder@26.15.3 electron-builder-squirrel-windows@26.15.3 --depth=0
if errorlevel 1 (
  echo [bootstrap] ERROR: Installed package versions do not match dependencies.manifest.json.
  popd
  exit /b 32
)
popd
echo [bootstrap] Dependencies are ready. Started %HGE_STARTED%, completed %TIME%.
exit /b 0
