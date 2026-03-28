import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('proposal reasoning enforcement', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-reasoning-test-'));
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
        enforcement: 'warn',
        exclude: [],
        intercept_tools: false,
        intercept_bash: false,
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
        auto_remap: false,
      },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      coherence: { threshold: 98 },
      review: {
        may_review: { human: true, agent: true },
        self_acceptance: { human: true, agent: true },
        cross_withdrawal: { human: false, agent: false },
        blocking_labels: {},
      },
      reasoning: {
        propose: { human: false, agent: true },
        review: { human: false, agent: true },
      },
      policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);

    filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects proposal without annotation when reasoning.propose.agent = true', async () => {
    // Default config has reasoning.propose.agent = true
    // Propose with op that has NO reason/annotation
    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/requires reasoning/i);
  });

  it('accepts proposal with reason param when reasoning.propose.agent = true', async () => {
    // classic mode: reason param provides the annotation
    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'better word' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
  });

  it('accepts proposal without annotation when reasoning.propose.agent = false', async () => {
    // Override: agents do NOT require reasoning
    const noReasoningConfig: ChangeDownConfig = {
      ...config,
      reasoning: {
        ...config.reasoning,
        propose: { human: false, agent: false },
      },
    };
    const noReasoningResolver = await createTestResolver(tmpDir, noReasoningConfig);

    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      noReasoningResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
  });

  it('accepts proposal from human author without annotation (humans not required by default)', async () => {
    // Default: reasoning.propose.human = false — humans can propose without annotation
    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
  });

  it('requires human annotation when reasoning.propose.human = true', async () => {
    const humanRequiredConfig: ChangeDownConfig = {
      ...config,
      reasoning: {
        ...config.reasoning,
        propose: { human: true, agent: true },
      },
    };
    const humanRequiredResolver = await createTestResolver(tmpDir, humanRequiredConfig);

    const result = await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice' },
      humanRequiredResolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/requires reasoning/i);
  });
});
