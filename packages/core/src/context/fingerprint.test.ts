// packages/core/src/context/fingerprint.test.ts
//
// P1.2 静态前缀指纹：
// - 相同 identity/skills/tools → 指纹稳定（Prompt Cache 友好）
// - 跨轮变化 → 注入缓存失效提示 + 指纹更新
import { describe, expect, it } from "vitest";
import { ContextBuilder } from "./builder.js";

function toolsMock(names: string[]) {
  return {
    list: () => names.map((n) => ({ name: n, permission: "safe" })),
    get: () => undefined,
    getActivatedGroups: () => [],
  } as any;
}

describe("P1.2 immutable-prefix fingerprinting", () => {
  it("fingerprint is stable across identical builds", async () => {
    const builder = new ContextBuilder("identity-v1");
    const input = {
      userInput: "hi",
      tools: toolsMock(["read_file", "write_file"]),
      options: { mode: "normal" as const },
      tokenEstimator: () => 100,
    };
    const r1 = await builder.build(input);
    const r2 = await builder.build(input);
    expect(r1.parts.staticFingerprint).toBe(r2.parts.staticFingerprint);
    expect(r1.parts.staticFingerprint?.length).toBeGreaterThan(0);
  });

  it("tool set change invalidates cache and injects a reminder once", async () => {
    const builder = new ContextBuilder("identity-v1");
    const base = {
      userInput: "hi",
      tools: toolsMock(["read_file", "write_file"]),
      options: { mode: "normal" as const },
      tokenEstimator: () => 100,
    };
    const r1 = await builder.build(base);
    expect(r1.parts.staticFingerprint).toBeDefined();
    expect(r1.systemPrompt).not.toContain("上下文缓存已失效");

    // 工具集变化（新增工具）→ 指纹变化 → 注入失效提示
    const r2 = await builder.build({
      ...base,
      tools: toolsMock(["read_file", "write_file", "browser_navigate"]),
    });
    expect(r2.parts.staticFingerprint).not.toBe(r1.parts.staticFingerprint);
    expect(r2.systemPrompt).toContain("上下文缓存已失效");

    // 保持与 r2 相同的工具集 → 指纹不变 → 不再注入（提示仅一轮）
    const r3 = await builder.build({
      ...base,
      tools: toolsMock(["read_file", "write_file", "browser_navigate"]),
    });
    expect(r3.parts.staticFingerprint).toBe(r2.parts.staticFingerprint);
    expect(r3.systemPrompt).not.toContain("上下文缓存已失效");
  });
});
