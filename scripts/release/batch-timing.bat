@echo off
setlocal EnableExtensions DisableDelayedExpansion

if /I "%~1"=="start" goto HGE_EVENT_START
if /I "%~1"=="phase-start" goto HGE_EVENT_PHASE_START
if /I "%~1"=="phase-finish" goto HGE_EVENT_PHASE_FINISH
if /I "%~1"=="finish" goto HGE_EVENT_FINISH
if /I "%~1"=="fail" goto HGE_EVENT_FAIL
echo [timing] ERROR: Unknown timing event.
exit /b 64

:HGE_EVENT_START
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0batch-timing.ps1" -Event start -ScriptName "%~2" -StatePath "%~3" -PhaseInventory "%~4"
if errorlevel 1 exit /b 1
exit /b 0

:HGE_EVENT_PHASE_START
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0batch-timing.ps1" -Event phase-start -ScriptName "%~2" -StatePath "%~3" -PhaseInventory "%~4" -Phase "%~5"
if errorlevel 1 exit /b 1
exit /b 0

:HGE_EVENT_PHASE_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0batch-timing.ps1" -Event phase-finish -ScriptName "%~2" -StatePath "%~3" -PhaseInventory "%~4" -Phase "%~5" -Status "%~6"
if errorlevel 1 exit /b 1
exit /b 0

:HGE_EVENT_FINISH
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0batch-timing.ps1" -Event finish -ScriptName "%~2" -StatePath "%~3" -PhaseInventory "%~4" -Status "%~5"
if errorlevel 1 exit /b 1
exit /b 0

:HGE_EVENT_FAIL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0batch-timing.ps1" -Event fail -ScriptName "%~2" -StatePath "%~3" -PhaseInventory "%~4" -Status failure
if errorlevel 1 exit /b 1
exit /b 0
