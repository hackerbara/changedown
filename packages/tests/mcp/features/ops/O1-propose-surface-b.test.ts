import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

const DESIGN_DOC = `# API Design

The API uses REST for the public interface.
Authentication uses API keys for all endpoints.
Rate limiting is set to 100 requests per minute.`;

describe('O1: Propose changes via Surface B (classic MCP)', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // --- Insertions ---

  describe('Insertions', () => {
    it('Scenario: Insert text after anchor', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: '',
        new_text: 'Pagination defaults to 50 results.',
        insert_after: 'Rate limiting is set to 100 requests per minute.',
        reason: 'API needs pagination for list endpoints',
      });

      expect(result.isError).toBeUndefined();
      const data = ctx.parseResult(result);
      expect(data.change_id).toBe('ct-1');
      expect(data.type).toBe('ins');

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('{++Pagination defaults to 50 results.++}');
      expect(disk).toContain('[^ct-1]');
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'proposed');
      // Verify reasoning in footnote
      expect(disk).toContain('API needs pagination for list endpoints');
    });

    it('Scenario: Insert text with empty old_text', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: '',
        new_text: '> Draft',
        insert_after: '# API Design',
        reason: 'Mark as draft',
      });

      expect(result.isError).toBeUndefined();
      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('{++> Draft++}');
    });
  });

  // --- Deletions ---

  describe('Deletions', () => {
    it('Scenario: Delete text by providing empty new_text', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: 'Rate limiting is set to 100 requests per minute.',
        new_text: '',
        reason: 'Rate limiting handled by API gateway',
      });

      expect(result.isError).toBeUndefined();
      const data = ctx.parseResult(result);
      expect(data.type).toBe('del');

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('{--Rate limiting is set to 100 requests per minute.--}');
    });
  });

  // --- Substitutions ---

  describe('Substitutions', () => {
    it('Scenario: Substitute text', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'GraphQL gives clients query flexibility',
      });

      expect(result.isError).toBeUndefined();
      const data = ctx.parseResult(result);
      expect(data.type).toBe('sub');

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('{~~REST~>GraphQL~~}');
    });

    it('Scenario: Multi-line substitution', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: 'Authentication uses API keys for all endpoints.\nRate limiting is set to 100 requests per minute.',
        new_text: 'Authentication uses OAuth2 with JWT tokens.\nRate limiting is set to 1000 requests per minute.',
        reason: 'Security upgrade',
      });

      expect(result.isError).toBeUndefined();
      const data = ctx.parseResult(result);
      expect(data.type).toBe('sub');
    });
  });

  // --- Metadata & author ---

  describe('Metadata and author', () => {
    it('Scenario: Reasoning is recorded in footnote', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'Security concern: API keys are insecure',
      });

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('Security concern: API keys are insecure');
    });

    it('Scenario: Author is recorded from config default', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'test',
      });

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('@ai:test-agent');
    });

    it('Scenario: Explicit author overrides config', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'test',
        author: 'ai:reviewer-bot',
      });

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('@ai:reviewer-bot');
    });
  });

  // --- Error cases ---

  describe('Error cases', () => {
    it('Scenario: Ambiguous old_text match returns error', async () => {
      // "the" appears multiple times in DESIGN_DOC (in "Authentication" and "the public")
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: 'the',
        new_text: 'THE',
        reason: 'test',
      });

      expect(result.isError).toBe(true);
      const text = ctx.resultText(result).toLowerCase();
      expect(text).toMatch(/ambiguous|multiple/);
    });

    it('Scenario: old_text not found returns error', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const result = await ctx.propose(filePath, {
        old_text: 'NONEXISTENT TEXT',
        new_text: 'replacement',
        reason: 'test',
      });

      expect(result.isError).toBe(true);
      const text = ctx.resultText(result).toLowerCase();
      expect(text).toMatch(/not found|no match/);
    });

    it('Scenario: File outside tracking scope returns error', async () => {
      const filePath = await ctx.createFile('README.txt', 'hello');

      const result = await ctx.propose(filePath, {
        old_text: 'hello',
        new_text: 'goodbye',
        reason: 'test',
      });

      expect(result.isError).toBe(true);
    });
  });

  // --- Sequential changes ---

  describe('Sequential changes', () => {
    it('Scenario: Two sequential changes get incrementing IDs', async () => {
      const filePath = await ctx.createFile('design.md', DESIGN_DOC);

      const r1 = await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'change 1',
      });
      const r2 = await ctx.propose(filePath, {
        old_text: 'API keys',
        new_text: 'OAuth2',
        reason: 'change 2',
      });

      expect(ctx.parseResult(r1).change_id).toBe('ct-1');
      expect(ctx.parseResult(r2).change_id).toBe('ct-2');

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('[^ct-1]');
      expect(disk).toContain('[^ct-2]');
    });
  });

  // --- Raw mode ---

  describe('Raw mode', () => {
    it('Scenario: Raw mode bypasses CriticMarkup wrapping', async () => {
      const ctxPermissive = new ScenarioContext({
        policy: { mode: 'permissive', creation_tracking: 'footnote' },
      });
      await ctxPermissive.setup();
      try {
        const filePath = await ctxPermissive.createFile('doc.md', 'hello world');

        const result = await ctxPermissive.propose(filePath, {
          old_text: 'hello',
          new_text: 'goodbye',
          raw: true,
          reason: 'test',
        });

        expect(result.isError).toBeUndefined();
        const disk = await ctxPermissive.readDisk(filePath);
        expect(disk).not.toContain('{~~');
        expect(disk).toContain('goodbye world');
      } finally {
        await ctxPermissive.teardown();
      }
    });

    it('Scenario: Raw mode denied in strict policy', async () => {
      const ctxStrict = new ScenarioContext({
        policy: { mode: 'strict', creation_tracking: 'footnote' },
      });
      await ctxStrict.setup();
      try {
        const filePath = await ctxStrict.createFile('doc.md', 'hello world');

        const result = await ctxStrict.propose(filePath, {
          old_text: 'hello',
          new_text: 'goodbye',
          raw: true,
          reason: 'test',
        });

        expect(result.isError).toBe(true);
        expect(ctxStrict.resultText(result).toLowerCase()).toContain('policy');
      } finally {
        await ctxStrict.teardown();
      }
    });
  });

  // --- affected_lines windowing ---

  describe('affected_lines windowing', () => {
    it('Scenario: Single-change affected_lines returns bounded window in classic mode', async () => {
      // Create a 55-line file (well above the 50+ line threshold)
      const lines = ['<!-- ctrcks.com/v1: tracked -->', '# Large Document', ''];
      for (let i = 1; i <= 52; i++) {
        lines.push(`Line ${i} of the specification document.`);
      }
      const bigContent = lines.join('\n');

      // Classic mode with hashlines disabled — exercises the fallback path
      const classicCtx = new ScenarioContext({
        protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
        hashline: { enabled: false, auto_remap: false },
        response: { affected_lines: true },
      });
      await classicCtx.setup();

      try {
        const filePath = await classicCtx.createFile('large.md', bigContent);

        // Single substitution in the middle of the file (line ~28)
        const result = await classicCtx.propose(filePath, {
          old_text: 'Line 25 of the specification document.',
          new_text: 'Line 25 REVISED.',
          reason: 'windowing test',
        });

        expect(result.isError).toBeUndefined();
        const data = classicCtx.parseResult(result);

        // affected_lines should exist and be bounded
        const affectedLines = data.affected_lines as Array<{ line: number; content: string }>;
        expect(affectedLines).toBeDefined();
        expect(Array.isArray(affectedLines)).toBe(true);

        // Must be fewer than 20 entries (not the entire 55+ line file)
        expect(affectedLines.length).toBeLessThan(20);

        // Must include the edit region (lines containing the change)
        const hasEditRegion = affectedLines.some(l => l.content.includes('REVISED'));
        expect(hasEditRegion).toBe(true);

        // Must NOT contain the entire file
        const totalFileLines = (await classicCtx.readDisk(filePath)).split('\n').length;
        expect(affectedLines.length).toBeLessThan(totalFileLines);

        // Should not include lines far from the edit (e.g. line 1-3 or line 50+)
        const lineNums = affectedLines.map(l => l.line);
        expect(lineNums.some(n => n > 50)).toBe(false);
      } finally {
        await classicCtx.teardown();
      }
    });
  });
});
