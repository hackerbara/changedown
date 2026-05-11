import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, computeLineHash } from '@changedown/core';
import { prepareCompactProposeChange, SessionState, type ChangeDownConfig } from '@changedown/cli/engine';

const config: ChangeDownConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test-agent', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [], intercept_tools: true, intercept_bash: false },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: true, auto_on_reject: true },
  policy: { mode: 'safety-net', creation_tracking: 'footnote' },
  protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  reasoning: {
    propose: { human: false, agent: false },
    review: { human: false, agent: false },
  },
  response: { affected_lines: true },
};

function hashForLine(content: string, line: number): string {
  const lines = content.split('\n');
  return computeLineHash(line - 1, lines[line - 1]!, lines);
}

describe('prepareCompactProposeChange', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('prepares a diskless substitution as full newL2 plus normal tool result', async () => {
    const state = new SessionState();
    const fileContent = 'The quick brown fox';
    const hash = hashForLine(fileContent, 1);

    const result = await prepareCompactProposeChange({
      args: { at: `1:${hash}`, op: '{~~quick brown~>slow red~~}', author: 'ai:test-agent' },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.oldL2).toBe(fileContent);
    expect(result.newL2).toContain('{~~quick brown~>slow red~~}[^cn-1]');
    expect(result.newL2).toContain('[^cn-1]: @ai:test-agent |');
    expect('wordPlan' in result).toBe(false);

    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload).toMatchObject({
      change_id: 'cn-1',
      file: 'word://sess-test',
      type: 'sub',
    });
  });

  it('does not reject highlight proposals just because Word has no native adapter yet', async () => {
    const state = new SessionState();
    const fileContent = 'The quick brown fox';
    const hash = hashForLine(fileContent, 1);

    const result = await prepareCompactProposeChange({
      args: { at: `1:${hash}`, op: '{==quick==}', author: 'ai:test-agent' },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newL2).toContain('{==quick==}[^cn-1]');
    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload.type).toBe('highlight');
  });

  it('auto-supersedes a same-author insertion when targeting text inside its proposed payload', async () => {
    const state = new SessionState();
    const fileContent = [
      '{++Paragraph one sentence one: public compact writes the first paragraph.',
      '',
      'Paragraph two sentence one: public compact writes the second paragraph.',
      '',
      '| Key | Value |',
      '| --- | --- |',
      '| alpha | one |',
      '| beta | two |',
      '',
      'Paragraph three sentence one: public compact writes the third paragraph.++}[^cn-2]',
      '',
      '[^cn-1]: @base-document | 2026-05-04 | ins | accepted',
      '    source: initial-word-body',
      '',
      '[^cn-2]: @ai:codex | 2026-05-04 | ins | proposed',
    ].join('\n');
    const hash = hashForLine(fileContent, 1);

    const result = await prepareCompactProposeChange({
      args: {
        at: `1:${hash}`,
        op: '{~~Paragraph one sentence one: public compact writes the first paragraph.~>Paragraph one sentence one: public compact updates the first paragraph.~~}{>>Revise the proposed insertion.<<}',
        author: 'ai:codex',
      },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newL2).toContain('{++Paragraph one sentence one: public compact updates the first paragraph.');
    expect(result.newL2).toContain('[^cn-3]: @ai:codex |');
    expect(result.newL2).toContain('supersedes: cn-2');
    expect(result.newL2).toContain('superseded-by: cn-3');
    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload).toMatchObject({
      change_id: 'cn-3',
      type: 'ins',
      superseded: ['cn-2'],
    });
  });

  it('auto-supersedes a same-author insertion when inserting after a line inside its proposed payload', async () => {
    const state = new SessionState();
    const fileContent = [
      'Hi codex\\!',
      '{++Smoke paragraph first',
      '',
      'Smoke paragraph second++}[^cn-2]',
      '',
      '[^cn-2]: @ai:codex-clean-smoke | 2026-05-08 | ins | proposed',
    ].join('\n');
    const hash = hashForLine(fileContent, 4);

    const result = await prepareCompactProposeChange({
      args: {
        at: `4:${hash}`,
        op: '{++| Thing | Status |\n| --- | --- |\n| table smoke | alive |++}{>>Append a table to the existing smoke insertion.<<}',
        author: 'ai:codex-clean-smoke',
      },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newL2).toContain('Hi codex\\!');
    expect(result.newL2).toContain('Smoke paragraph first');
    expect(result.newL2).toContain('Smoke paragraph second');
    expect(result.newL2).toContain('| Thing | Status |');
    expect(result.newL2).toContain('[^cn-3]: @ai:codex-clean-smoke |');
    expect(result.newL2).toContain('supersedes: cn-2');
    expect(result.newL2).toContain('superseded-by: cn-3');
    expect(result.newL2).not.toContain('{++| Thing | Status |');
    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload).toMatchObject({
      change_id: 'cn-3',
      type: 'ins',
      superseded: ['cn-2'],
    });
  });

  it('auto-supersedes the latest superseding insertion instead of falling back to a table-row substitution', async () => {
    const state = new SessionState();
    const fileContent = [
      '{++Paragraph one sentence one: public compact updates the first paragraph.',
      '',
      'Paragraph two sentence one: public compact writes the second paragraph.',
      '',
      '| Key | Value |',
      '| --- | --- |',
      '| alpha | one |',
      '| beta | two |',
      '',
      'Paragraph three sentence one: public compact writes the third paragraph.++}[^cn-3]',
      '',
      '[^cn-1]: @base-document | 2026-05-04 | ins | accepted',
      '    source: initial-word-body',
      '',
      '[^cn-4]: @base-document | 2026-05-04T00:00:00.000Z | ins | accepted',
      '    source: tracking-off-body-edit',
      '',
      '[^cn-2]: @ai:codex | 2026-05-04 | ins | rejected',
      '    superseded-by: cn-3',
      '',
      '[^cn-3]: @ai:codex | 2026-05-04 | ins | proposed',
      '    supersedes: cn-2',
    ].join('\n');
    const hash = hashForLine(fileContent, 8);

    const result = await prepareCompactProposeChange({
      args: {
        at: `8:${hash}`,
        op: '{~~| beta | two |~>| beta | three |~~}{>>Revise the proposed table row.<<}',
        author: 'ai:codex',
      },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newL2).toContain('| beta | three |');
    expect(result.newL2).toContain('[^cn-5]: @ai:codex |');
    expect(result.newL2).toContain('supersedes: cn-3');
    expect(result.newL2).toContain('superseded-by: cn-5');
    expect(result.newL2).not.toContain('{~~| beta | two |~>| beta | three |~~}');
    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload).toMatchObject({
      change_id: 'cn-5',
      type: 'ins',
      superseded: ['cn-3'],
    });
  });

  it('turns a comment targeted inside a proposed insertion into a thread reply', async () => {
    const state = new SessionState();
    const fileContent = [
      '{++Paragraph one sentence one.',
      '',
      'Paragraph two sentence one.++}[^cn-2]',
      '',
      '[^cn-2]: @ai:codex | 2026-05-04 | ins | proposed',
    ].join('\n');
    const hash = hashForLine(fileContent, 3);

    const result = await prepareCompactProposeChange({
      args: {
        at: `3:${hash}`,
        op: '{>>Please check this sentence break.<<}',
        author: 'ai:reviewer',
      },
      filePath: 'word://sess-test',
      relativePath: 'word://sess-test',
      fileContent,
      config,
      state,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeId).toBe('cn-2');
    expect(result.threadReply).toEqual({
      changeId: 'cn-2',
      text: 'Please check this sentence break.',
      author: 'ai:reviewer',
    });
    expect(result.newL2).not.toContain('{>>Please check this sentence break.<<}[^cn-');
    expect(result.newL2).toContain('    @ai:reviewer ');
    expect(result.newL2).toContain(': Please check this sentence break.');
    const payload = JSON.parse(result.toolResult.content[0]!.text);
    expect(payload).toMatchObject({
      change_id: 'cn-2',
      type: 'comment',
      comment_added: true,
      threaded_on: 'cn-2',
    });
  });

  it('preserves opaque word:// keys in SessionState view-aware resolution', async () => {
    const state = new SessionState();
    const fileContent = '{++Visible++}[^cn-1]\n\n[^cn-1]: @a | 2026-05-01 | ins | proposed\n';
    state.recordAfterRead('word://sess-test', 'working', [
      { line: 1, raw: 'aa', currentView: 'bb', rawLineNum: 1 },
    ], fileContent);

    expect(state.getLastReadView('word://sess-test')).toBe('working');
    expect(state.resolveHash('word://sess-test', 1, 'aa')).toEqual({
      match: true,
      rawLineNum: 1,
      view: 'working',
    });
  });
});
