// packages/core/src/tasks/task-registry.test.ts
//
// P1.7 统一任务注册表：
// - registerTask / updateTaskState / getTask / listTasks / deleteTask 生命周期
// - 子代理与后台任务共用同一注册表，按 taskKind 聚合查询
import { describe, expect, it } from "vitest";
import type { SubAgentTaskState } from "../agent/sub-agent.js";
import type { BackgroundTask } from "./background-task-manager.js";
import { TaskRegistry } from "./task-registry.js";

describe("P1.7 unified task registry", () => {
  it("registers and queries tasks by kind", () => {
    const registry = new TaskRegistry();

    const sub: SubAgentTaskState = {
      taskId: "task_sub_abc",
      taskKind: "subagent",
      subSessionId: "sess_sub_1",
      taskDescription: "调研依赖",
      status: "running",
      durationMs: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const bg: BackgroundTask = {
      taskId: "bg_xyz",
      taskKind: "background",
      status: "running",
      startedAt: 2000,
      createdAt: 2000,
      updatedAt: 2000,
      output: "",
    };

    registry.registerTask(sub);
    registry.registerTask(bg);

    expect(registry.getTask("task_sub_abc")).toBeDefined();
    expect(registry.listTasks("subagent")).toHaveLength(1);
    expect(registry.listTasks("background")).toHaveLength(1);
    expect(registry.listTasks()).toHaveLength(2);
  });

  it("updateTaskState patches status/error and bumps updatedAt", () => {
    const registry = new TaskRegistry();
    registry.registerTask({
      taskId: "bg_1",
      taskKind: "background",
      status: "running",
      startedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      output: "",
    } as BackgroundTask);

    const updated = registry.updateTaskState<BackgroundTask>("bg_1", {
      status: "failed",
      error: "boom",
      exitCode: 1,
    });
    expect(updated?.status).toBe("failed");
    expect(updated?.error).toBe("boom");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(1);

    expect(registry.updateTaskState("missing", { status: "completed" })).toBeUndefined();
  });

  it("deleteTask removes a task; clear empties the registry", () => {
    const registry = new TaskRegistry();
    registry.registerTask({
      taskId: "bg_a",
      taskKind: "background",
      status: "running",
      startedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      output: "",
    } as BackgroundTask);

    expect(registry.deleteTask("bg_a")).toBe(true);
    expect(registry.deleteTask("bg_a")).toBe(false);
    registry.registerTask({
      taskId: "bg_b",
      taskKind: "background",
      status: "completed",
      startedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      output: "",
    } as BackgroundTask);
    registry.clear();
    expect(registry.listTasks()).toHaveLength(0);
  });
});
