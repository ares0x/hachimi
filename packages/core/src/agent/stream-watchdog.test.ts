import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamWatchdogError, withStreamWatchdog } from "./stream-watchdog.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("withStreamWatchdog", () => {
  it("resolves when the call completes before the connect timeout", async () => {
    vi.useFakeTimers();
    const promise = withStreamWatchdog(
      { connectTimeoutMs: 1000, idleTimeoutMs: 5000 },
      async () => "ok"
    );
    await expect(promise).resolves.toBe("ok");
  });

  it("rejects with StreamWatchdogError when no chunk arrives", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const promise = withStreamWatchdog(
      { connectTimeoutMs: 1000, idleTimeoutMs: 5000, onTimeout },
      async () => new Promise<string>(() => {})
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(StreamWatchdogError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(onTimeout).toHaveBeenCalledWith("connect");
  });

  it("rejects when the stream goes idle mid-response", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const promise = withStreamWatchdog(
      { connectTimeoutMs: 1000, idleTimeoutMs: 2000, onTimeout },
      async (_signal, activity) =>
        new Promise<string>((resolve) => {
          activity(); // first chunk arrived
          setTimeout(() => resolve("done"), 10_000); // then silence
        })
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(StreamWatchdogError);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(2000); // idle budget exhausted
    await assertion;
    expect(onTimeout).toHaveBeenCalledWith("idle");
  });

  it("keeps the stream alive while chunks keep arriving", async () => {
    vi.useFakeTimers();
    let settled = false;
    const promise = withStreamWatchdog(
      { connectTimeoutMs: 1000, idleTimeoutMs: 300 },
      async (_signal, activity) =>
        new Promise<string>((resolve) => {
          const interval = setInterval(() => activity(), 100);
          setTimeout(() => {
            clearInterval(interval);
            settled = true;
            resolve("streamed");
          }, 1500);
        })
    );
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).resolves.toBe("streamed");
    expect(settled).toBe(true);
  });

  it("propagates the underlying error (e.g. external abort)", async () => {
    vi.useFakeTimers();
    const boom = new Error("user cancelled");
    const promise = withStreamWatchdog(
      { connectTimeoutMs: 1000, idleTimeoutMs: 5000 },
      async () => {
        throw boom;
      }
    );
    await expect(promise).rejects.toBe(boom);
  });
});
