// packages/core/src/sub-agent-scheduling.test.ts
//
// P1 子代理调度模块：并发信号量（超额排队）、取消（agent_kill）、
// 批量等待（agent_output）、每父会话派发上限（maxChildRuns）、
// 前缀歧义、任务列表（agent_list）、async 完成通知。
//
// 使用 fake runtime 以确定性方式控制 execute 的阻塞/中止。

import { describe, expect, it, vi } from "vitest";
import { SubAgentDelegator } from "./agent/sub-agent.js";

type FakeRuntime = {
  execute: (input: any) => Promise<any>;
  works: { get: () => undefined };
  events: { append: (event: any) => Promise<void> };
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function makeRuntime(execute: FakeRuntime["execute"], appended: any[] = []): FakeRuntime {
  return {
    execute,
    works: { get: () => undefined },
    events: { append: async (e) => void appended.push(e) },
  };
}

const okOutput = (sessionId = "sub") => ({ content: "ok", isError: false, sessionId });

describe("Sub-Agent scheduling: concurrency backpressure", () => {
  it("caps concurrent execution at maxConcurrent and queues the overflow", async () => {
    const gate = deferred();
    let active = 0;
    let maxActive = 0;
    const runtime = makeRuntime(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active--;
      return okOutput();
    });
    const delegator = new SubAgentDelegator(runtime as any, { maxConcurrent: 2 });

    const p1 = delegator.runSubAgent({ taskDescription: "t1" });
    const p2 = delegator.runSubAgent({ taskDescription: "t2" });
    const p3 = delegator.runSubAgent({ taskDescription: "t3" });
    const p4 = delegator.runSubAgent({ taskDescription: "t4" });

    await vi.waitFor(() => expect(active).toBe(2));
    expect(delegator.getRunningCount()).toBe(2);

    gate.resolve();
    const results = await Promise.all([p1, p2, p3, p4]);

    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
    expect(maxActive).toBe(2);
  });
});

describe("Sub-Agent scheduling: cancel / agent_kill", () => {
  it("aborts a running async task and marks it cancelled", async () => {
    const gate = deferred();
    const appended: any[] = [];
    const runtime = makeRuntime(async (input) => {
      await Promise.race([
        gate.promise,
        new Promise<never>((_, reject) =>
          input.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          })
        ),
      ]);
      return okOutput(input.sessionId);
    }, appended);
    const delegator = new SubAgentDelegator(runtime as any);
    const killTool = delegator.getKillTool();
    const statusTool = delegator.getCheckStatusTool();

    const dispatched = await delegator.runSubAgent({
      taskDescription: "long task",
      parentSessionId: "sess_parent",
      async: true,
    });
    expect(dispatched.isAsyncRunning).toBe(true);

    await vi.waitFor(() => expect(delegator.getRunningCount()).toBe(1));

    const killRes = await killTool.execute({ taskId: dispatched.taskId });
    expect(killRes).toMatch(/取消信号/);

    await vi.waitFor(() => {
      expect(delegator.getTaskState(dispatched.taskId)?.status).toBe("cancelled");
    });

    const statusRes = await statusTool.execute({ taskId: dispatched.taskId });
    expect(statusRes).toMatch(/已取消|Cancelled/);

    // async 完成通知写入父会话事件流
    const note = appended.find((e) => e.sessionId === "sess_parent");
    expect(note).toBeDefined();
    expect(note.type).toBe("assistant_message");
    expect(note.payload.content).toContain(dispatched.taskId);
  });
});

describe("Sub-Agent scheduling: agent_output batch wait", () => {
  it("waits for all tasks and returns their summaries", async () => {
    const runtime = makeRuntime(async (input) => okOutput(input.sessionId));
    const delegator = new SubAgentDelegator(runtime as any);
    const outputTool = delegator.getOutputTool();

    const r1 = await delegator.runSubAgent({ taskDescription: "a", async: true });
    const r2 = await delegator.runSubAgent({ taskDescription: "b", async: true });

    const res = await outputTool.execute({
      taskIds: [r1.taskId, r2.taskId],
      mode: "all",
      timeoutMs: 3000,
    });

    expect(res).toContain(r1.taskId);
    expect(res).toContain(r2.taskId);
    expect(res).toContain("[completed]");
    expect(res).toContain("ok");
  });
});

describe("Sub-Agent scheduling: per-parent dispatch cap", () => {
  it("rejects spawns beyond maxChildRunsPerParent", async () => {
    const runtime = makeRuntime(async () => okOutput());
    const delegator = new SubAgentDelegator(runtime as any, {
      maxConcurrent: 4,
      maxChildRunsPerParent: 1,
    });

    const r1 = await delegator.runSubAgent({ taskDescription: "t1", parentSessionId: "sess_p" });
    const r2 = await delegator.runSubAgent({ taskDescription: "t2", parentSessionId: "sess_p" });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(false);
    expect(r2.summary).toContain("派发上限");
    expect(delegator.getTaskState(r2.taskId)?.status).toBe("failed");
  });
});

describe("Sub-Agent scheduling: task id resolution & listing", () => {
  it("resolves exact ids, rejects ambiguous prefixes, and lists tasks", async () => {
    const runtime = makeRuntime(async () => okOutput());
    const delegator = new SubAgentDelegator(runtime as any);
    const listTool = delegator.getListTool();

    const r1 = await delegator.runSubAgent({ taskDescription: "alpha" });
    const r2 = await delegator.runSubAgent({ taskDescription: "beta" });

    // 精确匹配
    expect(delegator.getTaskState(r1.taskId)?.taskId).toBe(r1.taskId);
    // 同前缀（task_sub_* 两个任务）→ 歧义 → undefined，避免查错任务
    expect(delegator.getTaskState("task_sub_")).toBeUndefined();

    const listRes = await listTool.execute({});
    expect(listRes).toContain(r1.taskId);
    expect(listRes).toContain(r2.taskId);
    expect(listRes).toContain("alpha");
  });
});
