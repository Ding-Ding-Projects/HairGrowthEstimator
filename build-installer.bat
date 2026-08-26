@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HGE_SILENT=0"
if /I "%~1"=="/s" set "HGE_SILENT=1"
if /I "%~1"=="--silent" set "HGE_SILENT=1"
if /I "%SILENT%"=="1" set "HGE_SILENT=1"
set "HGE_ROOT=%~dp0"
set "HGE_PHASE_INVENTORY=dependencies;source-capture;squirrel-package;icon-application;installer-validation;source-verification"
if not defined HGE_TIMING_STATE set "HGE_TIMING_STATE=%TEMP%\hair-growth-installer-timing-%RANDOM%-%RANDOM%.json"
if not exist "%HGE_TIMING_STATE%" (
  call :HGE_TIMING start
  if errorlevel 1 (
    if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
    exit /b 38
  )
)
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="

if "%HGE_SILENT%"=="0" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [installer] Requesting elevation before packaging. The elevated copy remains interactive.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $p=Start-Process -FilePath $env:ComSpec -Verb RunAs -ArgumentList '/d','/s','/c','\"\"%~f0\" --elevated\"' -Wait -PassThru; exit $p.ExitCode } catch { Write-Error $_; exit 1 }"
    if errorlevel 1 (
      if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
      exit /b 39
    )
    exit /b 0
  )
)

call :HGE_TIMING phase-start dependencies
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 38
)
echo [installer] Fetching and verifying exact dependencies.
call "%HGE_ROOT%download-dependencies.bat" /s
if errorlevel 1 (
  call :HGE_TIMING fail
  exit /b 49
)
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.runtime.exactVersion)"`) do set "HGE_NODE_VERSION=%%V"
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.git.exactVersion.Replace('.windows.','.'))"`) do set "HGE_GIT_DIRECTORY_VERSION=%%V"
set "HGE_NODE_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\node-v%HGE_NODE_VERSION%-win-x64"
set "HGE_GIT_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\MinGit-%HGE_GIT_DIRECTORY_VERSION%-64-bit"
set "PATH=%HGE_GIT_ROOT%\cmd;%HGE_NODE_ROOT%;%PATH%"
call :HGE_TIMING phase-finish dependencies success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 38
)

call :HGE_TIMING phase-start source-capture
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 38
)
pushd "%HGE_ROOT%" || (
  call :HGE_TIMING fail
  exit /b 40
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\assert-source-preserved.mjs --capture dist\release\source-preservation-installer.json
if errorlevel 1 (
  call :HGE_TIMING fail
  exit /b 47
)
if /I "%HGE_REQUIRE_CLEAN%"=="1" (
  "%HGE_NODE_ROOT%\node.exe" scripts\release\assert-clean-candidate.mjs --ensure
  if errorlevel 1 (
    echo [installer] ERROR: Release packaging requires the same clean exact candidate commit.
    popd
    call :HGE_TIMING fail
    exit /b 41
  )
)
call :HGE_TIMING phase-finish source-capture success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
call :HGE_TIMING phase-start squirrel-package
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
if exist dist\squirrel-windows rmdir /s /q dist\squirrel-windows
echo [installer] Building genuine unsigned Squirrel.Windows release files.
call "%HGE_NODE_ROOT%\npm.cmd" run dist
if errorlevel 1 (
  echo [installer] ERROR: Squirrel.Windows packaging failed.
  popd
  call :HGE_TIMING fail
  exit /b 42
)
call :HGE_TIMING phase-finish squirrel-package success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
call :HGE_TIMING phase-start icon-application
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\apply-installer-icon.mjs dist\squirrel-windows
if errorlevel 1 (
  echo [installer] ERROR: The canonical icon could not be applied to the unsigned Setup executable.
  popd
  call :HGE_TIMING fail
  exit /b 43
)
call :HGE_TIMING phase-finish icon-application success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
call :HGE_TIMING phase-start installer-validation
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
"%HGE_NODE_ROOT%\node.exe" scripts\core\validate-installer.mjs dist\squirrel-windows
if errorlevel 1 (
  echo [installer] ERROR: Installer integrity, provenance, icon, release-index, or no-signing validation failed.
  popd
  call :HGE_TIMING fail
  exit /b 44
)
if not exist dist\squirrel-windows\release-manifest.json (
  echo [installer] ERROR: Validator returned without the required release-manifest.json evidence.
  popd
  call :HGE_TIMING fail
  exit /b 45
)
call :HGE_TIMING phase-finish installer-validation success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
call :HGE_TIMING phase-start source-verification
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\assert-source-preserved.mjs --verify dist\release\source-preservation-installer.json
if errorlevel 1 (
  echo [installer] ERROR: Installer packaging did not preserve every tracked source byte.
  popd
  call :HGE_TIMING fail
  exit /b 48
)
if /I "%HGE_REQUIRE_CLEAN%"=="1" (
  "%HGE_NODE_ROOT%\node.exe" scripts\release\assert-clean-candidate.mjs --ensure
  if errorlevel 1 (
    echo [installer] ERROR: Installer packaging changed tracked source bytes.
    popd
    call :HGE_TIMING fail
    exit /b 46
  )
)
call :HGE_TIMING phase-finish source-verification success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
echo [installer] Unsigned installer complete. Unknown-publisher or SmartScreen warnings are expected.
echo [installer] Release files: %HGE_ROOT%dist\squirrel-windows
call :HGE_TIMING finish success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 38
)
popd
exit /b 0

:HGE_TIMING
if /I "%~1"=="phase-start" goto HGE_TIMING_PHASE_START
if /I "%~1"=="phase-finish" goto HGE_TIMING_PHASE_FINISH
if /I "%~1"=="finish" goto HGE_TIMING_FINISH
if /I "%~1"=="fail" goto HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event start -ScriptName "build-installer.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_START
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-start -ScriptName "build-installer.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-finish -ScriptName "build-installer.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2" -Status "%~3"
exit /b %ERRORLEVEL%

:HGE_TIMING_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event finish -ScriptName "build-installer.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event fail -ScriptName "build-installer.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status failure
exit /b %ERRORLEVEL%
