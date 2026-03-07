/**
 * Internal exports for test consumption.
 *
 * This barrel re-exports symbols that tests need but that aren't
 * necessarily part of the stable public API (index.ts).  Today
 * everything happens to also appear in index.ts — but as the
 * public API gets trimmed, test-only symbols will migrate here.
 *
 * Import with:  import { ... } from '@changetracks/core/internals';
 */

// Re-export everything from the public surface so test files
// can use a single import specifier for both public and internal symbols.
export * from './index.js';
