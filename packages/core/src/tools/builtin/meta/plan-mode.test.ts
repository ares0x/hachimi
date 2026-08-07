// packages/core/src/tools/builtin/meta/plan-mode.test.ts
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateId } from "@hachimi/shared";
import { FileDirStore } from "@hachimi/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../../session/manager.js";
import { registerBuiltinTools } from "../../builtin/index.js";
import { ToolRegistry } from "../../registry.js";

const dir = join(process.cwd(), "data-test-planmode");

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry({ workspaceRoot: dir });
  registerBuiltinTools(registry);
  return registry;
}

describe("Plan Mode (P0-2)", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("registry blocks write tools in plan mode with valid args", async () => {
    const registry = makeRegistry();
    const target = join(dir, "x.txt");
    const res = await registry.execute(
      "write_file",
      { path: target, content: "hello" },
      { planMode: true, workspaceRoot: dir }
    );
    expect(res).toContain("[Plan Mode]");
    expect(existsSync(target)).toBe(false);
  });

  it("registry blocks shell run_command in plan mode", async () => {
    const registry = makeRegistry();
    const res = await registry.execute(
      "run_command",
      { command: "echo hi > out.txt" },
      { planMode: true, workspaceRoot: dir }
    );
    expect(res).toContain("[Plan Mode]");
  });

  it("registry allows read-only tools and plan tools in plan mode", async () => {
    const registry = makeRegistry();
    const res = await registry.execute(
      "read_file",
      { path: join(dir, "nope.txt") },
      { planMode: true, workspaceRoot: dir }
    );
    expect(res).not.toContain("[Plan Mode]");

    const planRes = await registry.execute(
      "update_work_plan",
      { steps: [{ title: "s1", status: "pending" }] },
      { planMode: true, workspaceRoot: dir }
    );
    expect(planRes).not.toContain("[Plan Mode]");
  });

  it("SessionManager persists plan mode", () => {
    const sessions = new SessionManager(join(dir, "sessions"), new FileDirStore());
    const sid = generateId("sess_");
    sessions.create("测试", sid);
    expect(sessions.getMode(sid)).toBe("normal");
    expect(sessions.setMode(sid, "plan")).toBe(true);
    expect(sessions.getMode(sid)).toBe("plan");
    // 重新加载后仍为 plan
    const reloaded = new SessionManager(join(dir, "sessions"), new FileDirStore());
    expect(reloaded.getMode(sid)).toBe("plan");
  });

  it("enter_plan_mode / exit_plan_mode toggle via injected sessionMode", async () => {
    const registry = makeRegistry();
    const sessions = new SessionManager(join(dir, "sessions"), new FileDirStore());
    const sid = generateId("sess_");
    sessions.create("plan流", sid);
    const sessionMode = {
      get: () => sessions.getMode(sid),
      set: (mode: "normal" | "plan") => sessions.setMode(sid, mode),
    };

    const enter = await registry.execute(
      "enter_plan_mode",
      { topic: "重构" },
      { planMode: false, confirm: true, sessionMode, workspaceRoot: dir }
    );
    expect(enter).toContain("[Plan Mode] 已进入计划模式");
    expect(sessions.getMode(sid)).toBe("plan");

    // 计划模式下 update_work_plan 放行、write_file 被拦
    const plan = await registry.execute(
      "update_work_plan",
      {
        steps: [
          { title: "调研", status: "pending" },
          { title: "实现", status: "pending" },
        ],
      },
      { planMode: true, sessionMode, workspaceRoot: dir }
    );
    expect(plan).toContain("[Plan 已更新]");

    const blocked = await registry.execute(
      "write_file",
      { path: join(dir, "y.txt"), content: "x" },
      { planMode: true, sessionMode, workspaceRoot: dir }
    );
    expect(blocked).toContain("[Plan Mode]");

    const exit = await registry.execute(
      "exit_plan_mode",
      {},
      { planMode: true, confirm: true, sessionMode, workspaceRoot: dir }
    );
    expect(exit).toContain("[Plan Mode] 已退出计划模式");
    expect(sessions.getMode(sid)).toBe("normal");
  });
});

describe("Plan Mode end-to-end via HarnessRuntime", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("blocks write tools through the full agent loop", async () => {
    const { createHarnessRuntime } = await import("../../../runtime/harness-runtime.js");
    const dataDir = join(dir, "runtime");
    const runtime = createHarnessRuntime({
      providerOverride: "mock",
      configOverride: {
        paths: {
          dataDir,
          memoryFile: join(dataDir, "memory.json"),
          sessionsDir: join(dataDir, "sessions"),
        },
      } as never,
    });
    const sid = generateId("sess_");
    runtime.sessions.create("plan 会话", sid);
    runtime.sessions.setMode(sid, "plan");

    const target = join(dataDir, "evil.txt");
    const out = await runtime.execute({
      prompt: `调用工具 write_file（参数 path=${target}, content=hello）`,
      sessionId: sid,
      channel: "cli",
    });

    expect(out.content).toContain("[Plan Mode]");
    expect(existsSync(target)).toBe(false);
    // 事件流里应记录 plan_mode_changed / 工具调用，但无文件副作用
    expect(runtime.sessions.getMode(sid)).toBe("plan");
  });
});
