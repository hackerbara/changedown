import { describe, it, expect } from 'vitest';
import { handlerToCliResult, formatResult, type CliResult } from 'changedown/cli-output';

/* ---------- shared test fixtures ---------- */

const successResult: CliResult = {
  success: true,
  data: { change_id: 'cn-1', type: 'substitution', file: 'docs/spec.md' },
  message: 'Proposed cn-1 (substitution) in docs/spec.md',
};

const errorResult: CliResult = {
  success: false,
  data: {},
  message: 'Match not unique: found 3 occurrences of "the"',
  error: 'MATCH_NOT_UNIQUE',
};

const rawResult: CliResult = {
  success: true,
  data: {},
  message: '',
  rawText: '1:a1|The quick brown fox\n2:b2|jumps over the lazy dog',
};

/* ========== formatResult ========== */

describe('formatResult', () => {
  describe('json format', () => {
    it('outputs JSON for success (parseable, contains change_id, type)', () => {
      const out = formatResult(successResult, 'json');
      const parsed = JSON.parse(out);
      expect(parsed.change_id).toBe('cn-1');
      expect(parsed.type).toBe('substitution');
      expect(parsed.file).toBe('docs/spec.md');
    });

    it('outputs JSON for error with error/message fields', () => {
      const out = formatResult(errorResult, 'json');
      const parsed = JSON.parse(out);
      expect(parsed.error).toBe('MATCH_NOT_UNIQUE');
      expect(parsed.message).toBe('Match not unique: found 3 occurrences of "the"');
    });
  });

  describe('pretty format', () => {
    it('outputs human-readable message for success', () => {
      const out = formatResult(successResult, 'pretty');
      expect(out).toBe('Proposed cn-1 (substitution) in docs/spec.md\n');
    });

    it('outputs error message for failures', () => {
      const out = formatResult(errorResult, 'pretty');
      expect(out).toBe('Error: Match not unique: found 3 occurrences of "the"\n');
    });
  });

  describe('quiet format', () => {
    it('outputs only change_id for propose results', () => {
      const out = formatResult(successResult, 'quiet');
      expect(out).toBe('cn-1\n');
    });

    it('outputs error code for failures', () => {
      const out = formatResult(errorResult, 'quiet');
      expect(out).toBe('MATCH_NOT_UNIQUE\n');
    });
  });

  describe('raw text passthrough', () => {
    it('json format wraps raw text in {content: ...}', () => {
      const out = formatResult(rawResult, 'json');
      const parsed = JSON.parse(out);
      expect(parsed.content).toBe(rawResult.rawText);
    });

    it('pretty format passes raw text through', () => {
      const out = formatResult(rawResult, 'pretty');
      expect(out).toBe(rawResult.rawText + '\n');
    });

    it('quiet format passes raw text through', () => {
      const out = formatResult(rawResult, 'quiet');
      expect(out).toBe(rawResult.rawText + '\n');
    });
  });
});

/* ========== handlerToCliResult ========== */

describe('handlerToCliResult', () => {
  it('converts successful handler JSON to CliResult', () => {
    const handler = {
      content: [{ type: 'text', text: JSON.stringify({ change_id: 'cn-5', type: 'insertion', file: 'readme.md' }) }],
    };
    const result = handlerToCliResult(handler);
    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-5');
    expect(result.message).toContain('cn-5');
    expect(result.message).toContain('insertion');
    expect(result.message).toContain('readme.md');
  });

  it('converts error handler result to CliResult', () => {
    const handler = {
      content: [{ type: 'text', text: JSON.stringify({ code: 'FILE_NOT_FOUND', message: 'File does not exist' }) }],
      isError: true,
    };
    const result = handlerToCliResult(handler);
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
    expect(result.message).toBe('File does not exist');
  });

  it('handles raw mode for read_tracked_file', () => {
    const handler = {
      content: [{ type: 'text', text: '1:a1|Hello world\n2:b2|Second line' }],
    };
    const result = handlerToCliResult(handler, { raw: true });
    expect(result.success).toBe(true);
    expect(result.rawText).toBe('1:a1|Hello world\n2:b2|Second line');
    expect(result.data).toEqual({});
  });

  it('handles raw mode with error', () => {
    const handler = {
      content: [{ type: 'text', text: 'File not tracked' }],
      isError: true,
    };
    const result = handlerToCliResult(handler, { raw: true });
    expect(result.success).toBe(false);
    expect(result.message).toBe('File not tracked');
    expect(result.rawText).toBeUndefined();
  });

  it('handles non-JSON success text gracefully', () => {
    const handler = {
      content: [{ type: 'text', text: 'Operation completed successfully' }],
    };
    const result = handlerToCliResult(handler);
    expect(result.success).toBe(true);
    expect(result.rawText).toBe('Operation completed successfully');
  });

  it('handles non-JSON error text gracefully', () => {
    const handler = {
      content: [{ type: 'text', text: 'Something went wrong' }],
      isError: true,
    };
    const result = handlerToCliResult(handler);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Something went wrong');
  });
});
