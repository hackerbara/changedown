import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { replaceUnique } from '../file-ops.js';
import { ConfigResolver } from '../config-resolver.js';

/** CriticMarkup opening delimiters (insertion, deletion, substitution). */
const MARKUP_OPENERS = [/\{\+\+/g, /\{\-\-/g, /\{\~\~/g];

/** Inline footnote refs: [^ct-N] or [^ct-N.M]. */
const FOOTNOTE_REF = /\[\^ct-\d+(?:\.\d+)?\]/g;

/**
 * Counts CriticMarkup annotations and footnote refs in text.
 * Used to warn when raw_edit would remove deliberation history.
 */
function countMarkupInText(text: string): { annotations: number; footnotes: number } {
  let annotations = 0;
  for (const re of MARKUP_OPENERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) annotations++;
  }
  FOOTNOTE_REF.lastIndex = 0;
  const footnoteMatches = text.match(FOOTNOTE_REF);
  const footnotes = footnoteMatches ? footnoteMatches.length : 0;
  return { annotations, footnotes };
}

/**
 * Tool definition for the raw_edit MCP tool.
 * Edits a file without CriticMarkup wrapping — for maintenance only.
 */
export const rawEditTool = {
  name: 'raw_edit',
  description:
    'Edit a tracked file without CriticMarkup wrapping. Use ONLY for maintenance: ' +
    'fixing corrupted markup, cleaning resolved footnotes, editing config. This edit will NOT be tracked.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      old_text: {
        type: 'string',
        description: 'Text to replace',
      },
      new_text: {
        type: 'string',
        description: 'Replacement text',
      },
      reason: {
        type: 'string',
        description: 'Why this edit must bypass tracking. Required.',
      },
    },
    required: ['file', 'old_text', 'new_text', 'reason'],
  },
};

export interface RawEditResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `raw_edit` tool call.
 * Validates args, performs a plain replace, writes dedup record so hooks skip the edit,
 * logs reason to stderr, and returns success with a warning.
 */
export async function handleRawEdit(
  args: Record<string, unknown>,
  resolver: ConfigResolver
): Promise<RawEditResult> {
  try {
    const file = args.file as string | undefined;
    const oldText = optionalStrArg(args, 'old_text', 'oldText');
    const newText = optionalStrArg(args, 'new_text', 'newText');
    const reason = optionalStrArg(args, 'reason', 'reason');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (oldText === undefined) {
      return errorResult('Missing required argument: "old_text"');
    }
    if (newText === undefined) {
      return errorResult('Missing required argument: "new_text"');
    }
    if (!reason || String(reason).trim() === '') {
      return errorResult('Missing or empty required argument: "reason". Justify why this edit must bypass tracking.');
    }

    const filePath = resolver.resolveFilePath(file);
    const projectDir = resolver.resolveDir();

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    const modifiedText = replaceUnique(fileContent, oldText, newText);
    await fs.writeFile(filePath, modifiedText, 'utf-8');

    console.error(`[changetracks] raw_edit bypassed tracking: ${reason}`);

    const { annotations, footnotes } = countMarkupInText(oldText);
    const baseWarning = 'This edit is untracked.';
    const removalWarning =
      annotations > 0 || footnotes > 0
        ? ` WARNING: This edit removes ${annotations} CriticMarkup annotation(s) and ${footnotes} footnote(s). These represent the file's deliberation history.`
        : '';

    const displayPath = path.relative(projectDir, filePath);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            file: displayPath,
            raw_edit: true,
            reason: reason,
            warning: baseWarning + removalWarning,
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

