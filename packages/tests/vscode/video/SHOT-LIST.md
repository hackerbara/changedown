<!-- ctrcks.com/v1: tracked -->
# Manual Recording Shot Lists

These videos require you to drive Claude Code manually while screen recording.
Use OBS, QuickTime, or ScreenFlow to capture. Record at 1920x1080.

## Video 5: Agent Proposes Changes (~20s)

### Setup
- Open a markdown file in VS Code (right half of screen)
- Open Claude Code terminal (left half of screen)
- Ensure `.changetracks/config.toml` has `mode = "safety-net"` or `mode = "strict"`
- Have a paragraph with an obvious improvement opportunity

### Sequence
1. **(0-3s)** Show the split screen — VS Code with markdown, terminal with Claude Code
2. **(3-8s)** In Claude Code, ask: "improve the second paragraph"
3. **(8-14s)** Claude calls `propose_change` — watch the terminal output
4. **(14-18s)** VS Code updates live — green insertion appears with agent author
5. **(18-20s)** Hold on the final state — change visible in editor with metadata

### Tips
- Keep the file short (5-6 lines) so everything fits on screen
- Use a paragraph that's obviously improvable (passive voice, vague wording)
- Wait for the full propose_change cycle to complete before stopping

---

## Video 6: Hooks Enforce Tracking (~15s)

### Setup
- Same split screen layout as Video 5
- Set policy to `strict` in `.changetracks/config.toml`:
  ```toml
  [policy]
  mode = "strict"
  ```
- Open a tracked markdown file in VS Code

### Sequence
1. **(0-3s)** Show the split screen with tracked file
2. **(3-6s)** Ask Claude to make a direct edit (e.g., "replace X with Y in the file")
3. **(6-10s)** Claude tries Edit tool — hook blocks it — warm redirect message appears
4. **(10-13s)** Claude follows redirect, uses `propose_change` instead
5. **(13-15s)** Change lands correctly with CriticMarkup metadata

### Tips
- The hook block message is the hero shot — make sure it's visible in the terminal
- The redirect message includes a pre-formatted `propose_change` call
- Keep the edit simple so the cycle is fast


[^ct-1]: ai:claude-opus-4.6 | 2026-03-08 | creation | proposed
    ai:claude-opus-4.6 2026-03-08T21:04:56Z: File created