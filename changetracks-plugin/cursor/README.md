# Cursor Setup

## Quick Setup (Recommended)

```bash
./changetracks-plugin/setup.sh --cursor
```

This builds hooks-impl and MCP server (if needed), installs hooks and skill in one step.

## Manual Setup

### 1. MCP Server

Build the server once:

```bash
cd changetracks-plugin/mcp-server && npm ci && npm run build
```

In Cursor: **Settings > Features > MCP** and ensure **changetracks** is enabled.

**Project root / hashline:** The server resolves the project root by walking up from the script path to find `.changetracks/config.toml`. To override, set `CHANGETRACKS_PROJECT_DIR` in the server's `env` in `.cursor/mcp.json`.

**Author identity (optional):** If the project has `[author] enforcement = "required"`, set `CHANGETRACKS_AUTHOR` in `.cursor/mcp.json` env (e.g. `"env": { "CHANGETRACKS_AUTHOR": "ai:composer-1.5" }`).

### 2. Hooks

```bash
cd changetracks-plugin/hooks-impl && npm run build
./changetracks-plugin/cursor/install-hooks.sh
```

Four hook points are installed:
- **beforeReadFile** — blocks raw reads on tracked files (strict mode), redirects to `read_tracked_file`
- **beforeMCPExecution** — validates MCP tool inputs (author enforcement, scope)
- **afterFileEdit** — logs raw edits for batch-wrapping (safety-net mode)
- **stop** — applies CriticMarkup wrapping to logged edits at session end

### 3. Skill (REQUIRED for strict mode)

```bash
./changetracks-plugin/cursor/install-skill.sh
```

Copies the shared SKILL.md into `.cursor/skills/changetracks/`. The SKILL.md provides redirect guidance when `beforeReadFile` blocks raw reads. Without it, agents see "blocked by a hook" with no instructions on what to do instead.

### 4. Rules (Optional)

Copy `.cursorrules.template` to `.cursorrules` at project root for inline agent guidance.

## Troubleshooting

**"File read was blocked by a hook"**
The agent tried to read a tracked `.md` file directly. It should use `read_tracked_file` MCP tool instead. Ensure SKILL.md is installed.

**"MCP tool validation failed"**
Check `[author] enforcement` in `.changetracks/config.toml`. If set to `"required"`, all write tools need an `author` parameter.

**Hooks not firing**
- Verify Cursor version >= 2.4
- Check hooks are enabled: Cursor Settings > Hooks
- Verify `.cursor/hooks.json` exists in workspace root
- Check hook scripts are built: `ls changetracks-plugin/hooks-impl/dist/adapters/cursor/`
