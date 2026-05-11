export interface AnchorRect { top: number; left: number; height: number; }
export interface PopupSize { width: number; height: number; }
export interface Viewport { width: number; height: number; }
export interface PopupPosition { top: number; left: number; placement: 'above' | 'below'; }

const GAP = 5;

/**
 * Compute the top/left placement of the ChangeAffordance popup.
 *
 * Prefers below the change span; falls back to above when room is
 * tight. Horizontally clamps so the popup stays within the viewport.
 *
 * Pure function — same inputs always produce the same output. Tested
 * in ChangeAffordance.test.ts.
 */
export function computePopupPosition(
  anchor: AnchorRect,
  popup: PopupSize,
  viewport: Viewport
): PopupPosition {
  const placement: 'above' | 'below' =
    anchor.top + anchor.height + GAP + popup.height <= viewport.height ? 'below' : 'above';
  const top = placement === 'below'
    ? anchor.top + anchor.height + GAP
    : anchor.top - popup.height - GAP;
  const left = Math.max(0, Math.min(anchor.left, viewport.width - popup.width));
  return { top, left, placement };
}
