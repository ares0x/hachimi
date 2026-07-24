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

export type PreToolCallHook = (
  ctx: PreToolCallContext
) => Promise<PreToolCallResult | void> | PreToolCallResult | void;

export type PostToolCallHook = (
  ctx: PostToolCallContext
) => Promise<PostToolCallResult | void> | PostToolCallResult | void;

export type SessionStartHook = (ctx: SessionStartContext) => Promise<void> | void;

/**
 * E3: 声明式生命周期钩子注册表 (HookRegistry)
 */
export class HookRegistry {
  private preToolCallHooks: PreToolCallHook[] = [];
  private postToolCallHooks: PostToolCallHook[] = [];
  private sessionStartHooks: SessionStartHook[] = [];

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

  async runSessionStart(ctx: SessionStartContext): Promise<void> {
    for (const hook of this.sessionStartHooks) {
      await hook(ctx);
    }
  }
}
