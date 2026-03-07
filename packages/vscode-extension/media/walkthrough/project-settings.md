## Project Settings

Settings live in `.changetracks/config.toml` and the **Project Settings** panel in the sidebar controls them visually.

| Group | What it controls |
|-------|-----------------|
| **Tracking** | Which files get tracked (`include`/`exclude` globs), whether new files auto-enable tracking |
| **Author** | Default author name, whether author is required on changes |
| **Protocol** | Classic mode (human-friendly) vs Compact mode (agent-optimized), metadata verbosity level |
| **Settlement** | Whether accepted/rejected changes auto-compact (remove markup after resolution) |
| **Hooks** | `warn` (log policy violations) vs `block` (prevent them) |
| **Policy** | Safety-net vs strict mode, footnote vs sidecar metadata tracking |
| **Hashline** | Line-level addressing for agents (enable for AI workflows) |
| **Matching** | Strict vs normalized text matching (handles Unicode normalization) |

### Key defaults

- **Tracking**: all `**/*.md` files, excludes `node_modules/`, `dist/`, `.git/`
- **Author enforcement**: optional (anyone can edit without identifying)
- **Settlement**: auto-compact on approve and reject
- **Hooks**: warn mode (log, don't block)

Open the Project Settings panel in the sidebar to configure these interactively.
