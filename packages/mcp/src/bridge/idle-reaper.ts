// Idle reaper for the bridge daemon. Polls isActive() at checkIntervalMs;
// when isActive() has been false continuously for idleTimeoutMs, calls
// onIdle() exactly once.
//
// Design doc: docs/superpowers/specs/2026-05-15-changedown-mcp-bridge-split-design.md

export interface IdleReaperOptions {
  idleTimeoutMs: number;
  checkIntervalMs: number;
  isActive: () => boolean;
  onIdle: () => void;
}

export class IdleReaper {
  private timer: NodeJS.Timeout | null = null;
  private idleSince: number | null = null;
  private fired = false;
  private readonly opts: IdleReaperOptions;
  private readonly now: () => number;

  constructor(opts: IdleReaperOptions, now: () => number = Date.now) {
    this.opts = opts;
    this.now = now;
  }

  start(): void {
    if (this.timer) return;
    this.idleSince = this.opts.isActive() ? null : this.now();
    this.timer = setInterval(() => this.tick(), this.opts.checkIntervalMs);
    // Don't keep the event loop alive just for the reaper.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.fired) return;
    if (this.opts.isActive()) {
      this.idleSince = null;
      return;
    }
    const t = this.now();
    if (this.idleSince === null) {
      this.idleSince = t;
      return;
    }
    if (t - this.idleSince >= this.opts.idleTimeoutMs) {
      this.fired = true;
      this.opts.onIdle();
    }
  }
}
