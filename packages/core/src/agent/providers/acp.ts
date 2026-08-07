// ACP client transport — drives an external agent harness (Codex / Claude Code /
// Grok / t3) over stdio JSON-RPC (Agent Client Protocol v2) as an LLM provider.
// The external agent owns its own tool loop; hachimi stays the single brain and
// observes external tool activity through onServerToolStart/onServerToolEnd,
// then returns the final text (+ reasoning + usage) to the agent loop.
//
// Not a second execution path: this provider sits behind ProviderRegistry and
// is invoked exclusively through LLMProvider.chat / chatStream, i.e. inside
// HarnessRuntime.execute(). Policy / PathJail / event flow are untouched.

import { type ChildProcess, spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { normalizeUsage } from "@hachimi/shared";
import type {
  ContentPart,
  LLMResponse,
  Message,
  ProviderTransport,
  ProviderTransportConfig,
  ToolDefinition,
} from "../../types/index.js";

export interface AcpClientConfig extends ProviderTransportConfig {
  /** External agent executable (e.g. "codex", "claude", absolute path). Falls back to baseURL. */
  command?: string;
  /** Extra argv passed to the executable (e.g. ["exec", "--full-auto"]). */
  commandArgs?: string[];
  /** Working directory for the external agent session (absolute path preferred). */
  cwd?: string;
  /** Per-turn completion timeout in ms (default 600_000). */
  timeoutMs?: number;
  /** Auto-approve external agent permission requests (default false → reject + log). */
  autoApprovePermissions?: boolean;
  /** Start a fresh external session per turn instead of reusing one (default false). */
  separateSession?: boolean;
}

export const ACP_PROTOCOL_VERSION = 2;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const DEFAULT_TURN_TIMEOUT_MS = 600_000;
const STDERR_TAIL_CHARS = 8_000;

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AgentCapabilities {
  protocolVersion?: number;
  capabilities?: {
    session?: {
      prompt?: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
      mcp?: { stdio?: boolean; http?: boolean };
    };
  };
  info?: { name?: string; version?: string };
  authMethods?: unknown[];
}

interface TurnState {
  done: Promise<{ stopReason?: string }>;
  finish: (stopReason?: string) => void;
  fail: (err: Error) => void;
  messageTexts: Map<string, string>;
  messageOrder: string[];
  /** messageIds whose full text has already been pushed to onChunk. */
  forwardedMessageIds: Set<string>;
  thoughtTexts: Map<string, string>;
  thoughtOrder: string[];
  usage?: Record<string, unknown>;
  toolCalls: Map<string, ToolCallState>;
}

interface ToolCallState {
  title: string;
  status: string;
  startedAt: number;
  input?: unknown;
  output?: string;
  content: string[];
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" || (err as { cause?: { name?: string } }).cause?.name === "AbortError"
  );
}

function blockText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const b = block as { type?: string; text?: string };
  if (b.type === "text" && typeof b.text === "string") return b.text;
  return "";
}

function blocksText(blocks: unknown): string {
  if (Array.isArray(blocks)) return blocks.map(blockText).join("");
  return blockText(blocks);
}

function toolOutputText(state: ToolCallState): string {
  if (state.output) return state.output;
  if (state.content.length > 0) return state.content.join("");
  return "";
}

function jsonRpcErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { message?: string; code?: number; data?: unknown };
  const dataText = e.data !== undefined ? ` — ${JSON.stringify(e.data).slice(0, 300)}` : "";
  return `${e.message || "JSON-RPC error"}${e.code !== undefined ? ` (code ${e.code})` : ""}${dataText}`;
}

export class AcpClientProvider implements ProviderTransport {
  readonly id = "acp";
  readonly name = "ACP Client Transport (external agent over stdio JSON-RPC)";

  private command: string;
  private commandArgs: string[];
  private cwd: string;
  private timeoutMs: number;
  private autoApprovePermissions: boolean;
  private separateSession: boolean;
  private model: string;

  private child: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private sessionId: string | null = null;
  private capabilities: AgentCapabilities | null = null;
  private exitError: Error | null = null;
  private stderrTail = "";
  private currentTurn: TurnState | null = null;

  constructor(config: AcpClientConfig) {
    this.command = (config.command || config.baseURL || "codex").trim();
    this.commandArgs = config.commandArgs || [];
    this.cwd = config.cwd || process.cwd();
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.autoApprovePermissions = config.autoApprovePermissions ?? false;
    this.separateSession = config.separateSession ?? false;
    this.model = config.model || "external-agent";
  }

  /** Spawn the external agent process and set up the stdio JSON-RPC loop. */
  private ensureProcess(): void {
    if (this.child && !this.child.killed && this.child.exitCode === null) return;

    this.exitError = null;
    this.stderrTail = "";
    this.capabilities = null;

    const [cmd, ...rest] = this.command.split(/\s+/);
    const args = [...rest, ...this.commandArgs];
    const child = spawn(cmd || this.command, args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.child = child;

    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    this.rl = rl;
    rl.on("line", (line) => this.handleLine(line));

    child.stderr!.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString("utf-8")).slice(-STDERR_TAIL_CHARS);
    });

    child.on("error", (err) => {
      this.exitError = err;
      this.failAllPending(err);
    });

    child.on("exit", (code, signal) => {
      const err =
        this.exitError ||
        new Error(`ACP agent process exited unexpectedly (code=${code}, signal=${signal})`);
      if (!this.exitError) this.exitError = err;
      this.failAllPending(err);
      this.currentTurn?.fail(err);
      this.rl?.close();
      this.rl = null;
      this.child = null;
    });
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private sendLine(msg: unknown): void {
    if (!this.child || !this.child.stdin?.writable) {
      throw new Error("ACP agent process is not running");
    }
    this.child.stdin.write(`${JSON.stringify(msg)}\n`, "utf-8");
  }

  /**
   * Send a JSON-RPC request and await its result. Notifications (no response)
   * are sent via `sendNotification` instead.
   */
  private request(
    method: string,
    params: unknown,
    timeoutMs = HANDSHAKE_TIMEOUT_MS
  ): Promise<unknown> {
    this.ensureProcess();
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`ACP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve: resolvePromise, reject: rejectPromise, timer });
      try {
        this.sendLine({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectPromise(err as Error);
      }
    });
  }

  private sendNotification(method: string, params: unknown): void {
    this.sendLine({ jsonrpc: "2.0", method, params });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      // Malformed stdout is not fatal; the agent may print stray text.
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (typeof msg.method === "string") {
      if (msg.method === "session/update") {
        this.handleUpdate(msg.params);
      } else if (msg.method === "session/request_permission") {
        this.handlePermissionRequest(msg);
      }
      return;
    }

    if (typeof msg.id === "number" || typeof msg.id === "string") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        pending.reject(
          new Error(`ACP request '${pending.method}' failed: ${jsonRpcErrorText(msg.error)}`)
        );
      } else {
        pending.resolve(msg.result ?? {});
      }
    }
  }

  private handleUpdate(params: any): void {
    if (!params || typeof params !== "object") return;
    const update = params.update;
    if (!update || typeof update !== "object") return;
    const turn = this.currentTurn;
    const kind = update.sessionUpdate;

    switch (kind) {
      case "state_update": {
        if (update.state === "idle") {
          turn?.finish(typeof update.stopReason === "string" ? update.stopReason : undefined);
        }
        break;
      }
      case "agent_message": {
        const id = String(update.messageId ?? "");
        if (!turn || !id) break;
        const text = blocksText(update.content);
        turn.messageTexts.set(id, text);
        if (!turn.messageOrder.includes(id)) turn.messageOrder.push(id);
        // Full replacement: stream it once if nothing has been streamed yet.
        if (text && this.chunkForwarder && !turn.forwardedMessageIds.has(id)) {
          turn.forwardedMessageIds.add(id);
          this.chunkForwarder(text);
        }
        break;
      }
      case "agent_message_chunk": {
        const id = String(update.messageId ?? "");
        if (!turn || !id) break;
        const text = blockText(update.content);
        if (text) {
          turn.messageTexts.set(id, (turn.messageTexts.get(id) || "") + text);
          if (!turn.messageOrder.includes(id)) turn.messageOrder.push(id);
          turn.forwardedMessageIds.add(id);
          this.chunkForwarder?.(text);
        }
        break;
      }
      case "agent_thought": {
        const id = String(update.messageId ?? update.thoughtId ?? "");
        if (!turn || !id) break;
        turn.thoughtTexts.set(id, blocksText(update.content));
        if (!turn.thoughtOrder.includes(id)) turn.thoughtOrder.push(id);
        break;
      }
      case "agent_thought_chunk": {
        const id = String(update.messageId ?? update.thoughtId ?? "");
        if (!turn || !id) break;
        turn.thoughtTexts.set(id, (turn.thoughtTexts.get(id) || "") + blockText(update.content));
        if (!turn.thoughtOrder.includes(id)) turn.thoughtOrder.push(id);
        break;
      }
      case "usage_update": {
        if (turn && update.usage && typeof update.usage === "object") {
          turn.usage = update.usage;
        }
        break;
      }
      case "tool_call_update": {
        if (turn) this.applyToolCallUpdate(turn, update);
        break;
      }
      case "tool_call_content_chunk": {
        const id = String(update.toolCallId ?? "");
        const state = turn?.toolCalls.get(id);
        if (state && update.content) state.content.push(blockText(update.content));
        break;
      }
      default:
        // plan_update / terminal_update / terminal_output_chunk are not
        // surfaced through LLMProvider yet — they remain log-only.
        break;
    }
  }

  private applyToolCallUpdate(turn: TurnState, update: any): void {
    const id = String(update.toolCallId ?? "");
    if (!id) return;
    const status = String(update.status ?? "");

    if (status === "pending" || status === "in_progress") {
      let state = turn.toolCalls.get(id);
      if (!state) {
        state = {
          title: String(update.title ?? "tool"),
          status,
          startedAt: Date.now(),
          input: update.input,
          content: [],
        };
        turn.toolCalls.set(id, state);
        // First observation of an in-flight tool → tool timeline start event.
        this.currentOverrideConfig?.onServerToolStart?.(state.title, this.toolArgs(state), id);
      } else {
        state.status = status;
        if (update.title) state.title = String(update.title);
        if (update.input !== undefined) state.input = update.input;
      }
      return;
    }

    // Terminal states: completed / error / cancelled
    let state = turn.toolCalls.get(id);
    const isFirstObservation = !state;
    if (!state) {
      state = {
        title: String(update.title ?? "tool"),
        status,
        startedAt: Date.now(),
        input: update.input,
        content: [],
      };
      turn.toolCalls.set(id, state);
    }
    if (update.title) state.title = String(update.title);
    if (typeof update.output === "string") state.output = update.output;
    if (Array.isArray(update.content)) {
      for (const block of update.content) {
        const text = blockText(block);
        if (text) state.content.push(text);
      }
    }

    const durationMs = Date.now() - state.startedAt;
    const success = status !== "error" && status !== "cancelled";
    const resultText = toolOutputText(state);
    const override = this.currentOverrideConfig;
    if (isFirstObservation) override?.onServerToolStart?.(state.title, this.toolArgs(state), id);
    override?.onServerToolEnd?.(state.title, resultText, durationMs, success, id);
  }

  private toolArgs(state: ToolCallState): Record<string, unknown> {
    if (state.input && typeof state.input === "object" && !Array.isArray(state.input)) {
      return state.input as Record<string, unknown>;
    }
    if (typeof state.input === "string") {
      try {
        const parsed = JSON.parse(state.input);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      } catch {
        /* keep empty */
      }
      return { value: state.input };
    }
    return {};
  }

  private handlePermissionRequest(msg: any): void {
    const params = msg.params || {};
    const options: Array<{ optionId: string; name?: string; kind?: string }> = Array.isArray(
      params.options
    )
      ? params.options
      : [];
    const allowOnce = options.find((o) => o.kind === "allow_once")?.optionId;
    const outcome = this.autoApprovePermissions && allowOnce ? "selected" : "rejected";

    if (!this.autoApprovePermissions || !allowOnce) {
      console.log(
        `[ACP] External agent requested permission: ${params.title ?? ""}${
          params.description ? ` — ${params.description}` : ""
        }`
      );
      if (!this.autoApprovePermissions) {
        console.log(
          "[ACP] Permission request rejected (autoApprovePermissions=false). " +
            "Configure the external agent to run without prompts (e.g. --full-auto) or enable auto-approval."
        );
      }
    }

    const result = {
      outcome: { outcome, ...(outcome === "selected" ? { optionId: allowOnce } : {}) },
    };
    this.sendLine({ jsonrpc: "2.0", id: msg.id, result });
  }

  private async initialize(): Promise<void> {
    const result = (await this.request(
      "initialize",
      {
        protocolVersion: ACP_PROTOCOL_VERSION,
        capabilities: {},
        info: { name: "hachimi", title: "Hachimi", version: "0.1.0" },
      },
      HANDSHAKE_TIMEOUT_MS
    )) as AgentCapabilities;
    this.capabilities = result || {};

    if (Number(result?.protocolVersion) !== ACP_PROTOCOL_VERSION) {
      throw new Error(
        `ACP protocol version mismatch: agent supports ${result?.protocolVersion}, hachimi speaks v${ACP_PROTOCOL_VERSION}`
      );
    }
    if (!result?.capabilities?.session) {
      throw new Error("ACP agent does not advertise session capabilities");
    }
  }

  private supportsImage(): boolean {
    return Boolean(this.capabilities?.capabilities?.session?.prompt?.image);
  }

  private supportsEmbeddedContext(): boolean {
    return Boolean(this.capabilities?.capabilities?.session?.prompt?.embeddedContext);
  }

  private async newSession(): Promise<string> {
    const result = (await this.request("session/new", {
      cwd: isAbsolute(this.cwd) ? this.cwd : resolve(this.cwd),
    })) as { sessionId?: string };
    if (!result?.sessionId) {
      throw new Error("ACP agent did not return a sessionId from session/new");
    }
    this.sessionId = result.sessionId;
    return this.sessionId;
  }

  private async ensureSession(): Promise<string> {
    this.ensureProcess();
    if (this.sessionId) return this.sessionId;
    if (!this.capabilities) await this.initialize();
    return this.newSession();
  }

  /** Latest user message → ACP ContentBlock[] prompt. */
  private buildPrompt(messages: Message[]): unknown[] {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const prompt: unknown[] = [];
    if (!lastUser) {
      prompt.push({ type: "text", text: "" });
      return prompt;
    }

    const parts: ContentPart[] =
      typeof lastUser.content === "string"
        ? [{ type: "text", text: lastUser.content }]
        : lastUser.content;

    for (const part of parts) {
      if (part.type === "text") {
        if (part.text) prompt.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        if (this.supportsImage()) {
          const data = url.startsWith("data:") ? url.slice(url.indexOf(",") + 1) : url;
          const mimeType = url.startsWith("data:")
            ? (url.match(/^data:([^;,]+)/)?.[1] ?? "image/png")
            : "image/png";
          prompt.push({ type: "image", mimeType, data });
        } else {
          console.log(
            "[ACP] External agent does not advertise image support; image attachment dropped."
          );
        }
      }
    }
    return prompt;
  }

  private beginTurn(overrideConfig: Partial<ProviderTransportConfig> | undefined): TurnState {
    let resolveDone!: (value: { stopReason?: string }) => void;
    let rejectDone!: (err: Error) => void;
    const done = new Promise<{ stopReason?: string }>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });
    const turn: TurnState = {
      done,
      finish: (stopReason) => resolveDone({ stopReason }),
      fail: (err) => rejectDone(err),
      messageTexts: new Map(),
      messageOrder: [],
      forwardedMessageIds: new Set(),
      thoughtTexts: new Map(),
      thoughtOrder: [],
      toolCalls: new Map(),
    };
    this.currentTurn = turn;
    this.currentOverrideConfig = overrideConfig;
    return turn;
  }

  private cancelSession(): void {
    if (!this.sessionId) return;
    try {
      this.sendNotification("session/cancel", { sessionId: this.sessionId });
    } catch {
      /* The agent process may already be gone — nothing to cancel. */
    }
  }

  private async runTurn(
    messages: Message[],
    _tools: ToolDefinition[],
    overrideConfig: Partial<ProviderTransportConfig> | undefined,
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (this.separateSession && this.sessionId) {
      // Session isolation: close the previous external session before a new turn.
      try {
        this.cancelSession();
        await this.request("session/close", { sessionId: this.sessionId });
      } catch {
        /* best-effort: the agent may have already exited */
      }
      this.sessionId = null;
    }
    const sessionId = await this.ensureSession();
    const timeoutMs = overrideConfig?.timeoutMs ?? this.timeoutMs;
    const signal = overrideConfig?.signal;

    if (signal?.aborted) {
      throw new DOMException("ACP turn aborted", "AbortError");
    }

    const turn = this.beginTurn(overrideConfig);
    try {
      await this.request(
        "session/prompt",
        { sessionId, prompt: this.buildPrompt(messages) },
        Math.min(timeoutMs, HANDSHAKE_TIMEOUT_MS)
      );

      await new Promise<void>((resolveWait, rejectWait) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.cancelSession();
          rejectWait(
            new Error(`ACP turn timed out after ${timeoutMs}ms — external agent cancelled`)
          );
        }, timeoutMs);

        turn.done.then(
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolveWait();
          },
          (err: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            rejectWait(err);
          }
        );

        if (signal) {
          const onAbort = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.cancelSession();
            rejectWait(new DOMException("ACP turn aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    } catch (err) {
      if (isAbortError(err)) {
        this.cancelSession();
        if (this.exitError) throw this.exitError;
      }
      throw err;
    } finally {
      this.currentTurn = null;
      this.currentOverrideConfig = undefined;
    }

    const finalText = turn.messageOrder.map((id) => turn.messageTexts.get(id) || "").join("");
    const reasoning =
      turn.thoughtOrder.map((id) => turn.thoughtTexts.get(id) || "").join("\n\n") || null;
    const usage = turn.usage ? normalizeUsage(turn.usage) : undefined;
    const usageWithCost = usage
      ? { ...usage, costUsd: calculateAcpCostUsd(usage, this.model) }
      : undefined;

    return {
      content: finalText,
      reasoning_content: reasoning,
      usage: usageWithCost,
    };
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    return this.runTurn(messages, tools, overrideConfig, undefined);
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfigOrOnChunk?: Partial<ProviderTransportConfig> | ((chunk: string) => void),
    onChunkOrConfig?: ((chunk: string) => void) | Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    let overrideConfig: Partial<ProviderTransportConfig> | undefined;
    let onChunk: ((chunk: string) => void) | undefined;

    if (typeof overrideConfigOrOnChunk === "function") {
      onChunk = overrideConfigOrOnChunk;
      if (onChunkOrConfig && typeof onChunkOrConfig === "object") {
        overrideConfig = onChunkOrConfig as Partial<ProviderTransportConfig>;
      }
    } else {
      overrideConfig = overrideConfigOrOnChunk;
      if (typeof onChunkOrConfig === "function") onChunk = onChunkOrConfig;
    }

    // Forward agent_message_chunk text through onChunk. The chunk callback is
    // invoked from handleUpdate via a lightweight hook so streaming stays live.
    this.chunkForwarder = onChunk;
    try {
      return await this.runTurn(messages, tools, overrideConfig, onChunk);
    } finally {
      this.chunkForwarder = undefined;
    }
  }

  private chunkForwarder?: (chunk: string) => void;

  /** For ACP, tool loops run inside the external agent — never surfaced as tool_calls. */
  private currentOverrideConfig: Partial<ProviderTransportConfig> | undefined;

  /** Public probe: initialize handshake + capability report (used by connection-tester). */
  async probe(timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<{
    protocolVersion: number;
    name?: string;
    supportsSession: boolean;
    stderr?: string;
  }> {
    await this.initialize();
    return {
      protocolVersion: Number(this.capabilities?.protocolVersion ?? 0),
      name: this.capabilities?.info?.name,
      supportsSession: Boolean(this.capabilities?.capabilities?.session),
      stderr: this.stderrTail || undefined,
    };
  }

  /** Test helper: expose the active external session id. */
  sessionIdForTest(): string | null {
    return this.sessionId;
  }

  /** Best-effort cleanup: kill the child process and settle pending requests. */
  dispose(): void {
    this.failAllPending(new Error("ACP provider disposed"));
    this.currentTurn?.fail(new Error("ACP provider disposed"));
    this.currentTurn = null;
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
    this.rl?.close();
    this.rl = null;
    this.child = null;
  }
}

function calculateAcpCostUsd(usage: ReturnType<typeof normalizeUsage>, _model: string): number {
  // External agent token accounting is reported by the agent itself; hachimi
  // has no pricing table for arbitrary harnesses, so cost stays 0 until usage
  // metadata can be mapped to a real provider.
  return 0;
}

/**
 * Probe an external agent command: spawn, initialize, report capabilities and
 * protocol compatibility. Used by connection-tester before a full session.
 */
export async function probeAcpAgent(
  command: string,
  commandArgs: string[] = [],
  cwd = process.cwd(),
  timeoutMs = HANDSHAKE_TIMEOUT_MS
): Promise<{ protocolVersion: number; name?: string; supportsSession: boolean; stderr?: string }> {
  const provider = new AcpClientProvider({
    apiKey: "",
    command,
    commandArgs,
    cwd,
    timeoutMs: Math.max(timeoutMs, 5_000),
  });
  try {
    return await provider.probe(timeoutMs);
  } finally {
    provider.dispose();
  }
}
