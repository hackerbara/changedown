<!-- ctrcks.com/v1: tracked -->
# Install

## VS Code / Cursor

Search **ChangeTracks** in the Extensions panel, or:

```
ext install changetracks
```

## MCP Server

Paste into `claude_desktop_config.json`, `.cursor/mcp.json`, or equivalent:[^ct-1]

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

{~~Parser, operations engine, and view rendering. Use it in your own tools.~>Parser, operations engine, and view rendering. Build your own integrations.~~}[^ct-3]


[^ct-1]: @ai:claude-opus-4.6 | 2026-03-13 | sub | accepted
    @ai:claude-opus-4.6 2026-03-13T06:08:37Z: Lead with the action verb. "Add to" is ambiguous — paste is what they'll actually do.
    approved: @human:hackerbara 2026-03-13T06:09:41Z "right — tell them exactly where to paste it"

[^ct-3]: @human:hackerbara | 2026-03-13 | sub | proposed
    @human:hackerbara 2026-03-13T06:09:10Z: say what they get, not what they should do with it