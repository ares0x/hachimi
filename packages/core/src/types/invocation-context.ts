// packages/core/src/types/invocation-context.ts
import type { SurfaceType } from "../tools/policy.js";

/**
 * P2: InvocationContext — 贯穿全链路的 Canonical Execution Context
 * 包含单次调用的微观标识、宏观 Session/Work 维度与 Lineage 追溯链
 */
export interface InvocationContext {
  /** 调用的微观全局唯一 ID */
  invocationId: string;
  /** Agent 单次 Turn / 运行 ID */
  runId: string;
  /** 所属 Session ID */
  sessionId: string;
  /** 所属 Work 容器 ID */
  workId?: string;
  /** 触发渠道 Surface (cli, tui, desktop, web, telegram, api) */
  channel: SurfaceType;
  /** 父级 Run ID（当由 SubAgent 派生时填充） */
  parentRunId?: string;
  /** 父级 Turn ID（当由重试/重生成派生时填充） */
  parentTurnId?: string;
  /** 创建时间戳 ISO8601 */
  createdAt: string;
}
