import type { BridgeConfig } from './types.js';

const NAMESPACE = 'changedown.lexicalBridge';

const DEFAULT_CONFIG: BridgeConfig = {
  enabled: true,
  smartView: true,
  authorColors: {},
};

export function readConfig(): BridgeConfig {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}.config`);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function isEnabled(): boolean {
  try {
    const val = localStorage.getItem(`${NAMESPACE}.enabled`);
    return val !== 'false';
  } catch {
    return true;
  }
}
