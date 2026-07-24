// packages/channels/cli/src/index.ts
import { createAgentSession } from "@hachimi/core";

export interface CliRunOptions {
  prompt: string;
  outputFormat?: "text" | "json";
  sessionId?: string;
  provider?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface CliRunResult {
  success: boolean;
  sessionId: string;
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  durationMs: number;
  error?: string;
}

/**
 * 编程式 SDK 入口：以 CLI 通道方式单轮运行 Agent 并返回标准结构
 */
export async function runCliChannel(options: CliRunOptions): Promise<CliRunResult> {
  const startTime = Date.now();

  try {
    const executedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    const agentSession = createAgentSession({
      sessionId: options.sessionId,
      provider: options.provider,
    });

    const content = await agentSession.run(options.prompt, {
      onChunk: options.onChunk,
      onToolStart: (name, args) => {
        executedToolCalls.push({ name, args });
      },
    });

    return {
      success: true,
      sessionId: agentSession.sessionId,
      content,
      toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      sessionId: options.sessionId || "cli-session",
      content: "",
      durationMs: Date.now() - startTime,
      error: err?.message || String(err),
    };
  }
}
