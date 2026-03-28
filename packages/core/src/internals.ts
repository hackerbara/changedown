/**
 * Internal exports for test consumption.
 *
 * This barrel re-exports symbols that tests need but that aren't
 * necessarily part of the stable public API (index.ts).  Today
 * everything happens to also appear in index.ts — but as the
 * public API gets trimmed, test-only symbols will migrate here.
 *
 * Import with:  import { ... } from '@changedown/core/internals';
 */

// Re-export everything from the public surface so test files
// can use a single import specifier for both public and internal symbols.
export * from './index.js';

// Re-export deprecated functions for test consumption only.
// These are removed from the public API (index.ts) per ADR-C §2
// but tests still verify the deprecated function's behavior.
export { neutralizeEditOpLines, neutralizeEditOpLine } from './format-aware-parse.js';
