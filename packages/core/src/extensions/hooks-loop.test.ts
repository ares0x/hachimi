// packages/core/src/extensions/hooks-loop.test.ts
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { HookRegistry } from "./hooks.js";

describe("H2.6 Lifecycle Hooks Integration Suite", () => {
  it("executes preToolCall and postToolCall hooks during tool execution pipeline", async () => {
    const hooks = new HookRegistry();
    const registry = new ToolRegistry();

    const preSpy = vi.fn();
    const postSpy = vi.fn();

    hooks.onPreToolCall((ctx) => {
      preSpy(ctx.toolName, ctx.args);
      return { action: "allow", modifiedArgs: { input: "modified_val" } };
    });

    hooks.onPostToolCall((ctx) => {
      postSpy(ctx.toolName, ctx.result);
      return { modifiedResult: `${ctx.result} [hooked]` };
    });

    registry.register({
      name: "echo_tool",
      description: "回显工具",
      permission: "safe",
      parameters: {},
      execute: async (args) => `echo:${args.input}`,
    });

    const result = await registry.execute("echo_tool", { input: "original_val" }, { hooks });

    expect(preSpy).toHaveBeenCalledWith("echo_tool", { input: "original_val" });
    expect(postSpy).toHaveBeenCalled();
    expect(result).toBe("echo:modified_val [hooked]");
  });

  it("blocks tool execution when preToolCall returns block action", async () => {
    const hooks = new HookRegistry();
    const registry = new ToolRegistry();

    hooks.onPreToolCall(() => ({
      action: "block",
      reason: "[安全策略] 阻止危险参数调用",
    }));

    registry.register({
      name: "guarded_tool",
      description: "受保护工具",
      permission: "safe",
      parameters: {},
      execute: async () => "should_not_run",
    });

    const result = await registry.execute("guarded_tool", {}, { hooks });
    expect(result).toContain("[安全策略] 阻止危险参数调用");
  });
});
