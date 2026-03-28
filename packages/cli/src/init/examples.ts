import * as fs from 'fs';
import * as path from 'path';

export interface CopyExamplesOptions {
  /** Path to bundled example files (extension context path or package dir) */
  bundledPath?: string;
}

/** Bundled example content — self-contained, no external file reads needed */
const GETTING_STARTED_CONTENT = `<!-- changedown.com/v1: tracked -->
# Getting Started with ChangeDown

ChangeDown brings durable change tracking to your markdown files.
Changes are visible inline — no diff tool needed.

## What Changes Look Like

{++This text was added by a collaborator.++}[^cn-1]

{--This paragraph was removed during editing.--}[^cn-2]

{~~first draft~>revised version~~}[^cn-3] — substitutions show before and after.

{==This section needs discussion.==}{>>Should we restructure this? The current flow feels unclear.<<}[^cn-4]

## A Proposed Change

{++ChangeDown works across three surfaces: your editor, your terminal,
and your AI agent. Changes made in any surface are visible in all of them.++}[^cn-5]

## How to Work With Changes

**In your editor** (VS Code / Cursor):
- Open this file to see inline decorations
- Toggle tracking mode to auto-wrap your edits
- Accept or reject changes from the review panel

**With an AI agent** (Claude Code / Cursor / OpenCode):
- Ask your agent to "review the changes in this file"
- The agent can propose, accept, and reject changes
- All changes include author attribution and reasoning

**From the command line:**
- \`changedown status\` — see tracked files and pending changes
- \`changedown diff\` — view changes across your project

[^cn-1]: @alice | 2026-01-15 | ins | proposed
[^cn-2]: @bob | 2026-01-16 | del | proposed
[^cn-3]: @alice | 2026-01-17 | sub | proposed
    @bob 2026-01-17: Good catch, the revision reads better.
[^cn-4]: @alice | 2026-01-15 | highlight | proposed
[^cn-5]: @ai:claude-opus-4.6 | 2026-01-18 | ins | proposed
    @ai:claude-opus-4.6 2026-01-18: Added cross-surface explanation to orient new users.
`;

/**
 * Copy example files into the target project directory.
 */
export async function copyExamples(targetDir: string, _options?: CopyExamplesOptions): Promise<void> {
  const examplesDir = path.join(targetDir, 'examples');
  if (!fs.existsSync(examplesDir)) {
    fs.mkdirSync(examplesDir, { recursive: true });
  }

  const gettingStartedPath = path.join(examplesDir, 'getting-started.md');
  if (!fs.existsSync(gettingStartedPath)) {
    fs.writeFileSync(gettingStartedPath, GETTING_STARTED_CONTENT, 'utf8');
  }
}
