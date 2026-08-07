import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function openNativeFolderPicker(): Promise<string | null> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const cmd = `osascript -e 'tell application "System Events" to activate' -e 'POSIX path of (choose folder with prompt "选择目录")'`;
      const { stdout } = await execAsync(cmd);
      const chosen = stdout.trim();
      return chosen ? chosen.replace(/\/$/, "") : null;
    } else if (platform === "win32") {
      const psCmd = `powershell -Command "Add-Type -AssemblyName System.windows.forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }"`;
      const { stdout } = await execAsync(psCmd);
      const chosen = stdout.trim();
      return chosen || null;
    } else {
      const { stdout } = await execAsync(`zenity --file-selection --directory`);
      const chosen = stdout.trim();
      return chosen || null;
    }
  } catch {
    return null;
  }
}

async function openNativeFilePicker(): Promise<string | null> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const cmd = `osascript -e 'tell application "System Events" to activate' -e 'POSIX path of (choose file with prompt "选择文件")'`;
      const { stdout } = await execAsync(cmd);
      const chosen = stdout.trim();
      return chosen || null;
    } else if (platform === "win32") {
      const psCmd = `powershell -Command "Add-Type -AssemblyName System.windows.forms; $f = New-Object System.Windows.Forms.OpenFileDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.FileName }"`;
      const { stdout } = await execAsync(psCmd);
      const chosen = stdout.trim();
      return chosen || null;
    } else {
      const { stdout } = await execAsync(`zenity --file-selection`);
      const chosen = stdout.trim();
      return chosen || null;
    }
  } catch {
    return null;
  }
}

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  CREDENTIAL_KIND_LABELS,
  type CredentialKind,
  type CredentialStore,
  fetchConnectionModels,
  getDefaultCredentialStore,
  isVisionModelId,
  type LlmConnection,
  maskApiKey,
  PROVIDER_CATALOG,
  resolveCredentialReference,
  saveConfig,
  testConnection,
} from "@hachimi/config";
import {
  type AppContext,
  buildUsageSummary,
  createHarnessRuntime,
  getOrCreateHarnessRuntime,
  type HarnessRuntime,
  installSkillsFromGitHub,
  ProactiveScheduler,
  SkillPackageLoader,
  SkillProposalManager,
  TrajectoryCompressor,
  VisionCompanion,
} from "@hachimi/core";
import {
  DAEMON_DEFAULT_HOST,
  DAEMON_DEFAULT_PORT,
  generateId,
  log,
  summarizeToolArgs,
  type ToolArgSummary,
} from "@hachimi/shared";
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

export interface HachimiApiServerOptions {
  runtime?: HarnessRuntime;
  appContext?: AppContext;
  port?: number;
  host?: string;
  secretKey?: string;
  /** Where config updates are persisted (default: standard config.json resolution) */
  configPath?: string;
  /** Credential store for API keys (default: shared ~/.hachimi store) */
  credentialStore?: CredentialStore;
}

export interface HachimiApiServer {
  runtime: HarnessRuntime;
  appContext: AppContext;
  proposalManager: SkillProposalManager;
  scheduler: ProactiveScheduler;
  fastify: FastifyInstance;
  listen(): Promise<string>;
  close(): Promise<void>;
}

export function createHachimiApiServer(options: HachimiApiServerOptions = {}): HachimiApiServer {
  const runtime =
    options.runtime ||
    (options.appContext
      ? // 显式注入 appContext（测试/宿主进程）：直接绑定，避免单例污染。
        createHarnessRuntime(options.appContext)
      : getOrCreateHarnessRuntime({}));
  const appContext = runtime.context;
  const proposalManager = new SkillProposalManager(appContext.config.paths.dataDir, runtime.skills);
  const scheduler = new ProactiveScheduler(
    appContext.config.paths.dataDir,
    appContext.activityPolicy
  );
  const configPath = options.configPath ?? "config.json";
  const credStore = options.credentialStore ?? getDefaultCredentialStore();

  // L1: 待审批注册表（供 /api/status 托盘轮询与 approve/deny 使用）
  const pendingApprovals = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      toolName: string;
      args: Record<string, unknown>;
      sessionId?: string;
      argsSummary?: ToolArgSummary;
      diff?: string;
      requestedAt: number;
    }
  >();

  const secretKey = resolveApiSecret(options.secretKey, appContext.config.paths.dataDir);
  const authRequired = Boolean(secretKey);

  const server = fastify({ logger: false });

  // W2.4: CORS 白名单 — 只允许 localhost:* 来源，拒绝任意反射
  server.register(cors, {
    origin: (origin, cb) => {
      // 无 origin (curl / server-to-server) 或 localhost 来源均放行
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin '${origin}' not allowed`), false);
      }
    },
    credentials: true,
  });
  server.register(websocket);

  // F3 / W3: 托管 Web UI 静态产物 (使用统一 Work-first UI: apps/web/dist)
  const webDistDir = resolve(process.cwd(), "apps", "web", "dist");
  const webPublicDir = resolve(process.cwd(), "packages", "channels", "web", "public");
  const staticRoot = existsSync(webDistDir)
    ? webDistDir
    : existsSync(webPublicDir)
      ? webPublicDir
      : webDistDir;

  if (existsSync(staticRoot)) {
    log("info", `🌐 Serving Web UI from ${staticRoot}`);
    server.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
    });
  }

  // SPA Fallback: 非 API 请求路由回退到 index.html (注入 API Secret 变量)
  server.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith("/api") && !request.url.startsWith("/health")) {
      const indexPath = resolve(staticRoot, "index.html");
      if (existsSync(indexPath)) {
        let html = readFileSync(indexPath, "utf-8");
        if (secretKey) {
          html = html.replace(
            "<head>",
            `<head><script>window.__HACHIMI_API_SECRET__="${secretKey}";</script>`
          );
        }
        return reply.type("text/html").send(html);
      }
    }
    return reply.status(404).send({ error: "Not Found", path: request.url });
  });

  // H1.6 链路追踪 x-request-id 中间件
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const reqId = (request.headers["x-request-id"] as string) || generateId("req_");
    (request as any).requestId = reqId;
    reply.header("x-request-id", reqId);
  });

  // C5 传输层 Token 鉴权中间件 (针对 /api/* 接口校验 Token，本地 127.0.0.1 回环与静态文件豁免)
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith("/api")) {
      return;
    }

    // 若显式指定了 secretKey (如测试用例或 HACHIMI_API_SECRET)，强制执行 Bearer Token 校验；
    // 若 Secret 为系统自动生成的底层兜底，本地 127.0.0.1 回环无缝放行，远程非本机请求严格校验。
    const isAutoGeneratedSecret = !options.secretKey && !process.env.HACHIMI_API_SECRET;
    if (isAutoGeneratedSecret) {
      const clientIp = request.ip || "";
      const host = request.hostname || "";
      const isLocalhost =
        clientIp === "127.0.0.1" ||
        clientIp === "::1" ||
        clientIp === "::ffff:127.0.0.1" ||
        host.startsWith("localhost") ||
        host.startsWith("127.0.0.1");

      if (isLocalhost) {
        return;
      }
    }

    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (request.query && typeof request.query === "object" && "token" in request.query) {
      token = String((request.query as any).token);
    }

    if (!token || token !== secretKey) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid or missing Bearer API secret token",
      });
    }
  });

  // 1. GET /health
  server.get("/health", async () => {
    return {
      status: "ok",
      authRequired,
      version: "0.1.0",
      timestamp: Date.now(),
    };
  });

  // 2. GET /api/status
  server.get("/api/status", async () => {
    const runningTasks = appContext.backgroundTasks
      .list()
      .filter((t) => t.status === "running").length;
    return {
      ...runtime.getStatus(),
      // L1: 托盘/角标轮询所需的实时计数
      pendingApprovals: pendingApprovals.size,
      runningTasks,
    };
  });

  // L1: GET /api/tasks — 后台任务面板（J3 surfacing）
  server.get("/api/tasks", async () => {
    return { tasks: appContext.backgroundTasks.list() };
  });

  // L1: POST /api/tasks/:id/kill — 终止后台任务
  server.post("/api/tasks/:id/kill", async (request, reply) => {
    const taskId = (request.params as { id: string }).id;
    const task = appContext.backgroundTasks.get(taskId);
    if (!task) {
      reply.code(404).send({ error: `Task not found: ${taskId}` });
      return;
    }
    const killed = await appContext.backgroundTasks.kill(taskId);
    return { success: killed, taskId };
  });

  // L1: GET /api/approvals — 待审批队列（托盘 openApprovals → 审批面板）
  server.get("/api/approvals", async () => {
    return {
      approvals: Array.from(pendingApprovals.entries()).map(([approvalId, record]) => ({
        approvalId,
        toolName: record.toolName,
        sessionId: record.sessionId,
        requestedAt: record.requestedAt,
        argsSummary: record.argsSummary,
        diff: record.diff,
      })),
    };
  });

  // L1: GET /api/usage — 用量/费用汇总（B8 surfacing）
  server.get("/api/usage", async (request) => {
    const query = request.query as { days?: string };
    const days = query.days ? Number(query.days) : 7;
    const sessionIds = await runtime.events.listSessionIds();
    const events = [];
    for (const sid of sessionIds) {
      const page = await runtime.events.list(sid, {
        types: ["run_finished", "error", "tool_call"],
        limit: 100_000,
      });
      events.push(...page.events);
    }
    return buildUsageSummary(events, {
      days: Number.isFinite(days) && days > 0 ? Math.floor(days) : 0,
    });
  });

  // L1: GET /api/search — 跨会话搜索（B12 lite）
  server.get("/api/search", async (request) => {
    const query = request.query as { q?: string; limit?: string };
    const q = (query.q || "").trim().toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    if (!q) return { query: "", results: [] };

    const results: Array<{
      type: "message" | "work";
      sessionId: string;
      workId?: string;
      role?: string;
      content: string;
      snippet: string;
      timestamp: string;
    }> = [];

    for (const meta of runtime.sessions.list()) {
      // list() 仅返回元信息（id/title/updatedAt），消息需逐会话 load
      const session = runtime.sessions.load(meta.id);
      if (!session) continue;
      const messages = session && Array.isArray(session.messages) ? session.messages : [];
      for (const m of messages) {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        if (content.toLowerCase().includes(q)) {
          results.push({
            type: "message",
            sessionId: session.id,
            role: m.role,
            content,
            snippet: content.length > 160 ? `${content.slice(0, 160)}…` : content,
            timestamp: new Date(m.timestamp).toISOString(),
          });
          if (results.length >= limit) {
            return { query: q, results };
          }
        }
      }
    }

    for (const work of runtime.works.list()) {
      const haystack = `${work.title ?? ""} ${work.goal ?? ""}`.toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          type: "work",
          // 初始阶段 workId === sessionId（1:1 映射）
          sessionId: work.id,
          workId: work.id,
          content: work.title ?? work.goal ?? "",
          snippet: (work.title ?? work.goal ?? "").slice(0, 160),
          timestamp: work.createdAt ?? new Date().toISOString(),
        });
        if (results.length >= limit) break;
      }
    }

    return { query: q, results };
  });

  // L1: GET /api/grants — 记忆授权列表（J4 surfacing）
  server.get("/api/grants", async () => {
    const store = runtime.tools.getGrantStore();
    return { grants: store?.list() ?? [] };
  });

  // L1: DELETE /api/grants — 撤销记忆授权（按 id 或整项目）
  server.delete("/api/grants", async (request) => {
    const body = (request.body || {}) as {
      grantId?: string;
      workspaceRoot?: string;
      toolName?: string;
    };
    const store = runtime.tools.getGrantStore();
    if (!store) return { removed: 0 };
    if (body.grantId) {
      return { removed: store.removeById(body.grantId) ? 1 : 0 };
    }
    const removed = store.removeAll(body.workspaceRoot, body.toolName);
    return { removed };
  });

  // W3.7: GET /api/config — 读取 Daemon 配置（不暴露 apiKey）
  server.get("/api/config", async () => {
    const cfg = appContext.getConfig();
    const connections = Object.entries(cfg.llm.connections || {}).map(([id, c]) => ({
      id,
      name: c.name,
      providerType: c.providerType,
      enabled: c.enabled,
      model: c.defaultModelId || "default",
      models: c.models || [],
      enabledModels: c.enabledModels || [],
      baseURL: c.baseUrl || undefined,
      hasKey: credStore.has(id) || Boolean(c.apiKey),
      supportsVision: c.supportsVision,
      visionModels: (c.enabledModels || []).filter((m) => isVisionModelId(m, c)),
    }));
    // Backward compat: legacy providers shape
    const providers = Object.entries(cfg.llm.providers || {}).map(([id, p]) => ({
      id,
      model: p.model || "default",
      hasKey: Boolean(p.apiKey),
      baseURL: p.baseURL || undefined,
    }));
    return {
      activeConnectionId: cfg.llm.activeConnectionId || "mock",
      connections,
      activeProvider: cfg.llm.activeProvider || cfg.llm.activeConnectionId || "mock",
      providers,
      vision: cfg.llm.vision ?? {},
      permissionRules: cfg.permissionRules ?? {},
    };
  });

  // W3.7: PATCH /api/config — 更新 Daemon 配置（切换 provider / model）
  server.patch("/api/config", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      activeProvider?: string;
      model?: string;
      vision?: { enabled?: boolean; connectionId?: string; modelId?: string };
      permissionRules?: {
        deny?: string[];
        ask?: string[];
        allow?: string[];
        dangerousCommands?: string[];
      };
    };

    const cfg = appContext.getConfig();

    // 权限规则（deny/ask/allow/dangerousCommands）：直接持久化，运行时规则引擎实时读取
    if (body.permissionRules) {
      cfg.permissionRules = {
        deny: body.permissionRules.deny,
        ask: body.permissionRules.ask,
        allow: body.permissionRules.allow,
        dangerousCommands: body.permissionRules.dangerousCommands,
      };
      saveConfig(cfg, configPath);
      return { success: true, permissionRules: cfg.permissionRules };
    }

    // 视觉协助（"模型的眼睛"）配置：仅持久化，无需重建 provider（companion 实时读取 config）
    if (body.vision) {
      const vision = body.vision;
      cfg.llm.vision = {
        ...(cfg.llm.vision ?? {}),
        ...(vision.enabled !== undefined ? { enabled: vision.enabled } : {}),
        ...(vision.connectionId !== undefined ? { connectionId: vision.connectionId } : {}),
        ...(vision.modelId !== undefined ? { modelId: vision.modelId } : {}),
      };
      saveConfig(cfg, configPath);
      return { success: true, vision: cfg.llm.vision };
    }

    if (body.activeProvider) {
      const providerName = body.activeProvider.toLowerCase();
      // 新连接模型（connections）优先：切换激活连接并可选更新默认模型
      if (cfg.llm.connections?.[providerName]) {
        appContext.setActiveConnection(
          providerName,
          body.model ? { defaultModelId: body.model } : undefined
        );
        return {
          success: true,
          activeProvider: providerName,
          model: body.model || cfg.llm.connections[providerName].defaultModelId || "default",
        };
      }

      // 兼容旧版 providers 配置
      if (!cfg.llm.providers?.[providerName]) {
        reply.code(400).send({
          error: `Unknown provider: ${providerName}`,
        });
        return;
      }

      const pConfig = body.model ? { defaultModelId: body.model } : undefined;

      appContext.setActiveConnection(providerName, pConfig);

      return {
        success: true,
        activeProvider: providerName,
        model: cfg.llm.providers?.[providerName]?.model || body.model || "default",
      };
    }

    if (body.model) {
      // 仅更新当前 provider 的 model
      const activeName = cfg.llm.activeProvider || cfg.llm.activeConnectionId || "mock";
      appContext.setActiveConnection(activeName, { defaultModelId: body.model });

      return {
        success: true,
        activeProvider: activeName,
        model: body.model,
      };
    }

    reply.code(400).send({
      error: "Missing activeProvider or model in request body",
    });
  });

  // L1: POST /api/llm/active — 切换当前激活的连接/模型（Composer/Settings 调用）
  server.post("/api/llm/active", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { providerId?: string; model?: string };
    const cfg = appContext.getConfig();
    const model = body.model?.trim();
    let connectionId = body.providerId?.trim();

    if (!connectionId && model) {
      // 仅传 model：沿用当前激活连接；若当前是 mock 或无连接则拒绝，
      // 避免用户以为切到了真实模型、实际仍走 MockLLMProvider。
      const current = cfg.llm.activeConnectionId;
      if (!current || current === "mock" || !cfg.llm.connections?.[current]) {
        reply.code(400).send({
          error: "Missing providerId — 当前激活连接不可用（mock），请指定 providerId",
        });
        return;
      }
      connectionId = current;
    }

    if (!connectionId) {
      reply.code(400).send({ error: "Missing providerId or model in request body" });
      return;
    }

    if (!cfg.llm.connections?.[connectionId]) {
      reply.code(400).send({ error: `Unknown connection: ${connectionId}` });
      return;
    }

    appContext.setActiveConnection(connectionId, model ? { defaultModelId: model } : undefined);

    return {
      success: true,
      activeConnectionId: connectionId,
      model: model || cfg.llm.connections[connectionId].defaultModelId || "default",
    };
  });

  // ── Connection CRUD (single source of truth) ────────────────────────────
  // GET /api/llm/connections — list connections (keys masked)
  server.get("/api/llm/connections", async () => {
    const cfg = appContext.getConfig();
    const connections = Object.entries(cfg.llm.connections || {}).map(([id, c]) => ({
      id,
      name: c.name,
      providerType: c.providerType,
      enabled: c.enabled,
      baseUrl: c.baseUrl,
      defaultModelId: c.defaultModelId,
      models: c.models || [],
      enabledModels: c.enabledModels || [],
      modelSource: c.modelSource || "static_catalog",
      modelsFetchedAt: c.modelsFetchedAt,
      lastTestStatus: c.lastTestStatus || "untested",
      lastTestAt: c.lastTestAt,
      lastTestMessage: c.lastTestMessage,
      apiKeyPreview: maskApiKey(credStore.get(id) || c.apiKey),
      hasKey: credStore.has(id) || Boolean(c.apiKey),
      supportsVision: c.supportsVision,
      serverWebSearch: c.serverWebSearch,
      command: c.command,
      commandArgs: c.commandArgs,
      cwd: c.cwd,
      autoApprovePermissions: c.autoApprovePermissions,
      separateSession: c.separateSession,
      visionModels: (c.enabledModels || []).filter((m) => isVisionModelId(m, c)),
    }));
    // Provider catalog presets so the settings UI can render a provider list
    // (label, category, signup link, default base URL, curated models).
    const catalog = PROVIDER_CATALOG.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      category: p.category,
      protocol: p.protocol,
      requiresKey: p.requiresKey,
      signupUrl: p.signupUrl,
      defaultBaseUrl: p.defaultBaseUrl,
      modelsPath: p.modelsPath,
      fallbackModels: p.fallbackModels,
      devOnly: p.devOnly,
    }));
    return {
      connections,
      catalog,
      vision: cfg.llm.vision ?? {},
      activeConnectionId: cfg.llm.activeConnectionId || cfg.llm.activeProvider || "mock",
    };
  });

  // POST /api/llm/connections — create or update a connection
  server.post("/api/llm/connections", async (request, reply) => {
    const body = (request.body || {}) as {
      id?: string;
      name?: string;
      providerType?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModelId?: string;
      models?: string[];
      enabledModels?: string[];
      enabled?: boolean;
      serverWebSearch?: boolean;
      command?: string;
      commandArgs?: string[];
      cwd?: string;
      autoApprovePermissions?: boolean;
      separateSession?: boolean;
    };
    const id = body.id || body.providerType;
    if (!id) {
      reply.code(400).send({ error: "Missing connection id" });
      return;
    }
    const cfg = appContext.getConfig();
    if (!cfg.llm.connections) cfg.llm.connections = {};

    // Env auto-fill: if no key supplied, read from catalog.envKeys (Pi pattern)
    let resolvedKey = body.apiKey;
    if (!resolvedKey) {
      const preset = PROVIDER_CATALOG.find(
        (p) => p.id === (body.providerType || id) || p.id === id
      );
      if (preset) {
        for (const envKey of preset.envKeys) {
          const envVal = process.env[envKey];
          if (envVal) {
            resolvedKey = envVal;
            break;
          }
        }
      }
    }

    const existing = cfg.llm.connections[id];
    const preset = PROVIDER_CATALOG.find((p) => p.id === (body.providerType || id) || p.id === id);

    // Seed a brand-new connection from the catalog preset (base URL, curated
    // models, recommended default model) so one click creates a usable entry.
    const seeded: Partial<LlmConnection> = {};
    if (!existing && preset) {
      const recommended = preset.fallbackModels.find((m) => m.recommended)?.id;
      seeded.baseUrl = preset.defaultBaseUrl;
      seeded.models = preset.fallbackModels.map((m) => m.id);
      seeded.enabledModels = preset.fallbackModels.map((m) => m.id);
      seeded.defaultModelId = recommended || preset.fallbackModels[0]?.id || "default";
    }

    const base: LlmConnection = existing || {
      id,
      name: body.name || preset?.label || id.toUpperCase(),
      providerType: body.providerType || preset?.protocol || "openai-compatible",
      enabled: true,
      defaultModelId: "default",
      models: [],
      enabledModels: [],
    };

    cfg.llm.connections[id] = {
      ...base,
      ...seeded,
      ...existing,
      ...(body.name ? { name: body.name } : {}),
      ...(body.providerType ? { providerType: body.providerType } : {}),
      ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
      ...(body.defaultModelId ? { defaultModelId: body.defaultModelId } : {}),
      ...(body.models ? { models: body.models } : {}),
      ...(body.enabledModels ? { enabledModels: body.enabledModels } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.serverWebSearch !== undefined ? { serverWebSearch: body.serverWebSearch } : {}),
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.commandArgs !== undefined ? { commandArgs: body.commandArgs } : {}),
      ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
      ...(body.autoApprovePermissions !== undefined
        ? { autoApprovePermissions: body.autoApprovePermissions }
        : {}),
      ...(body.separateSession !== undefined ? { separateSession: body.separateSession } : {}),
    };

    // API key goes to credential store, never config.json
    if (resolvedKey) {
      credStore.set(id, resolvedKey);
      cfg.llm.connections[id].apiKey = undefined;
    }

    saveConfig(cfg, configPath);
    return { success: true, connection: cfg.llm.connections[id] };
  });

  // DELETE /api/llm/connections/:id
  server.delete("/api/llm/connections/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cfg = appContext.getConfig();
    if (!cfg.llm.connections?.[id]) {
      reply.code(404).send({ error: `Connection not found: ${id}` });
      return;
    }
    delete cfg.llm.connections[id];
    credStore.delete(id);
    saveConfig(cfg, configPath);
    return { success: true };
  });

  // POST /api/llm/connections/:id/test — verify connection with 15s health check (Maka pattern)
  server.post("/api/llm/connections/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cfg = appContext.getConfig();
    const conn = cfg.llm.connections?.[id];
    if (!conn) {
      reply.code(404).send({ error: `Connection not found: ${id}` });
      return;
    }
    const apiKey = credStore.get(id) || conn.apiKey;
    if (conn.providerType !== "mock" && conn.providerType !== "ollama" && !apiKey) {
      reply.code(400).send({ error: "No API key configured for this connection" });
      return;
    }

    const testRes = await testConnection(conn, apiKey);

    // Persist test outcome on the connection (Maka lastTestStatus pattern)
    conn.lastTestStatus = testRes.success
      ? "ok"
      : ((testRes.failureCategory as LlmConnection["lastTestStatus"]) ?? "unknown");
    conn.lastTestAt = new Date().toISOString();
    conn.lastTestMessage = testRes.errorMessage || (testRes.success ? "OK" : "Failed");
    saveConfig(cfg, configPath);

    if (testRes.success) {
      return { success: true, latencyMs: testRes.latencyMs };
    }

    return {
      success: false,
      errorClass: testRes.failureCategory || "error",
      message: testRes.errorMessage || "Connection test failed",
      latencyMs: testRes.latencyMs,
    };
  });

  // POST /api/llm/vision/test — verify the vision companion ("model eyes")
  server.post("/api/llm/vision/test", async (request, reply) => {
    const body = (request.body || {}) as { connectionId?: string; modelId?: string };
    const cfg = appContext.getConfig();

    // 1x1 red PNG — tiny, offline-safe probe image
    const PROBE =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const testCfg = {
      ...cfg,
      llm: {
        ...cfg.llm,
        vision: {
          enabled: true,
          ...(body.connectionId ? { connectionId: body.connectionId } : {}),
          ...(body.modelId ? { modelId: body.modelId } : {}),
        },
      },
    };

    const companion = new VisionCompanion({ config: testCfg });
    if (!companion.isConfigured()) {
      reply.code(400).send({
        success: false,
        error: "No vision-capable connection/model found. Configure one or add an API key.",
      });
      return;
    }

    const resolved = companion.resolve();
    const startedAt = Date.now();
    try {
      const result = await companion.describeImage({ dataUrl: PROBE });
      const latencyMs = Date.now() - startedAt;
      if (!result) {
        return {
          success: false,
          error: "Vision companion call failed (no description returned)",
          latencyMs,
        };
      }
      return {
        success: true,
        connectionId: resolved?.connectionId,
        model: resolved?.modelId,
        latencyMs,
        description: result.description.slice(0, 200),
        cached: result.cached,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  });

  // POST /api/llm/connections/:id/models — dynamic model discovery with catalog fallback
  server.post("/api/llm/connections/:id/models", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cfg = appContext.getConfig();
    const conn = cfg.llm.connections?.[id];
    if (!conn) {
      reply.code(404).send({ error: `Connection not found: ${id}` });
      return;
    }
    const apiKey = credStore.get(id) || conn.apiKey;
    const preset = PROVIDER_CATALOG.find((p) => p.id === conn.providerType);
    const modelsPath = preset?.modelsPath || "/models";

    const fetched = await fetchConnectionModels(conn, apiKey, modelsPath);
    if (fetched.length > 0) {
      conn.models = fetched;
      conn.enabledModels = fetched;
      conn.modelSource = "fetched";
      conn.modelsFetchedAt = new Date().toISOString();
    } else if (preset?.fallbackModels?.length) {
      conn.models = preset.fallbackModels.map((m) => m.id);
      conn.modelSource = "static_catalog";
    }
    saveConfig(cfg, configPath);

    return {
      success: fetched.length > 0,
      models: conn.models,
      modelSource: conn.modelSource,
      modelsFetchedAt: conn.modelsFetchedAt,
    };
  });

  // POST /api/session/model — dynamically switch active connection / model (Maka / Pi pattern)
  server.post("/api/session/model", async (request, reply) => {
    const body = (request.body || {}) as {
      connectionId?: string;
      modelId?: string;
    };
    if (!body.connectionId && !body.modelId) {
      reply.code(400).send({ error: "Missing connectionId or modelId" });
      return;
    }

    const cfg = appContext.getConfig();
    if (body.connectionId) {
      cfg.llm.activeConnectionId = body.connectionId;
      cfg.llm.activeProvider = body.connectionId;
    }
    if (body.modelId && body.connectionId && cfg.llm.connections?.[body.connectionId]) {
      cfg.llm.connections[body.connectionId].defaultModelId = body.modelId;
    }

    saveConfig(cfg, configPath);
    return {
      success: true,
      activeConnectionId: cfg.llm.activeConnectionId,
      activeModelId: body.modelId,
    };
  });

  // 3. POST /api/chat (全部委派给 HarnessRuntime.execute，带 Request ID 追踪)
  server.post("/api/chat", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;
    const body = (request.body || {}) as {
      prompt?: string;
      sessionId?: string;
      provider?: string;
      channel?: string;
      stream?: boolean;
      /** 用户图片附件（dataBase64 / url / filePath） */
      attachments?: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        dataBase64?: string;
        filePath?: string;
        url?: string;
      }>;
    };

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    const isSSE =
      body.stream === true || (request.headers.accept || "").includes("text/event-stream");

    if (isSSE) {
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("x-request-id", requestId);

      try {
        const output = await runtime.execute({
          prompt,
          sessionId: body.sessionId,
          channel: (body.channel as any) || "web-sse",
          providerOverride: body.provider,
          attachments: body.attachments?.map((a) => ({
            id: a.id ?? `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: a.name,
            mimeType: a.mimeType || "image/png",
            dataBase64: a.dataBase64,
            filePath: a.filePath,
            url: a.url,
          })),
          metadata: { requestId },
          options: {
            onChunk: (chunk) => {
              reply.raw.write(`data: ${JSON.stringify({ type: "chunk", chunk })}\n\n`);
            },
            // "模型的眼睛"：视觉协助调用时向客户端推送实时状态
            onVisionCompanionCall: (info) => {
              reply.raw.write(`data: ${JSON.stringify({ type: "vision_companion", ...info })}\n\n`);
            },
            onToolApproval: async (toolName, args, _permission, diff) => {
              const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              const summary = summarizeToolArgs(toolName, args as Record<string, unknown>);
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: "confirm_required",
                  approvalId,
                  toolName,
                  args,
                  argsSummary: summary,
                  diff,
                })}\n\n`
              );
              return new Promise<boolean>((resolve) => {
                pendingApprovals.set(approvalId, {
                  resolve,
                  toolName,
                  args,
                  sessionId: body.sessionId,
                  argsSummary: summary,
                  diff,
                  requestedAt: Date.now(),
                });
                // P2 fix: extend timeout to 120s and emit a specific approval_timeout event
                // instead of silently resolving false (which made Agent think user refused).
                // The UI should display a "timed out, still waiting" indicator.
                setTimeout(() => {
                  if (pendingApprovals.has(approvalId)) {
                    pendingApprovals.delete(approvalId);
                    // Notify the client that we timed out (not a user rejection)
                    reply.raw.write(
                      `data: ${JSON.stringify({
                        type: "approval_timeout",
                        approvalId,
                        toolName,
                        message: "审批等待超时 (120s)。工具调用已暂停，如需继续请重新发送指令。",
                      })}\n\n`
                    );
                    resolve(false);
                  }
                }, 120_000);
              });
            },
          },
        });

        reply.raw.write(
          `data: ${JSON.stringify({
            type: "done",
            sessionId: output.sessionId,
            content: output.content,
            requestId,
          })}\n\n`
        );
      } catch (err: any) {
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "error",
            error: err?.message || String(err),
            requestId,
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return;
    }

    try {
      const output = await runtime.execute({
        prompt,
        sessionId: body.sessionId,
        channel: (body.channel as any) || "api-json",
        providerOverride: body.provider,
        attachments: body.attachments?.map((a) => ({
          id: a.id ?? `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: a.name,
          mimeType: a.mimeType || "image/png",
          dataBase64: a.dataBase64,
          filePath: a.filePath,
          url: a.url,
        })),
        metadata: { requestId },
      });

      return {
        success: true,
        sessionId: output.sessionId,
        content: output.content,
        durationMs: output.durationMs,
        requestId,
      };
    } catch (err: any) {
      reply.code(500).send({
        success: false,
        sessionId: body.sessionId,
        error: err?.message || String(err),
        requestId,
      });
    }
  });

  // W2.2: POST /api/tools/approve — approve, deny, or trust session (Maka pattern)
  server.post("/api/tools/approve", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      approvalId?: string;
      decision?: "approve" | "deny";
      trustSession?: boolean;
      reason?: string;
    };
    if (!body.approvalId || !body.decision) {
      reply.code(400).send({ error: "Missing required parameters: approvalId, decision" });
      return;
    }

    const record = pendingApprovals.get(body.approvalId);
    if (!record) {
      reply.code(404).send({ error: "Approval request expired or not found" });
      return;
    }

    pendingApprovals.delete(body.approvalId);
    const approved = body.decision === "approve";

    if (record.sessionId) {
      if (body.trustSession && approved) {
        const sess = runtime.sessions.getOrCreate(record.sessionId);
        sess.trustLevel = "elevated";
        runtime.sessions.save(sess);
      }

      if (approved) {
        await appContext.events.append({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          type: "approval_granted",
          sessionId: record.sessionId,
          payload: {
            approvalId: body.approvalId,
            toolName: record.toolName,
            surface: "web-sse",
            trustSession: Boolean(body.trustSession),
          },
        });
      } else {
        await appContext.events.append({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          type: "approval_denied",
          sessionId: record.sessionId,
          payload: {
            approvalId: body.approvalId,
            toolName: record.toolName,
            surface: "web-sse",
            reason: body.reason,
          },
        });
      }
    }

    record.resolve(approved);
    return {
      success: true,
      approvalId: body.approvalId,
      decision: body.decision,
      trustSession: Boolean(body.trustSession),
    };
  });

  // C6: POST /api/chat/steer
  server.post("/api/chat/steer", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { prompt?: string; channel?: string };
    const prompt = (body.prompt || "").trim();
    const channel = body.channel || "web-sse";
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    const steered = runtime.steer(prompt);
    return { success: steered, prompt, channel, isRunning: runtime.agent.isRunning() };
  });

  // C6: POST /api/chat/followup
  server.post("/api/chat/followup", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { prompt?: string; channel?: string };
    const prompt = (body.prompt || "").trim();
    const channel = body.channel || "web-sse";
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    runtime.followUp(prompt);
    return { success: true, prompt, channel };
  });

  // Phase D: GET /api/export
  server.get("/api/export", async () => {
    const bundle = await runtime.exportBundle();
    return { success: true, bundle };
  });

  // Phase D: POST /api/import
  server.post("/api/import", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      bundle?: any;
      mergeStrategy?: "additive" | "overwrite";
    };
    if (!body.bundle) {
      reply.code(400).send({ error: "Missing required parameter: bundle" });
      return;
    }
    const result = await runtime.importBundle(body.bundle, {
      mergeStrategy: body.mergeStrategy,
    });
    return { success: true, result };
  });

  // Phase F5: GET /api/skills/proposals (and /api/proposals alias) & Accept / Reject
  const getProposalsHandler = async (request: FastifyRequest) => {
    const status = (request.query as any)?.status as
      | "pending"
      | "approved"
      | "rejected"
      | undefined;
    return { proposals: proposalManager.listProposals(status) };
  };

  const acceptProposalHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = proposalManager.acceptProposal(id);
    if (!result.success) {
      reply.code(400).send(result);
      return;
    }
    return result;
  };

  const rejectProposalHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = proposalManager.rejectProposal(id);
    if (!result.success) {
      reply.code(400).send(result);
      return;
    }
    return result;
  };

  server.get("/api/proposals", getProposalsHandler);
  server.get("/api/skills/proposals", getProposalsHandler);

  server.post("/api/proposals/:id/accept", acceptProposalHandler);
  server.post("/api/skills/proposals/:id/accept", acceptProposalHandler);

  server.post("/api/proposals/:id/reject", rejectProposalHandler);
  server.post("/api/skills/proposals/:id/reject", rejectProposalHandler);

  server.post(
    "/api/works/:id/extract-skill",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const work = runtime.works.get(id);
      if (!work) {
        reply.code(404).send({ error: `Work '${id}' not found` });
        return;
      }

      const sessionId = work.sessionIds[0] || id;
      const eventsRes = await runtime.events.list(sessionId);
      const compressor = new TrajectoryCompressor();
      const candidates = compressor.compressEvents(eventsRes.events);
      const candidate = candidates[0] || {
        name: `skill_${id.slice(-6)}`,
        description: `Learned skill from work: ${work.title}`,
        instructions: `# ${work.title}\n\nInstructions derived from Work trajectory.`,
        triggerCondition: `When user asks for ${work.title}`,
      };

      const proposal = proposalManager.createProposal(
        candidate.name || `skill_${id.slice(-6)}`,
        candidate.description || `Learned skill from work: ${work.title}`,
        candidate.instructions || `# ${work.title}\n\nInstructions derived from Work trajectory.`,
        candidate.triggerCondition || `When user asks for ${work.title}`
      );

      return { success: true, proposal };
    }
  );

  // Phase F6: GET /api/triggers & POST /api/triggers & DELETE /api/triggers/:id
  server.get("/api/triggers", async () => {
    return { triggers: scheduler.listTasks() };
  });

  server.post("/api/triggers", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      name?: string;
      prompt?: string;
      intervalMs?: number;
      cronExpression?: string;
      channel?: string;
      delayMs?: number;
    };
    if (!body.name || !body.prompt) {
      reply.code(400).send({ error: "Missing required parameters: name and prompt" });
      return;
    }
    const created = scheduler.addTask({
      name: body.name,
      prompt: body.prompt,
      intervalMs: body.intervalMs,
      cronExpression: body.cronExpression,
      channel: body.channel,
      delayMs: body.delayMs,
    });
    return { success: true, trigger: created };
  });

  server.delete("/api/triggers/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const removed = scheduler.removeTask(id);
    if (!removed) {
      reply.code(404).send({ error: `Trigger task '${id}' not found` });
      return;
    }
    return { success: true, id };
  });

  server.post("/api/browse-directory", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = await openNativeFolderPicker();
    return { path };
  });

  // 4. GET /api/sessions & POST /api/sessions
  server.get("/api/sessions", async () => {
    return { sessions: runtime.sessions.list() };
  });

  server.get("/api/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const session = runtime.sessions.load(id);
    if (!session) {
      reply.code(404).send({ error: `Session '${id}' not found` });
      return;
    }
    return { session };
  });

  server.post("/api/sessions", async (request: FastifyRequest) => {
    const body = (request.body || {}) as { title?: string };
    const created = runtime.sessions.create(body.title);
    return { session: created };
  });

  server.patch("/api/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { title: string };
    if (!body.title?.trim()) {
      reply.code(400).send({ error: "Title is required" });
      return;
    }
    const updated = runtime.sessions.rename(id, body.title.trim());
    if (!updated) {
      reply.code(404).send({ error: `Session '${id}' not found` });
      return;
    }
    return { session: updated };
  });

  server.delete("/api/sessions/:id", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const success = await runtime.deleteSession(id);
    return { success, id };
  });

  // ─── W0: Events API ──────────────────────────────────────────────────────────

  // GET /api/sessions/:id/events — 分页事件列表
  server.get("/api/sessions/:id/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      limit?: string;
      cursor?: string;
      type?: string;
    };
    const limit = Math.min(Number(query.limit || 50), 200);
    const cursor = query.cursor;
    const types = query.type
      ? (query.type.split(",") as import("@hachimi/core").RuntimeEventType[])
      : undefined;

    const hasEvents = await runtime.events.hasEvents(id);
    if (!hasEvents) {
      const session = runtime.sessions.load(id);
      if (!session) {
        reply.code(404).send({ error: `Session '${id}' not found` });
        return;
      }
    }

    const result = await runtime.events.list(id, { limit, cursor, types });
    return result;
  });

  // POST /api/workspace/pick — 调用宿主 OS 原生文件/目录选择框
  server.post("/api/workspace/pick", async (request: FastifyRequest) => {
    const query = request.query as { type?: "file" | "folder" };
    const type = query.type || "folder";
    const chosen = type === "file" ? await openNativeFilePicker() : await openNativeFolderPicker();
    return { path: chosen };
  });

  // ─── W1: Works API ───────────────────────────────────────────────────────────

  // GET /api/works — 列出 Works（默认 primary，支持 status 过滤）
  server.get("/api/works", async (request: FastifyRequest) => {
    const query = request.query as {
      kind?: string;
      status?: string;
      limit?: string;
    };
    const kind = (query.kind as "primary" | "worker") || "primary";
    const status = query.status as import("@hachimi/core").WorkStatus | undefined;
    const limit = Number(query.limit || 50);
    const works = runtime.works.list({
      kind,
      status: status ? [status] : undefined,
      limit,
    });
    return { works };
  });

  // POST /api/works — 用 intent 创建 Work
  server.post("/api/works", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      intent?: string;
      goal?: string;
      uiKind?: "conversation" | "task" | "project";
      workspaceRoot?: string;
      projectId?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.intent?.trim()) {
      reply.code(400).send({ error: "Missing required parameter: intent" });
      return;
    }
    // V1.2: workspaceRoot 存在但未显式指定 projectId 时，幂等升级为 Project
    let projectId = body.projectId;
    if (body.workspaceRoot && !projectId) {
      try {
        const { project } = await runtime.context.projects.getOrCreateFromRoot(body.workspaceRoot);
        projectId = project.id;
      } catch {
        /* 保留未关联状态 */
      }
    }
    const work = runtime.works.create({
      intent: body.intent.trim(),
      goal: body.goal,
      uiKind: body.uiKind,
      workspaceRoot: body.workspaceRoot,
      projectId,
      sessionId: body.sessionId,
      kind: "primary",
      ...(body.metadata ? { metadata: body.metadata } : {}),
    });
    return { work };
  });

  // GET /api/works/:id — Work 详情
  server.get("/api/works/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }
    return { work };
  });

  // PATCH /api/works/:id — 更新 Work（status / title / goal / workspaceRoot / uiKind / projectId）
  server.patch("/api/works/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      title?: string;
      status?: import("@hachimi/core").WorkStatus;
      goal?: string;
      workspaceRoot?: string;
      projectId?: string;
      uiKind?: "project" | "conversation";
      metadata?: Record<string, unknown>;
    };
    const existing = runtime.works.get(id);
    // V1.2: workspaceRoot 变更时同步项目归属（空字符串 = 清除绑定）
    let workspaceRoot: string | undefined;
    let projectId: string | undefined;
    if (body.workspaceRoot !== undefined) {
      if (body.workspaceRoot.trim()) {
        try {
          const { project } = await runtime.context.projects.getOrCreateFromRoot(
            body.workspaceRoot
          );
          workspaceRoot = project.workspaceRoot;
          projectId = project.id;
        } catch {
          workspaceRoot = body.workspaceRoot.trim();
          projectId = body.projectId;
        }
      } else {
        // 用空字符串表达「清除」意图（undefined = 未提供，二者不可混用）
        workspaceRoot = "";
        projectId = "";
      }
    } else if (body.projectId !== undefined) {
      projectId = body.projectId || undefined;
    }
    const updated = runtime.works.update(id, {
      ...(body.title ? { title: body.title } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.goal ? { goal: body.goal } : {}),
      ...(body.workspaceRoot !== undefined ? { workspaceRoot, projectId } : {}),
      ...(body.uiKind ? { uiKind: body.uiKind } : {}),
      // PATCH 语义：metadata 浅合并（如仅翻转 incognito 不影响其他元数据）
      ...(body.metadata ? { metadata: { ...(existing?.metadata ?? {}), ...body.metadata } } : {}),
    });
    if (!updated) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }
    return { work: updated };
  });

  // DELETE /api/works/:id — 彻底擦除 Work 及其绑定的 Session、事件流、执行记录
  server.delete("/api/works/:id", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const deleted = await runtime.deleteWork(id);
    return { success: deleted, id };
  });

  // ─── V1.2: Projects API ──────────────────────────────────────────────────────

  // POST /api/projects — 导入/打开目录 → 升级为 Project（幂等：同一根路径复用）
  server.post("/api/projects", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { root?: string; name?: string };
    if (!body.root?.trim()) {
      reply.code(400).send({ error: "Missing required parameter: root" });
      return;
    }
    const { project, created } = await runtime.context.projects.getOrCreateFromRoot(
      body.root.trim()
    );
    if (body.name?.trim() && created) {
      runtime.context.projects.update(project.id, { name: body.name.trim() });
      project.name = body.name.trim();
    }
    return { project, created };
  });

  // GET /api/projects — 列出全部项目（含各自 Work 数量）
  server.get("/api/projects", async () => {
    const works = runtime.works.list({ limit: 1000 });
    // 自愈：旧版 uiKind=project 的 Work（有 workspaceRoot 但项目实体缺失）自动补建项目
    const legacyRoots = new Set<string>();
    for (const w of works) {
      if (w.workspaceRoot) legacyRoots.add(w.workspaceRoot);
    }
    for (const root of legacyRoots) {
      if (!runtime.context.projects.findByRoot(root)) {
        try {
          await runtime.context.projects.getOrCreateFromRoot(root);
        } catch {
          /* 忽略无法解析的根路径 */
        }
      }
    }
    const projects = runtime.context.projects.list();
    const byProject = new Map<string, number>();
    for (const w of works) {
      if (w.projectId) byProject.set(w.projectId, (byProject.get(w.projectId) || 0) + 1);
    }
    return {
      projects: projects.map((p) =>
        runtime.context.projects.toSummary(p, byProject.get(p.id) || 0)
      ),
    };
  });

  // GET /api/projects/:id — 项目详情（含其下 Works）
  server.get("/api/projects/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = runtime.context.projects.get(id);
    if (!project) {
      reply.code(404).send({ error: `Project '${id}' not found` });
      return;
    }
    const works = runtime.works.list({ limit: 500 }).filter((w) => w.projectId === id);
    return { project, works };
  });

  // PATCH /api/projects/:id — 更新项目元数据（名称/描述/details/颜色/归档）
  server.patch("/api/projects/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      name?: string;
      description?: string;
      details?: string;
      color?: string;
      archivedAt?: string | null;
    };
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.details !== undefined) patch.details = body.details;
    if (body.color !== undefined) patch.color = body.color;
    if (body.archivedAt !== undefined) patch.archivedAt = body.archivedAt ?? undefined;
    const updated = runtime.context.projects.update(id, patch as never);
    if (!updated) {
      reply.code(404).send({ error: `Project '${id}' not found` });
      return;
    }
    return { project: updated };
  });

  // DELETE /api/projects/:id — 删除项目记录（解绑其下 Works，Work/Session 数据保留）
  server.delete("/api/projects/:id", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const project = runtime.context.projects.get(id);
    if (!project) return { success: false, id };
    const works = runtime.works.list({ limit: 500 }).filter((w) => w.projectId === id);
    for (const w of works) {
      runtime.works.update(w.id, { projectId: undefined as never });
    }
    const deleted = runtime.context.projects.delete(id);
    return { success: deleted, id, unlinkedWorks: works.length };
  });

  // W2.2: POST /api/works/:id/cancel — 取消正在运行的 Work（设置状态 + 写入 error 事件 + steer 停止）
  server.post("/api/works/:id/cancel", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { reason?: string };
    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }

    const reason = (body.reason || "user_cancelled").trim();
    const sessionId = work.sessionIds[0] || id;

    // 1) 状态变更为 cancelled
    const updated = runtime.works.update(id, { status: "cancelled" });

    // 2) 写一条 steer 事件留痕（标识为用户手动取消而非系统故障）
    try {
      await runtime.events.append({
        id: generateId("evt_"),
        sessionId,
        type: "steer",
        timestamp: new Date().toISOString(),
        payload: {
          prompt: `Work 已取消: ${reason}`,
        },
      });
    } catch {
      /* ignore */
    }

    // 3) 如果当前在执行中，steer 注入取消提示以阻止下一轮 LLM 决策
    const steered = runtime.agent.isRunning()
      ? runtime.steer(
          `[用户已取消当前 Work，理由: ${reason}]。请立即停止进一步的工具调用或操作，向用户说明已取消。`
        )
      : false;

    return {
      success: !!updated,
      status: updated?.status ?? "failed",
      steered,
      workId: id,
      reason,
    };
  });

  // W2.6: GET /api/works/:id/events — 按 Work（即其 sessionIds）查询事件流，支持 ?type= 过滤
  server.get("/api/works/:id/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      limit?: string;
      cursor?: string;
      type?: string;
    };
    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }

    const limit = Math.min(Number(query.limit || 50), 200);
    const cursor = query.cursor;
    const types = query.type
      ? (query.type.split(",") as import("@hachimi/core").RuntimeEventType[])
      : undefined;

    // Work → 1:N sessionIds（默认 1:1，兼容未来多 session）
    const sessionIds = work.sessionIds.length > 0 ? work.sessionIds : [id];
    const merged: Array<import("@hachimi/core").RuntimeEvent> = [];
    let total = 0;
    for (const sid of sessionIds) {
      const r = await runtime.events.list(sid, { limit, cursor, types });
      merged.push(...r.events);
      total += r.total;
    }
    merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const page = merged.slice(0, limit);
    const nextCursor = merged.length > limit ? page[page.length - 1]?.id : undefined;

    return {
      events: page,
      nextCursor,
      total,
      workId: id,
      sessionIds,
    };
  });

  // GET /api/works/:id/activities — Activity 分页列表（投影自事件）
  server.get("/api/works/:id/activities", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; cursor?: string };
    const limit = Number(query.limit || 50);
    const cursor = query.cursor;

    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }

    const result = await runtime.works.listActivities(id, { limit, cursor });
    return result;
  });

  // POST /api/works/:id/steer — 对当前 Work 的意图干预
  server.post("/api/works/:id/steer", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { prompt?: string };
    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }

    const steered = runtime.steer(prompt);

    // W0: 写入 steer 事件
    if (work.sessionIds[0]) {
      await runtime.events.append({
        id: generateId("evt_"),
        sessionId: work.sessionIds[0],
        type: "steer",
        timestamp: new Date().toISOString(),
        payload: { prompt },
      });
    }

    return { success: steered, prompt, workId: id };
  });

  // GET /api/works/:id/children — 子任务列表
  server.get("/api/works/:id/children", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const work = runtime.works.get(id);
    if (!work) {
      reply.code(404).send({ error: `Work '${id}' not found` });
      return;
    }
    const children = runtime.works.listChildren(id);
    return { children };
  });

  // 5. Memory — 记忆库 CRUD（四层记忆浏览/搜索/增删/确认草稿/清空）
  server.get("/api/memory", async (request: FastifyRequest) => {
    const query = ((request.query as any)?.query || "").trim();
    const layer = ((request.query as any)?.layer || "").trim() as
      | "working"
      | "session"
      | "long_term"
      | "archival"
      | "";
    if (query) {
      const results = runtime.memory.search(query);
      return { query, results };
    }
    const all = runtime.memory.list();
    const layers: Record<string, number> = {
      working: all.filter((m) => m.layer === "working").length,
      session: all.filter((m) => m.layer === "session").length,
      long_term: all.filter((m) => m.layer === "long_term").length,
      archival: all.filter((m) => m.layer === "archival").length,
    };
    const memories = layer ? all.filter((m) => m.layer === layer) : all;
    return { memories, layers, layer: layer || undefined };
  });

  server.post("/api/memory", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      content?: string;
      layer?: "working" | "session" | "long_term" | "archival";
      importance?: number;
      source?: "user" | "agent";
    };
    const content = (body.content || "").trim();
    if (!content) {
      reply.code(400).send({ error: "Missing memory content" });
      return;
    }
    const layer = body.layer || "long_term";
    const entry = runtime.memory.add({
      layer,
      content,
      importance: body.importance ?? 0.5,
      source: body.source,
    });
    return { success: true, entry };
  });

  server.delete("/api/memory/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const removed = runtime.memory.forget(id);
    if (!removed) {
      reply.code(404).send({ error: `Memory '${id}' not found` });
      return;
    }
    return { success: true };
  });

  server.post("/api/memory/:id/confirm", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ok = runtime.memory.confirmDraft(id);
    if (!ok) {
      reply.code(404).send({ error: `Draft memory '${id}' not found or not draft` });
      return;
    }
    return { success: true };
  });

  server.post("/api/memory/clear", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { layer?: string };
    const layer = body.layer;
    if (!layer || !["working", "session", "long_term", "archival"].includes(layer)) {
      reply.code(400).send({ error: "Missing or invalid layer" });
      return;
    }
    runtime.memory.clear(layer as "working" | "session" | "long_term" | "archival");
    return { success: true };
  });

  // 审计日志：跨 Work 的批准/拒绝记录（等价 CLI `hachimi work audit`，UI 版）
  server.get("/api/audit", async (request: FastifyRequest) => {
    const query = (request.query || {}) as { workId?: string; limit?: string };
    const workId = query.workId?.trim() || "";
    const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000);
    const works = runtime.works.list();
    const events: Array<{
      timestamp: string;
      workId: string;
      workTitle: string;
      toolName: string;
      decision: "GRANTED" | "DENIED";
      surface: string;
    }> = [];

    for (const summary of works) {
      if (workId && summary.id !== workId) continue;
      const work = runtime.works.get(summary.id);
      const sessionIds = work && work.sessionIds.length > 0 ? work.sessionIds : [summary.id];
      for (const sid of sessionIds) {
        const r = await runtime.events.list(sid, {
          limit: 500,
          types: ["approval_granted", "approval_denied"],
        });
        for (const ev of r.events) {
          if (ev.type === "approval_granted" || ev.type === "approval_denied") {
            events.push({
              timestamp: ev.timestamp,
              workId: summary.id,
              workTitle: summary.title || summary.id,
              toolName: ev.payload.toolName || "-",
              decision: ev.type === "approval_granted" ? "GRANTED" : "DENIED",
              surface: (ev.payload as any).surface || "-",
            });
          }
        }
      }
    }

    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { events: events.slice(0, limit), total: events.length };
  });

  // 6. GET /api/ws (WebSocket 通信全部委派给 HarnessRuntime)
  server.get("/api/ws", { websocket: true }, (socket, req) => {
    const requestId = generateId("req_ws_");
    socket.on("message", async (rawMessage: any) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        if (payload.type === "chat" && payload.prompt) {
          const output = await runtime.execute({
            prompt: payload.prompt,
            sessionId: payload.sessionId,
            channel: "ws",
            providerOverride: payload.provider,
            metadata: { requestId },
            options: {
              onChunk: (chunk) => {
                socket.send(JSON.stringify({ type: "chunk", chunk, requestId }));
              },
            },
          });

          socket.send(
            JSON.stringify({
              type: "done",
              sessionId: output.sessionId,
              content: output.content,
              requestId,
            })
          );
        } else if (payload.type === "steer" && payload.prompt) {
          const steered = runtime.steer(payload.prompt);
          socket.send(JSON.stringify({ type: "steer_ack", success: steered, requestId }));
        } else if (payload.type === "followup" && payload.prompt) {
          runtime.followUp(payload.prompt);
          socket.send(JSON.stringify({ type: "followup_ack", success: true, requestId }));
        } else if (payload.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", timestamp: Date.now(), requestId }));
        }
      } catch (err: any) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: err?.message || String(err),
          })
        );
      }
    });
  });
  // ─── Credential Management Endpoints ─────────────────────────────────────
  // Values are never returned: only masked previews and metadata.
  server.get("/api/credentials", async () => {
    const entries = credStore.listEntries().map((e) => {
      const value = credStore.getSecret(e.slug, e.kind);
      return {
        slug: e.slug,
        kind: e.kind,
        kindLabel: CREDENTIAL_KIND_LABELS[e.kind] || e.kind,
        preview: maskApiKey(value),
        hasValue: value !== undefined,
      };
    });
    return { entries };
  });

  server.put(
    "/api/credentials/:slug/:kind",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug, kind } = request.params as { slug: string; kind: CredentialKind };
      const body = (request.body || {}) as { value?: string };
      if (!(kind in CREDENTIAL_KIND_LABELS)) {
        reply.code(400).send({ error: `Unsupported credential kind: ${kind}` });
        return;
      }
      const value = (body.value || "").trim();
      if (!value) {
        reply.code(400).send({ error: "value is required" });
        return;
      }
      credStore.setSecret(slug, kind, value);
      return { success: true, slug, kind };
    }
  );

  server.delete("/api/credentials/:slug/:kind", async (request: FastifyRequest) => {
    const { slug, kind } = request.params as { slug: string; kind: CredentialKind };
    credStore.deleteSecret(slug, kind);
    return { success: true, slug, kind };
  });

  server.delete("/api/credentials/:slug", async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };
    credStore.deleteSecret(slug);
    return { success: true, slug };
  });

  // ─── MCP Servers REST Endpoints ──────────────────────────────────────────
  server.get("/api/mcp/servers", async () => {
    const mcpManager = appContext?.mcp;
    const servers = mcpManager ? mcpManager.listServers() : [];
    return { servers };
  });

  server.post("/api/mcp/servers", async (request: FastifyRequest) => {
    const body = (request.body || {}) as {
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      envCredentials?: Record<string, string>;
      url?: string;
    };
    const mcpManager = appContext?.mcp;
    if (mcpManager && body.name && body.command) {
      const serverId = body.name.toLowerCase().replace(/\s+/g, "-");
      // envCredentials: resolve `<slug>:<kind>` references from the credential store.
      const resolvedEnv = { ...(body.env || {}) };
      for (const [envName, ref] of Object.entries(body.envCredentials || {})) {
        const secret = resolveCredentialReference(ref, credStore);
        if (secret !== undefined && !(envName in resolvedEnv)) {
          resolvedEnv[envName] = secret;
        }
      }
      await mcpManager.addServer({
        id: serverId,
        name: body.name,
        command: body.command,
        args: body.args || [],
        env: resolvedEnv,
        url: body.url,
        enabled: true,
      });

      // P0-4: 持久化 MCP Server 配置到 config.json，重启后依然生效
      const cfg = appContext.getConfig();
      cfg.mcpServers = cfg.mcpServers ?? {};
      cfg.mcpServers[serverId] = {
        command: body.command,
        args: body.args || [],
        env: body.env || {},
        envCredentials: body.envCredentials || {},
        url: body.url,
        enabled: true,
      };
      saveConfig(cfg, configPath);

      // 立即把该 Server 的工具同步进 ToolRegistry
      const result = await mcpManager.syncTools(appContext.tools);
      return { success: true, id: serverId, registered: result.registered, failed: result.failed };
    }
    return { success: false, error: "name and command are required" };
  });

  server.delete("/api/mcp/servers/:id", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const mcpManager = appContext?.mcp;
    if (mcpManager) {
      await mcpManager.removeServer(id);
      // 从 config.json 中移除并持久化
      const cfg = appContext.getConfig();
      if (cfg.mcpServers && cfg.mcpServers[id]) {
        delete cfg.mcpServers[id];
        saveConfig(cfg, configPath);
      }
    }
    return { success: true, id };
  });

  // ─── Personal Context Config Endpoints ────────────────────────────────────
  server.get("/api/personal-context/config", async () => {
    const pConfig =
      appContext?.config?.personalContext || runtime.context.config.personalContext || {};
    const userDir = resolve(homedir(), ".hachimi");
    return {
      soulPath: pConfig.soulPath || resolve(userDir, "SOUL.md"),
      telosRoot: pConfig.telosRoot || resolve(userDir, "telos"),
      knowledgeRoot: pConfig.knowledgeRoot || resolve(userDir, "second-brain"),
      knowledgeWriteRoot: pConfig.knowledgeWriteRoot || resolve(userDir, "second-brain/_inbox"),
    };
  });

  server.post("/api/personal-context/config", async (request: FastifyRequest) => {
    const body = (request.body || {}) as {
      soulPath?: string;
      telosRoot?: string;
      knowledgeRoot?: string;
      knowledgeWriteRoot?: string;
    };

    if (appContext?.config) {
      appContext.config.personalContext = {
        ...appContext.config.personalContext,
        ...body,
      };
    }

    if (runtime?.context?.config) {
      runtime.context.config.personalContext = {
        ...runtime.context.config.personalContext,
        ...body,
      };
    }

    const targetConfig = appContext?.config || runtime?.context?.config;
    if (targetConfig) {
      try {
        saveConfig(targetConfig, configPath);
        log("info", "Personal context configuration updated and persisted", body);
      } catch (err) {
        log("warn", `Failed to persist personal context config: ${err}`);
      }
    }

    return { success: true, config: body };
  });

  // ─── SOUL.md Content Endpoints ────────────────────────────────────────────
  server.get("/api/personal-context/soul", async () => {
    const pConfig =
      appContext?.config?.personalContext || runtime.context.config.personalContext || {};
    const userDir = resolve(homedir(), ".hachimi");
    const soulPath = pConfig.soulPath || resolve(userDir, "SOUL.md");
    let content = "";
    try {
      if (existsSync(soulPath)) {
        content = readFileSync(soulPath, "utf-8");
      }
    } catch (err) {
      log("warn", `Failed to read SOUL.md: ${err}`);
    }
    return { soulPath, content };
  });

  server.post("/api/personal-context/soul", async (request: FastifyRequest) => {
    const body = (request.body || {}) as { content?: string };
    const pConfig =
      appContext?.config?.personalContext || runtime.context.config.personalContext || {};
    const userDir = resolve(homedir(), ".hachimi");
    const soulPath = pConfig.soulPath || resolve(userDir, "SOUL.md");
    try {
      mkdirSync(dirname(soulPath), { recursive: true });
      writeFileSync(soulPath, body.content ?? "", "utf-8");
      log("info", "SOUL.md updated", { soulPath });
      return { success: true, soulPath };
    } catch (err) {
      log("warn", `Failed to write SOUL.md: ${err}`);
      return { success: false, soulPath, error: String(err) };
    }
  });

  // ─── Skills REST Endpoints ───────────────────────────────────────────────
  const skillLoader = appContext?.skillLoader || new SkillPackageLoader();
  const userSkillsFolder = skillLoader.getUserSkillsDir();

  /** Unregister package-loaded skills, then reload them from disk. */
  const reloadExternalSkills = () => {
    const skillRegistry = appContext?.skills;
    if (!skillRegistry) return;
    for (const skill of skillRegistry.list()) {
      if (skill.source === "external" || skill.source === "project") {
        skillRegistry.unregister(skill.name);
      }
    }
    for (const ext of skillLoader.loadPackages()) {
      if (!skillRegistry.get(ext.name)) {
        skillRegistry.register(ext);
      }
    }
  };

  server.get("/api/skills", async () => {
    const skillRegistry = appContext?.skills;
    const list = skillRegistry ? skillRegistry.list() : [];

    const enrichedSkills = await Promise.all(
      list.map(async (s) => {
        let content: string | undefined;
        try {
          const loaded = await skillRegistry?.loadContent(s.name);
          if (loaded?.instructions) content = loaded.instructions;
        } catch {
          /* ignore */
        }

        const realPath = s.sourceDir
          ? resolve(s.sourceDir, s.name, "SKILL.md")
          : resolve(userSkillsFolder, s.name);
        const builtinPath = resolve(process.cwd(), `packages/core/src/skills/builtin/${s.name}.ts`);
        return {
          id: s.name,
          name: s.name,
          description: s.description || "Skill definition",
          path: existsSync(realPath) ? realPath : existsSync(builtinPath) ? builtinPath : realPath,
          source: s.source || "builtin",
          sourceDir: s.sourceDir,
          version: s.version || "0.0.0",
          author: s.author,
          license: s.license,
          homepage: s.homepage,
          tags: s.tags || [],
          allowedTools: s.allowedTools || [],
          priority: s.priority ?? 0,
          enabled: s.enabled !== false,
          content: content || `# ${s.name}\n\n${s.description}`,
        };
      })
    );

    return { skills: enrichedSkills };
  });

  server.patch("/api/skills/:id", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { enabled?: boolean };
    const skillRegistry = appContext?.skills;
    if (skillRegistry) {
      if (body.enabled === false) {
        skillRegistry.disable(id);
      } else if (body.enabled === true) {
        skillRegistry.enable(id);
      }
    }
    return { success: true, id };
  });

  // POST /api/skills/install — install skills from a GitHub repo/tree/blob URL
  server.post("/api/skills/install", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { url?: string };
    const url = (body.url || "").trim();
    if (!url) {
      reply.code(400).send({ error: "url is required" });
      return;
    }
    try {
      const imported = await installSkillsFromGitHub(url);
      const created: Array<{ name: string; path: string }> = [];
      for (const skill of imported) {
        const saved = skillLoader.createSkill({
          name: skill.name,
          description: skill.description,
          instructions: skill.content,
          tags: skill.tags,
          version: skill.version,
          license: skill.license,
          author: skill.author,
          homepage: skill.homepage,
        });
        created.push(saved);
      }
      reloadExternalSkills();
      return { success: true, count: created.length, skills: created };
    } catch (err) {
      reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  });

  // POST /api/skills — manually create a user skill
  server.post("/api/skills", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      name?: string;
      description?: string;
      instructions?: string;
      tags?: string[];
      version?: string;
      license?: string;
      author?: string;
    };
    const name = (body.name || "").trim();
    const instructions = (body.instructions || "").trim();
    if (!name || !instructions) {
      reply.code(400).send({ error: "name and instructions are required" });
      return;
    }
    try {
      const saved = skillLoader.createSkill({
        name,
        description: body.description,
        instructions,
        tags: body.tags,
        version: body.version,
        license: body.license,
        author: body.author,
      });
      reloadExternalSkills();
      return { success: true, skill: saved };
    } catch (err) {
      reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  });

  // PUT /api/skills/:id — update the SKILL.md content of a user skill
  server.put("/api/skills/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { content?: string };
    const content = (body.content || "").trim();
    if (!content) {
      reply.code(400).send({ error: "content is required" });
      return;
    }
    try {
      const saved = skillLoader.updateSkill(id, content);
      reloadExternalSkills();
      return { success: true, path: saved.path };
    } catch (err) {
      reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  });

  // DELETE /api/skills/:id — remove a user skill (builtins are protected)
  server.delete("/api/skills/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const skillRegistry = appContext?.skills;
    const skill = skillRegistry?.get(id);
    if (skill && (skill.source === "builtin" || skill.source === undefined)) {
      reply.code(400).send({ error: `内置技能 ${id} 不可删除` });
      return;
    }
    const result = skillLoader.deleteSkill(id);
    if (!result.success) {
      reply.code(400).send(result);
      return;
    }
    skillRegistry?.unregister(id);
    reloadExternalSkills();
    return { success: true, message: result.message };
  });

  server.post("/api/skills/open-folder", async () => {
    const skillsFolder = userSkillsFolder;
    if (!existsSync(skillsFolder)) {
      mkdirSync(skillsFolder, { recursive: true });
    }
    const platform = process.platform;
    try {
      if (platform === "darwin") {
        await execAsync(`open "${skillsFolder}"`);
      } else if (platform === "win32") {
        await execAsync(`explorer "${skillsFolder}"`);
      } else {
        await execAsync(`xdg-open "${skillsFolder}"`);
      }
      return { success: true, path: skillsFolder };
    } catch {
      return { success: false, path: skillsFolder };
    }
  });

  return {
    runtime,
    appContext,
    proposalManager,
    scheduler,
    fastify: server,
    async listen() {
      const port = options.port || Number(process.env.HACHIMI_PORT || DAEMON_DEFAULT_PORT);
      const host = options.host || process.env.HACHIMI_HOST || DAEMON_DEFAULT_HOST;
      const address = await server.listen({ port, host });
      log("info", `🚀 Hachimi Daemon Server running at ${address}`, {
        authRequired,
        port,
        host,
      });

      // Start proactive trigger scheduler loop
      scheduler.start(async (task) => {
        log("info", `Proactive trigger fired: [${task.name}] "${task.prompt}"`);
        await runtime.execute({
          prompt: task.prompt,
          channel: (task.channel as any) || "proactive-trigger",
        });
      });

      return address;
    },
    async close() {
      scheduler.stop();
      await server.close();
    },
  };
}

/**
 * W2.3: 自动解析或生成 API Secret
 */
function resolveApiSecret(explicitSecret?: string, dataDir?: string): string {
  if (explicitSecret) return explicitSecret;
  if (process.env.HACHIMI_API_SECRET) return process.env.HACHIMI_API_SECRET;

  // Vitest 单测自动跑免 Secret 模式
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return "";
  }

  if (!dataDir) return "";

  const secretPath = resolve(dataDir, ".secret");
  try {
    if (existsSync(secretPath)) {
      const existing = readFileSync(secretPath, "utf-8").trim();
      if (existing) return existing;
    }
    mkdirSync(dataDir, { recursive: true });
    const generated = randomBytes(32).toString("hex");
    writeFileSync(secretPath, generated, "utf-8");
    log("info", `🔑 Auto-generated 32-byte API Secret at ${secretPath}`);
    return generated;
  } catch (err) {
    log("warn", "Failed to auto-generate API secret:", err);
    return "";
  }
}
