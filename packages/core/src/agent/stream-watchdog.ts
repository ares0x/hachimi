/**
 * P2-B5: Model stream watchdog (pattern: maka `StreamWatchdog`).
 *
 * Two phases guard every streaming model call:
 *   - connect: no chunk has arrived yet (server stalled / bad route)
 *   - idle:    chunks stopped arriving mid-stream (half-open connection)
 *
 * Permission waits are naturally excluded: the watchdog is scoped to a single
 * model call, and the model stream has already ended before the loop blocks on
 * user approval. On timeout the call is aborted and a descriptive error is
 * thrown so the harness error boundary / circuit breaker can react.
 */

export type StreamWatchdogPhase = "connect" | "idle";

export interface StreamWatchdogOptions {
  /** Max ms before the first chunk. Default 30_000. */
  connectTimeoutMs?: number;
  /** Max ms between chunks once streaming. Default 120_000. */
  idleTimeoutMs?: number;
  /** Called when a phase times out (after abort). */
  onTimeout?: (phase: StreamWatchdogPhase) => void;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

export class StreamWatchdogError extends Error {
  readonly phase: StreamWatchdogPhase;

  constructor(phase: StreamWatchdogPhase) {
    super(`Model stream timed out during ${phase} phase`);
    this.name = "StreamWatchdogError";
    this.phase = phase;
  }
}

/**
 * Run a streaming call under connect/idle supervision.
 * `run(signal, activity)` must call `activity()` whenever a chunk arrives.
 */
export async function withStreamWatchdog<T>(
  opts: StreamWatchdogOptions,
  run: (signal: AbortSignal, activity: () => void) => Promise<T>
): Promise<T> {
  const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const controller = new AbortController();

  let started = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = (): void => {
    if (connectTimer) clearTimeout(connectTimer);
    if (idleTimer) clearTimeout(idleTimer);
    connectTimer = undefined;
    idleTimer = undefined;
  };

  return await new Promise<T>((resolve, reject) => {
    const fail = (phase: StreamWatchdogPhase): void => {
      clearTimers();
      controller.abort();
      opts.onTimeout?.(phase);
      reject(new StreamWatchdogError(phase));
    };

    connectTimer = setTimeout(() => {
      if (!started && !controller.signal.aborted) fail("connect");
    }, connectTimeoutMs);

    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (started && !controller.signal.aborted) fail("idle");
      }, idleTimeoutMs);
    };

    const activity = (): void => {
      started = true;
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }
      armIdle();
    };

    run(controller.signal, activity).then(
      (value) => {
        clearTimers();
        resolve(value);
      },
      (err: unknown) => {
        clearTimers();
        reject(err);
      }
    );
  });
}
