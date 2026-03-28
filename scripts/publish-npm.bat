@echo off
cd /d "%~dp0\.."

echo === Publishing changedown to npm ===
echo.

npm run build

cd packages\cli
echo Package: changedown
echo.
set /p confirm="Publish to npm? (y/N) "
if /i "%confirm%"=="y" (
  npm publish --access public
  echo Published!
) else (
  echo Skipped.
)
