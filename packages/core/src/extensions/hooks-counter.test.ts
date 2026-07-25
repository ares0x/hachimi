// packages/core/src/extensions/hooks-counter.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";

describe("P1 HookRegistry Full Execution Counter Suite", () => {
  it("triggers sessionStart, preToolCall, and postToolCall during runtime execute", async () => {
    let sessionStartCount = 0;
    let preToolCount = 0;
    let postToolCount = 0;

    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    runtime.hooks.onSessionStart(() => {
      sessionStartCount++;
    });

    runtime.hooks.onPreToolCall(() => {
      preToolCount++;
      return { action: "allow" };
    });

    runtime.hooks.onPostToolCall(() => {
      postToolCount++;
    });

    // 触发单轮交互
    await runtime.execute({ prompt: "你好！", channel: "cli" });

    expect(sessionStartCount).toBeGreaterThanOrEqual(1);

    // 测试工具调用的 Hook 触发
    await runtime.tools.execute(
      "calculator",
      { a: 2, b: 3, operator: "+" },
      { hooks: runtime.hooks }
    );

    expect(preToolCount).toBeGreaterThanOrEqual(1);
    expect(postToolCount).toBeGreaterThanOrEqual(1);
  });
});
