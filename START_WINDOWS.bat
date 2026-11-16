@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed. Please read START_HERE.html.
  pause
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo Start Docker Desktop and wait for Docker Engine to become ready.
  pause
  exit /b 1
)
docker compose version
if errorlevel 1 goto failed
docker compose up -d --build --wait
if errorlevel 1 goto failed
start "INNOSIGHT" "http://localhost:3000"
echo INNOSIGHT is ready: http://localhost:3000
pause
exit /b 0
:failed
echo Startup failed. Read START_HERE.html, section 9.
echo Run: docker compose logs --tail=100
pause
exit /b 1
