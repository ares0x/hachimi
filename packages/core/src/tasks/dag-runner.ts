// packages/core/src/tasks/dag-runner.ts
//
// P2.2: DAG 任务编排（craft-agents-oss TaskRunner 模式）。
// - 每个节点 = 一个独立子代理会话（复用 SubAgentDelegator.runSubAgent）
// - 拓扑调度：依赖就绪的节点按 max_parallel 并发执行（O(nodes+edges)）
// - `${nodes.<id>.output}` 插值：依赖节点完成后输出注入依赖方任务文本
// - 失败传播：依赖失败 → 下游节点 skipped；run-log 追加到统一任务注册表
// - 注入点可替换（deps）以便单测

import { generateId, log, type SubAgentType } from "@hachimi/shared";
import type { HarnessRuntime } from "../runtime/harness-runtime.js";
import type { ToolDefinition } from "../types/index.js";
import { type DagSpec, parseDagSpec } from "./dag-spec.js";
import type { TaskRegistry, TaskStateBase } from "./task-registry.js";

export type DagNodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface DagNodeResult {
  id: string;
  status: DagNodeStatus;
  output: string;
  error?: string;
  durationMs: number;
  subSessionId?: string;
}

export interface DagRunResult {
  runId: string;
  name?: string;
  nodes: DagNodeResult[];
  success: boolean;
  durationMs: number;
}

export interface DagRunnerDeps {
  runNode?: (opts: {
    task: string;
    subagentType?: SubAgentType;
    parentSessionId?: string;
    channel?: string;
    trustLevel?: Parameters<HarnessRuntime["execute"]>[0]["trustLevel"];
    maxTokens?: number;
    maxCostUSD?: number;
    signal?: AbortSignal;
  }) => Promise<{ success: boolean; summary: string; subSessionId?: string }>;
}

export interface DagRunInput {
  spec: string | DagSpec;
  parentSessionId?: string;
  channel?: string;
  trustLevel?: Parameters<HarnessRuntime["execute"]>[0]["trustLevel"];
  signal?: AbortSignal;
  maxParallel?: number;
  async?: boolean;
}

/** run-log 投影（P1.7 统一任务注册表） */
export interface DagRunTaskState extends TaskStateBase {
  taskKind: "dag";
  dagName?: string;
  nodeStatus: Array<{ id: string; status: DagNodeStatus }>;
}

const INTERPOLATION_RE = /\$\{nodes\.([\w-]+)\.output\}/g;

/** 插值：将 ${nodes.<id>.output} 替换为已完成节点的输出（未完成保留占位说明） */
export function interpolateNodeOutput(
  template: string,
  outputs: ReadonlyMap<string, string>
): string {
  return template.replace(INTERPOLATION_RE, (raw, id: string) => {
    const out = outputs.get(id);
    return out ?? `[${raw} 依赖节点 ${id} 尚未完成]`;
  });
}

export class DagRunner {
  private readonly deps: Required<DagRunnerDeps>;

  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly registry?: TaskRegistry,
    deps?: DagRunnerDeps
  ) {
    this.deps = {
      runNode: deps?.runNode ?? ((opts) => this.defaultRunNode(opts)),
    };
  }

  /** 解析 + 调度执行一个 DAG（异步后台或同步阻塞） */
  async runDag(input: DagRunInput): Promise<DagRunResult> {
    const spec = parseDagSpec(input.spec);
    const runId = generateId("dag_");
    const maxParallel = input.maxParallel ?? spec.maxParallel ?? 2;
    const startedAt = Date.now();

    if (input.async) {
      setImmediate(() => {
        void this.schedule(runId, spec, maxParallel, input);
      });
      return {
        runId,
        name: spec.name,
        nodes: spec.nodes.map((n) => ({ id: n.id, status: "pending", output: "", durationMs: 0 })),
        success: false,
        durationMs: 0,
      };
    }
    return this.schedule(runId, spec, maxParallel, input);
  }

  /** 拓扑调度主循环 */
  private async schedule(
    runId: string,
    spec: DagSpec,
    maxParallel: number,
    input: DagRunInput
  ): Promise<DagRunResult> {
    const startedAt = Date.now();
    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    const results = new Map<string, DagNodeResult>();
    const outputs = new Map<string, string>();
    // in-degree：尚未满足的依赖数
    const remainingDeps = new Map<string, number>(
      spec.nodes.map((n) => [n.id, n.dependsOn?.length ?? 0])
    );
    const dependents = new Map<string, string[]>();
    for (const n of spec.nodes) {
      for (const dep of n.dependsOn ?? []) {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(n.id);
      }
    }

    const logNode = (id: string, status: DagNodeStatus): void => {
      results.set(id, {
        id,
        status,
        output: status === "completed" ? (outputs.get(id) ?? "") : "",
        ...(status === "failed" ? { error: "依赖失败，已跳过" } : {}),
        durationMs: 0,
      });
      this.syncRunLog(runId, spec, results);
    };

    while (results.size < spec.nodes.length) {
      // 就绪节点：所有依赖已完成（或已跳过）
      const ready = spec.nodes.filter((n) => {
        if (results.has(n.id)) return false;
        const remaining = remainingDeps.get(n.id) ?? 0;
        if (remaining > 0) return false;
        // 任一依赖失败/跳过 → 本节点跳过
        for (const dep of n.dependsOn ?? []) {
          const s = results.get(dep)?.status;
          if (s === "failed" || s === "skipped") return false;
        }
        return true;
      });

      if (ready.length === 0) {
        // 剩余节点全部卡在失败的依赖上 → 跳过
        for (const n of spec.nodes) {
          if (!results.has(n.id)) logNode(n.id, "skipped");
        }
        break;
      }

      const batch = ready.slice(0, maxParallel);
      const batchResults = await Promise.all(
        batch.map(async (node) => {
          const task = interpolateNodeOutput(node.task, outputs);
          const depStatus = node.dependsOn?.map((d) => results.get(d)?.status ?? "pending") ?? [];
          if (depStatus.some((s) => s === "failed" || s === "skipped")) {
            return { node, status: "skipped" as const, output: "", subSessionId: undefined };
          }
          results.set(node.id, {
            id: node.id,
            status: "running",
            output: "",
            durationMs: 0,
          });
          this.syncRunLog(runId, spec, results);
          const res = await this.deps.runNode({
            task,
            subagentType: node.subagentType,
            parentSessionId: input.parentSessionId,
            channel: input.channel,
            trustLevel: input.trustLevel,
            maxTokens: node.maxTokens,
            maxCostUSD: node.maxCostUSD,
            signal: input.signal,
          });
          return {
            node,
            status: res.success ? ("completed" as const) : ("failed" as const),
            output: res.summary,
            subSessionId: res.subSessionId,
          };
        })
      );

      for (const r of batchResults) {
        const node = r.node;
        if (r.status === "completed") {
          outputs.set(node.id, r.output);
          results.set(node.id, {
            id: node.id,
            status: "completed",
            output: r.output,
            durationMs: 0,
            ...(r.subSessionId ? { subSessionId: r.subSessionId } : {}),
          });
        } else {
          results.set(node.id, {
            id: node.id,
            status: r.status,
            output: "",
            ...(r.status === "failed" ? { error: "节点执行失败" } : { error: "依赖失败，已跳过" }),
            durationMs: 0,
          });
        }
        // 解锁依赖方
        for (const child of dependents.get(node.id) ?? []) {
          remainingDeps.set(child, (remainingDeps.get(child) ?? 1) - 1);
        }
      }
      this.syncRunLog(runId, spec, results);
    }

    const nodes = spec.nodes
      .map((n) => results.get(n.id)!)
      .sort((a, b) => a.id.localeCompare(b.id));
    const success = nodes.every((n) => n.status === "completed");
    const result: DagRunResult = {
      runId,
      name: spec.name,
      nodes,
      success,
      durationMs: Date.now() - startedAt,
    };
    this.finishRunLog(runId, result);
    return result;
  }

  private async defaultRunNode(opts: {
    task: string;
    subagentType?: SubAgentType;
    parentSessionId?: string;
    channel?: string;
    trustLevel?: Parameters<HarnessRuntime["execute"]>[0]["trustLevel"];
    maxTokens?: number;
    maxCostUSD?: number;
    signal?: AbortSignal;
  }): Promise<{ success: boolean; summary: string; subSessionId?: string }> {
    const res = await this.runtime.subAgentDelegator.runSubAgent({
      taskDescription: opts.task,
      subagentType: opts.subagentType,
      parentSessionId: opts.parentSessionId,
      async: false,
      maxTokens: opts.maxTokens,
      maxCostUSD: opts.maxCostUSD,
      parentSignal: opts.signal,
      parentChannel: opts.channel,
      parentTrustLevel: opts.trustLevel,
    });
    return { success: res.success, summary: res.summary, subSessionId: res.subSessionId };
  }

  // ─── run-log（统一任务注册表） ───────────────────────────────────────────────

  private syncRunLog(runId: string, spec: DagSpec, results: Map<string, DagNodeResult>): void {
    if (!this.registry) return;
    const nodeStatus = spec.nodes.map((n) => ({
      id: n.id,
      status: results.get(n.id)?.status ?? ("pending" as const),
    }));
    const existing = this.registry.getTask<DagRunTaskState>(runId);
    const base: DagRunTaskState = {
      taskId: runId,
      taskKind: "dag",
      ...(spec.name ? { dagName: spec.name } : {}),
      nodeStatus,
      status: nodeStatus.some((s) => s.status === "running")
        ? "running"
        : nodeStatus.every((s) => s.status === "completed")
          ? "completed"
          : nodeStatus.some((s) => s.status === "failed" || s.status === "skipped")
            ? "failed"
            : "running",
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    if (existing) {
      this.registry.updateTaskState<DagRunTaskState>(runId, base);
    } else {
      this.registry.registerTask(base);
    }
  }

  private finishRunLog(runId: string, result: DagRunResult): void {
    if (!this.registry) return;
    this.registry.updateTaskState<DagRunTaskState>(runId, {
      status: result.success ? "completed" : "failed",
    });
  }

  // ─── 工具面 ─────────────────────────────────────────────────────────────────

  /** 工具 1: run_dag — 解析并执行一个 DAG 编排（异步，避免沙箱 30s 超时） */
  getRunTool(): ToolDefinition {
    return {
      name: "run_dag",
      kind: "meta",
      description:
        "Executes a DAG orchestration: nodes run as independent sub-agent sessions, respecting depends_on ordering and max_parallel. Spec may be JSON or a minimal YAML (name, max_parallel, nodes: [{id, task, depends_on, subagent_type}]). Node tasks can interpolate prior node outputs via the nodes.<id>.output placeholder. Returns the runId for dag_status.",
      permission: "needs_confirm",
      parameters: {
        type: "object",
        properties: {
          spec: {
            type: "string",
            description:
              "DAG spec as JSON string or minimal YAML, e.g. {name:'x', max_parallel:2, nodes:[{id:'a',task:'...'},{id:'b',task:'use nodes.a.output',depends_on:['a']}]}",
          },
        },
        required: ["spec"],
      },
      execute: async (args, ctx) => {
        const spec = String(args.spec ?? "");
        if (!spec.trim()) return "[run_dag] spec is required";
        const result = await this.runDag({
          spec,
          parentSessionId: ctx?.sessionId,
          channel: ctx?.channel,
          trustLevel: ctx?.trustLevel,
          async: true,
        });
        return `[DAG 已启动] runId=${result.runId}，节点 ${result.nodes.length} 个（异步后台执行）。使用 dag_status（runId=${result.runId}）查询进度。`;
      },
    };
  }

  /** 工具 2: dag_status — 查询 DAG 运行结果 */
  getStatusTool(): ToolDefinition {
    return {
      name: "dag_status",
      kind: "read",
      description:
        "Queries a DAG run by runId: per-node status (pending/running/completed/failed/skipped), outputs, and overall success.",
      permission: "safe",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          runId: { type: "string", description: "DAG run ID (e.g. dag_xxx) from run_dag" },
        },
        required: ["runId"],
      },
      execute: async (args) => {
        const runId = String(args.runId ?? "");
        if (!this.registry) return "[dag_status] 任务注册表不可用";
        const task = this.registry.getTask<DagRunTaskState>(runId);
        if (!task) return `未找到 runId=${runId} 的 DAG 任务。`;
        const lines = [
          `[DAG 状态] ${task.status} | runId=${runId}${task.dagName ? ` | ${task.dagName}` : ""}`,
          "节点：",
          ...task.nodeStatus.map((n) => `- ${n.id}: ${n.status}`),
        ];
        return lines.join("\n");
      },
    };
  }
}
