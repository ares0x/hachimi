// packages/core/src/extensions/hooks.ts

export interface PreToolCallContext {
  toolName: string;
  args: Record<string, unknown>;
  sessionId?: string;
}

export interface PreToolCallResult {
  action: "allow" | "block";
  modifiedArgs?: Record<string, unknown>;
  reason?: string;
}

export interface PostToolCallContext {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
}

export interface PostToolCallResult {
  modifiedResult?: string;
}

export interface SessionStartContext {
  sessionId: string;
}

/**
 * Context passed to post-turn hooks after each tool call round.
 * Hooks can inspect the current state and inject system reminders
 * (e.g., "context nearly full — stop exploring").
 */
export interface PostTurnContext {
  /** Messages after this round's tool results were appended */
  messages: unknown[];
  /** Current round number (1-based) */
  round: number;
  /** Estimated token count of the full message array */
  estimatedTokens: number;
  sessionId?: string;
}

export interface PostTurnResult {
  /** If set, this message is injected before the next LLM call */
  injectMessage?: string;
}

export type PreToolCallHook = (
  ctx: PreToolCallContext
) => Promise<PreToolCallResult | void> | PreToolCallResult | void;

export type PostToolCallHook = (
  ctx: PostToolCallContext
) => Promise<PostToolCallResult | void> | PostToolCallResult | void;

export type PostTurnHook = (
  ctx: PostTurnContext
) => Promise<PostTurnResult | void> | PostTurnResult | void;

export type SessionStartHook = (ctx: SessionStartContext) => Promise<void> | void;

/**
 * E3: 声明式生命周期钩子注册表 (HookRegistry)
 */
export class HookRegistry {
  private preToolCallHooks: PreToolCallHook[] = [];
  private postToolCallHooks: PostToolCallHook[] = [];
  private sessionStartHooks: SessionStartHook[] = [];
  private postTurnHooks: PostTurnHook[] = [];

  onPreToolCall(hook: PreToolCallHook): () => void {
    this.preToolCallHooks.push(hook);
    return () => {
      this.preToolCallHooks = this.preToolCallHooks.filter((h) => h !== hook);
    };
  }

  onPostToolCall(hook: PostToolCallHook): () => void {
    this.postToolCallHooks.push(hook);
    return () => {
      this.postToolCallHooks = this.postToolCallHooks.filter((h) => h !== hook);
    };
  }

  onSessionStart(hook: SessionStartHook): () => void {
    this.sessionStartHooks.push(hook);
    return () => {
      this.sessionStartHooks = this.sessionStartHooks.filter((h) => h !== hook);
    };
  }

  async runPreToolCall(ctx: PreToolCallContext): Promise<PreToolCallResult> {
    let currentArgs = { ...ctx.args };

    for (const hook of this.preToolCallHooks) {
      const res = await hook({ ...ctx, args: currentArgs });
      if (res && res.action === "block") {
        return {
          action: "block",
          reason: res.reason || `[Hook 拦截] 工具 ${ctx.toolName} 被生命周期钩子阻止执行。`,
        };
      }
      if (res && res.modifiedArgs) {
        currentArgs = { ...res.modifiedArgs };
      }
    }

    return {
      action: "allow",
      modifiedArgs: currentArgs,
    };
  }

  async runPostToolCall(ctx: PostToolCallContext): Promise<PostToolCallResult> {
    let currentResult = ctx.result;

    for (const hook of this.postToolCallHooks) {
      const res = await hook({ ...ctx, result: currentResult });
      if (res && res.modifiedResult !== undefined) {
        currentResult = res.modifiedResult;
      }
    }

    return {
      modifiedResult: currentResult,
    };
  }

  onPostTurn(hook: PostTurnHook): () => void {
    this.postTurnHooks.push(hook);
    return () => {
      this.postTurnHooks = this.postTurnHooks.filter((h) => h !== hook);
    };
  }

  async runPostTurn(ctx: PostTurnContext): Promise<PostTurnResult> {
    for (const hook of this.postTurnHooks) {
      const res = await hook(ctx);
      if (res && res.injectMessage) {
        return { injectMessage: res.injectMessage };
      }
    }
    return {};
  }

  async runSessionStart(ctx: SessionStartContext): Promise<void> {
    for (const hook of this.sessionStartHooks) {
      await hook(ctx);
    }
  }
}
