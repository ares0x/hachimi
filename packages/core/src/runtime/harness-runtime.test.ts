// packages/core/src/runtime/harness-runtime.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime, getOrCreateHarnessRuntime } from "./harness-runtime.js";

describe("HarnessRuntime Core Unified Orchestration Engine", () => {
  it("executes multi-surface prompt via unified runtime.execute()", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    // 执行 CLI 通道
    const cliOutput = await runtime.execute({
      prompt: "用一句话介绍自己",
      channel: "cli",
    });
    expect(cliOutput.sessionId).toBeDefined();
    expect(cliOutput.content).toBeDefined();
    expect(cliOutput.channel).toBe("cli");

    // 执行 Telegram 通道共享同一 Session 机制
    const tgOutput = await runtime.execute({
      prompt: "再推荐一个工具",
      sessionId: cliOutput.sessionId,
      channel: "telegram",
    });
    expect(tgOutput.sessionId).toBe(cliOutput.sessionId);
    expect(tgOutput.channel).toBe("telegram");
  });

  it("provides getOrCreateHarnessRuntime singleton instance", () => {
    const r1 = getOrCreateHarnessRuntime({ providerOverride: "mock" });
    const r2 = getOrCreateHarnessRuntime();
    expect(r1).toBe(r2);
  });

  it("delegates steer, getStatus, exportBundle and importBundle correctly", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    const status = runtime.getStatus();
    expect(status.title).toBe("hachimi");

    const bundle = await runtime.exportBundle();
    expect(bundle.schemaVersion).toBe(1);

    const importRes = await runtime.importBundle(bundle, { mergeStrategy: "additive" });
    expect(importRes.success).toBe(true);
  });
});
