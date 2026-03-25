import { describe, it, expect } from 'vitest';
import { composeGuide } from '@changetracks/mcp/internals';
import { DEFAULT_CONFIG } from '@changetracks/mcp/internals';

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
      expect(guide).toMatch(/no re-read needed/i);
    });
  });

  describe('view section', () => {
    it('review default describes review view and mentions alternatives', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'review' },
      });
      expect(guide).toContain('review view');
      expect(guide).toContain('changes');
      expect(guide).toContain('settled');
    });

    it('changes default describes changes view', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'changes' },
      });
      expect(guide).toContain('changes view');
      expect(guide).toContain('review');
      expect(guide).toContain('settled');
    });

    it('settled default describes settled view', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'settled' },
      });
      expect(guide).toContain('settled view');
      expect(guide).toContain('review');
      expect(guide).toContain('changes');
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
      expect(guide).toContain('Range replace');
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
    it('default config (classic, no hashlines, agent reasoning required) is under 325 tokens', () => {
      const guide = composeGuide(DEFAULT_CONFIG);
      // Rough token estimate: ~4 chars per token
      // DEFAULT_CONFIG has reasoning.propose.agent = true, so annotation section is included
      expect(guide.length).toBeLessThan(1300);
    });

    it('maximal config (compact, hashlines, required everything) is under 500 tokens', () => {
      const guide = composeGuide({
        ...DEFAULT_CONFIG,
        protocol: { mode: 'compact', level: 2, reasoning: 'required', batch_reasoning: 'required' },
        hashline: { enabled: true, auto_remap: false },
        author: { default: '', enforcement: 'required' },
        policy: { ...DEFAULT_CONFIG.policy, default_view: 'review' },
      });
      // Rough token estimate: ~4 chars per token
      expect(guide.length).toBeLessThan(2000);
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
