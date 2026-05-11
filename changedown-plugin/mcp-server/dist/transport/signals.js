// src/transport/signals.ts
function installSignalHandlers(stack) {
  let disposing = false;
  const trigger = (reason) => {
    if (disposing) return;
    disposing = true;
    console.error(`[changedown] ${reason} received \u2014 disposing`);
    const escalation = setTimeout(() => {
      console.error("[changedown] dispose timeout \u2014 force exit");
      process.exit(1);
    }, 3e3);
    escalation.unref();
    stack.disposeAsync().then(() => {
      clearTimeout(escalation);
      process.exit(0);
    }).catch((err) => {
      clearTimeout(escalation);
      console.error("[changedown] dispose rejected:", err);
      process.exit(1);
    });
  };
  process.once("SIGINT", () => trigger("SIGINT"));
  process.once("SIGTERM", () => trigger("SIGTERM"));
  process.stdin.on("end", () => trigger("stdin-end"));
  process.stdin.on("error", () => trigger("stdin-error"));
  process.stdin.resume();
}
export {
  installSignalHandlers
};
//# sourceMappingURL=signals.js.map
