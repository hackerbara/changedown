import { describe, it, expect } from 'vitest';
import { SessionState } from '@changetracks/mcp/internals';

describe('SessionState: guideShownForMode', () => {
  it('starts as null', () => {
    const state = new SessionState();
    expect(state.getGuideShownForMode()).toBeNull();
  });

  it('records the mode after setGuideShown', () => {
    const state = new SessionState();
    state.setGuideShown('compact');
    expect(state.getGuideShownForMode()).toBe('compact');
  });

  it('updates when mode changes', () => {
    const state = new SessionState();
    state.setGuideShown('classic');
    expect(state.getGuideShownForMode()).toBe('classic');
    state.setGuideShown('compact');
    expect(state.getGuideShownForMode()).toBe('compact');
  });
});
