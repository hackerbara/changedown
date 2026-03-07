@echo off
cd /d "%~dp0\.."

echo === Publishing VS Code extension ===
echo.

npm run build

set /p confirm="Publish to VS Code Marketplace? (y/N) "
if /i "%confirm%"=="y" (
  cd packages\vscode-extension
  npx @vscode/vsce publish --no-dependencies --allow-missing-repository
  cd ..\..
  echo Published to VS Code Marketplace!
) else (
  echo Skipped VS Code Marketplace.
)
echo.

set /p confirm="Publish to Open VSX (for Cursor)? (y/N) "
if /i "%confirm%"=="y" (
  cd packages\vscode-extension
  npx ovsx publish --no-dependencies
  cd ..\..
  echo Published to Open VSX!
) else (
  echo Skipped Open VSX.
)
