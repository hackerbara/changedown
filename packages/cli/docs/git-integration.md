<!-- ctrcks.com/v1: tracked -->
# Git Integration

ChangeTracks's `sc diff` command renders CriticMarkup with ANSI colors in the terminal. You can integrate it with git as a custom diff driver so `git diff` and tools like lazygit automatically show colored CriticMarkup.

## Setup

### 1. Configure git diff driver

Add to your `~/.gitconfig` (or project `.git/config`):

```ini
[diff "changetracks"]
  command = sc
```

When git invokes a custom diff driver, it passes 7 arguments:
`sc path old-file old-hex old-mode new-file new-hex new-mode`

The `sc` binary detects this 7-argument pattern automatically and renders the new file with ANSI-colored CriticMarkup (smart view: delimiters hidden, insertions green, deletions red+strikethrough).

### 2. Configure .gitattributes

In your project's `.gitattributes` (or `~/.config/git/attributes` for global):

```gitattributes
*.md diff=changetracks
```

This tells git to use the `changetracks` diff driver for all markdown files.

### 3. Verify

```bash
# Make a change to a tracked markdown file with CriticMarkup
echo 'Hello {++world++}.' > test.md
git diff test.md
# Should show colored output with "world" in green
```

## Lazygit

Lazygit uses git's diff driver automatically. No additional config needed — once `.gitconfig` and `.gitattributes` are set up, lazygit's diff panel shows colored CriticMarkup.

## View Modes

The diff driver uses `smart` view by default (delimiters hidden, content colored). For standalone use:

```bash
sc diff <file>                # Smart view (default)
sc diff <file> --view=markup  # Full CriticMarkup with colored delimiters
sc diff <file> --view=settled # Clean text, all changes applied
```

## How It Works

The `sc` binary entry point checks `process.argv`:
1. If exactly 7 arguments with a 40-character hex SHA at position 2 → git diff driver mode
2. If first argument is a user command (`diff`, `status`, etc.) → commander routing
3. Otherwise → agent command routing

In git diff driver mode, `sc` reads the new file (argument 5), renders it through the ANSI renderer, and writes to stdout. Git captures the output and displays it in the pager.

## Requirements

The `sc` binary must be in your PATH. From the monorepo:

```bash
cd packages/cli && npm link
# Now `sc` is available globally

# To unlink later:
npm unlink -g @changetracks/cli
```

Or add an alias:

```bash
alias sc="node /path/to/changetracks/packages/cli/dist/index.js"
```


[^ct-1]: ai:claude-opus-4.6 | 2026-02-26 | creation | proposed
    ai:claude-opus-4.6 2026-02-26: File created