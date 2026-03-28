import type { ChangeDownConfig } from './config.js';

export interface ResolveAuthorResult {
  author: string;
  error?: { message: string; isError: true };
}

/**
 * Environment variable the MCP server can read for author when the agent
 * does not pass one. Set in MCP server config (e.g. Cursor mcp.json "env")
 * so the host or user can supply the correct identity (e.g. ai:composer-1.5).
 * The MCP protocol does not pass client/model metadata in tool requests;
 * Cursor does not currently inject model identity when spawning MCP servers.
 */
const AUTHOR_ENV_KEY = 'CHANGEDOWN_AUTHOR';

/**
 * Valid author format: namespace:identifier
 * - Namespace: starts with lowercase letter, followed by lowercase letters/digits
 * - Separator: colon
 * - Identifier: letters, digits, underscores, dots, hyphens
 */
const AUTHOR_FORMAT = /^[a-z][a-z0-9]*:[a-zA-Z0-9_.-]+$/;

/** System fallback value exempt from format validation. */
const SYSTEM_FALLBACK = 'unknown';

function validateAuthorFormat(author: string): ResolveAuthorResult | null {
  if (author === SYSTEM_FALLBACK) {
    return null; // system fallback is exempt
  }
  if (!AUTHOR_FORMAT.test(author)) {
    return {
      author: '',
      error: {
        isError: true,
        message:
          `Invalid author format: '${author}'. Expected namespace:identifier (e.g., ai:claude-opus-4.6, human:alice).`,
      },
    };
  }
  return null; // valid
}

/**
 * Resolves the author identity for a tool call.
 *
 * Precedence: explicit argument > CHANGEDOWN_AUTHOR env > config default > "unknown".
 * When enforcement is `'required'` and no explicit author is provided, env (if set)
 * satisfies the requirement; otherwise returns an error with an actionable message.
 *
 * All resolved author strings are validated against the namespace:identifier format
 * (e.g., ai:claude-opus-4.6, human:alice). The "unknown" system fallback is exempt.
 */
export function resolveAuthor(
  explicitAuthor: string | undefined,
  config: ChangeDownConfig,
  toolName: string
): ResolveAuthorResult {
  // Explicit author always wins (truthy check — empty string is "not provided")
  if (explicitAuthor) {
    const formatError = validateAuthorFormat(explicitAuthor);
    if (formatError) return formatError;
    return { author: explicitAuthor };
  }

  const fromEnv = process.env[AUTHOR_ENV_KEY]?.trim();

  if (config.author.enforcement === 'required') {
    if (fromEnv) {
      const formatError = validateAuthorFormat(fromEnv);
      if (formatError) return formatError;
      return { author: fromEnv };
    }
    return {
      author: '',
      error: {
        isError: true,
        message:
          `${toolName} requires an author parameter. This project has [author] enforcement = "required". ` +
          `Pass author in the tool call (e.g. author: "ai:claude-opus-4.6") or set ${AUTHOR_ENV_KEY} in the MCP server env (e.g. in Cursor mcp.json).`,
      },
    };
  }

  // Optional enforcement: env > config default > 'unknown'
  const fallback = fromEnv || config.author.default || 'unknown';
  const formatError = validateAuthorFormat(fallback);
  if (formatError) return formatError;
  return { author: fallback };
}
