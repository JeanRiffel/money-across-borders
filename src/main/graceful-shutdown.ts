// Graceful shutdown for the HTTP process. Extracted from server.ts after a
// real incident: the old inline handler was `void shutdown(signal)` with no
// timeout, so when one of its awaits hung (node-redis marks the client
// closed *synchronously* inside quit(), before QUIT is answered), it never
// reached process.exit(0). The process stayed alive, still bound to PORT,
// answering every request with "The client is closed" / "Cannot use a pool
// after calling end on the pool" — while a freshly started instance sat idle
// next to it.
//
// The guarantees this gives instead:
// - steps run in the order given (callers put the HTTP server first, so no
//   new request is accepted once its dependencies start closing);
// - a failing step is logged and the remaining steps still run;
// - a second signal while already shutting down is a no-op instead of a
//   second pool.end() ("Called end on pool more than once");
// - exit() is ALWAYS called — either once every step settles, or by the
//   force-exit timer if any step hangs past timeoutMs.
// Every dependency (exit, timers, log) is injected so this is unit-testable
// without real Postgres/Redis — see
// __tests__/main/graceful-shutdown.test.ts.

export type ShutdownStep = {
  name: string;
  close: () => Promise<unknown>;
};

type ShutdownLogger = {
  info: (msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export type GracefulShutdownOptions = {
  steps: ShutdownStep[];
  log: ShutdownLogger;
  exit: (code: number) => void;
  timeoutMs: number;
};

export function createGracefulShutdown(
  options: GracefulShutdownOptions
): (signal: string) => Promise<void> {
  const { steps, log, exit, timeoutMs } = options;
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      log.info(`${signal} received while already shutting down, ignoring`);
      return;
    }
    shuttingDown = true;
    log.info(`${signal} received, shutting down (timeout ${timeoutMs}ms)...`);

    // Unref'd: if every step finishes early, this timer must not be the
    // thing keeping the event loop alive.
    const forceExitTimer = setTimeout(() => {
      log.error({ timeoutMs }, 'Graceful shutdown timed out, forcing exit');
      exit(1);
    }, timeoutMs);
    forceExitTimer.unref();

    let exitCode = 0;
    for (const step of steps) {
      try {
        // Promise.resolve().then() so a step that throws synchronously is
        // handled the same as one that rejects.
        await Promise.resolve().then(step.close);
        log.info(`✓ ${step.name} closed`);
      } catch (err) {
        exitCode = 1;
        log.error({ err }, `✗ Failed to close ${step.name}, continuing shutdown`);
      }
    }

    clearTimeout(forceExitTimer);
    exit(exitCode);
  };
}
