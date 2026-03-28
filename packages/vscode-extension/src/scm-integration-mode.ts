import * as vscode from 'vscode';

export type ScmIntegrationMode = 'scm-first' | 'hybrid' | 'legacy';

const VALID_MODES: ScmIntegrationMode[] = ['scm-first', 'hybrid', 'legacy'];
const DEFAULT_MODE: ScmIntegrationMode = 'scm-first';

/**
 * Returns the current SCM integration mode from configuration.
 * Used to gate legacy vs SCM-first behavior and to enable hybrid comparison.
 */
export function getScmIntegrationMode(): ScmIntegrationMode {
  const raw = vscode.workspace.getConfiguration('changedown').get<string>('scmIntegrationMode', DEFAULT_MODE);
  return VALID_MODES.includes(raw as ScmIntegrationMode) ? (raw as ScmIntegrationMode) : DEFAULT_MODE;
}

/**
 * Instrumentation for comparing SCM-first vs legacy usage during rollout.
 * In hybrid mode, call this when user takes an action (e.g. open diff from SCM vs from command).
 * Structured logs can be used for comparison metrics (Section 5 of the plan).
 */
export function recordScmIntegrationEvent(event: string, source: 'scm' | 'legacy'): void {
  if (getScmIntegrationMode() !== 'hybrid') return;
  // Structured debug log; can be replaced with telemetry or metrics in production
  console.debug(`[changedown] scm_integration: event=${event} source=${source}`);
}
