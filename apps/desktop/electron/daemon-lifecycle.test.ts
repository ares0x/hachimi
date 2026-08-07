import { describe, expect, it } from "vitest";
import { DaemonLifecycle } from "./daemon-lifecycle.js";

function makeProbe(healthy: Set<number>) {
  return async (port: number) => healthy.has(port);
}

describe("DaemonLifecycle (L1-D1)", () => {
  it("attaches when the daemon is already online on the preferred port", async () => {
    const lifecycle = new DaemonLifecycle({
      port: 3700,
      isListening: makeProbe(new Set([3700])),
      spawnDaemon: () => {
        throw new Error("must not spawn when attaching");
      },
    });
    const result = await lifecycle.ensureRunning();
    expect(result.state).toBe("attached");
    expect(result.mode).toBe("attached");
    expect(result.port).toBe(3700);
    expect(lifecycle.state).toBe("attached");
  });

  it("spawns and waits for health on the preferred port", async () => {
    const healthy: Set<number> = new Set();
    const spawned: number[] = [];
    const lifecycle = new DaemonLifecycle({
      port: 3700,
      isListening: async (port) => {
        if (port === 3700 && spawned.length > 0) return true; // becomes healthy after spawn
        return healthy.has(port);
      },
      spawnDaemon: (port) => {
        spawned.push(port);
        return { pid: 4242 };
      },
      probeIntervalMs: 5,
      maxWaitMs: 1000,
    });
    const result = await lifecycle.ensureRunning();
    expect(result.state).toBe("ready");
    expect(result.mode).toBe("spawned");
    expect(result.port).toBe(3700);
    expect(spawned).toEqual([3700]);
  });

  it("falls back to the next port when the preferred port is occupied by something else", async () => {
    // 3700 is bound by a non-Hachimi service: our health probe never sees it,
    // and a daemon spawned there cannot bind → fall back to 3701.
    const spawned: number[] = [];
    const lc = new DaemonLifecycle({
      port: 3700,
      isListening: async (port) => spawned.includes(port) && port !== 3700,
      spawnDaemon: (port) => {
        spawned.push(port);
        return { pid: port };
      },
      probeIntervalMs: 5,
      maxWaitMs: 1000,
    });
    const result = await lc.ensureRunning();
    expect(result.mode).toBe("spawned");
    expect(result.port).toBe(3701);
    expect(spawned).toEqual([3700, 3701]);
    expect(result.state).toBe("ready");
  });

  it("fails cleanly when no port becomes healthy", async () => {
    const lifecycle = new DaemonLifecycle({
      port: 3700,
      isListening: async () => false,
      spawnDaemon: () => ({ pid: 1 }),
      probeIntervalMs: 5,
      maxWaitMs: 50,
      maxPortTries: 2,
    });
    const result = await lifecycle.ensureRunning();
    expect(result.state).toBe("failed");
    expect(result.error).toBeDefined();
    expect(lifecycle.state).toBe("failed");
  });

  it("stop() is a no-op when attached", () => {
    const lifecycle = new DaemonLifecycle({ port: 3700 });
    lifecycle.state = "attached";
    lifecycle.stop();
    expect(lifecycle.state).toBe("stopped");
  });
});
