#!/bin/bash
# Install native messaging host for MIT App Inventor MCP Bridge
# Registers the host manifest with Chrome/Chromium

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.appinventor.mcp"
HOST_PATH="$SCRIPT_DIR/index.js"

# Detect OS and set target directories
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  ARC_DIR="$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
  ARC_DIR=""
else
  echo "Unsupported OS: $OSTYPE"
  echo "Use install.bat for Windows"
  exit 1
fi

# Write manifest to a given directory
install_host() {
  local dir="$1"
  local browser="$2"
  mkdir -p "$dir"
  cat > "$dir/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "MIT App Inventor MCP Bridge Native Messaging Host",
  "path": "$(which node)",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://koboojlkibeakgmjeddgnolbebnmpmkp/"
  ],
  "args": ["$HOST_PATH"]
}
EOF
  echo "Installed for $browser: $dir/$HOST_NAME.json"
}

# Install for Chrome
install_host "$CHROME_DIR" "Chrome"

# Install for Arc (macOS only)
if [[ -n "$ARC_DIR" ]]; then
  install_host "$ARC_DIR" "Arc"
fi

echo ""
echo "IMPORTANT: Update allowed_origins with your actual extension ID"
echo "  1. Load the extension in your browser (chrome://extensions or arc://extensions)"
echo "  2. Copy the extension ID"
echo "  3. Edit the manifest JSON file(s) above"
echo "  4. Replace the extension ID in allowed_origins"
