// packages/core/src/context/compaction-breaker.test.ts
//
// P0.3 Compaction circuit breaker：
// - 连续压缩失败达到阈值 → 熔断（停止自动压缩，防死锁循环）
// - 一次成功复位计数；手动 reset 恢复自动压缩
import { describe, expect, it } from "vitest";
import { ContextBuilder, MAX_CONSECUTIVE_COMPACTION_FAILURES } from "./builder.js";

function makeHistory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg_${i}`,
    role: "user" as const,
    content: "x".repeat(800),
    timestamp: Date.now() + i,
  }));
}

describe("P0.3 Compaction circuit breaker", () => {
  it("opens after consecutive compaction failures and pauses auto-compaction", async () => {
    const builder = new ContextBuilder();
    const history = makeHistory(14);

    for (let i = 0; i < MAX_CONSECUTIVE_COMPACTION_FAILURES; i++) {
      // 有状态 estimator：第 1 次返回超大数触发压缩，之后抛错模拟压缩失败
      let calls = 0;
      const explodingEstimator = (text: string): number => {
        calls++;
        if (calls === 1) return 1_000_000; // ratio >> 95%
        throw new Error("estimator exploded");
      };
      await builder.build({
        userInput: "test",
        history,
        workId: "w_breaker",
        options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
        tokenEstimator: explodingEstimator,
      });
    }

    expect(builder.isCompactionBreakerOpen("w_breaker")).toBe(true);

    // 熔断后：同一输入不再尝试压缩（estimator 只被调用一次做 ratio 计算）
    let calls = 0;
    const quietEstimator = (): number => {
      calls++;
      return 1_000_000;
    };
    const res = await builder.build({
      userInput: "test",
      history,
      workId: "w_breaker",
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: quietEstimator,
    });
    expect(res.systemPrompt).toBeDefined();
    expect(calls).toBe(1); // 只做了 ratio 计算，未进入压缩
  });

  it("a successful compaction resets the failure counter", async () => {
    const builder = new ContextBuilder();
    const history = makeHistory(14);

    // 1 次失败
    let calls = 0;
    await builder.build({
      userInput: "test",
      history,
      workId: "w_reset",
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: (text: string): number => {
        calls++;
        if (calls === 1) return 1_000_000;
        throw new Error("estimator exploded");
      },
    });
    expect(builder.isCompactionBreakerOpen("w_reset")).toBe(false);

    // 1 次成功（正常 estimator）→ 计数复位
    await builder.build({
      userInput: "test",
      history,
      workId: "w_reset",
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: (text: string): number => 1000,
    });

    // 再失败 2 次（未达阈值 3）→ 仍不熔断
    for (let i = 0; i < MAX_CONSECUTIVE_COMPACTION_FAILURES - 1; i++) {
      let c = 0;
      await builder.build({
        userInput: "test",
        history,
        workId: "w_reset",
        options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
        tokenEstimator: (text: string): number => {
          c++;
          if (c === 1) return 1_000_000;
          throw new Error("estimator exploded");
        },
      });
    }
    expect(builder.isCompactionBreakerOpen("w_reset")).toBe(false);
  });

  it("resetCompactionBreaker restores auto-compaction", async () => {
    const builder = new ContextBuilder();
    const history = makeHistory(14);

    for (let i = 0; i < MAX_CONSECUTIVE_COMPACTION_FAILURES; i++) {
      let calls = 0;
      await builder.build({
        userInput: "test",
        history,
        workId: "w_reset2",
        options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
        tokenEstimator: (text: string): number => {
          calls++;
          if (calls === 1) return 1_000_000;
          throw new Error("estimator exploded");
        },
      });
    }
    expect(builder.isCompactionBreakerOpen("w_reset2")).toBe(true);

    builder.resetCompactionBreaker("w_reset2");
    expect(builder.isCompactionBreakerOpen("w_reset2")).toBe(false);
  });
});
