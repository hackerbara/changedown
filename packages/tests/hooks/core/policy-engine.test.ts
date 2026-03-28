import { describe, it, expect } from 'vitest';
import { evaluateRawEdit, evaluateRawRead, evaluateMcpCall, DEFAULT_CONFIG } from 'changedown-hooks/internals';
import type { ChangeDownConfig } from 'changedown-hooks/internals';

function makeConfig(overrides: Partial<ChangeDownConfig> = {}): ChangeDownConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

describe('evaluateRawEdit', () => {
  it('returns allow for non-tracked files', () => {
    const result = evaluateRawEdit('/project/src/app.ts', makeConfig(), '/project');
    expect(result.action).toBe('allow');
  });

  it('returns deny in strict mode for tracked files', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const result = evaluateRawEdit('/project/docs/readme.md', config, '/project');
    expect(result.action).toBe('deny');
    expect(result.agentHint).toContain('propose_change');
  });

  it('returns warn in safety-net mode for tracked files', () => {
    const result = evaluateRawEdit('/project/docs/readme.md', makeConfig(), '/project');
    expect(result.action).toBe('warn');
  });

  it('returns allow in permissive mode', () => {
    const config = makeConfig({ policy: { mode: 'permissive', creation_tracking: 'footnote' } });
    const result = evaluateRawEdit('/project/docs/readme.md', config, '/project');
    expect(result.action).toBe('allow');
  });

  it('returns allow for hook-excluded files', () => {
    const config = makeConfig({ hooks: { enforcement: 'warn', exclude: ['docs/readme.md'] } });
    const result = evaluateRawEdit('/project/docs/readme.md', config, '/project');
    expect(result.action).toBe('allow');
  });

  it('includes hashline tip when hashline enabled', () => {
    const config = makeConfig({ hashline: { enabled: true, auto_remap: true } });
    const result = evaluateRawEdit('/project/docs/readme.md', config, '/project');
    expect(result.agentHint).toContain('read_tracked_file');
  });
});

describe('evaluateRawRead', () => {
  it('returns deny in strict mode for tracked files', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const result = evaluateRawRead('/project/docs/readme.md', config, '/project');
    expect(result.action).toBe('deny');
    expect(result.agentHint).toContain('read_tracked_file');
  });

  it('returns allow for non-tracked files', () => {
    const result = evaluateRawRead('/project/src/app.ts', makeConfig(), '/project');
    expect(result.action).toBe('allow');
  });

  it('returns allow in permissive mode', () => {
    const config = makeConfig({ policy: { mode: 'permissive', creation_tracking: 'footnote' } });
    const result = evaluateRawRead('/project/docs/readme.md', config, '/project');
    expect(result.action).toBe('allow');
  });

  it('returns allow in safety-net mode (reads are safe)', () => {
    const result = evaluateRawRead('/project/docs/readme.md', makeConfig(), '/project');
    expect(result.action).toBe('allow');
  });
});

describe('evaluateMcpCall', () => {
  it('always allows read_tracked_file', () => {
    const result = evaluateMcpCall('read_tracked_file', { file: 'test.md' }, makeConfig());
    expect(result.action).toBe('allow');
  });

  it('always allows get_change', () => {
    const result = evaluateMcpCall('get_change', { file: 'test.md', change_id: 'cn-1' }, makeConfig());
    expect(result.action).toBe('allow');
  });

  it('denies propose_change without author when enforcement required', () => {
    const config = makeConfig({ author: { default: 'unknown', enforcement: 'required' } });
    const result = evaluateMcpCall('propose_change', { file: 'test.md', op: '{~~old~>new~~}' }, config);
    expect(result.action).toBe('deny');
    expect(result.reason).toContain('author');
  });

  it('allows propose_change with author when enforcement required', () => {
    const config = makeConfig({ author: { default: 'unknown', enforcement: 'required' } });
    const result = evaluateMcpCall('propose_change', { file: 'test.md', op: '{~~old~>new~~}', author: 'ai:claude' }, config);
    expect(result.action).toBe('allow');
  });

  it('allows propose_change without author when enforcement optional', () => {
    const result = evaluateMcpCall('propose_change', { file: 'test.md', op: '{~~old~>new~~}' }, makeConfig());
    expect(result.action).toBe('allow');
  });

  it('denies review_changes without author when required', () => {
    const config = makeConfig({ author: { default: 'unknown', enforcement: 'required' } });
    const result = evaluateMcpCall('review_changes', { file: 'test.md', reviews: [] }, config);
    expect(result.action).toBe('deny');
  });

  it('denies amend_change without author when required', () => {
    const config = makeConfig({ author: { default: 'unknown', enforcement: 'required' } });
    const result = evaluateMcpCall('amend_change', { file: 'test.md', change_id: 'cn-1' }, config);
    expect(result.action).toBe('deny');
  });

  it('allows review_changes with author when required', () => {
    const config = makeConfig({ author: { default: 'unknown', enforcement: 'required' } });
    const result = evaluateMcpCall('review_changes', { file: 'test.md', reviews: [], author: 'ai:claude' }, config);
    expect(result.action).toBe('allow');
  });
});
