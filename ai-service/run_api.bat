@echo off
if "%~1"=="" (
  echo Uso: run_api.bat CAMINHO_ENV_PRIVADO [CAMINHO_PYTHON]
  exit /b 1
)
if "%~2"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_api.ps1" -EnvFile "%~1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_api.ps1" -EnvFile "%~1" -Python "%~2"
)
