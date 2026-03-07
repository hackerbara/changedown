/**
 * View builder index — dispatcher that routes to the correct view builder
 * based on the requested ViewName.
 */

import { buildReviewDocument, type ReviewBuildOptions } from './review.js';
import { buildChangesDocument, type ChangesViewOptions } from './changes.js';
import { buildSettledDocument, type SettledViewOptions } from './settled.js';
import { buildRawDocument, type RawViewOptions } from './raw.js';
import type { ThreeZoneDocument, ViewName } from '../three-zone-types.js';

export { buildReviewDocument, buildChangesDocument, buildSettledDocument, buildRawDocument };
export type { ReviewBuildOptions, ChangesViewOptions, SettledViewOptions, RawViewOptions };

/**
 * Union of all view-specific option types.
 * Since all four share the same base fields (filePath, trackingStatus,
 * protocolMode, defaultView, viewPolicy), the intersection collapses
 * to a single shared shape. This lets callers pass one options object
 * to buildViewDocument without caring which view is selected.
 */
export type ViewOptions = ReviewBuildOptions & ChangesViewOptions & SettledViewOptions & RawViewOptions;

/**
 * Dispatch to the correct view builder based on the view name.
 *
 * Falls back to review view for unrecognised view names (defensive;
 * TypeScript exhaustiveness catches this at compile time for known callers).
 */
export function buildViewDocument(
  rawContent: string,
  view: ViewName,
  options: ViewOptions,
): ThreeZoneDocument {
  switch (view) {
    case 'review': return buildReviewDocument(rawContent, options);
    case 'changes': return buildChangesDocument(rawContent, options);
    case 'settled': return buildSettledDocument(rawContent, options);
    case 'raw': return buildRawDocument(rawContent, options);
    default: return buildReviewDocument(rawContent, options);
  }
}
