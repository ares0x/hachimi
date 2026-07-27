/**
 * W1: WorkManager — Work 数据管理器
 *
 * Work 是比 Session 更高层的一等公民，承载目标（goal）、计划（plan）与状态（status）。
 * 初始阶段：workId === sessionId（1:1 映射）。
 *
 * 存储路径：{dataDir}/works/{workId}.json
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateId } from "@hachimi/shared";
import { FileDirStore } from "@hachimi/storage";
import type { Activity } from "../types/event.js";
import type { IEventStore } from "../events/event-store.js";
import type {
  PlanStep,
  PlanStepStatus,
  Work,
  WorkKind,
  WorkStatus,
  WorkSummary,
} from "../types/work.js";

export interface CreateWorkOptions {
  /** 用户意图（首条消息或显式声明） */
  intent: string;
  goal?: string;
  kind?: WorkKind;
  parentWorkId?: string;
  /** 若提供，则 workId = sessionId（初始阶段 1:1 映射） */
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ListWorksOptions {
  kind?: WorkKind;
  status?: WorkStatus | WorkStatus[];
  limit?: number;
  offset?: number;
}

export class WorkManager {
  private readonly dir: string;
  private readonly store: FileDirStore;
  private readonly eventStore?: IEventStore;

  constructor(dataDir: string, eventStore?: IEventStore) {
    this.dir = join(dataDir, "works");
    this.store = new FileDirStore();
    this.eventStore = eventStore;
    this.ensureDir();
  }

  // ─── 私有工具 ───────────────────────────────────────────────────────────────

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(workId: string): string {
    return join(this.dir, `${workId}.json`);
  }

  private readWork(workId: string): Work | null {
    return this.store.read<Work>(this.filePath(workId));
  }

  private writeWork(work: Work): void {
    work.updatedAt = new Date().toISOString();
    writeFileSync(this.filePath(work.id), JSON.stringify(work, null, 2), "utf-8");
  }

  // ─── 标题生成 ───────────────────────────────────────────────────────────────

  /**
   * W1.2: 从用户首条消息自动生成可读标题
   * 规则优先：截取前 40 字符，去除换行；绝不使用纯时间戳。
   */
  generateTitle(firstUserMessage: string): string {
    const cleaned = firstUserMessage.replace(/[\n\r]+/g, " ").trim();
    if (!cleaned) return `工作 ${new Date().toLocaleDateString()}`;
    return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned;
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  /** W1.5: 创建 Work（通常由首条用户消息触发） */
  create(options: CreateWorkOptions): Work {
    const now = new Date().toISOString();
    const id = options.sessionId || generateId("work_");

    const work: Work = {
      id,
      title: this.generateTitle(options.intent),
      goal: options.goal || options.intent,
      status: "active",
      plan: [],
      sessionIds: options.sessionId ? [options.sessionId] : [id],
      kind: options.kind || "primary",
      parentWorkId: options.parentWorkId,
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata,
    };

    this.writeWork(work);
    return work;
  }

  /** 获取指定 Work */
  get(workId: string): Work | null {
    return this.readWork(workId);
  }

  /** 列出 Works（支持 kind / status 过滤） */
  list(options: ListWorksOptions = {}): WorkSummary[] {
    const { kind = "primary", status, limit = 50, offset = 0 } = options;

    if (!existsSync(this.dir)) return [];

    const all = readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.store.read<Work>(join(this.dir, f)))
      .filter((w): w is Work => !!w);

    const filtered = all.filter((w) => {
      if (kind && w.kind !== kind) return false;
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        if (!statuses.includes(w.status)) return false;
      }
      return true;
    });

    // 按最近更新排序
    filtered.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return filtered.slice(offset, offset + limit).map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      kind: w.kind,
      goal: w.goal,
      planTotal: w.plan.length,
      planDone: w.plan.filter((s) => s.status === "done").length,
      updatedAt: w.updatedAt,
      createdAt: w.createdAt,
    }));
  }

  /** 更新 Work（title / status / goal） */
  update(
    workId: string,
    patch: Partial<Pick<Work, "title" | "status" | "goal" | "metadata">>
  ): Work | null {
    const work = this.readWork(workId);
    if (!work) return null;
    Object.assign(work, patch);
    this.writeWork(work);
    return work;
  }

  /** 更新 Work 状态 */
  setStatus(workId: string, status: WorkStatus): Work | null {
    return this.update(workId, { status });
  }

  // ─── Plan ───────────────────────────────────────────────────────────────────

  /** W1.3: 写入/替换整个 plan */
  updatePlan(workId: string, steps: Omit<PlanStep, "id">[]): Work | null {
    const work = this.readWork(workId);
    if (!work) return null;
    work.plan = steps.map((s) => ({
      ...s,
      id: generateId("step_"),
    }));
    this.writeWork(work);
    return work;
  }

  /** W1.3: 更新单个步骤状态 */
  updateStepStatus(
    workId: string,
    stepId: string,
    status: PlanStepStatus,
    completedAt?: string
  ): Work | null {
    const work = this.readWork(workId);
    if (!work) return null;
    const step = work.plan.find((s) => s.id === stepId);
    if (!step) return null;
    step.status = status;
    if (status === "done" && !step.completedAt) {
      step.completedAt = completedAt || new Date().toISOString();
    }
    this.writeWork(work);
    return work;
  }

  // ─── Activity 投影 ──────────────────────────────────────────────────────────

  /**
   * W1.4: 从 EventStore 投影 Activity 列表
   * 合并 tool_call + tool_result 为单个 tool Activity
   */
  async listActivities(
    workId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{ activities: Activity[]; nextCursor?: string; total: number }> {
    if (!this.eventStore) {
      return { activities: [], total: 0 };
    }

    const work = this.readWork(workId);
    if (!work) return { activities: [], total: 0 };

    // 使用主 sessionId（初始阶段 1:1）
    const sessionId = work.sessionIds[0] || workId;
    const result = await this.eventStore.list(sessionId, {
      limit: (options.limit || 50) * 3, // 预取更多以支持合并
      cursor: options.cursor,
    });

    const activities = this.projectToActivities(result.events, sessionId);

    return {
      activities: activities.slice(0, options.limit || 50),
      nextCursor: result.nextCursor,
      total: result.total,
    };
  }

  /**
   * 将 RuntimeEvent[] 投影为 Activity[]
   * - user/assistant_message → type:"message"
   * - tool_call + tool_result → type:"tool"（合并）
   * - approval_* → type:"approval"
   * - steer → type:"steer"
   * - error → type:"error"
   */
  private projectToActivities(events: import("../types/event.js").RuntimeEvent[], sessionId: string): Activity[] {
    const activities: Activity[] = [];
    const pendingToolCalls = new Map<string, import("../types/event.js").ToolCallEvent>();

    for (const event of events) {
      switch (event.type) {
        case "user_message":
          activities.push({
            id: event.id,
            sessionId,
            type: "message",
            role: "user",
            timestamp: event.timestamp,
            content: event.payload.content,
            sourceEventIds: [event.id],
          });
          break;

        case "assistant_message":
          activities.push({
            id: event.id,
            sessionId,
            type: "message",
            role: "assistant",
            timestamp: event.timestamp,
            content: event.payload.content,
            sourceEventIds: [event.id],
          });
          break;

        case "tool_call":
          // 暂存，等待对应的 tool_result
          pendingToolCalls.set(event.payload.toolCallId, event);
          break;

        case "tool_result": {
          const callEvent = pendingToolCalls.get(event.payload.toolCallId);
          pendingToolCalls.delete(event.payload.toolCallId);

          activities.push({
            id: event.id,
            sessionId,
            type: "tool",
            timestamp: event.timestamp,
            content: event.payload.isError
              ? `[错误] ${event.payload.result}`
              : event.payload.result,
            toolName: event.payload.toolName,
            toolArgs: callEvent?.payload.args,
            toolResult: event.payload.result,
            isToolError: event.payload.isError,
            sourceEventIds: callEvent ? [callEvent.id, event.id] : [event.id],
          });
          break;
        }

        case "approval_requested":
          activities.push({
            id: event.id,
            sessionId,
            type: "approval",
            timestamp: event.timestamp,
            content: `等待审批：${event.payload.toolName}`,
            toolName: event.payload.toolName,
            toolArgs: event.payload.args,
            approvalId: event.payload.approvalId,
            approvalDecision: "pending",
            sourceEventIds: [event.id],
          });
          break;

        case "approval_granted":
          activities.push({
            id: event.id,
            sessionId,
            type: "approval",
            timestamp: event.timestamp,
            content: `已批准：${event.payload.toolName}`,
            toolName: event.payload.toolName,
            approvalId: event.payload.approvalId,
            approvalDecision: "granted",
            sourceEventIds: [event.id],
          });
          break;

        case "approval_denied":
          activities.push({
            id: event.id,
            sessionId,
            type: "approval",
            timestamp: event.timestamp,
            content: `已拒绝：${event.payload.toolName}${event.payload.reason ? ` (${event.payload.reason})` : ""}`,
            toolName: event.payload.toolName,
            approvalId: event.payload.approvalId,
            approvalDecision: "denied",
            sourceEventIds: [event.id],
          });
          break;

        case "steer":
          activities.push({
            id: event.id,
            sessionId,
            type: "steer",
            timestamp: event.timestamp,
            content: `纠偏：${event.payload.prompt}`,
            sourceEventIds: [event.id],
          });
          break;

        case "error":
          activities.push({
            id: event.id,
            sessionId,
            type: "error",
            timestamp: event.timestamp,
            content: event.payload.message,
            sourceEventIds: [event.id],
          });
          break;

        case "session_started":
        case "run_finished":
          // system 级别，不展示为 Activity（或可扩展展示）
          break;

        default:
          break;
      }
    }

    // 处理没有对应 tool_result 的孤立 tool_call（如执行中中断）
    for (const [, callEvent] of pendingToolCalls) {
      activities.push({
        id: callEvent.id,
        sessionId,
        type: "tool",
        timestamp: callEvent.timestamp,
        content: `工具调用中：${callEvent.payload.toolName}`,
        toolName: callEvent.payload.toolName,
        toolArgs: callEvent.payload.args,
        sourceEventIds: [callEvent.id],
      });
    }

    return activities;
  }

  // ─── Session 关联 ────────────────────────────────────────────────────────────

  /** 将 Session 关联到 Work（子 Agent 多 Run 场景） */
  addSession(workId: string, sessionId: string): Work | null {
    const work = this.readWork(workId);
    if (!work) return null;
    if (!work.sessionIds.includes(sessionId)) {
      work.sessionIds.push(sessionId);
      this.writeWork(work);
    }
    return work;
  }

  /** 获取子任务列表 */
  listChildren(parentWorkId: string): WorkSummary[] {
    if (!existsSync(this.dir)) return [];

    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.store.read<Work>(join(this.dir, f)))
      .filter((w): w is Work => !!w && w.parentWorkId === parentWorkId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((w) => ({
        id: w.id,
        title: w.title,
        status: w.status,
        kind: w.kind,
        goal: w.goal,
        planTotal: w.plan.length,
        planDone: w.plan.filter((s) => s.status === "done").length,
        updatedAt: w.updatedAt,
        createdAt: w.createdAt,
      }));
  }
}
