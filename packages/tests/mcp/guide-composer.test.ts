import { describe, it, expect } from 'vitest';
import { composeGuide } from '@changedown/mcp/internals';
import { DEFAULT_CONFIG } from '@changedown/mcp/internals';

describe('composeGuide', () => {
  describe('protocol section', () => {
    it('classic mode without hashlines shows old_text/new_text', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        protocol: { ...DEFAULT_CONFIG.protocol, mode: 'classic' },
        hashline: { enabled: false, auto_remap: false },
        // Disable annotation section so `op` term doesn't appear from annotation guidance
        reasoning: { ...DEFAULT_CONFIG.reasoning, propose: { human: false, agent: false } },
      });
      expect(guide).toContain('old_text');
      expect(guide).toContain('new_text');
      // Check for backtick-wrapped `at` and `op` (compact-mode terms)
      // to avoid false positives from words like "Batch" or "propose"
      expect(guide).not.toContain('`at`');
      expect(guide).not.toContain('`op`');
      expect(guide).not.toContain('LINE:HASH');
    });

    it('compact mode with hashlines shows at/op and LINE:HASH', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        protocol: { ...DEFAULT_CONFIG.protocol, mode: 'compact' },
        hashline: { enabled: true, auto_remap: false },
      });
      expect(guide).toContain('`at`');
      expect(guide).toContain('`op`');
      expect(guide).toContain('LINE:HASH');
      expect(guide).toContain('{~~old~>new~~}');
      expect(guide).toContain('{++text++}');
      expect(guide).toContain('{--text--}');
    });

    it('compact mode shows disambiguation guidance', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        protocol: { ...DEFAULT_CONFIG.protocol, mode: 'compact' },
        hashline: { enabled: true, auto_remap: false },
      });
      expect(guide).toMatch(/disambiguat/i);
    });
  });

  describe('author section', () => {
    it('required enforcement says "Required"', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        author: { default: '', enforcement: 'required' },
      });
      expect(guide).toMatch(/required/i);
      expect(guide).toContain('ai:YOUR-ACTUAL-MODEL');
    });

    it('optional enforcement says "Recommended"', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        author: { default: '', enforcement: 'optional' },
      });
      expect(guide).toMatch(/recommended/i);
    });
  });

  describe('annotation section', () => {
    it('reasoning.propose.agent=true includes annotation requirement', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        reasoning: { ...DEFAULT_CONFIG.reasoning, propose: { human: false, agent: true } },
      });
      expect(guide).toMatch(/annotation.*required|required.*annotation/i);
    });

    it('reasoning.propose.agent=false omits annotation requirement', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        reasoning: { ...DEFAULT_CONFIG.reasoning, propose: { human: false, agent: false } },
      });
      expect(guide).not.toMatch(/annotation.*required/i);
    });
  });

  describe('chaining section', () => {
    it('chaining section references affected_lines and preview', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      expect(guide).toContain('affected_lines');
      expect(guide).toContain('preview');
      expect(guide).not.toContain('updated_lines'); // old name removed
    });

    it('always includes no re-read guidance', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      expect(guide).toMatch(/no re-read is needed/i);
    });
  });

  describe('view section', () => {
    it('working default describes working view and mentions alternatives', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'working' },
      });
      expect(guide).toContain('working view');
      expect(guide).toContain('simple');
      expect(guide).toContain('decided');
    });

    it('simple default describes simple view', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'simple' },
      });
      expect(guide).toContain('simple view');
      expect(guide).toContain('working');
      expect(guide).toContain('decided');
    });

    it('decided default describes decided view', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'decided' },
      });
      expect(guide).toContain('decided view');
      expect(guide).toContain('working');
      expect(guide).toContain('simple');
    });
  });

  describe('compact mode range and encoding guidance', () => {
    const compactConfig = {
      ...DEFAULT_CONFIG,
      protocol: { ...DEFAULT_CONFIG.protocol, mode: 'compact' as const },
      hashline: { enabled: true, auto_remap: false },
    };

    it('compact guide includes range replacement instruction', () => {
      const guide = composeGuide(compactConfig);
      expect(guide).toMatch(/range replace/i);
    });

    it('compact guide includes multi-line instruction', () => {
      const guide = composeGuide(compactConfig);
      expect(guide).toContain('real newlines');
    });
  });

  describe('self-revision section', () => {
    const compactConfig = {
      ...DEFAULT_CONFIG,
      protocol: { ...DEFAULT_CONFIG.protocol, mode: 'compact' as const },
      hashline: { enabled: true, auto_remap: false },
    };
    const classicConfig = {
      ...DEFAULT_CONFIG,
      protocol: { ...DEFAULT_CONFIG.protocol, mode: 'classic' as const },
      hashline: { enabled: false, auto_remap: false },
    };

    it('guide includes self-revision instruction in both modes', () => {
      const compactGuide = composeGuide(compactConfig);
      const classicGuide = composeGuide(classicConfig);
      expect(compactGuide).toContain('auto-supersedes');
      expect(classicGuide).toContain('auto-supersedes');
    });
  });

  describe('token cost', () => {
    it('default config (classic, no hashlines, agent reasoning required) stays bounded', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      // Rough token estimate: ~4 chars per token
      // DEFAULT_CONFIG has reasoning.propose.agent = true, so annotation section is included
      expect(guide.length).toBeLessThan(1600);
    });

    it('maximal config (compact, hashlines, required everything) stays bounded', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        protocol: { mode: 'compact', level: 2, reasoning: 'required', batch_reasoning: 'required' },
        hashline: { enabled: true, auto_remap: false },
        author: { default: '', enforcement: 'required' },
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'working' },
      });
      // Rough token estimate: ~4 chars per token
      expect(guide.length).toBeLessThan(2400);
    });
  });

  describe('structure', () => {
    it('starts with --- and "How to edit this file"', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      expect(guide).toMatch(/^---\n## How to edit this file/);
    });

    it('ends with ---', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      expect(guide.trimEnd()).toMatch(/---$/);
    });
  });
});


describe('word session guide', () => {
  it('compact word guide teaches compact+hashline as preferred and classic as accepted fallback', () => {
    const guide = composeGuide({
      ...DEFAULT_CONFIG,
      protocol: { ...DEFAULT_CONFIG.protocol, mode: 'compact' },
      hashline: { enabled: true, auto_remap: false },
    }, { targetKind: 'word' });

    expect(guide).toContain('word://');
    expect(guide).toContain('compact+hashline');
    expect(guide).toContain('old_text');
    expect(guide).toContain('new_text');
    expect(guide).toMatch(/one proposal per call/i);
  });

  it('classic word guide still names compact+hashline as accepted for word sessions', () => {
    const guide = composeGuide({
      ...DEFAULT_CONFIG,
      protocol: { ...DEFAULT_CONFIG.protocol, mode: 'classic' },
      hashline: { enabled: true, auto_remap: false },
    }, { targetKind: 'word' });

    expect(guide).toContain('word://');
    expect(guide).toContain('old_text');
    expect(guide).toContain('compact+hashline');
    expect(guide).toContain('LINE:HASH');
  });
});
