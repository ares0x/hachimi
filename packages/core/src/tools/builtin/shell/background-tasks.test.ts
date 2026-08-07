// packages/core/src/tools/builtin/shell/background-tasks.test.ts

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../../../runtime/harness-runtime.js";
import { BackgroundTaskManager } from "../../../tasks/background-task-manager.js";
import { ToolRegistry } from "../../registry.js";
import { registerBuiltinTools } from "../index.js";

function makeRegistry() {
  const registry = new ToolRegistry({ workspaceRoot: mkdtempSync(join(tmpdir(), "hachimi-bg-")) });
  registerBuiltinTools(registry);
  return registry;
}

describe("Background task tools (P0-3)", () => {
  it("run_command with background:true returns a task_id, then get output", async () => {
    const registry = makeRegistry();
    const mgr = new BackgroundTaskManager();

    const start = await registry.execute(
      "run_command",
      { command: "sleep 0.2 && echo bg-done", background: true },
      { backgroundTasks: mgr, confirm: true }
    );
    expect(start).toContain("task_id=");
    const taskId = start.match(/task_id=((?:bg_|task_)[A-Za-z0-9_-]+)/)?.[1];
    expect(taskId).toBeTruthy();

    const poll = await registry.execute(
      "get_command_or_subagent_output",
      { task_id: taskId, timeout_ms: 5000 },
      { backgroundTasks: mgr }
    );
    expect(poll).toContain("已完成");
    expect(poll).toContain("bg-done");
  });

  it("get_command_or_subagent_output reports unknown task", async () => {
    const registry = makeRegistry();
    const mgr = new BackgroundTaskManager();
    const res = await registry.execute(
      "get_command_or_subagent_output",
      { task_id: "task_missing" },
      { backgroundTasks: mgr }
    );
    expect(res).toContain("未找到任务");
  });

  it("wait_commands_or_subagents actually waits for async sub-agents (P2.8)", async () => {
    const registry = makeRegistry();
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = runtime.subAgentDelegator;

    const dispatch = await delegator
      .getDelegationTool()
      .execute({ taskDescription: "调研任务", async: true }, { sessionId: "work_parent" });
    const taskId = dispatch.match(/task_sub_[A-Za-z0-9-]+/)?.[0];
    expect(taskId).toBeTruthy();

    const res = await registry.execute(
      "wait_commands_or_subagents",
      { task_ids: [taskId], mode: "all", timeout_ms: 10000 },
      { subAgents: delegator }
    );
    expect(res).toContain("已完成");
  });

  it("get_command_or_subagent_output waits for async sub-agent completion (P2.8)", async () => {
    const registry = makeRegistry();
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = runtime.subAgentDelegator;

    const dispatch = await delegator
      .getDelegationTool()
      .execute({ taskDescription: "调研任务", async: true }, { sessionId: "work_parent" });
    const taskId = dispatch.match(/task_sub_[A-Za-z0-9-]+/)?.[0];
    expect(taskId).toBeTruthy();

    const res = await registry.execute(
      "get_command_or_subagent_output",
      { task_id: taskId, timeout_ms: 10000 },
      { subAgents: delegator }
    );
    expect(res).toContain("已完成");
  });

  it("wait_commands_or_subagents waits for both tasks", async () => {
    const registry = makeRegistry();
    const mgr = new BackgroundTaskManager();
    const t1 = mgr.startCommand("sleep 0.05 && echo A");
    const t2 = mgr.startCommand("sleep 0.1 && echo B");

    const res = await registry.execute(
      "wait_commands_or_subagents",
      { task_ids: [t1.taskId, t2.taskId], mode: "all", timeout_ms: 5000 },
      { backgroundTasks: mgr }
    );
    expect(res).toContain("A");
    expect(res).toContain("B");
  });

  it("kill_command_or_subagent kills a running task", async () => {
    const registry = makeRegistry();
    const mgr = new BackgroundTaskManager();
    const t = mgr.startCommand("sleep 30");

    const res = await registry.execute(
      "kill_command_or_subagent",
      { task_id: t.taskId },
      { backgroundTasks: mgr, confirm: true }
    );
    expect(res).toContain("已发送终止信号");

    const after = await mgr.getOutput(t.taskId, 3000);
    expect(["killed", "failed"]).toContain(after?.status);
  });
});
