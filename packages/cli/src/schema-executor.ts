/**
 * Generic CLI executor that replaces per-command boilerplate.
 *
 * Each command is defined declaratively via a `CommandDef`. The executor
 * handles: help detection, commander option building from the def,
 * positional extraction, flag->schema-name mapping, int conversion,
 * custom parsers, defaults, subcommand dispatch, and handler invocation.
 *
 * Uses commander instead of node:util parseArgs so that flag values
 * starting with '-' (e.g. --old "- Item 1") are handled correctly.
 */

import { Command } from 'commander';
import { helpResult, usageError, parseIntFlag } from './cli-helpers.js';
import { handlerToCliResult, type CliResult } from './cli-output.js';
import type { ConfigResolver, SessionState } from './engine/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolHandler = (
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

export interface CommandDef {
  /** MCP handler function. */
  handler: ToolHandler;
  /** Schema property names taken from positional args (in order). */
  positionals: string[];
  /** Help text (handcrafted). */
  usage: string;
  /** Pass `{ raw: true }` to handlerToCliResult. */
  rawOutput?: boolean;
  /** CLI flag name -> schema property name (for shortened/renamed flags). */
  flagMapping?: Record<string, string>;
  /** Schema property names that need parseInt conversion. */
  intFlags?: string[];
  /**
   * Schema property names that are passed through directly as strings.
   * Auto-kebab-cased for CLI flags (e.g. `'reasoning'` -> `--reasoning`).
   */
  directFlags?: string[];
  /** Custom parser for specific schema property names. */
  customParsers?: Record<string, (value: string | boolean | undefined) => unknown>;
  /** Default values for schema properties when not provided. */
  defaults?: Record<string, unknown>;
  /** Nested subcommands (e.g., `group begin`, `group end`). */
  subcommands?: Record<string, CommandDef>;
  /** Which positionals are required (indices). Defaults to all. */
  requiredPositionals?: number[];
  /**
   * CLI flag names (kebab-case) that are boolean toggles (no value argument).
   * These flags are set to `true` when present, omitted when absent.
   */
  booleanFlags?: string[];
  /**
   * Like `flagMapping` but for boolean toggles (no value argument).
   * Maps CLI flag name (kebab-case) -> schema property name.
   * Use this when the CLI flag name differs from the schema property name
   * (e.g., `'include-meta': 'include_meta'`).
   */
  booleanFlagMapping?: Record<string, string>;
  /**
   * Optional hook to post-process the parsed args object before handler invocation.
   * Useful for cross-field normalization that can't be expressed per-flag.
   */
  preProcess?: (args: Record<string, unknown>) => void;
}

export class ParseError extends Error {
  constructor(message: string, public readonly code: string = 'PARSE_ERROR') {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Core executor
// ---------------------------------------------------------------------------

export async function executeCommand(
  def: CommandDef,
  subArgs: string[],
  resolver: ConfigResolver,
  state: SessionState,
): Promise<CliResult> {
  // Subcommand dispatch takes priority
  if (def.subcommands) {
    // Commander would handle --help, but we intercept early for subcommand commands
    // to avoid building a full commander tree for subcommand dispatch.
    if (subArgs.includes('--help') || subArgs.includes('-h')) return helpResult(def.usage);
    const sub = subArgs[0];
    if (sub && def.subcommands[sub]) {
      return executeCommand(def.subcommands[sub], subArgs.slice(1), resolver, state);
    }
    return usageError(def.usage);
  }

  return new Promise<CliResult>((resolve) => {
    const cmd = new Command();
    cmd.allowUnknownOption(false);
    cmd.exitOverride(); // Prevent process.exit on errors
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} }); // Suppress all output

    // ---------------------------------------------------------------------------
    // Register positionals
    // ---------------------------------------------------------------------------
    const requiredIndices = def.requiredPositionals ?? def.positionals.map((_, i) => i);
    for (let i = 0; i < def.positionals.length; i++) {
      const name = def.positionals[i];
      if (requiredIndices.includes(i)) {
        cmd.argument(`<${name}>`);
      } else {
        cmd.argument(`[${name}]`);
      }
    }

    // ---------------------------------------------------------------------------
    // Track which CLI flags have been registered (by long name) to avoid duplicates
    // ---------------------------------------------------------------------------
    const registeredLongFlags = new Set<string>();

    function addValueOption(cliFlag: string) {
      if (!registeredLongFlags.has(cliFlag)) {
        registeredLongFlags.add(cliFlag);
        cmd.option(`--${cliFlag} <value>`);
      }
    }

    // ---------------------------------------------------------------------------
    // Register flag options from flagMapping
    // CLI flag name (key) -> schema property name (value)
    // ---------------------------------------------------------------------------
    if (def.flagMapping) {
      for (const cliFlag of Object.keys(def.flagMapping)) {
        addValueOption(cliFlag);
      }
    }

    // ---------------------------------------------------------------------------
    // Register direct flags (schema prop names, auto-kebab-cased)
    // ---------------------------------------------------------------------------
    if (def.directFlags) {
      for (const schemaProp of def.directFlags) {
        if (def.positionals.includes(schemaProp)) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        addValueOption(cliFlag);
      }
    }

    // ---------------------------------------------------------------------------
    // Register custom parser flags (schema prop names, auto-kebab-cased)
    // ---------------------------------------------------------------------------
    if (def.customParsers) {
      for (const schemaProp of Object.keys(def.customParsers)) {
        if (def.positionals.includes(schemaProp)) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        addValueOption(cliFlag);
      }
    }

    // ---------------------------------------------------------------------------
    // Register int flags (schema prop names, auto-kebab-cased)
    // ---------------------------------------------------------------------------
    if (def.intFlags) {
      for (const schemaProp of def.intFlags) {
        if (def.positionals.includes(schemaProp)) continue;
        // intFlags may be targets of flagMapping (e.g. start_line <- --start)
        // Only add a direct option if the schema prop is not already covered by flagMapping
        const isTargetOfFlagMapping = def.flagMapping
          ? Object.values(def.flagMapping).includes(schemaProp)
          : false;
        if (isTargetOfFlagMapping) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        addValueOption(cliFlag);
      }
    }

    // ---------------------------------------------------------------------------
    // Register boolean flags (no <value> argument)
    // ---------------------------------------------------------------------------
    if (def.booleanFlags) {
      for (const cliFlag of def.booleanFlags) {
        if (!registeredLongFlags.has(cliFlag)) {
          registeredLongFlags.add(cliFlag);
          cmd.option(`--${cliFlag}`);
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Register booleanFlagMapping entries (renamed boolean toggles)
    // ---------------------------------------------------------------------------
    if (def.booleanFlagMapping) {
      for (const cliFlag of Object.keys(def.booleanFlagMapping)) {
        if (!registeredLongFlags.has(cliFlag)) {
          registeredLongFlags.add(cliFlag);
          cmd.option(`--${cliFlag}`);
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Capture parsed values from the action callback
    // ---------------------------------------------------------------------------
    let actionCalled = false;
    let positionalValues: (string | undefined)[] = [];
    let optionValues: Record<string, unknown> = {};

    cmd.action((...actionArgs: unknown[]) => {
      actionCalled = true;
      // Commander passes positionals as first N args, then the options object, then the Command
      positionalValues = def.positionals.map((_, i) => actionArgs[i] as string | undefined);
      optionValues = (actionArgs[def.positionals.length] ?? {}) as Record<string, unknown>;
    });

    // ---------------------------------------------------------------------------
    // Parse
    // ---------------------------------------------------------------------------
    try {
      cmd.parse(subArgs, { from: 'user' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === 'commander.helpDisplayed') {
          resolve(helpResult(def.usage));
          return;
        }
      }
      resolve(usageError(def.usage));
      return;
    }

    if (!actionCalled) {
      resolve(usageError(def.usage));
      return;
    }

    // ---------------------------------------------------------------------------
    // Build args from parsed values
    // ---------------------------------------------------------------------------
    const args: Record<string, unknown> = {};

    // Positionals
    for (let i = 0; i < def.positionals.length; i++) {
      if (positionalValues[i] !== undefined) {
        args[def.positionals[i]] = positionalValues[i];
      }
    }

    // Check required positionals
    for (const idx of requiredIndices) {
      const name = def.positionals[idx];
      if (name && args[name] === undefined) {
        resolve(usageError(def.usage));
        return;
      }
    }

    // ---------------------------------------------------------------------------
    // Build reverse mapping: commander camelCase option key -> schema property name
    //
    // Commander camelCases multi-word option names:
    //   --insert-after -> insertAfter
    //   --start-hash   -> startHash
    //   --new-text     -> newText
    //
    // For flagMapping entries the CLI flag name is the key:
    //   { 'insert-after': 'insert_after' } -> reverseMap['insertAfter'] = 'insert_after'
    //
    // For directFlags / customParsers / intFlags the schema prop is both the
    // definition source and target (just snake_case -> kebab -> camelCase round-trip):
    //   directFlags: ['reasoning'] -> CLI --reasoning -> commander key 'reasoning'
    //   directFlags: ['insert_after'] -> CLI --insert-after -> commander key 'insertAfter'
    // ---------------------------------------------------------------------------
    const reverseMap: Record<string, string> = {};

    function kebabToCamel(kebab: string): string {
      return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    }

    if (def.flagMapping) {
      for (const [cliFlag, schemaProp] of Object.entries(def.flagMapping)) {
        const camelKey = kebabToCamel(cliFlag);
        reverseMap[camelKey] = schemaProp;
      }
    }

    // directFlags: snake_case schema prop -> kebab CLI flag -> camelCase commander key
    if (def.directFlags) {
      for (const schemaProp of def.directFlags) {
        if (def.positionals.includes(schemaProp)) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        const camelKey = kebabToCamel(cliFlag);
        // Only add if not already covered by flagMapping
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }

    // customParsers: schema prop -> kebab -> camel
    if (def.customParsers) {
      for (const schemaProp of Object.keys(def.customParsers)) {
        if (def.positionals.includes(schemaProp)) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }

    // intFlags: schema prop -> kebab -> camel
    if (def.intFlags) {
      for (const schemaProp of def.intFlags) {
        if (def.positionals.includes(schemaProp)) continue;
        const cliFlag = schemaProp.replace(/_/g, '-');
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }

    // booleanFlags: CLI flag name doubles as schema prop (no rename)
    if (def.booleanFlags) {
      for (const cliFlag of def.booleanFlags) {
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = cliFlag;
        }
      }
    }

    // booleanFlagMapping: CLI flag -> schema prop (renamed boolean toggles)
    if (def.booleanFlagMapping) {
      for (const [cliFlag, schemaProp] of Object.entries(def.booleanFlagMapping)) {
        const camelKey = kebabToCamel(cliFlag);
        if (!(camelKey in reverseMap)) {
          reverseMap[camelKey] = schemaProp;
        }
      }
    }

    const intFlagSet = new Set(def.intFlags ?? []);
    const customParsers = def.customParsers ?? {};

    // ---------------------------------------------------------------------------
    // Map commander option values to args
    // ---------------------------------------------------------------------------
    for (const [optKey, value] of Object.entries(optionValues)) {
      if (value === undefined) continue;

      // Resolve the schema property name for this commander key
      const schemaProp = reverseMap[optKey] ?? optKey;

      // Skip if it resolves to a positional name
      if (def.positionals.includes(schemaProp)) continue;

      // Boolean flags: commander sets them to true when present
      if (value === true) {
        args[schemaProp] = true;
        continue;
      }

      // Custom parsers
      if (customParsers[schemaProp]) {
        try {
          const parsedValue = customParsers[schemaProp](value as string | undefined);
          if (parsedValue !== undefined) args[schemaProp] = parsedValue;
        } catch (err) {
          if (err instanceof ParseError) {
            resolve({ success: false, data: {}, message: err.message, error: err.code });
            return;
          }
          resolve({
            success: false,
            data: {},
            message: err instanceof Error ? err.message : String(err),
            error: 'PARSE_ERROR',
          });
          return;
        }
        continue;
      }

      // Int flags
      if (intFlagSet.has(schemaProp)) {
        const n = parseIntFlag(value as string | undefined);
        if (n !== undefined) args[schemaProp] = n;
        continue;
      }

      // Default: string value
      if (typeof value === 'string') {
        args[schemaProp] = value;
      }
    }

    // ---------------------------------------------------------------------------
    // Apply defaults
    // ---------------------------------------------------------------------------
    if (def.defaults) {
      for (const [key, defaultVal] of Object.entries(def.defaults)) {
        if (args[key] === undefined) {
          args[key] = defaultVal;
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Pre-process hook
    // ---------------------------------------------------------------------------
    if (def.preProcess) {
      try {
        def.preProcess(args);
      } catch (err) {
        if (err instanceof ParseError) {
          resolve({ success: false, data: {}, message: err.message, error: err.code });
          return;
        }
        resolve({
          success: false,
          data: {},
          message: err instanceof Error ? err.message : String(err),
          error: 'INTERNAL_ERROR',
        });
        return;
      }
    }

    // ---------------------------------------------------------------------------
    // Call handler
    // ---------------------------------------------------------------------------
    def.handler(args, resolver, state).then(
      (result) => resolve(handlerToCliResult(result, { raw: def.rawOutput })),
      (err) => resolve({
        success: false,
        data: {},
        message: err instanceof Error ? err.message : String(err),
        error: 'INTERNAL_ERROR',
      }),
    );
  });
}
