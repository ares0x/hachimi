// packages/core/src/replay/types.ts
//
// P1.4: Replay 基准 — 从既有 RuntimeEvent 事件流投影出可复用的评估轨迹。
// 设计（Kun replay-benchmark.ts / maka scorer taxonomy）：
//   - 轨迹是事件的确定性投影（不重放 LLM 调用，快）
//   - ReplayExpect 定义工具面/行为/文件改动（Jaccard）/错误数/时长/成本约束
//   - 基线（baseline.json）支持 failOnRegression

export interface ReplayExpect {
  /** 轨迹中必须出现过的工具名 */
  requiredTools?: string[];
  /** 禁止行为（工具名 + 可选参数子集匹配） */
  forbiddenBehaviors?: Array<{
    tool: string;
    argsMatch?: Record<string, unknown>;
  }>;
  /** 期望修改的文件（与实际的 Jaccard 相似度 ≥0.5 视为通过） */
  expectedChangedFiles?: string[];
  /** 允许的最大错误事件数（error 事件 + 失败工具结果） */
  maxErrorEvents?: number;
  /** 允许的最大总耗时（ms） */
  maxTotalMs?: number;
  /** 允许的最大成本（USD） */
  maxCostUsd?: number;
}

export interface ReplaySuite {
  id: string;
  name: string;
  description?: string;
  /** 从哪些会话的事件流提取轨迹（CLI --session 可覆盖） */
  sourceSessionIds?: string[];
  expect: ReplayExpect;
}

export interface ReplayToolCall {
  name: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
  durationMs?: number;
}

export interface ReplayTrajectory {
  sessionId: string;
  prompt: string;
  toolCalls: ReplayToolCall[];
  /** 轨迹中实际修改/删除/追加的文件（从工具 args 提取） */
  changedFiles: string[];
  errorEvents: number;
  durationMs: number;
  totalTokens: number;
  costUsd: number;
}

export interface ReplayCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ReplayVerdict {
  suiteId: string;
  suiteName: string;
  trajectory: ReplayTrajectory;
  passed: boolean;
  score: number; // 0.0 ~ 1.0（通过的检查比例）
  checks: ReplayCheck[];
}

export interface ReplayReport {
  generatedAt: string;
  overallPassed: boolean;
  verdicts: ReplayVerdict[];
  markdown: string;
}
