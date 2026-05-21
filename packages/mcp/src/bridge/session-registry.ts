// In-memory session registry on the bridge side. One entry per stdio MCP
// process that has called POST /sessions. Idle sessions expire after
// idleTimeoutMs since their last lookup (a `word-op` POST counts as a lookup).
//
// Token uses crypto.randomBytes(16).toString('hex') = 32 hex chars.
//
// Design doc: docs/superpowers/specs/2026-05-15-changedown-mcp-bridge-split-design.md

import { randomBytes } from 'node:crypto';

export interface SessionMeta {
  tool: string;
  pid: number;
  sessionId: string;
}

export interface SessionEntry extends SessionMeta {
  token: string;
  registeredAt: number;
  lastSeenAt: number;
}

export interface SessionRegistryOptions {
  idleTimeoutMs: number;
  /** Override for tests. */
  now?: () => number;
}

export class SessionRegistry {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly idleTimeoutMs: number;
  private readonly now: () => number;

  constructor(opts: SessionRegistryOptions) {
    this.idleTimeoutMs = opts.idleTimeoutMs;
    this.now = opts.now ?? Date.now;
  }

  register(meta: SessionMeta): { token: string } {
    const token = randomBytes(16).toString('hex');
    const t = this.now();
    this.entries.set(token, { ...meta, token, registeredAt: t, lastSeenAt: t });
    return { token };
  }

  lookup(token: string): SessionEntry | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    const t = this.now();
    if (t - entry.lastSeenAt > this.idleTimeoutMs) {
      this.entries.delete(token);
      return null;
    }
    entry.lastSeenAt = t;
    return entry;
  }

  unregister(token: string): void {
    this.entries.delete(token);
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [token, entry] of this.entries) {
      if (now - entry.lastSeenAt > this.idleTimeoutMs) {
        this.entries.delete(token);
      }
    }
  }

  size(): number {
    this.purgeExpired();
    return this.entries.size;
  }
}
