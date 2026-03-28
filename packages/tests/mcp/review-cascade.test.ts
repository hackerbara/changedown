import { describe, it, expect } from 'vitest';
import { applyReview } from '@changedown/mcp/internals';

const HEADER = '<!-- changedown.com/v1: tracked -->\n';

function makeGroupFile(): string {
  return HEADER + `# Test Doc

Some content here.

[^cn-1]: ai:test | 2026-02-25 | group | proposed
    ai:test 2026-02-25: Group reasoning

[^cn-1.1]: ai:test | 2026-02-25 | sub | proposed
    ai:test 2026-02-25: First child

[^cn-1.2]: ai:test | 2026-02-25 | sub | proposed
    ai:test 2026-02-25: Second child

[^cn-1.3]: ai:test | 2026-02-25 | sub | proposed
    ai:test 2026-02-25: Third child
`;
}

describe('Group Review Cascade', () => {
  it('approving group parent cascades to all proposed children', () => {
    const content = makeGroupFile();
    const result = applyReview(content, 'cn-1', 'approve', 'Approve the group', 'ai:reviewer');

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const updated = result.updatedContent;
    // Parent should be accepted
    expect(updated).toContain('[^cn-1]: ai:test | 2026-02-25 | group | accepted');
    // All children should be accepted
    expect(updated).toContain('[^cn-1.1]: ai:test | 2026-02-25 | sub | accepted');
    expect(updated).toContain('[^cn-1.2]: ai:test | 2026-02-25 | sub | accepted');
    expect(updated).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | accepted');
    // Each child should have an approval line
    expect(updated).toMatch(/\[.cn-1\.1\][\s\S]*approved:.*ai:reviewer/);
    expect(updated).toMatch(/\[.cn-1\.2\][\s\S]*approved:.*ai:reviewer/);
    expect(updated).toMatch(/\[.cn-1\.3\][\s\S]*approved:.*ai:reviewer/);
    // Result should report cascaded children
    expect(result.result.cascaded_children).toEqual(['cn-1.1', 'cn-1.2', 'cn-1.3']);
  });

  it('skips children with existing decisions', () => {
    let content = makeGroupFile();
    // Pre-reject cn-1.2
    content = content.replace(
      '[^cn-1.2]: ai:test | 2026-02-25 | sub | proposed',
      '[^cn-1.2]: ai:test | 2026-02-25 | sub | rejected'
    );

    const result = applyReview(content, 'cn-1', 'approve', 'Approve group', 'ai:reviewer');
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const updated = result.updatedContent;
    // Parent and proposed children accepted
    expect(updated).toContain('| group | accepted');
    expect(updated).toContain('[^cn-1.1]: ai:test | 2026-02-25 | sub | accepted');
    expect(updated).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | accepted');
    // cn-1.2 stays rejected (not overridden)
    expect(updated).toContain('[^cn-1.2]: ai:test | 2026-02-25 | sub | rejected');
    // Only proposed children in cascade list
    expect(result.result.cascaded_children).toEqual(['cn-1.1', 'cn-1.3']);
  });

  it('rejecting group parent cascades rejection to proposed children', () => {
    const content = makeGroupFile();
    const result = applyReview(content, 'cn-1', 'reject', 'Reject the group', 'ai:reviewer');

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const updated = result.updatedContent;
    expect(updated).toContain('| group | rejected');
    expect(updated).toContain('[^cn-1.1]: ai:test | 2026-02-25 | sub | rejected');
    expect(updated).toContain('[^cn-1.2]: ai:test | 2026-02-25 | sub | rejected');
    expect(updated).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | rejected');
  });

  it('non-group IDs do not cascade', () => {
    const content = makeGroupFile();
    const result = applyReview(content, 'cn-1.1', 'approve', 'Just one child', 'ai:reviewer');

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const updated = result.updatedContent;
    // Only cn-1.1 accepted
    expect(updated).toContain('[^cn-1.1]: ai:test | 2026-02-25 | sub | accepted');
    // Others stay proposed
    expect(updated).toContain('[^cn-1.2]: ai:test | 2026-02-25 | sub | proposed');
    expect(updated).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | proposed');
    // No cascade field
    expect(result.result.cascaded_children).toBeUndefined();
  });

  it('explicit child reject after parent approve keeps child rejected (BUG-002) and reports status_updated (BUG-003)', () => {
    let content = makeGroupFile();
    // First: approve parent → cascades to all children (cn-1.3 becomes accepted)
    const afterApprove = applyReview(content, 'cn-1', 'approve', 'Approve group', 'ai:reviewer');
    expect('error' in afterApprove).toBe(false);
    if ('error' in afterApprove) return;
    expect(afterApprove.updatedContent).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | accepted');

    // Second: explicitly reject child cn-1.3 (overrides cascade)
    const afterReject = applyReview(afterApprove.updatedContent, 'cn-1.3', 'reject', 'Reject this child', 'ai:reviewer');
    expect('error' in afterReject).toBe(false);
    if ('error' in afterReject) return;

    const updated = afterReject.updatedContent;
    // Child must stay rejected, not accepted
    expect(updated).toContain('[^cn-1.3]: ai:test | 2026-02-25 | sub | rejected');
    expect(updated).not.toMatch(/\[\^cn-1\.3\][\s\S]*\| accepted/);
    // Reject must report status_updated: true (BUG-003)
    expect(afterReject.result.status_updated).toBe(true);
  });
});
