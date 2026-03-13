# Install

## VS Code / Cursor

Search **ChangeTracks** in the Extensions panel, or:

```
ext install changetracks
```

## MCP Server

Paste into `claude_desktop_config.json`, `.cursor/mcp.json`, or equivalent:

```json
{
  "mcpServers": {
    "changetracks": {
      "command": "npx",
      "args": ["@changetracks/mcp-server"]
    }
  }
}
```

Six tools become available: `propose_change`, `amend_change`, `supersede_change`, `review_changes`, `list_changes`, `read_tracked_file`.

## Core Library

```bash
npm install @changetracks/core
```

Parser, operations engine, and view rendering. Build your own integrations.
