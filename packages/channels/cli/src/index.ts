// packages/channels/cli/src/index.ts
import { HarnessRuntime, getOrCreateHarnessRuntime } from "@hachimi/core";

export interface CliRunOptions {
  prompt: string;
  outputFormat?: "text" | "json";
  sessionId?: string;
  provider?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  runtime?: HarnessRuntime;
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
 * 编程式 SDK 入口：以 CLI 通道方式单轮运行 Agent 并返回标准结构（委派给 HarnessRuntime）
 */
export async function runCliChannel(options: CliRunOptions): Promise<CliRunResult> {
  const runtime =
    options.runtime ||
    getOrCreateHarnessRuntime(options.provider ? { providerOverride: options.provider } : {});
  const executedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  try {
    const output = await runtime.execute({
      prompt: options.prompt,
      sessionId: options.sessionId,
      channel: "cli",
      providerOverride: options.provider,
      options: {
        onChunk: options.onChunk,
        onToolStart: (name, args) => {
          executedToolCalls.push({ name, args });
        },
      },
    });

    return {
      success: true,
      sessionId: output.sessionId,
      content: output.content,
      toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      durationMs: output.durationMs,
    };
  } catch (err: any) {
    return {
      success: false,
      sessionId: options.sessionId || "cli-session",
      content: "",
      durationMs: 0,
      error: err?.message || String(err),
    };
  }
}
