/**
 * Declarative command registry for the `sc` CLI.
 *
 * Each command is defined as a `CommandDef` — the executor handles
 * help, parseArgs, positionals, flag mapping, and handler invocation.
 * Usage strings are handcrafted; everything else is derived.
 */

import type { CommandDef } from './schema-executor.js';
import { ParseError } from './schema-executor.js';
import { stringFlag } from './cli-helpers.js';

// -- Handlers ---------------------------------------------------------------
import {
  handleReadTrackedFile,
  handleGetTrackingStatus,
  handleGetChange,
  handleListOpenThreads,
  handleProposeChange,
  handleFindTrackedFiles,
  handleAmendChange,
  handleReviewChanges,
  handleRespondToThread,
  handleBeginChangeGroup,
  handleEndChangeGroup,
  handleRawEdit,
  handleCompactChanges,
} from './engine/index.js';
import { handleCliBatch } from './cli-batch-handler.js';

// ---------------------------------------------------------------------------
// Usage strings
// ---------------------------------------------------------------------------

const READ_USAGE = `Usage: sc read <file> [flags]

Read a tracked file with hashline coordinates.

Flags:
  --offset N       Line number to start from (1-indexed, default: 1)
  --limit N        Maximum lines to return (default: 500, max: 2000)
  --view MODE      Display mode: meta (default), content, full, or settled
  --include-meta   Include change levels line and full tip
`;

const STATUS_USAGE = `Usage: sc status [<file>]

Check tracking status of a file or project.

When called with a file, shows that file's tracking status and
which layer determined it (header, config, or default).
When called with no arguments, shows project-wide config summary.
`;

const GET_USAGE = `Usage: sc get <file> <change-id> [flags]

Get full details of a tracked change.

Shows inline markup with surrounding context, footnote metadata,
discussion thread, and group info.

Flags:
  --context N      Lines of surrounding context (default: 3)
`;

const LIST_USAGE = `Usage: sc list <path> [flags]

List changes with proposed status or open discussion threads.

Path can be a file or directory. If directory, scans **/*.md.

Flags:
  --author @NAME       Filter by author (e.g. "@ai:claude-opus-4.6")
  --status LIST        Comma-separated statuses: proposed,accepted,rejected
`;

const PROPOSE_USAGE = `Usage: sc propose <file> [flags]

Propose a tracked change to a markdown file.

Modes:
  String match:    --old "text" --new "text"
  Insert after:    --new "text" --insert-after "anchor"
  Line range:      --start N --start-hash XX --new "text"
  Compact:         --at "5:a3" --op "{~~old~>new~~}{>>reason"

Flags:
  --old TEXT           Text to replace (empty = insertion)
  --new TEXT           Replacement text (empty = deletion)
  --insert-after TEXT  Insert after this anchor text
  --reason TEXT     Why this change is being made
  --author TEXT        Who is making this change
  --at COORD           Hashline coordinate (compact mode)
  --op EXPR            Operation expression (compact mode)
  --start N            Start line (1-indexed)
  --start-hash XX      Hash for start line verification
  --end N              End line (1-indexed, inclusive)
  --end-hash XX        Hash for end line verification
  --after-line N       Insert after this line number
  --after-hash XX      Hash for after-line verification
  --level N            Participation level: 1 (compact) or 2 (footnote, default)
`;

const BATCH_USAGE = `Usage: sc batch <file> [flags]

Propose a batch of tracked changes as one atomic edit.

All changes are applied all-or-nothing with automatic coordinate
adjustment and an auto-created change group.

Input sources (first match wins):
  --changes JSON       JSON array of operations (inline)
  --from FILE          Read changes JSON from a file

Flags:
  --reason TEXT      Why this batch of changes is being made
  --author TEXT         Who is making this change

Each operation in --changes/--from supports:
  Classic: {"old_text": "...", "new_text": "...", "reason": "..."}
  Compact: {"at": "5:a3", "op": "{~~old~>new~~}{>>reason"}
`;

const AMEND_USAGE = `Usage: sc amend <file> <change-id> [flags]

Amend a previously proposed change.

Updates inline markup in place, preserves the change ID and
discussion thread, adds revision history to the footnote.

Flags:
  --new TEXT           The new proposed text (alias for --new-text)
  --new-text TEXT      The new proposed text
  --reason TEXT     Why this amendment is being made
  --author TEXT        Who is making this change (must match original)
`;

const REVIEW_USAGE = `Usage: sc review <file> [<change-id>] [flags]

Review one or more changes (accept, reject, or request changes).

Single change (convenience):
  sc review <file> <change-id> --decision approve --reason "..."

Batch mode:
  sc review <file> --reviews '[{"change_id":"ct-1","decision":"approve","reasoning":"..."}]'

Flags:
  --decision DECISION  approve, reject, or request_changes (single mode)
  --reason TEXT      Why this decision (single mode)
  --reviews JSON        JSON array of review objects (batch mode)
  --settle              Settle (compact) accepted/rejected changes after review
  --author TEXT         Who is making this review

Decisions: approve, reject, request_changes
`;

const RESPOND_USAGE = `Usage: sc respond <file> <change-id> [response] [flags]

Add a response to an existing change's discussion thread.

The response text can be provided as a positional argument or via --response flag.

Flags:
  --response TEXT       Response text (alternative to positional)
  --label TYPE          Comment label: suggestion, issue, question,
                        praise, todo, thought, nitpick
  --author TEXT         Who is making this response
`;

const GROUP_USAGE = `Usage: sc group <subcommand> [flags]

Manage change groups for related edits.

Subcommands:
  begin    Start a new change group
  end      Close the active change group

Begin flags:
  --description TEXT   Group description (required)
  --reason TEXT     Why this group of changes

End flags:
  --author TEXT        Who is closing the group
  --summary TEXT       Summary of the group's changes
`;

const FILES_USAGE = `Usage: sc files [<directory>]

List tracked files in a directory.

Uses the project config's tracking include/exclude patterns to find
files that are in scope for tracking. Defaults to the project root
if no directory is specified.

Aliases: sc ls
`;

const RAW_EDIT_USAGE = `Usage: sc raw-edit <file> [flags]

Edit a tracked file without CriticMarkup wrapping.

Use ONLY for maintenance: fixing corrupted markup, cleaning
resolved footnotes, editing config. Not tracked.

Flags:
  --old TEXT           Text to replace (required)
  --new TEXT           Replacement text (required)
  --reason TEXT        Why this edit must bypass tracking (required)
`;

const COMPACT_USAGE = `Usage: sc compact <file> [flags]

Compact decided (accepted/rejected) footnotes from a tracked file.

Removes targeted footnote blocks, applies body mutations for rejected
proposed changes, and inserts a compaction-boundary footnote.

Flags:
  --targets JSON       JSON array of change IDs or "all-decided" (required)
  --undecided-policy   Policy for undecided changes: accept or reject (default: accept)
  --boundary-meta JSON Optional metadata for the compaction-boundary footnote
`;

// ---------------------------------------------------------------------------
// JSON parser helper (shared by batch + review)
// ---------------------------------------------------------------------------

function parseJsonArray(flagName: string): (v: string | boolean | undefined) => unknown {
  return (v: string | boolean | undefined) => {
    try {
      const arr = JSON.parse(stringFlag(v) ?? '');
      if (!Array.isArray(arr)) throw new Error();
      return arr;
    } catch {
      throw new ParseError(
        `Invalid JSON in --${flagName} flag. Provide a valid JSON array.`,
        'INVALID_JSON',
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COMMANDS: Record<string, CommandDef> = {
  read: {
    handler: handleReadTrackedFile,
    positionals: ['file'],
    rawOutput: true,
    flagMapping: { offset: 'offset', limit: 'limit' },
    booleanFlagMapping: { 'include-meta': 'include_meta' },
    intFlags: ['offset', 'limit'],
    directFlags: ['view'],
    usage: READ_USAGE,
  },

  status: {
    handler: handleGetTrackingStatus,
    positionals: ['file'],
    requiredPositionals: [],  // file is optional
    usage: STATUS_USAGE,
  },

  get: {
    handler: handleGetChange as CommandDef['handler'],
    positionals: ['file', 'change_id'],
    flagMapping: { context: 'context_lines' },
    intFlags: ['context_lines'],
    usage: GET_USAGE,
  },

  list: {
    handler: handleListOpenThreads,
    positionals: ['path'],
    directFlags: ['author', 'limit'],
    customParsers: {
      status: (v) => {
        const s = stringFlag(v);
        return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
      },
    },
    usage: LIST_USAGE,
  },

  propose: {
    handler: handleProposeChange,
    positionals: ['file'],
    flagMapping: {
      old: 'old_text',
      new: 'new_text',
      'insert-after': 'insert_after',
      start: 'start_line',
      'start-hash': 'start_hash',
      end: 'end_line',
      'end-hash': 'end_hash',
      'after-line': 'after_line',
      'after-hash': 'after_hash',
    },
    intFlags: ['start_line', 'end_line', 'after_line'],
    directFlags: ['reason', 'author', 'at', 'op', 'level'],
    defaults: { old_text: '', new_text: '' },
    usage: PROPOSE_USAGE,
  },

  batch: {
    handler: handleCliBatch as CommandDef['handler'],
    positionals: ['file'],
    directFlags: ['reason', 'author', 'from'],
    customParsers: {
      changes: parseJsonArray('changes'),
    },
    usage: BATCH_USAGE,
  },

  amend: {
    handler: handleAmendChange as CommandDef['handler'],
    positionals: ['file', 'change_id'],
    flagMapping: { 'new-text': 'new_text', new: 'new_text' },
    directFlags: ['reason', 'author'],
    usage: AMEND_USAGE,
  },

  review: {
    handler: handleReviewChanges,
    positionals: ['file', 'change_id'],
    requiredPositionals: [0],  // file required, change_id optional
    directFlags: ['author', 'decision', 'reason'],
    booleanFlags: ['settle'],
    customParsers: {
      reviews: parseJsonArray('reviews'),
    },
    preProcess: (args) => {
      // Conflict: cannot use both single-change and batch modes simultaneously
      if (args.change_id && args.reviews) {
        throw new ParseError(
          'Provide either <change-id> --decision (single mode) or --reviews JSON (batch mode), not both.',
          'USAGE_ERROR',
        );
      }
      // Convenience: synthesize reviews array from positional + flags
      if (args.change_id && args.decision && !args.reviews) {
        args.reviews = [{
          change_id: args.change_id,
          decision: args.decision,
          reason: args.reason ?? '',
        }];
        delete args.change_id;
        delete args.decision;
        delete args.reason;
      }
    },
    usage: REVIEW_USAGE,
  },

  respond: {
    handler: handleRespondToThread,
    positionals: ['file', 'change_id', 'response'],
    requiredPositionals: [0, 1],  // file and change_id required, response optional
    directFlags: ['label', 'author'],
    // --response flag maps to response_flag; preProcess promotes it to response if not set by positional
    flagMapping: { response: 'response_flag' },
    preProcess: (args) => {
      if (args.response === undefined && args.response_flag !== undefined) {
        args.response = args.response_flag;
      }
      delete args.response_flag;
    },
    usage: RESPOND_USAGE,
  },

  group: {
    handler: handleBeginChangeGroup,  // placeholder — subcommands handle dispatch
    positionals: [],
    subcommands: {
      begin: {
        handler: handleBeginChangeGroup,
        positionals: [],
        directFlags: ['description', 'reason'],
        usage: GROUP_USAGE,
      },
      end: {
        handler: handleEndChangeGroup,
        positionals: [],
        directFlags: ['author', 'summary'],
        usage: GROUP_USAGE,
      },
    },
    usage: GROUP_USAGE,
  },

  'raw-edit': {
    handler: handleRawEdit as CommandDef['handler'],
    positionals: ['file'],
    flagMapping: { old: 'old_text', new: 'new_text' },
    directFlags: ['reason'],
    usage: RAW_EDIT_USAGE,
  },

  files: {
    handler: handleFindTrackedFiles as CommandDef['handler'],
    positionals: ['path'],
    requiredPositionals: [],  // path is optional (defaults to project root)
    usage: FILES_USAGE,
  },

  ls: {
    handler: handleFindTrackedFiles as CommandDef['handler'],
    positionals: ['path'],
    requiredPositionals: [],  // path is optional (defaults to project root)
    usage: FILES_USAGE,
  },

  compact: {
    handler: handleCompactChanges,
    positionals: ['file'],
    flagMapping: { 'undecided-policy': 'undecided_policy' },
    customParsers: {
      targets: (v) => {
        const raw = stringFlag(v);
        if (!raw) return undefined;
        if (raw === 'all-decided') return 'all-decided';
        try {
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) throw new Error();
          return arr;
        } catch {
          throw new ParseError(
            'Invalid --targets: provide a JSON array of change IDs or "all-decided".',
            'INVALID_JSON',
          );
        }
      },
      boundary_meta: (v) => {
        const raw = stringFlag(v);
        if (!raw) return undefined;
        try {
          return JSON.parse(raw);
        } catch {
          throw new ParseError(
            'Invalid --boundary-meta: provide a valid JSON object.',
            'INVALID_JSON',
          );
        }
      },
    },
    usage: COMPACT_USAGE,
  },
};
