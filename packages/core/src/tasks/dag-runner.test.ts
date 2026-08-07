// packages/core/src/tasks/dag-runner.test.ts
//
// P2.2: DagRunner 拓扑调度 / 输出插值 / 失败传播 / run-log（注入假 runNode，不触达 LLM）。

import { describe, expect, it, vi } from "vitest";
import type { HarnessRuntime } from "../runtime/harness-runtime.js";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { DagRunner, type DagRunTaskState, interpolateNodeOutput } from "./dag-runner.js";
import { TaskRegistry } from "./task-registry.js";

const fakeRuntime = {} as unknown as HarnessRuntime;

/** 构造插值占位符（避免字面 ${ 触发 noTemplateCurlyInString） */
const outputRef = (id: string): string => `${"$"}{nodes.${id}.output}`;

function makeDeps(failIds: string[] = []) {
  const calls: Array<{ task: string }> = [];
  const failSet = new Set(failIds);
  return {
    calls,
    runNode: vi.fn(async (opts: { task: string }) => {
      calls.push({ task: opts.task });
      const m = opts.task.match(/^#(\w+)/);
      const id = m ? m[1] : "";
      if (failSet.has(id)) {
        return { success: false, summary: `failed ${id}` };
      }
      return { success: true, summary: `output-of-${id}`, subSessionId: `sub_${id}` };
    }),
  };
}

describe("DagRunner", () => {
  it("串行依赖：b 等到 a 完成且插值注入 a 的输出", async () => {
    const deps = makeDeps();
    const runner = new DagRunner(fakeRuntime, undefined, { runNode: deps.runNode });
    const result = await runner.runDag({
      spec: {
        name: "chain",
        nodes: [
          { id: "a", task: "#a 步骤一" },
          { id: "b", task: `#b 使用 ${outputRef("a")} 继续`, dependsOn: ["a"] },
          { id: "c", task: `#c 结合 ${outputRef("b")} 继续`, dependsOn: ["b"] },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(deps.runNode).toHaveBeenCalledTimes(3);
    // 顺序：a → b → c
    const tasks = deps.calls.map((c) => c.task);
    expect(tasks[0]).toContain("#a");
    expect(tasks[1]).toContain("output-of-a");
    expect(tasks[2]).toContain("output-of-b");
    expect(result.nodes.every((n) => n.status === "completed")).toBe(true);
  });

  it("并行执行：无依赖节点按 max_parallel 并发（顺序无关，全部完成）", async () => {
    const deps = makeDeps();
    const runner = new DagRunner(fakeRuntime, undefined, { runNode: deps.runNode });
    const result = await runner.runDag({
      spec: {
        nodes: [
          { id: "a", task: "#a" },
          { id: "b", task: "#b" },
          { id: "c", task: "#c" },
        ],
      },
      maxParallel: 2,
    });
    expect(result.success).toBe(true);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.every((n) => n.status === "completed")).toBe(true);
  });

  it("节点失败 → 下游 skipped，整体失败", async () => {
    const deps = makeDeps(["b"]);
    const runner = new DagRunner(fakeRuntime, undefined, { runNode: deps.runNode });
    const result = await runner.runDag({
      spec: {
        nodes: [
          { id: "a", task: "#a" },
          { id: "b", task: "#b", dependsOn: ["a"] },
          { id: "c", task: "#c", dependsOn: ["b"] },
        ],
      },
    });
    expect(result.success).toBe(false);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("a")?.status).toBe("completed");
    expect(byId.get("b")?.status).toBe("failed");
    expect(byId.get("c")?.status).toBe("skipped");
  });

  it("YAML spec 输入可直接执行", async () => {
    const deps = makeDeps();
    const runner = new DagRunner(fakeRuntime, undefined, { runNode: deps.runNode });
    const result = await runner.runDag({
      spec: `
nodes:
  - id: x
    task: "#x hello"
`,
    });
    expect(result.success).toBe(true);
    expect(result.nodes[0].output).toBe("output-of-x");
  });

  it("run-log 写入统一任务注册表（taskKind=dag）", async () => {
    const registry = new TaskRegistry();
    const deps = makeDeps();
    const runner = new DagRunner(fakeRuntime, registry, { runNode: deps.runNode });
    const result = await runner.runDag({
      spec: { name: "logme", nodes: [{ id: "a", task: "#a" }] },
    });
    const task = registry.getTask<DagRunTaskState>(result.runId);
    expect(task?.taskKind).toBe("dag");
    expect(task?.status).toBe("completed");
    expect(task?.nodeStatus[0]).toEqual({
      id: "a",
      status: "completed",
    });
  });

  it("环 spec 在执行前被拒绝", async () => {
    const runner = new DagRunner(fakeRuntime, undefined, { runNode: makeDeps().runNode });
    await expect(
      runner.runDag({
        spec: {
          nodes: [
            { id: "a", task: "1", dependsOn: ["b"] },
            { id: "b", task: "2", dependsOn: ["a"] },
          ],
        },
      })
    ).rejects.toThrow(/存在环/);
  });
});

describe("interpolateNodeOutput", () => {
  it("替换已知输出，未知依赖保留占位", () => {
    const out = new Map([["a", "OUT-A"]]);
    expect(interpolateNodeOutput(`x ${outputRef("a")} y ${outputRef("b")}`, out)).toBe(
      `x OUT-A y [${outputRef("b")} 依赖节点 b 尚未完成]`
    );
  });
});

describe("HarnessRuntime DAG 接线", () => {
  it("注册 run_dag / dag_status 工具", () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    expect(runtime.dag).toBeDefined();
    expect(runtime.tools.get("run_dag")).toBeDefined();
    expect(runtime.tools.get("dag_status")).toBeDefined();
  });
});
