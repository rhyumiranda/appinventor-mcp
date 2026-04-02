@echo off
:: Install native messaging host for MIT App Inventor MCP Bridge (Windows)
:: Registers the host manifest with Chrome via registry

set HOST_NAME=com.appinventor.mcp
set SCRIPT_DIR=%~dp0
set HOST_PATH=%SCRIPT_DIR%index.js
set MANIFEST_DIR=%LOCALAPPDATA%\Google\Chrome\NativeMessagingHosts

if not exist "%MANIFEST_DIR%" mkdir "%MANIFEST_DIR%"

:: Write manifest
(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "MIT App Inventor MCP Bridge Native Messaging Host",
echo   "path": "node",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://EXTENSION_ID_HERE/"
echo   ],
echo   "args": ["%HOST_PATH:\=\\%"]
echo }
) > "%MANIFEST_DIR%\%HOST_NAME%.json"

:: Register in Windows registry
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_DIR%\%HOST_NAME%.json" /f

echo.
echo Native messaging host installed.
echo IMPORTANT: Replace EXTENSION_ID_HERE in the manifest with your extension ID.
echo Manifest: %MANIFEST_DIR%\%HOST_NAME%.json
