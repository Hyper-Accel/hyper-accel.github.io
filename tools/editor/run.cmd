@echo off
setlocal
pushd "%~dp0"

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is required: https://bun.sh 1>&2
  popd
  exit /b 1
)

where hugo >nul 2>nul
if errorlevel 1 (
  echo Hugo is required: winget install Hugo.Hugo.Extended 1>&2
  popd
  exit /b 1
)

if not exist node_modules\ (
  call bun install
  if errorlevel 1 (
    popd
    exit /b 1
  )
)

echo.
echo HyperAccel Blog Editor: http://127.0.0.1:4173
echo Hugo rendered site:      http://127.0.0.1:1413
echo.
call bun run dev
set "editor_exit=%errorlevel%"
popd
exit /b %editor_exit%
