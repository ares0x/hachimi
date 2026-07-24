// packages/core/src/runtime/session.ts
import type { AppContext, CreateAppContextOptions } from "./context.js";
import { createAppContext } from "./context.js";

export interface AgentSessionOptions extends CreateAppContextOptions {
  sessionId?: string;
  provider?: string;
}

export interface AgentSessionRunOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;
}

export interface AgentSession {
  context: AppContext;
  sessionId: string;
  run(prompt: string, options?: AgentSessionRunOptions): Promise<string>;
}

/**
 * 高阶 SDK 入口：创建并绑定唯一 SessionId 的 Agent 交互会话实例
 */
export function createAgentSession(options: AgentSessionOptions = {}): AgentSession {
  const context = createAppContext({
    ...options,
    providerOverride: options.provider || options.providerOverride,
  });

  if (options.sessionId) {
    context.sessions.load(options.sessionId);
  }
  const session = context.sessions.getOrCreate();
  const sessionId = session.id;

  return {
    context,
    sessionId,
    async run(prompt: string, runOptions: AgentSessionRunOptions = {}) {
      const history = session.messages || [];
      const responseText = await context.agent.run(prompt, history, runOptions);
      context.sessions.save(session);
      return responseText;
    },
  };
}
