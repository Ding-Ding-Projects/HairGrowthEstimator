@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HGE_SILENT=0"
if /I "%~1"=="/s" set "HGE_SILENT=1"
if /I "%~1"=="--silent" set "HGE_SILENT=1"
if /I "%SILENT%"=="1" set "HGE_SILENT=1"
set "HGE_ROOT=%~dp0"
set "HGE_PHASE_INVENTORY=manifest;git;node;npm-dependencies;squirrel-tools;release-contract"
if not defined HGE_BOOTSTRAP_TIMING_STATE set "HGE_BOOTSTRAP_TIMING_STATE=%TEMP%\hair-growth-bootstrap-timing-%RANDOM%-%RANDOM%.json"
if not exist "%HGE_BOOTSTRAP_TIMING_STATE%" (
  call :HGE_TIMING start
  if errorlevel 1 (
    if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
    exit /b 19
  )
)

call :HGE_TIMING phase-start manifest
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)
if not exist "%HGE_ROOT%dependencies.manifest.json" (
  echo [bootstrap] ERROR: dependencies.manifest.json is missing.
  call :HGE_TIMING fail
  exit /b 20
)

for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.git.exactVersion)"`) do set "HGE_GIT_VERSION=%%V"
if not defined HGE_GIT_VERSION (
  echo [bootstrap] ERROR: The exact MinGit version could not be read from dependencies.manifest.json.
  call :HGE_TIMING fail
  exit /b 21
)
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.runtime.exactVersion)"`) do set "HGE_NODE_VERSION=%%V"
if not defined HGE_NODE_VERSION (
  echo [bootstrap] ERROR: The exact Node.js version could not be read from dependencies.manifest.json.
  call :HGE_TIMING fail
  exit /b 24
)
call :HGE_TIMING phase-finish manifest success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)

call :HGE_TIMING phase-start git
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)
echo [bootstrap] Preparing exact user-scoped MinGit %HGE_GIT_VERSION%.
if "%HGE_SILENT%"=="1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\bootstrap-git.ps1" -RepositoryRoot "%HGE_ROOT%." -Silent
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\bootstrap-git.ps1" -RepositoryRoot "%HGE_ROOT%."
)
if errorlevel 1 (
  echo [bootstrap] ERROR: Exact MinGit bootstrap failed. Required version and SHA-256 values are recorded in dependencies.manifest.json.
  call :HGE_TIMING fail
  exit /b 22
)
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.git.exactVersion.Replace('.windows.','.'))"`) do set "HGE_GIT_DIRECTORY_VERSION=%%V"
set "HGE_GIT_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\MinGit-%HGE_GIT_DIRECTORY_VERSION%-64-bit"
set "PATH=%HGE_GIT_ROOT%\cmd;%PATH%"
if not exist "%HGE_GIT_ROOT%\cmd\git.exe" (
  echo [bootstrap] ERROR: Verified MinGit bootstrap did not leave cmd\git.exe at %HGE_GIT_ROOT%.
  call :HGE_TIMING fail
  exit /b 23
)
call :HGE_TIMING phase-finish git success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)

call :HGE_TIMING phase-start node
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)
echo [bootstrap] Preparing exact Node.js %HGE_NODE_VERSION% from the recorded portable archive.
if "%HGE_SILENT%"=="1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\bootstrap-node.ps1" -RepositoryRoot "%HGE_ROOT%." -Silent
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\bootstrap-node.ps1" -RepositoryRoot "%HGE_ROOT%."
)
if errorlevel 1 (
  echo [bootstrap] ERROR: Exact Node.js bootstrap failed. Required version: %HGE_NODE_VERSION%. Source and SHA-256 are recorded in dependencies.manifest.json.
  call :HGE_TIMING fail
  exit /b 25
)

set "HGE_NODE_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\node-v%HGE_NODE_VERSION%-win-x64"
set "PATH=%HGE_NODE_ROOT%;%PATH%"
if not exist "%HGE_NODE_ROOT%\node.exe" (
  echo [bootstrap] ERROR: Verified Node.js bootstrap did not leave node.exe at %HGE_NODE_ROOT%.
  call :HGE_TIMING fail
  exit /b 26
)
for /f "delims=" %%V in ('"%HGE_NODE_ROOT%\node.exe" --version') do set "HGE_OBSERVED_NODE=%%V"
if /I not "%HGE_OBSERVED_NODE%"=="v%HGE_NODE_VERSION%" (
  echo [bootstrap] ERROR: Node.js reported %HGE_OBSERVED_NODE%; expected v%HGE_NODE_VERSION%.
  call :HGE_TIMING fail
  exit /b 27
)
if not exist "%HGE_NODE_ROOT%\npm.cmd" (
  echo [bootstrap] ERROR: npm.cmd did not accompany the verified Node.js archive.
  call :HGE_TIMING fail
  exit /b 28
)
call :HGE_TIMING phase-finish node success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)

call :HGE_TIMING phase-start npm-dependencies
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)
pushd "%HGE_ROOT%" || (
  call :HGE_TIMING fail
  exit /b 29
)
if not exist package-lock.json (
  echo [bootstrap] ERROR: package-lock.json is missing. The exact npm dependency graph cannot be verified.
  popd
  call :HGE_TIMING fail
  exit /b 30
)
echo [bootstrap] Installing exact npm dependencies from package-lock.json.
call "%HGE_NODE_ROOT%\npm.cmd" ci --ignore-scripts=false --no-audit --no-fund
if errorlevel 1 (
  echo [bootstrap] ERROR: npm clean install failed against package-lock.json integrity.
  popd
  call :HGE_TIMING fail
  exit /b 31
)
if not exist node_modules\electron\dist\electron.exe (
  echo [bootstrap] Electron metadata exists without its runtime. Running the exact package installer.
  "%HGE_NODE_ROOT%\node.exe" node_modules\electron\install.js
  if errorlevel 1 (
    echo [bootstrap] ERROR: electron 44.0.0 runtime acquisition failed.
    popd
    call :HGE_TIMING fail
    exit /b 32
  )
)
if not exist node_modules\electron\dist\electron.exe (
  echo [bootstrap] ERROR: electron 44.0.0 installer returned without electron.exe.
  popd
  call :HGE_TIMING fail
  exit /b 33
)
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.npm.electronRuntime.executableSha256)"`) do set "HGE_EXPECTED_ELECTRON_EXE_SHA=%%H"
"%HGE_NODE_ROOT%\node.exe" -e "const fs=require('node:fs');const m=JSON.parse(fs.readFileSync('dependencies.manifest.json'));const c=JSON.parse(fs.readFileSync('node_modules/electron/checksums.json'));if(c[m.npm.electronRuntime.archive]!==m.npm.electronRuntime.archiveSha256)process.exit(1)"
if errorlevel 1 (
  echo [bootstrap] ERROR: electron 44.0.0 archive checksum metadata does not match dependencies.manifest.json.
  popd
  call :HGE_TIMING fail
  exit /b 34
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\verify-file-sha256.mjs node_modules\electron\dist\electron.exe %HGE_EXPECTED_ELECTRON_EXE_SHA% >nul
if errorlevel 1 (
  echo [bootstrap] ERROR: electron 44.0.0 executable bytes do not match the pinned extracted runtime digest.
  popd
  call :HGE_TIMING fail
  exit /b 35
)

call :HGE_TIMING phase-finish npm-dependencies success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 19
)

call :HGE_TIMING phase-start squirrel-tools
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 19
)

pushd node_modules\electron-winstaller
"%HGE_NODE_ROOT%\node.exe" script\select-7z-arch.js
if errorlevel 1 (
  echo [bootstrap] ERROR: electron-winstaller 26.15.3 could not select its bundled x64 7-Zip binary.
  popd
  popd
  call :HGE_TIMING fail
  exit /b 36
)
popd
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.npm.squirrelBundled7Zip.sha256)"`) do set "HGE_EXPECTED_7Z_SHA=%%H"
"%HGE_NODE_ROOT%\node.exe" scripts\release\verify-file-sha256.mjs node_modules\electron-winstaller\vendor\7z-x64.exe %HGE_EXPECTED_7Z_SHA% >nul
if errorlevel 1 (
  echo [bootstrap] ERROR: electron-winstaller bundled 7-Zip SHA-256 does not match dependencies.manifest.json.
  popd
  call :HGE_TIMING fail
  exit /b 37
)
copy /y node_modules\electron-winstaller\vendor\7z-x64.exe node_modules\electron-winstaller\vendor\7z.exe >nul
"%HGE_NODE_ROOT%\node.exe" scripts\release\verify-file-sha256.mjs node_modules\electron-winstaller\vendor\7z.exe %HGE_EXPECTED_7Z_SHA% >nul
if errorlevel 1 (
  echo [bootstrap] ERROR: Active electron-winstaller 7-Zip binary does not match the verified x64 binary.
  popd
  call :HGE_TIMING fail
  exit /b 38
)
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.npm.squirrelResourceEditor.sha256)"`) do set "HGE_EXPECTED_RCEDIT_SHA=%%H"
"%HGE_NODE_ROOT%\node.exe" scripts\release\verify-file-sha256.mjs node_modules\electron-winstaller\vendor\rcedit.exe %HGE_EXPECTED_RCEDIT_SHA% >nul
if errorlevel 1 (
  echo [bootstrap] ERROR: electron-winstaller bundled resource editor SHA-256 does not match dependencies.manifest.json.
  popd
  call :HGE_TIMING fail
  exit /b 39
)
for %%F in (Squirrel.exe Setup.exe WriteZipToSetup.exe) do (
  for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.npm.squirrelExecutableTools.'%%F')"`) do set "HGE_EXPECTED_SQUIRREL_TOOL_SHA=%%H"
  call "%HGE_NODE_ROOT%\node.exe" scripts\release\verify-file-sha256.mjs node_modules\electron-winstaller\vendor\%%F %%HGE_EXPECTED_SQUIRREL_TOOL_SHA%% >nul
  if errorlevel 1 (
    echo [bootstrap] ERROR: electron-winstaller %%F SHA-256 does not match dependencies.manifest.json.
    popd
    call :HGE_TIMING fail
    exit /b 41
  )
)

call "%HGE_NODE_ROOT%\npm.cmd" ls @electron/asar@4.3.0 electron@44.0.0 electron-builder@26.15.3 electron-builder-squirrel-windows@26.15.3 resedit@1.7.2 sharp@0.34.3 --depth=0
if errorlevel 1 (
  echo [bootstrap] ERROR: Installed package versions do not match dependencies.manifest.json.
  popd
  call :HGE_TIMING fail
  exit /b 40
)

call :HGE_TIMING phase-finish squirrel-tools success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 19
)

call :HGE_TIMING phase-start release-contract
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 19
)

"%HGE_NODE_ROOT%\node.exe" scripts\release\release-context.mjs --validate-only >nul
if errorlevel 1 (
  echo [bootstrap] ERROR: Dependency and release manifests do not satisfy the committed schema.
  popd
  call :HGE_TIMING fail
  exit /b 41
)
call :HGE_TIMING phase-finish release-contract success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 19
)
popd
call :HGE_TIMING finish success
if errorlevel 1 (
  if exist "%HGE_BOOTSTRAP_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 19
)
echo [bootstrap] Dependencies are ready. MinGit %HGE_GIT_VERSION%, Node.js %HGE_OBSERVED_NODE%.
exit /b 0

:HGE_TIMING
if /I "%~1"=="phase-start" goto HGE_TIMING_PHASE_START
if /I "%~1"=="phase-finish" goto HGE_TIMING_PHASE_FINISH
if /I "%~1"=="finish" goto HGE_TIMING_FINISH
if /I "%~1"=="fail" goto HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event start -ScriptName "download-dependencies.bat" -StatePath "%HGE_BOOTSTRAP_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_START
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-start -ScriptName "download-dependencies.bat" -StatePath "%HGE_BOOTSTRAP_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-finish -ScriptName "download-dependencies.bat" -StatePath "%HGE_BOOTSTRAP_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2" -Status "%~3"
exit /b %ERRORLEVEL%

:HGE_TIMING_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event finish -ScriptName "download-dependencies.bat" -StatePath "%HGE_BOOTSTRAP_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event fail -ScriptName "download-dependencies.bat" -StatePath "%HGE_BOOTSTRAP_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status failure
exit /b %ERRORLEVEL%
