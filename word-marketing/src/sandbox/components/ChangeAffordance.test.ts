import { describe, it, expect } from 'vitest';
import { computePopupPosition } from './computePopupPosition';

describe('ChangeAffordance positioning', () => {
  const viewport = { width: 1024, height: 768 };
  const popup = { width: 240, height: 120 };

  it('places below when room available', () => {
    const pos = computePopupPosition({ top: 100, left: 200, height: 20 }, popup, viewport);
    expect(pos.placement).toBe('below');
    expect(pos.top).toBe(125);
  });

  it('places above when no room below', () => {
    const pos = computePopupPosition({ top: 700, left: 200, height: 20 }, popup, viewport);
    expect(pos.placement).toBe('above');
    expect(pos.top).toBeLessThan(700);
  });

  it('clamps left so popup stays in viewport', () => {
    const pos = computePopupPosition({ top: 100, left: 900, height: 20 }, popup, viewport);
    expect(pos.left + popup.width).toBeLessThanOrEqual(viewport.width);
  });

  it('clamps left at zero on narrow viewports', () => {
    const pos = computePopupPosition({ top: 100, left: -50, height: 20 }, popup, viewport);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it('right edge clamps when anchor is far right', () => {
    const pos = computePopupPosition({ top: 100, left: 1000, height: 20 }, popup, viewport);
    expect(pos.left).toBe(viewport.width - popup.width); // 784
  });
});
