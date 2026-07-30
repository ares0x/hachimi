// packages/core/src/extensions/contributor.ts
import type { InvocationContext } from "../types/invocation-context.js";

/**
 * P3: Grok-inspired Contributor System — 窄接口生命周期贡献者规范
 * 替代大而全的 HookRegistry，按明确职责解耦 Hook
 */
export interface TurnLifecycleInput {
  ctx: InvocationContext;
  prompt: string;
}

export interface TurnLifecycleResult {
  action: "continue" | "block";
  reason?: string;
  modifiedPrompt?: string;
}

export interface TurnLifecycleContributor {
  name: string;
  onTurnStart?: (input: TurnLifecycleInput) => Promise<TurnLifecycleResult>;
  onTurnEnd?: (input: TurnLifecycleInput & { content: string }) => Promise<void>;
}

export interface SessionLifecycleContributor {
  name: string;
  onSessionStart?: (sessionId: string) => Promise<void>;
  onSessionEnd?: (sessionId: string) => Promise<void>;
}
