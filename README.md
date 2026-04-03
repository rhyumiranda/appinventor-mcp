# MIT App Inventor MCP Bridge

> Build Android apps with AI. No drag-and-drop required.

A Chrome extension that exposes MIT App Inventor's internal APIs as an [MCP](https://modelcontextprotocol.io) server. AI agents like Claude Code send structured tool calls; the extension translates them into live JS injections inside App Inventor.

**Result:** What takes 30+ minutes of manual drag-and-drop takes seconds with natural language.

https://github.com/user-attachments/assets/placeholder-demo.mp4

## How It Works

```
Claude Code (or any MCP client)
    | stdio (JSON-RPC 2.0)
    v
Native Messaging Host (Node.js)        <- extension/host/
    | WebSocket (localhost:8765)
    v
Background Service Worker               <- extension/background.js
    | chrome.tabs.sendMessage
    v
Content Script                          <- extension/content.js
    | window.postMessage
    v
Page Bridge (MAIN world)               <- extension/page-bridge.js
    | Direct JS execution
    v
MIT App Inventor (GWT + Blockly)
```

Content scripts can't access page globals. The page-bridge is injected into the MAIN world to reach `BlocklyPanel_*`, `Blockly.*`, and GWT-RPC internals.

## Features

- **15 MCP tools** -- read project state, add components, inject blocks, manage workspace
- **6 MCP resources** -- component catalog, block types, format specs, agent guide
- **107 component types** with full property/event/method schemas
- **147 tests** across 18 test files

### Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Read** | `get_project_info` | Project ID, name, editor state, active screen |
| | `get_component_tree` | Full SCM component hierarchy |
| | `get_component_schema` | Properties, events, methods for a component type |
| | `get_all_component_types` | Complete 107-component catalog |
| | `get_blocks` | Blockly workspace as XML or summary |
| | `get_block_diagnostics` | Warnings, orphaned blocks, counts |
| | `search_components` | Keyword search across component types |
| **Write** | `add_components` | Batch-add UI components (save2 + reload) |
| | `update_component_properties` | Modify existing component props |
| | `remove_components` | Delete components from screen |
| | `add_blocks` | Inject blocks (XML or structured descriptions) |
| | `clear_blocks` | Remove blocks from workspace |
| | `modify_block` | Change field values on existing blocks |
| **Workspace** | `reload_designer` | Force page reload after changes |
| | `undo` / `redo` | Workspace undo/redo |

## Installation

### Prerequisites

- Node.js 18+
- Chrome or Chromium-based browser (Arc, Edge, etc.)
- An MCP client -- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | [Cursor](https://cursor.com) | [Windsurf](https://codeium.com/windsurf) | [Cline](https://github.com/cline/cline) | [Continue](https://continue.dev) | [Zed](https://zed.dev) | [OpenCode](https://github.com/opencode-ai/opencode) | or any MCP-compatible agent

### 1. Install dependencies

```bash
cd extension/host
npm install
```

### 2. Load the extension

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** -> select the `extension/` folder
4. Copy the extension ID

### 3. Register native messaging host

```bash
./extension/host/install.sh    # macOS/Linux (handles Chrome + Arc)
extension\host\install.bat     # Windows
```

Update `allowed_origins` in the generated manifest with your extension ID from step 2.

### 4. Configure your MCP client

<details>
<summary><strong>Claude Code</strong></summary>

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "appinventor": {
    "type": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/extension/host/index.js"]
  }
}
```

Restart Claude Code.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "appinventor": {
      "command": "node",
      "args": ["/absolute/path/to/extension/host/index.js"]
    }
  }
}
```

Restart Cursor.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "appinventor": {
      "command": "node",
      "args": ["/absolute/path/to/extension/host/index.js"]
    }
  }
}
```

Restart Windsurf.

</details>

<details>
<summary><strong>Cline (VS Code)</strong></summary>

Open Cline settings in VS Code, go to **MCP Servers**, click **Add Server**, and enter:

- **Name:** `appinventor`
- **Command:** `node`
- **Args:** `/absolute/path/to/extension/host/index.js`

Or edit `~/.vscode/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "appinventor": {
      "command": "node",
      "args": ["/absolute/path/to/extension/host/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Continue (VS Code / JetBrains)</strong></summary>

Add to `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "appinventor",
      "command": "node",
      "args": ["/absolute/path/to/extension/host/index.js"]
    }
  ]
}
```

</details>

<details>
<summary><strong>Zed</strong></summary>

Add to Zed settings (`settings.json`):

```json
{
  "context_servers": {
    "appinventor": {
      "command": {
        "path": "node",
        "args": ["/absolute/path/to/extension/host/index.js"]
      }
    }
  }
}
```

</details>

<details>
<summary><strong>OpenCode</strong></summary>

Add to `~/.config/opencode/config.toml`:

```toml
[mcp.appinventor]
command = "node"
args = ["/absolute/path/to/extension/host/index.js"]
```

</details>

<details>
<summary><strong>Any MCP Client</strong></summary>

The server speaks standard MCP over stdio (JSON-RPC 2.0, protocol version `2024-11-05`). Point your client at:

```
command: node
args:    /absolute/path/to/extension/host/index.js
```

</details>

## Usage

1. Open a project at [ai2a.appinventor.mit.edu](https://ai2a.appinventor.mit.edu)
2. Start building — no manual edit needed. Claude automatically force-touches the component tree to establish the MCP connection:

```
You: "Add a Button and Label to Screen1"
Claude: [calls add_components] -> Components added, page reloading...

You: "When Button1 is clicked, set Label1 text to 'Hello World'"
Claude: [calls add_blocks] -> Event handler injected
```

## Development

### Running Tests

```bash
cd extension
npm install
npm test                 # 147 tests
npm run test:coverage    # with coverage report
```

Coverage thresholds: 80% on branches, functions, lines, statements.

### Project Structure

```
extension/
  manifest.json          # MV3 manifest
  background.js          # Service worker (WS bridge, auto-reconnect)
  content.js             # Content script (message relay, session cache)
  page-bridge.js         # MAIN world script (GWT/Blockly access + all tool handlers)
  host/
    index.js             # MCP server (stdio + WebSocket)
    install.sh           # Native messaging host installer
    package.json
  lib/
    mcp-handler.js       # MCP protocol parsing/routing
__tests__/               # 18 test files
```

### Methodology

TDD (Red -> Green -> Refactor). No production code without a failing test first.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Chrome extension not connected` | Check service worker console for `Connected to host`. Verify host is running: `lsof -i :8765` |
| `Session params not captured` | Claude will force-touch the component tree automatically. If it still fails, try switching to Designer view |
| `save2 failed with status 500` | Refresh App Inventor tab, make a manual edit to re-capture session params |
| `Blockly workspace not available` | Switch to Blocks editor view |
| `Extension request timed out` | Page may have reloaded mid-request -- retry |

## Known Limitations

- Page reloads after component changes (~3s) -- batch changes to minimize reloads
- Screenshot tool not yet implemented
- No official App Inventor API exists -- relies on reverse-engineered GWT-RPC and Blockly internals

## License

MIT
