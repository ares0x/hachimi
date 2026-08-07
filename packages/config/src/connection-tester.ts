import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { LlmConnection } from "./index.js";

export interface ConnectionTestResult {
  success: boolean;
  connectionId: string;
  latencyMs: number;
  failureCategory?: "auth" | "timeout" | "network" | "provider_unavailable" | "unknown";
  errorMessage?: string;
}

/**
 * Executes a 15-second timeout health check against an LLM connection.
 * Categorizes errors cleanly (auth, timeout, network, provider_unavailable) (Maka pattern).
 */
export async function testConnection(
  connection: LlmConnection,
  apiKeyOverride?: string
): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  const apiKey = (apiKeyOverride || connection.apiKey || "").trim();

  // Mock / local offline connections test instantly
  if (connection.providerType === "mock") {
    return {
      success: true,
      connectionId: connection.id,
      latencyMs: Date.now() - startTime,
    };
  }

  // ACP client connections probe the external agent process directly
  // (spawn + initialize handshake over stdio JSON-RPC).
  if (connection.providerType === "acp") {
    const command = connection.command || connection.baseUrl;
    if (!command) {
      return {
        success: false,
        connectionId: connection.id,
        latencyMs: Date.now() - startTime,
        failureCategory: "provider_unavailable",
        errorMessage: "ACP 连接未配置外部 Agent 命令 (command/baseUrl)",
      };
    }
    return await probeAcpProcess(connection, command, startTime);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  const baseUrl = (connection.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const protocol = connection.providerType;

  try {
    let testUrl = `${baseUrl}/models`;
    let headers: Record<string, string> = {};

    if (protocol === "anthropic") {
      testUrl = `${baseUrl}/v1/models`;
      headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
    } else {
      headers = {
        Authorization: `Bearer ${apiKey}`,
      };
    }

    // DeepSeek 服务端联网搜索连接：直接探测 Responses API 端点，
    // 验证 Key 与 web_search 能力（比 /models 更贴近真实使用路径）。
    if (connection.serverWebSearch && protocol === "deepseek") {
      const probe = await fetch(`${baseUrl.replace(/\/v1$/, "")}/responses`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: connection.defaultModelId || "deepseek-chat",
          input: "ping",
          max_output_tokens: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      if (probe.ok) {
        return { success: true, connectionId: connection.id, latencyMs };
      }
      const errText = (await probe.text()).slice(0, 300);
      const status = probe.status;
      let failureCategory: ConnectionTestResult["failureCategory"] = "unknown";
      if (status === 401 || status === 403) {
        failureCategory = "auth";
      } else if (status === 429 || status >= 500) {
        failureCategory = "provider_unavailable";
      }
      return {
        success: false,
        connectionId: connection.id,
        latencyMs,
        failureCategory,
        errorMessage: `HTTP ${status}: ${errText || probe.statusText}`,
      };
    }

    const res = await fetch(testUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (res.ok || res.status === 404) {
      // 200 OK or 404 (some custom proxies hide /models but endpoint is live)
      return {
        success: true,
        connectionId: connection.id,
        latencyMs,
      };
    }

    const errText = (await res.text()).slice(0, 300);
    const status = res.status;

    let failureCategory: ConnectionTestResult["failureCategory"] = "unknown";
    if (status === 401 || status === 403) {
      failureCategory = "auth";
    } else if (status === 429 || status >= 500) {
      failureCategory = "provider_unavailable";
    }

    return {
      success: false,
      connectionId: connection.id,
      latencyMs,
      failureCategory,
      errorMessage: `HTTP ${status}: ${errText || res.statusText}`,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const msg = err?.message || String(err);

    let failureCategory: ConnectionTestResult["failureCategory"] = "unknown";
    if (err?.name === "AbortError" || msg.includes("timeout") || msg.includes("aborted")) {
      failureCategory = "timeout";
    } else if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND")
    ) {
      failureCategory = "network";
    }

    return {
      success: false,
      connectionId: connection.id,
      latencyMs,
      failureCategory,
      errorMessage: msg,
    };
  }
}

/**
 * Dynamically fetch a connection's model list (Pi/Grok pattern).
 * GET {baseUrl}{modelsPath} for OpenAI-compatible endpoints; anthropic uses /v1/models.
 * Returns [] on failure so the caller can fall back to the catalog's static list.
 */
export async function fetchConnectionModels(
  connection: LlmConnection,
  apiKeyOverride?: string,
  modelsPath = "/models"
): Promise<string[]> {
  const apiKey = (apiKeyOverride || connection.apiKey || "").trim();
  if (connection.providerType === "mock" || connection.providerType === "acp") {
    // ACP has no model list endpoint — models come from the catalog fallback.
    return connection.models || [];
  }

  const baseUrl = (connection.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const isAnthropic = connection.providerType === "anthropic";
    const url = isAnthropic ? `${baseUrl}/v1/models` : `${baseUrl}${modelsPath}`;
    const headers: Record<string, string> = isAnthropic
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${apiKey}` };

    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: Array<{ id: string }>;
      models?: Array<{ id: string; name?: string }>;
    };
    const list = (data.data || data.models || []).map((m) => m.id).filter(Boolean);
    return list;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ACP client probe: spawn the external agent, perform the initialize
 * handshake (Agent Client Protocol v2), then tear the process down.
 */
async function probeAcpProcess(
  connection: LlmConnection,
  command: string,
  startTime: number
): Promise<ConnectionTestResult> {
  const [cmd, ...rest] = command.split(/\s+/);
  const args = [...rest, ...(connection.commandArgs || [])];
  const cwd = connection.cwd || process.cwd();

  return await new Promise<ConnectionTestResult>((resolveResult) => {
    const child = spawn(cmd || command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let settled = false;
    let stderrTail = "";
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolveResult({
        success: false,
        connectionId: connection.id,
        latencyMs: Date.now() - startTime,
        failureCategory: "timeout",
        errorMessage: `ACP initialize timed out (${command})`,
      });
    }, 15_000);

    const finish = (
      success: boolean,
      failureCategory: ConnectionTestResult["failureCategory"],
      errorMessage?: string
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      resolveResult({
        success,
        connectionId: connection.id,
        latencyMs: Date.now() - startTime,
        ...(failureCategory ? { failureCategory } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf-8")).slice(-2000);
    });
    child.on("error", (err) => {
      finish(false, "provider_unavailable", `无法启动 ACP Agent: ${err.message}`);
    });
    child.on("exit", (code) => {
      if (!settled) {
        finish(
          false,
          "provider_unavailable",
          `ACP Agent 提前退出 (code=${code})${stderrTail ? `: ${stderrTail.trim().slice(0, 300)}` : ""}`
        );
      }
    });

    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (settled) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg && typeof msg === "object" && msg.id !== undefined && !msg.method) {
        const result = msg.result || {};
        const versionOk = Number(result.protocolVersion) === 2;
        const sessionOk = Boolean(result.capabilities?.session);
        if (versionOk && sessionOk) {
          finish(true, undefined);
        } else {
          finish(
            false,
            "provider_unavailable",
            `ACP 握手失败: protocolVersion=${result.protocolVersion}, session=${sessionOk}`
          );
        }
      }
    });

    child.stdin?.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: 2,
          capabilities: {},
          info: { name: "hachimi", title: "Hachimi", version: "0.1.0" },
        },
      })}\n`,
      "utf-8"
    );
  });
}
