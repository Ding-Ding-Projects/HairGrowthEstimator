@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HGE_SILENT=0"
if /I "%~1"=="/s" set "HGE_SILENT=1"
if /I "%~1"=="--silent" set "HGE_SILENT=1"
if /I "%SILENT%"=="1" set "HGE_SILENT=1"
set "HGE_ROOT=%~dp0"
set "HGE_PHASE_INVENTORY=dependencies;source-capture;package;source-verification;packaged-validation"
if not defined HGE_TIMING_STATE set "HGE_TIMING_STATE=%TEMP%\hair-growth-build-timing-%RANDOM%-%RANDOM%.json"
if not exist "%HGE_TIMING_STATE%" (
  call :HGE_TIMING start
  if errorlevel 1 (
    if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
    exit /b 18
  )
)

if "%HGE_SILENT%"=="0" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [build] Requesting elevation before any build work. The elevated copy remains interactive.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $p=Start-Process -FilePath $env:ComSpec -Verb RunAs -ArgumentList '/d','/s','/c','\"\"%~f0\" --elevated\"' -Wait -PassThru; exit $p.ExitCode } catch { Write-Error $_; exit 1 }"
    if errorlevel 1 (
      if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
      exit /b 19
    )
    exit /b 0
  )
)

call :HGE_TIMING phase-start dependencies
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 18
)
echo [build] Fetching and verifying exact dependencies.
call "%HGE_ROOT%download-dependencies.bat" /s
if errorlevel 1 (
  call :HGE_TIMING fail
  exit /b 20
)
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.runtime.exactVersion)"`) do set "HGE_NODE_VERSION=%%V"
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$m=ConvertFrom-Json (Get-Content -Raw -LiteralPath '%HGE_ROOT%dependencies.manifest.json'); [Console]::Write($m.git.exactVersion.Replace('.windows.','.'))"`) do set "HGE_GIT_DIRECTORY_VERSION=%%V"
set "HGE_NODE_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\node-v%HGE_NODE_VERSION%-win-x64"
set "HGE_GIT_ROOT=%LOCALAPPDATA%\DingDingProjects\HairGrowthEstimator\toolchain\MinGit-%HGE_GIT_DIRECTORY_VERSION%-64-bit"
set "PATH=%HGE_GIT_ROOT%\cmd;%HGE_NODE_ROOT%;%PATH%"
call :HGE_TIMING phase-finish dependencies success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 18
)

call :HGE_TIMING phase-start source-capture
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  exit /b 18
)
pushd "%HGE_ROOT%" || (
  call :HGE_TIMING fail
  exit /b 30
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\assert-source-preserved.mjs --capture dist\release\source-preservation-build.json
if errorlevel 1 (
  call :HGE_TIMING fail
  exit /b 36
)
if /I "%HGE_REQUIRE_CLEAN%"=="1" (
  "%HGE_NODE_ROOT%\node.exe" scripts\release\assert-clean-candidate.mjs --ensure
  if errorlevel 1 (
    echo [build] ERROR: Release packaging requires a clean exact candidate commit.
    popd
    call :HGE_TIMING fail
    exit /b 31
  )
)
call :HGE_TIMING phase-finish source-capture success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
call :HGE_TIMING phase-start package
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
if exist dist\win-unpacked rmdir /s /q dist\win-unpacked
if exist dist\package rmdir /s /q dist\package
echo [build] Packaging the real runnable Windows application from the current commit.
call "%HGE_NODE_ROOT%\npm.cmd" run package:dir
if errorlevel 1 (
  echo [build] ERROR: The runnable packaged application build failed.
  popd
  call :HGE_TIMING fail
  exit /b 32
)
call :HGE_TIMING phase-finish package success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
call :HGE_TIMING phase-start source-verification
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\assert-source-preserved.mjs --verify dist\release\source-preservation-build.json
if errorlevel 1 (
  echo [build] ERROR: Packaging did not preserve every tracked source byte.
  popd
  call :HGE_TIMING fail
  exit /b 37
)
if /I "%HGE_REQUIRE_CLEAN%"=="1" (
  "%HGE_NODE_ROOT%\node.exe" scripts\release\assert-clean-candidate.mjs --ensure
  if errorlevel 1 (
    echo [build] ERROR: Packaging changed tracked source bytes.
    popd
    call :HGE_TIMING fail
    exit /b 35
  )
)
call :HGE_TIMING phase-finish source-verification success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
call :HGE_TIMING phase-start packaged-validation
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
"%HGE_NODE_ROOT%\node.exe" scripts\release\validate-packaged-app.mjs dist\win-unpacked
if errorlevel 1 (
  echo [build] ERROR: The packaged executable, app.asar, provenance, icon, or source-preservation contract is invalid.
  popd
  call :HGE_TIMING fail
  exit /b 33
)
if not exist "dist\win-unpacked\Hair Growth Estimator.exe" (
  echo [build] ERROR: Packaging reported success without the runnable executable.
  popd
  call :HGE_TIMING fail
  exit /b 34
)
call :HGE_TIMING phase-finish packaged-validation success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
echo [build] Runnable packaged application: %HGE_ROOT%dist\win-unpacked\Hair Growth Estimator.exe
call :HGE_TIMING finish success
if errorlevel 1 (
  if exist "%HGE_TIMING_STATE%" call :HGE_TIMING fail
  popd
  exit /b 18
)
if "%HGE_SILENT%"=="0" (
  choice /C YN /N /M "Run the packaged Hair Growth Estimator now? [Y/N] "
  if errorlevel 2 goto build_done
  start "Hair Growth Estimator" "%HGE_ROOT%dist\win-unpacked\Hair Growth Estimator.exe"
)
:build_done
popd
exit /b 0

:HGE_TIMING
if /I "%~1"=="phase-start" goto HGE_TIMING_PHASE_START
if /I "%~1"=="phase-finish" goto HGE_TIMING_PHASE_FINISH
if /I "%~1"=="finish" goto HGE_TIMING_FINISH
if /I "%~1"=="fail" goto HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event start -ScriptName "build.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_START
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-start -ScriptName "build.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_PHASE_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event phase-finish -ScriptName "build.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Phase "%~2" -Status "%~3"
exit /b %ERRORLEVEL%

:HGE_TIMING_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event finish -ScriptName "build.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status "%~2"
exit /b %ERRORLEVEL%

:HGE_TIMING_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HGE_ROOT%scripts\release\batch-timing.ps1" -Event fail -ScriptName "build.bat" -StatePath "%HGE_TIMING_STATE%" -PhaseInventory "%HGE_PHASE_INVENTORY%" -Status failure
exit /b %ERRORLEVEL%
