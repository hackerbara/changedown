#!/usr/bin/env node
export { handleStop } from './adapters/claude-code/stop.js';
export type { StopResult } from './adapters/claude-code/stop.js';
export { findEditPosition } from './core/edit-positioning.js';
export { findDeletionInsertionPoint } from './core/edit-positioning.js';
