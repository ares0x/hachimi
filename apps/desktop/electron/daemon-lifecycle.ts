// apps/desktop/electron/daemon-lifecycle.ts
/**
 * L1 (D1): Daemon process lifecycle manager — Electron-free pure logic.
 *
 * Injectable probe/spawn so it can be unit-tested without Electron:
 *  - probe candidate ports; if a healthy Hachimi daemon already answers → attach
 *  - otherwise spawn the daemon on a free port (fallback +N on conflicts)
 *  - wait for health up to maxWaitMs; surface failure instead of hanging
 */

export type DaemonLifecycleState = "stopped" | "attached" | "spawning" | "ready" | "failed";

export interface DaemonLifecycleResult {
  state: Exclude<DaemonLifecycleState, "stopped" | "spawning">;
  port: number;
  /** "attached" = already online; "spawned" = we started it */
  mode: "attached" | "spawned";
  error?: string;
}

export interface DaemonLifecycleOptions {
  /** Preferred daemon port (default 3700) */
  port?: number;
  host?: string;
  /** Health probe, e.g. GET http://host:port/health */
  isListening?: (port: number, host?: string) => Promise<boolean>;
  /** Spawn the daemon bound to the given port; return the child pid */
  spawnDaemon?: (port: number) => { pid?: number };
  /** How long to wait for the daemon to become healthy after spawn (ms) */
  maxWaitMs?: number;
  probeIntervalMs?: number;
  /** How many extra ports to try after the preferred one is occupied */
  maxPortTries?: number;
}

const DEFAULT_PORT = 3700;

export class DaemonLifecycle {
  private readonly basePort: number;
  private readonly host: string;
  private readonly isListening: (port: number, host?: string) => Promise<boolean>;
  private readonly spawnDaemon: (port: number) => { pid?: number };
  private readonly maxWaitMs: number;
  private readonly probeIntervalMs: number;
  private readonly maxPortTries: number;

  state: DaemonLifecycleState = "stopped";
  private childPid?: number;
  private lastError?: string;

  constructor(options: DaemonLifecycleOptions = {}) {
    this.basePort = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? "127.0.0.1";
    this.isListening = options.isListening ?? (async () => false);
    this.spawnDaemon = options.spawnDaemon ?? (() => ({}));
    this.maxWaitMs = options.maxWaitMs ?? 20_000;
    this.probeIntervalMs = options.probeIntervalMs ?? 250;
    this.maxPortTries = options.maxPortTries ?? 4;
  }

  getPort(): number {
    return this.basePort;
  }

  getError(): string | undefined {
    return this.lastError;
  }

  /** Probe a single port; false = port is free or unreachable */
  private async probe(port: number): Promise<boolean> {
    try {
      return await this.isListening(port, this.host);
    } catch {
      return false;
    }
  }

  private async waitForHealth(port: number): Promise<boolean> {
    const deadline = Date.now() + this.maxWaitMs;
    while (Date.now() < deadline) {
      if (await this.probe(port)) return true;
      await new Promise((r) => setTimeout(r, this.probeIntervalMs));
    }
    return false;
  }

  /**
   * Ensure the daemon is running and healthy.
   * - preferred port healthy → attach
   * - preferred port occupied but unhealthy → try fallback ports for spawning
   * - preferred port free → spawn, wait for health, else fail
   */
  async ensureRunning(): Promise<DaemonLifecycleResult> {
    // 1) Already online on the preferred port?
    if (await this.probe(this.basePort)) {
      this.state = "attached";
      return { state: "attached", port: this.basePort, mode: "attached" };
    }

    // 2) Pick a spawn port: try basePort, then fallbacks
    const candidates: number[] = [];
    for (let i = 0; i < this.maxPortTries; i++) {
      candidates.push(this.basePort + i);
    }

    for (const port of candidates) {
      if (await this.probe(port)) continue; // occupied by something else
      this.state = "spawning";
      const child = this.spawnDaemon(port);
      this.childPid = child.pid;
      if (await this.waitForHealth(port)) {
        this.state = "ready";
        return { state: "ready", port, mode: "spawned" };
      }
      this.lastError = `Daemon did not become healthy on port ${port} within ${this.maxWaitMs}ms`;
    }

    this.state = "failed";
    return {
      state: "failed",
      port: this.basePort,
      mode: "spawned",
      error:
        this.lastError ??
        `No free port found in ${candidates.length} attempts (${candidates.join(", ")})`,
    };
  }

  /** Stop a daemon we spawned (no-op for attached mode) */
  stop(): void {
    if (this.childPid && this.state !== "attached") {
      try {
        process.kill(this.childPid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
    this.childPid = undefined;
    this.state = "stopped";
  }
}
