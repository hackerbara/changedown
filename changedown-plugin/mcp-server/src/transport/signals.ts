// changedown-plugin/mcp-server/src/transport/signals.ts

/**
 * Wire all teardown signals (SIGINT, SIGTERM, stdin-end, stdin-error) to a
 * single `stack.disposeAsync()` call. The stack is idempotent — repeated
 * dispose calls are no-ops — so racing signals can't double-tear-down.
 *
 * Two failure modes are explicitly handled:
 *   - Disposer THROWS: caught and turned into a fast non-zero exit. Without
 *     this, an unhandled rejection from the disposer chain would leave the
 *     process in a half-shut-down state.
 *   - Disposer HANGS: SIGKILL escalation timer (3 s) guarantees the process
 *     exits even if a disposer awaits forever.
 *
 * Both timers are unref'd so they don't keep the loop alive on their own.
 */
export function installSignalHandlers(stack: AsyncDisposableStack): void {
  let disposing = false;
  const trigger = (reason: string) => {
    if (disposing) return;
    disposing = true;
    console.error(`[changedown] ${reason} received — disposing`);

    // Escalation: if dispose hangs (e.g. a disposer awaits an unresolvable
    // promise), force-exit after 3 s. unref so the timer doesn't keep the
    // event loop alive on its own.
    const escalation = setTimeout(() => {
      console.error('[changedown] dispose timeout — force exit');
      process.exit(1);
    }, 3000);
    escalation.unref();

    stack
      .disposeAsync()
      .then(() => {
        clearTimeout(escalation);
        process.exit(0);
      })
      .catch((err) => {
        clearTimeout(escalation);
        console.error('[changedown] dispose rejected:', err);
        process.exit(1);
      });
  };

  process.once('SIGINT', () => trigger('SIGINT'));
  process.once('SIGTERM', () => trigger('SIGTERM'));
  process.stdin.on('end', () => trigger('stdin-end'));
  process.stdin.on('error', () => trigger('stdin-error'));
  // MCP SDK normally resumes stdin, but if it doesn't, 'end' never fires.
  process.stdin.resume();
}
