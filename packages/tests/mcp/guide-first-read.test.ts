import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from './features/scenario-context.js';

describe('First-contact guide in read_tracked_file', () => {
  describe('compact mode', () => {
    let ctx: ScenarioContext;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        hashline: { enabled: true, auto_remap: false },
        protocol: { mode: 'compact', level: 2, reasoning: 'required', batch_reasoning: 'required' },
        author: { default: '', enforcement: 'required' },
      }, { showGuide: true });
      await ctx.setup();
    });

    afterEach(async () => { await ctx.teardown(); });

    it('first read includes the edit guide', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath);
      // Guide is the first content item, file content is second
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toContain('## How to edit this file');
      expect(guideText).toContain('`at`');
      expect(guideText).toContain('`op`');
      expect(guideText).toContain('{~~old~>new~~}');
      // File content should NOT contain the guide
      expect(result.content[1].text).not.toContain('## How to edit this file');
    });

    it('second read omits the edit guide', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      await ctx.read(filePath);
      const result2 = await ctx.read(filePath);
      expect(result2.content.length).toBe(1);
    });

    it('reading a different file in the same session omits the guide', async () => {
      const file1 = await ctx.createFile('a.md',
        '<!-- changedown.com/v1: tracked -->\n# A\nContent A.\n');
      const file2 = await ctx.createFile('b.md',
        '<!-- changedown.com/v1: tracked -->\n# B\nContent B.\n');
      await ctx.read(file1);
      const result2 = await ctx.read(file2);
      expect(result2.content.length).toBe(1);
    });

    it('guide shows required author when enforcement is required', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath);
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toMatch(/author.*required/i);
    });
  });

  describe('classic mode', () => {
    let ctx: ScenarioContext;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        hashline: { enabled: false, auto_remap: false },
        protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
        author: { default: '', enforcement: 'optional' },
      }, { showGuide: true });
      await ctx.setup();
    });

    afterEach(async () => { await ctx.teardown(); });

    it('first read includes classic-mode guide', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath);
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toContain('## How to edit this file');
      expect(guideText).toContain('old_text');
      expect(guideText).toContain('new_text');
      expect(guideText).not.toContain('LINE:HASH');
    });

    it('classic guide shows optional author as recommended', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath);
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toMatch(/recommended/i);
    });
  });

  describe('include_guide parameter', () => {
    let ctx: ScenarioContext;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        hashline: { enabled: true, auto_remap: false },
        protocol: { mode: 'compact', level: 2, reasoning: 'required', batch_reasoning: 'required' },
        author: { default: '', enforcement: 'required' },
      }, { showGuide: true });
      await ctx.setup();
    });

    afterEach(async () => { await ctx.teardown(); });

    it('include_guide: true delivers guide even after first read consumed it', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      // First read consumes the auto-delivery
      const result1 = await ctx.read(filePath);
      expect(result1.content.length).toBe(2);

      // Second read without include_guide omits guide
      const result2 = await ctx.read(filePath);
      expect(result2.content.length).toBe(1);

      // Third read with include_guide: true re-delivers guide
      const result3 = await ctx.read(filePath, { include_guide: true });
      expect(result3.content.length).toBe(2);
      expect(result3.content[0].text).toContain('## How to edit this file');
    });

    it('include_guide: false does not re-deliver guide after first read', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      await ctx.read(filePath);
      const result2 = await ctx.read(filePath, { include_guide: false });
      expect(result2.content.length).toBe(1);
    });

    it('omitted include_guide does not re-deliver guide after first read', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      await ctx.read(filePath);
      const result2 = await ctx.read(filePath);
      expect(result2.content.length).toBe(1);
    });

    it('include_guide: true on first read still delivers guide and consumes auto-delivery', async () => {
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      // First read with include_guide: true
      const result1 = await ctx.read(filePath, { include_guide: true });
      expect(result1.content.length).toBe(2);
      expect(result1.content[0].text).toContain('## How to edit this file');

      // Second read without include_guide should NOT get guide (auto-delivery consumed)
      const result2 = await ctx.read(filePath);
      expect(result2.content.length).toBe(1);
    });
  });

  describe('view descriptions', () => {
    it('review default mentions review view', async () => {
      const ctx = new ScenarioContext({
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
      }, { showGuide: true });
      await ctx.setup();
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath);
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toContain('review view');
      await ctx.teardown();
    });

    it('changes default mentions changes view', async () => {
      const ctx = new ScenarioContext({
        hashline: { enabled: true, auto_remap: false },
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'changes', view_policy: 'suggest' },
      }, { showGuide: true });
      await ctx.setup();
      const filePath = await ctx.createFile('doc.md',
        '<!-- changedown.com/v1: tracked -->\n# Test\nSome content.\n');
      const result = await ctx.read(filePath, { view: 'changes' });
      expect(result.content.length).toBe(2);
      const guideText = result.content[0].text;
      expect(guideText).toContain('changes view');
      await ctx.teardown();
    });
  });
});
