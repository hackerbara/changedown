## What's Next

### AI Agent Integration

ChangeTracks works with AI agents via MCP (Model Context Protocol). Agents can **propose**, **accept**, **reject**, and **discuss** changes — the same operations available in the editor.

- **Claude Code** — Reads tracked files, proposes changes with reasoning, and reviews existing changes
- **Cursor** — Agent-mode edits are tracked with author attribution
- **OpenCode** — Same MCP integration

Agents see a structured view of the document with line-level addressing. Their changes appear in the editor and sidebar in real time, and humans review them using the same accept/reject workflow.[^ct-1]

### The Three-Layer Model

1. **VCS** (Git) — *what* changed
2. **Agent Trace** — *who* changed it (human vs AI, which model)
3. **ChangeTracks** — *why* it changed (reasoning, discussion, approval)

### Resources

- `.changetracks/config.toml` — Full configuration reference
- Changes panel in sidebar — Navigate and review all changes
- Comments panel (View → Comments) — Threaded discussions on changes
- SCM panel — ChangeTracks appears as a Source Control provider alongside Git


[^ct-1]: @ai:claude-opus-4.6 | 2026-03-01 | sub | accepted
    @ai:claude-opus-4.6 2026-03-01T07:36:22Z: Update agent integration description to emphasize agents have full propose/accept/reject/discuss capability, not just read-and-propose
    approved: @ai:claude-opus-4.6 2026-03-01T07:36:29Z "Update agent integration to show full propose/accept/reject/discuss capability"