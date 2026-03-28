import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('handleProposeChange', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-propose-test-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: true,
      },
      author: {
        default: 'ai:claude-opus-4.6',
        enforcement: 'optional',
      },
      hooks: {
        enforcement: 'warn', exclude: [],
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
        auto_remap: false,
      },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exactly one content block (structured JSON only)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick brown', new_text: 'slow red', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBeDefined();
  });

  it('happy path substitution: modifies file and returns change_id', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick brown', new_text: 'slow red', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.type).toBe('sub');
    expect(data.file).toBe(path.relative(tmpDir, filePath));
    expect(data.document_state).toBeDefined();
    expect(data.document_state.total_changes).toBe(1);
    expect(data.document_state.proposed).toBe(1);
    expect(data.document_state.accepted).toBe(0);
    expect(data.document_state.authors).toBe(1);

    // Verify file was actually modified on disk
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick brown~>slow red~~}[^cn-1]');
    expect(modified).toContain(`[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`);
  });

  it('happy path deletion: modifies file and returns type "del"', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    const result = await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.type).toBe('del');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{-- brown--}[^cn-1]');
  });

  it('happy path insertion: modifies file and returns type "ins"', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox jumps.');

    const result = await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.type).toBe('ins');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('quick{++ brown++}[^cn-1]');
  });

  it('with reason: footnote includes reason line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'world', new_text: 'earth', reason: 'More specific term' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: More specific term`));
  });

  it('file not in scope: returns isError=true with descriptive message', async () => {
    const filePath = path.join(tmpDir, 'src', 'code.ts');
    await fs.mkdir(path.join(tmpDir, 'src'));
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'const', new_text: 'let' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope|not tracked|excluded/i);
  });

  it('file not found: returns isError=true', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'hello', new_text: 'world' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|no such file|ENOENT/i);
  });

  it('old_text not found in file: returns isError=true', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'xyz not here', new_text: 'replacement', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|xyz not here/i);
  });

  it('accepts camelCase oldText and newText (MCP clients may send camelCase)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await handleProposeChange(
      { file: filePath, oldText: 'quick brown', newText: 'slow red', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.type).toBe('sub');
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick brown~>slow red~~}[^cn-1]');
  });

  it('both old_text and new_text empty returns VALIDATION_ERROR with received keys', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleProposeChange(
      { file: filePath, old_text: '', new_text: '' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    expect(payload.error?.message).toContain('Received argument keys');
    expect(payload.error?.message).toMatch(/old_text|oldText|new_text|newText/);
  });

  it('relative file path: resolves correctly against projectDir', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir);
    const filePath = path.join(subDir, 'notes.md');
    await fs.writeFile(filePath, 'Some notes here.');

    const result = await handleProposeChange(
      { file: 'docs/notes.md', old_text: 'Some', new_text: 'My', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.type).toBe('sub');

    // Verify the file was modified at the correct resolved path
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~Some~>My~~}[^cn-1]');
  });

  it('uses "unknown" as author when config.author.default is empty', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const emptyAuthorConfig: ChangeDownConfig = {
      ...config,
      author: { default: '', enforcement: 'optional' },
    };
    const emptyAuthorResolver = await createTestResolver(tmpDir, emptyAuthorConfig);

    const result = await handleProposeChange(
      { file: filePath, old_text: 'world', new_text: 'earth' },
      emptyAuthorResolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('@unknown');
  });

  it('uses explicit author parameter when provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'world', new_text: 'earth', author: 'ai:claude-sonnet-4.5', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the explicit author, not the config default (ai:claude-opus-4.6)
    expect(modified).toContain(`[^cn-1]: @ai:claude-sonnet-4.5 | ${TODAY} | sub | proposed`);
  });

  it('uses config default author when author parameter is omitted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'world', new_text: 'earth', reason: 'test' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the config default
    expect(modified).toContain('@ai:claude-opus-4.6');
  });

  // --- Auto-insert tracking header tests ---

  describe('auto-insert tracking header', () => {
    it('first propose_change on file without header inserts header', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleProposeChange(
        { file: filePath, old_text: 'world', new_text: 'earth', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('<!-- changedown.com/v1: tracked -->');
      // The change should also be present
      expect(modified).toContain('{~~world~>earth~~}[^cn-1]');
    });

    it('propose_change on file that already has header does not duplicate it', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '<!-- changedown.com/v1: tracked -->\nHello world.',
      );

      const result = await handleProposeChange(
        { file: filePath, old_text: 'world', new_text: 'earth', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      // Should have exactly one header
      const headerCount = (modified.match(/changedown.com\/v1/g) || []).length;
      expect(headerCount).toBe(1);
      expect(modified).toContain('{~~world~>earth~~}[^cn-1]');
    });

    it('auto_header=false does not insert header', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Hello world.');

      const noAutoConfig: ChangeDownConfig = {
        ...config,
        tracking: { ...config.tracking, auto_header: false },
      };
      const noAutoResolver = await createTestResolver(tmpDir, noAutoConfig);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'world', new_text: 'earth', reason: 'test' },
        noAutoResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).not.toContain('changedown.com/v1');
      expect(modified).toContain('{~~world~>earth~~}[^cn-1]');
    });
  });

  // --- Author enforcement tests ---

  describe('author enforcement', () => {
    it('enforcement=required without author returns error', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Hello world.');

      const requiredConfig: ChangeDownConfig = {
        ...config,
        author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
      };
      const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'world', new_text: 'earth' },
        requiredResolver,
        state
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires an author parameter');

      // File must NOT be modified
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello world.');
    });

    it('enforcement=required with author succeeds', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Hello world.');

      const requiredConfig: ChangeDownConfig = {
        ...config,
        author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
      };
      const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'world', new_text: 'earth', author: 'ai:claude-sonnet-4.5', reason: 'test' },
        requiredResolver,
        state
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.change_id).toBe('cn-1');

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain(`@ai:claude-sonnet-4.5`);
    });
  });

  // --- Delimiter padding tests (Bug 7) ---

  describe('delimiter padding when content starts with ambiguous chars', () => {
    it('deletion of text starting with dash adds space padding to avoid {---', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Items:\n- Clean syntax\n- Editor integration');

      const result = await handleProposeChange(
        { file: filePath, old_text: '- Clean syntax\n', new_text: '', reason: 'Remove', author: 'ai:test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // Should be {-- - Clean syntax...--} NOT {--- Clean syntax...--}
      expect(content).toMatch(/\{-- /);        // space after opening delimiter
      expect(content).not.toMatch(/\{---/);    // no three consecutive dashes
    });

    it('insertion of text starting with plus adds space padding to avoid {+++', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'prefix text here');

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: '++ extra', insert_after: 'prefix', author: 'ai:test', reason: 'test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // Should be {++ ++ extra++} NOT {+++ extra++}
      expect(content).toMatch(/\{\+\+ /);     // space after opening delimiter
      expect(content).not.toMatch(/\{\+\+\+/); // no three consecutive pluses
    });

    it('substitution of text starting with tilde adds space padding to avoid {~~~', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'replace ~this~ text');

      const result = await handleProposeChange(
        { file: filePath, old_text: '~this~', new_text: 'that', author: 'ai:test', reason: 'test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // Should be {~~ ~this~~>that~~} NOT {~~~this~~>that~~}
      expect(content).toMatch(/\{~~ /);       // space after opening delimiter
      expect(content).not.toMatch(/\{~~~(?!>)/); // no {~~~ that's not {~~~>
    });

    it('normal deletion (no dash start) produces no extra space', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'The quick brown fox.');

      const result = await handleProposeChange(
        { file: filePath, old_text: 'quick ', new_text: '', author: 'ai:test', reason: 'test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('{--quick --}');
    });

    it('normal insertion (no plus start) produces no extra space', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'prefix text');

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: ' brown', insert_after: 'prefix', author: 'ai:test', reason: 'test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('{++ brown++}');
    });
  });

  // --- Newline handling for insert-after (Bug 8) ---

  describe('insert-after newline handling', () => {
    it('insert-after prepends newline when anchor ends mid-line and content is a block element', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, '- Item 1\n- Item 2\n- Item 3');

      const result = await handleProposeChange(
        { file: filePath, new_text: '- Item 4', insert_after: '- Item 3', reason: 'Add item', author: 'ai:test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // Insertion should be on its own line
      expect(content).toContain('- Item 3\n{++');
      expect(content).not.toContain('- Item 3{++');
    });

    it('insert-after does not prepend newline when anchor ends at a newline', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      // Trailing newline after Item 3 means anchor ends at a newline boundary
      await fs.writeFile(filePath, '- Item 1\n- Item 2\n- Item 3\n');

      const result = await handleProposeChange(
        { file: filePath, new_text: '- Item 4', insert_after: '- Item 3\n', reason: 'Add item', author: 'ai:test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // No extra newline should be added
      expect(content).not.toContain('- Item 3\n\n{++');
    });

    it('insert-after does not prepend newline for inline insertion (non-block content)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'The quick fox jumps.');

      const result = await handleProposeChange(
        { file: filePath, new_text: ' brown', insert_after: 'quick', author: 'ai:test', reason: 'test' },
        resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      // Inline content should NOT get a newline prepended
      expect(content).toContain('quick{++ brown++}');
      expect(content).not.toContain('quick\n{++');
    });
  });

  // --- Identity-substitution guard ---

  describe('identity-substitution guard', () => {
    it('rejects propose where only refs differ (identity substitution)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'some text[^cn-1] on a line.',
        '',
        '[^cn-1]: @ai:agent | 2026-02-28 | sub | accepted',
        '    approved: @ai:agent 2026-02-28 "done"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'some text[^cn-1]', new_text: 'some text', author: 'ai:test' },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No prose changes detected');
    });

    it('allows propose where prose actually differs despite refs', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'some text[^cn-1] on a line.',
        '',
        '[^cn-1]: @ai:agent | 2026-02-28 | sub | accepted',
        '    approved: @ai:agent 2026-02-28 "done"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'some text[^cn-1]', new_text: 'different text', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
    });
  });

  // --- New file creation tests ---

  describe('new file creation', () => {
    it('creates new file when file does not exist and oldText is empty with no insertAfter', async () => {
      const filePath = path.join(tmpDir, 'brand-new.md');

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: '# New Document\n\nThis is new content.', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.change_id).toBe('cn-1');
      expect(data.type).toBe('ins');

      const content = await fs.readFile(filePath, 'utf-8');
      // Should have tracking header
      expect(content).toContain('<!-- changedown.com/v1: tracked -->');
      // Should have the content wrapped in insertion markup
      expect(content).toContain('{++# New Document\n\nThis is new content.++}[^cn-1]');
    });

    it('new file creation without auto_header omits header', async () => {
      const filePath = path.join(tmpDir, 'brand-new.md');
      const noAutoConfig: ChangeDownConfig = {
        ...config,
        tracking: { ...config.tracking, auto_header: false },
      };
      const noAutoResolver = await createTestResolver(tmpDir, noAutoConfig);

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: 'Hello world.', reason: 'test' },
        noAutoResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).not.toContain('changedown.com/v1');
      expect(content).toContain('{++Hello world.++}[^cn-1]');
    });

    it('file not found with non-empty oldText still returns error', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.md');

      const result = await handleProposeChange(
        { file: filePath, old_text: 'something', new_text: 'replacement' },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found|ENOENT|unreadable/i);
    });
  });

  describe('content-zone-only matching', () => {
    it('matches prose, not footnote definition text', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'The API uses REST for the external interface.',
        '',
        '[^cn-1]: @ai:claude-opus-4.6 | 2026-02-28 | sub | accepted',
        '    @ai:claude-opus-4.6 2026-02-28: REST to GraphQL migration',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // "REST" appears in both prose (line 2) and footnote (line 4+5)
      const result = await handleProposeChange(
        { file: filePath, old_text: 'REST', new_text: 'GraphQL', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );
      // Should succeed (matches prose only), not fail with "ambiguous"
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');
    });

    it('searches full file when no footnotes exist', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = '<!-- changedown.com/v1: tracked -->\nThe API uses REST.';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        { file: filePath, old_text: 'REST', new_text: 'GraphQL', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');
    });

    it('ignores footnote-like text inside fenced code blocks', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'The API uses REST.',
        '',
        '```markdown',
        '[^cn-1]: This looks like a footnote but is inside a code block',
        '```',
        '',
        'More REST content here.',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // "REST" appears twice in prose. Without code-zone filtering,
      // the fake footnote would truncate too early.
      // This should find the text (it appears in prose content zone).
      const result = await handleProposeChange(
        { file: filePath, old_text: 'More REST content here', new_text: 'More GraphQL content here', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );
      expect(result.isError).toBeUndefined();
    });
  });

  // --- Ref accumulation loop prevention (G-task5_v2 benchmark) ---

  describe('ref accumulation loop prevention', () => {
    it('agent can edit text on a line with settled refs without accumulating more refs', async () => {
      // Setup: file with settled change on a line (has [^cn-1] ref)
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'The latency is 10-20 milliseconds[^cn-1] in practice.',
        '',
        '[^cn-1]: @ai:agent | 2026-02-28 | sub | accepted',
        '    @ai:agent 2026-02-28: previous edit',
        '    approved: @ai:agent 2026-02-28 "done"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Agent proposes: change hyphen to en-dash (clean prose, no refs)
      const result = await handleProposeChange(
        { file: filePath, old_text: '10-20 milliseconds', new_text: '10\u201320 milliseconds', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();

      // The CriticMarkup should wrap the prose, with refs OUTSIDE
      const disk = await fs.readFile(filePath, 'utf-8');
      expect(disk).toContain('{~~10-20 milliseconds~>10\u201320 milliseconds~~}');
      expect(disk).toContain('[^cn-1]'); // original ref preserved
      // No duplicate refs — the new change gets its own ref, original stays
      const sc1Count = (disk.match(/\[\^cn-1\]/g) || []).length;
      expect(sc1Count).toBeGreaterThanOrEqual(2); // once inline, once in footnote
    });

    it('rejects attempt to remove refs via substitution', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'The value[^cn-4][^cn-2.1] is correct.',
        '',
        '[^cn-4]: @ai:agent | 2026-02-28 | sub | accepted',
        '    approved: @ai:agent 2026-02-28 "done"',
        '[^cn-2.1]: @ai:agent | 2026-02-28 | sub | accepted',
        '    approved: @ai:agent 2026-02-28 "done"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Agent tries to "clean" refs by submitting text without them
      const result = await handleProposeChange(
        { file: filePath, old_text: 'The value[^cn-4][^cn-2.1] is correct.', new_text: 'The value is correct.', author: 'ai:test' },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No prose changes detected');
    });

    it('allows real edits even when agent includes refs in old_text', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'The value[^cn-1] is approximately correct.',
        '',
        '[^cn-1]: @ai:agent | 2026-02-28 | sub | accepted',
        '    approved: @ai:agent 2026-02-28 "done"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Agent includes ref in old_text but also makes a real prose change
      const result = await handleProposeChange(
        { file: filePath, old_text: 'The value[^cn-1] is approximately correct.', new_text: 'The value is exactly correct.', author: 'ai:test', reason: 'test' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const disk = await fs.readFile(filePath, 'utf-8');
      // Should contain substitution markup
      expect(disk).toContain('~>');
      // Original ref should still be present
      expect(disk).toContain('[^cn-1]');
    });
  });

  describe('settle-on-demand', () => {
    it('auto-settles accepted substitution markup when propose targets settled text', async () => {
      const filePath = path.join(tmpDir, 'settle-on-demand.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {~~old~>new~~}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | sub | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Agent reads settled view (sees "Hello new world"), then proposes:
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'new',
          new_text: 'newer',
          author: 'ai:test-model',
          reason: 'updating accepted text',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      // The old accepted CriticMarkup delimiters should be settled (removed)
      expect(fileAfter).not.toContain('{~~old~>new~~}');
      // New proposal should exist wrapping the settled text "new"
      expect(fileAfter).toContain('{~~new~>newer~~}');
      // The accepted footnote definition should still be present (audit trail)
      expect(fileAfter).toContain('[^cn-1]: @alice');
    });

    it('auto-settles accepted insertion markup when propose targets settled text', async () => {
      const filePath = path.join(tmpDir, 'settle-ins.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {++inserted++}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | ins | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Agent reads settled view (sees "Hello inserted world"), then proposes to change "inserted world":
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'inserted world',
          new_text: 'modified world',
          author: 'ai:test-model',
          reason: 'test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      // The old accepted insertion markup should be settled (no {++ delimiters)
      expect(fileAfter).not.toContain('{++inserted++}');
      // New proposal wrapping settled text
      expect(fileAfter).toContain('{~~inserted world~>modified world~~}');
      // The accepted footnote definition should still be present
      expect(fileAfter).toContain('[^cn-1]: @alice');
    });

    it('settle-on-demand preserves the accepted footnote ref inline after settling', async () => {
      // After settle-on-demand: settleAcceptedChangesOnly produces `new[^cn-1]` inline.
      // The subsequent proposal wraps `new` and should retain `[^cn-1]` next to the markup.
      const filePath = path.join(tmpDir, 'settle-ref-preservation.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {~~old~>new~~}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | sub | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'new',
          new_text: 'newer',
          author: 'ai:test-model',
          reason: 'test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      // Old markup settled: no CriticMarkup delimiters for cn-1
      expect(fileAfter).not.toContain('{~~old~>new~~}');
      // New proposal created on settled text
      expect(fileAfter).toContain('{~~new~>newer~~}');
      // The settled cn-1 ref should still be adjacent to the markup (inline anchor preserved)
      // After settle: `new[^cn-1]` — after proposal: `{~~new~>newer~~}[^cn-2][^cn-1]`
      expect(fileAfter).toContain('[^cn-1]');
      // The inline cn-1 anchor should be adjacent to the new proposal markup
      const hasInlineRef = /\{~~new~>newer~~\}\[\^cn-2\]\[\^cn-1\]/.test(fileAfter) ||
        /\{~~new~>newer~~\}\[\^cn-1\]\[\^cn-2\]/.test(fileAfter);
      expect(hasInlineRef).toBe(true);
    });
  });

  describe('compact settle-on-demand', () => {
    let compactResolver: ConfigResolver;

    beforeEach(async () => {
      compactResolver = await createTestResolver(tmpDir, {
        ...config,
        protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
        hashline: { enabled: true, auto_remap: false },
      });
    });

    it('auto-settles accepted insertion markup when compact op targets settled text', async () => {
      const filePath = path.join(tmpDir, 'compact-settle-ins.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {++inserted++}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | ins | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      // Record settled-view hashes so compact path can resolve coordinates.
      // Hashes must be 2-char lowercase hex (the format parseAt requires).
      state.recordAfterRead(filePath, 'settled', [
        { line: 1, raw: 'a1', settled: 'a1', settledView: 'a1', rawLineNum: 1 },
        { line: 2, raw: 'b2', settled: 'c3', settledView: 'd4', rawLineNum: 2 },
      ], content);

      const result = await handleProposeChange(
        {
          file: filePath,
          at: '2:d4',
          op: '{~~inserted~>modified~~}',
          author: 'ai:test-model',
          reason: 'test',
        },
        compactResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      // Old accepted insertion markup should be settled
      expect(fileAfter).not.toContain('{++inserted++}');
      // New proposal should exist
      expect(fileAfter).toContain('{~~inserted~>modified~~}');
      // Accepted footnote preserved
      expect(fileAfter).toContain('[^cn-1]: @alice');
    });

    it('auto-settles accepted substitution markup when compact op targets settled text', async () => {
      const filePath = path.join(tmpDir, 'compact-settle-sub.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {~~old~>new~~}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | sub | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      state.recordAfterRead(filePath, 'settled', [
        { line: 1, raw: 'a1', settled: 'a1', settledView: 'a1', rawLineNum: 1 },
        { line: 2, raw: 'b2', settled: 'c3', settledView: 'd4', rawLineNum: 2 },
      ], content);

      const result = await handleProposeChange(
        {
          file: filePath,
          at: '2:d4',
          op: '{~~new~>newer~~}',
          author: 'ai:test-model',
          reason: 'test',
        },
        compactResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      expect(fileAfter).not.toContain('{~~old~>new~~}');
      expect(fileAfter).toContain('{~~new~>newer~~}');
      expect(fileAfter).toContain('[^cn-1]: @alice');
    });

    it('skips settle-on-demand when target has no accepted/rejected markup', async () => {
      const filePath = path.join(tmpDir, 'compact-no-settle.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello world',
        '',
      ].join('\n');
      await fs.writeFile(filePath, content);

      state.recordAfterRead(filePath, 'raw', [
        { line: 1, raw: 'a1', settled: 'a1', rawLineNum: 1 },
        { line: 2, raw: 'b2', settled: 'b2', rawLineNum: 2 },
      ], content);

      const result = await handleProposeChange(
        {
          file: filePath,
          at: '2:b2',
          op: '{~~world~>earth~~}',
          author: 'ai:test-model',
          reason: 'test',
        },
        compactResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      expect(fileAfter).toContain('{~~world~>earth~~}');
    });

    it('preserves footnote ref inline after compact settle-on-demand', async () => {
      const filePath = path.join(tmpDir, 'compact-settle-ref.md');
      const content = [
        '<!-- changedown.com/v1: tracked -->',
        'Hello {~~old~>new~~}[^cn-1] world',
        '',
        '[^cn-1]: @alice | 2026-03-04 | sub | accepted',
        '    approved: @bob 2026-03-04 "ok"',
      ].join('\n');
      await fs.writeFile(filePath, content);

      state.recordAfterRead(filePath, 'settled', [
        { line: 1, raw: 'a1', settled: 'a1', settledView: 'a1', rawLineNum: 1 },
        { line: 2, raw: 'b2', settled: 'c3', settledView: 'd4', rawLineNum: 2 },
      ], content);

      const result = await handleProposeChange(
        {
          file: filePath,
          at: '2:d4',
          op: '{~~new~>newer~~}',
          author: 'ai:test-model',
          reason: 'test',
        },
        compactResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const fileAfter = await fs.readFile(filePath, 'utf-8');
      // The settled cn-1 ref should be preserved inline
      expect(fileAfter).toContain('[^cn-1]');
      // New proposal ref should also be present
      expect(fileAfter).toMatch(/\[\^cn-2\]/);
    });
  });
});
