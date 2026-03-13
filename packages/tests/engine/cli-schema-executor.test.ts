import { describe, it, expect } from 'vitest';
import { executeCommand, ParseError, type CommandDef, type ToolHandler } from 'changetracks/schema-executor';
import { ConfigResolver } from 'changetracks/engine';
import { SessionState } from 'changetracks/engine';

/* Minimal stubs — the executor never touches resolver/state directly. */
const resolver = {} as ConfigResolver;
const state = {} as SessionState;

/** Fake handler that echoes args back as JSON. */
const echoHandler: ToolHandler = async (args) => ({
  content: [{ type: 'text', text: JSON.stringify(args) }],
});

/** Fake handler that returns an error result. */
const errorHandler: ToolHandler = async () => ({
  content: [{ type: 'text', text: JSON.stringify({ code: 'TEST_ERR', message: 'boom' }) }],
  isError: true,
});

describe('executeCommand', () => {
  it('returns helpResult for --help', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      usage: 'Usage: sc test <file>',
    };
    const result = await executeCommand(def, ['--help'], resolver, state);
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('Usage: sc test <file>');
  });

  it('returns helpResult for -h', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      usage: 'Usage: help test',
    };
    const result = await executeCommand(def, ['-h'], resolver, state);
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('Usage: help test');
  });

  it('returns usageError for missing required positionals', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file', 'id'],
      usage: 'Usage: sc test <file> <id>',
    };
    const result = await executeCommand(def, ['myfile.md'], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
  });

  it('returns usageError for unknown flags', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      usage: 'Usage: sc test <file>',
    };
    const result = await executeCommand(def, ['myfile.md', '--bogus', 'val'], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
  });

  it('extracts positionals and passes to handler', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file', 'change_id'],
      usage: 'test',
    };
    const result = await executeCommand(def, ['doc.md', 'ct-1'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.file).toBe('doc.md');
    expect(data.change_id).toBe('ct-1');
  });

  it('applies flagMapping to rename CLI flags', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      flagMapping: { old: 'old_text', new: 'new_text' },
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md', '--old', 'a', '--new', 'b'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.old_text).toBe('a');
    expect(data.new_text).toBe('b');
  });

  it('converts intFlags to numbers', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      flagMapping: { offset: 'offset' },
      intFlags: ['offset'],
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md', '--offset', '42'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.offset).toBe(42);
  });

  it('applies defaults when values missing', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      flagMapping: { old: 'old_text' },
      defaults: { old_text: '', new_text: '' },
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.old_text).toBe('');
    expect(data.new_text).toBe('');
  });

  it('does not override explicit value with defaults', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      flagMapping: { old: 'old_text' },
      defaults: { old_text: 'DEFAULT' },
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md', '--old', 'explicit'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.old_text).toBe('explicit');
  });

  it('passes directFlags through to handler', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      directFlags: ['reason', 'author'],
      usage: 'test',
    };
    const result = await executeCommand(
      def,
      ['f.md', '--reason', 'test reason', '--author', 'alice'],
      resolver,
      state,
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.reason).toBe('test reason');
    expect(data.author).toBe('alice');
  });

  it('custom parsers transform values', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      customParsers: {
        status: (v) => {
          const s = typeof v === 'string' ? v : undefined;
          return s ? s.split(',') : undefined;
        },
      },
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md', '--status', 'a,b'], resolver, state);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.status).toEqual(['a', 'b']);
  });

  it('ParseError.code propagates to CliResult.error', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      customParsers: {
        data: () => { throw new ParseError('bad json', 'INVALID_JSON'); },
      },
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md', '--data', 'xxx'], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_JSON');
    expect(result.message).toBe('bad json');
  });

  it('handles handler errors gracefully via handlerToCliResult', async () => {
    const def: CommandDef = {
      handler: errorHandler,
      positionals: ['file'],
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md'], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('TEST_ERR');
  });

  it('respects requiredPositionals (optional positional)', async () => {
    const def: CommandDef = {
      handler: echoHandler,
      positionals: ['file'],
      requiredPositionals: [],  // none required
      usage: 'test',
    };
    const result = await executeCommand(def, [], resolver, state);
    expect(result.success).toBe(true);
  });

  it('rawOutput passes through to handlerToCliResult', async () => {
    const rawHandler: ToolHandler = async () => ({
      content: [{ type: 'text', text: 'raw output here' }],
    });
    const def: CommandDef = {
      handler: rawHandler,
      positionals: ['file'],
      rawOutput: true,
      usage: 'test',
    };
    const result = await executeCommand(def, ['f.md'], resolver, state);
    expect(result.success).toBe(true);
    expect(result.rawText).toBe('raw output here');
  });
});

describe('subcommand dispatch', () => {
  const beginHandler: ToolHandler = async (args) => ({
    content: [{ type: 'text', text: JSON.stringify({ ...args, sub: 'begin' }) }],
  });
  const endHandler: ToolHandler = async (args) => ({
    content: [{ type: 'text', text: JSON.stringify({ ...args, sub: 'end' }) }],
  });

  const groupDef: CommandDef = {
    handler: beginHandler,
    positionals: [],
    subcommands: {
      begin: {
        handler: beginHandler,
        positionals: [],
        directFlags: ['description', 'reason'],
        usage: 'begin usage',
      },
      end: {
        handler: endHandler,
        positionals: [],
        directFlags: ['author'],
        usage: 'end usage',
      },
    },
    usage: 'group usage',
  };

  it('dispatches to subcommand', async () => {
    const result = await executeCommand(
      groupDef,
      ['begin', '--description', 'test group'],
      resolver,
      state,
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.sub).toBe('begin');
    expect(data.description).toBe('test group');
  });

  it('returns help for parent --help', async () => {
    const result = await executeCommand(groupDef, ['--help'], resolver, state);
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('group usage');
  });

  it('returns usage error for unknown subcommand', async () => {
    const result = await executeCommand(groupDef, ['unknown'], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
  });

  it('returns usage error for no subcommand', async () => {
    const result = await executeCommand(groupDef, [], resolver, state);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
  });
});
