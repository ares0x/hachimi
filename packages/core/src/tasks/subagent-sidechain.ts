// packages/core/src/tasks/subagent-sidechain.ts
//
// P1.3: Sub-agent sidechain — 每个子代理一条 append-only JSONL。
//
// 背景：子代理状态默认只存在内存（SubAgentDelegator.tasks）。进程重启后
// `agent_output` / 状态查询会丢。主事件流（events/{subSessionId}.jsonl）保存
// 完整对话，但缺少聚合的任务状态（status/summary/durationMs）。
//
// 本模块：data/subagents/{subSessionId}.jsonl 记录任务状态快照（running →
// 终态），支持：
//   - rebuildTaskState() 从 sidechain 重建任务状态（内存丢失后仍可查询）
//   - markOrphanedRunning() 启动时把上次进程遗留的 running 标记为 failed（Kun 孤儿恢复）
//
// 设计约束：只追加不修改；读取按行解析并跳过损坏行（与 FileEventStore 一致）。

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "@hachimi/shared";

export interface SubAgentSidechainState {
  taskId: string;
  subSessionId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  summary?: string;
  error?: string;
  durationMs: number;
  updatedAt: number;
  /** 是否为启动时孤儿恢复标记（不是真实任务结束） */
  orphanRecovered?: boolean;
}

export class SubAgentSidechain {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "subagents");
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(subSessionId: string): string {
    return join(this.dir, `${subSessionId}.jsonl`);
  }

  append(subSessionId: string, state: SubAgentSidechainState): void {
    try {
      appendFileSync(this.filePath(subSessionId), `${JSON.stringify(state)}\n`, "utf-8");
    } catch (err) {
      log("warn", `[SubAgentSidechain] Failed to append state for ${subSessionId}:`, err);
    }
  }

  /** 读取某子代理的最后一条状态快照（无则 undefined） */
  readLastState(subSessionId: string): SubAgentSidechainState | undefined {
    const path = this.filePath(subSessionId);
    if (!existsSync(path)) return undefined;
    const lines = readFileSync(path, "utf-8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      try {
        return JSON.parse(trimmed) as SubAgentSidechainState;
      } catch {}
    }
    return undefined;
  }

  /** 启动时孤儿恢复：把所有遗留 running 状态标记为 failed（Kun pattern） */
  markOrphanedRunning(): number {
    if (!existsSync(this.dir)) return 0;
    let recovered = 0;
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const subSessionId = file.replace(/\.jsonl$/, "");
      const last = this.readLastState(subSessionId);
      if (last && last.status === "running" && !last.orphanRecovered) {
        this.append(subSessionId, {
          taskId: last.taskId,
          subSessionId,
          status: "failed",
          error: "进程重启，子代理任务被标记为失败（孤儿恢复）",
          summary: last.summary,
          durationMs: last.durationMs,
          updatedAt: Date.now(),
          orphanRecovered: true,
        });
        recovered++;
      }
    }
    return recovered;
  }

  /** 列出 sidechain 中出现的所有子会话 ID（供恢复流程扫描） */
  listSubSessions(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""));
  }
}
