@echo off
setlocal
cd /d "%~dp0"
if defined NEUROTRANSLATE_PYTHON (
  "%NEUROTRANSLATE_PYTHON%" -B play-joint.py %*
) else (
  where py >nul 2>nul
  if errorlevel 1 (python -B play-joint.py %*) else (py -3 -B play-joint.py %*)
)
if errorlevel 1 pause
