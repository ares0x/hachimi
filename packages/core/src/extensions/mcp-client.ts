// packages/core/src/extensions/mcp-client.ts

import type { ToolPermission } from "../tools/types.js";
import type { ToolDefinition } from "../types/index.js";
import type { CapabilitySource } from "./capability.js";
import { LegacyStdioTransport, StatelessHttpTransport } from "./mcp-transports.js";
import type {
  IMcpTransport,
  McpProtocolVersion,
  McpServerConfig,
  McpToolDefinition,
} from "./mcp-types.js";

export { LegacyStdioTransport, StatelessHttpTransport } from "./mcp-transports.js";
export type { McpProtocolVersion, McpServerConfig, McpToolDefinition } from "./mcp-types.js";

/** P0.2: MCP server 健康状态（连续失败 → degraded → 指数退避自动恢复） */
export interface McpServerHealth {
  consecutiveFailures: number;
  degraded: boolean;
  lastFailureAt?: number;
  /** 下一次自动恢复尝试的时间戳（指数退避） */
  nextRestartAt?: number;
}

/**
 * E4: Model Context Protocol (MCP) 客户端管理器
 * 支撑 MCP 2024-11-05 (Stdio/SSE) 与 2026-07-28 (Stateless HTTP/MRTR) 双版本无缝适配
 */
export class McpClientManager implements CapabilitySource<ToolDefinition> {
  public id = "mcp-client-source";
  public type = "mcp" as const;

  private servers: Map<string, McpServerConfig> = new Map();
  private transports: Map<string, IMcpTransport> = new Map();
  private mcpTools: Map<string, ToolDefinition> = new Map();
  /** qualified tool name → server id，供 removeServer 反注册 */
  private toolOwners: Map<string, string> = new Map();
  private registryRef: import("../tools/registry.js").ToolRegistry | null = null;
  /** P0.2: 每 server 健康状态（连续失败 → degraded → 指数退避自动恢复） */
  private health: Map<string, McpServerHealth> = new Map();
  private readonly maxFailuresBeforeDegrade = 2;
  private readonly maxBackoffMs = 30_000;

  constructor(configs: Record<string, McpServerConfig> = {}) {
    for (const [name, config] of Object.entries(configs)) {
      this.registerServer(name, config);
    }
  }

  /**
   * 注册 MCP Server，自动做 2024-11-05 / 2026-07-28 版本协商与 Transport 路由
   */
  registerServer(name: string, config: McpServerConfig): IMcpTransport {
    const serverId = config.id || name;
    this.servers.set(serverId, { ...config, id: serverId, name: config.name || name });
    const transport = this.createTransport({ ...config, id: serverId, name: config.name || name });
    this.transports.set(serverId, transport);
    return transport;
  }

  /** P0.2: 按协议版本实例化传输层（供 registerServer 与 recoverServer 复用） */
  private createTransport(config: McpServerConfig): IMcpTransport {
    if (config.url || config.protocolVersion === "2026-07-28") {
      return new StatelessHttpTransport(config);
    }
    return new LegacyStdioTransport(config);
  }

  /**
   * 获取指定服务器的传输层实例
   */
  getTransport(serverName: string): IMcpTransport | undefined {
    return this.transports.get(serverName);
  }

  /**
   * 注册 Mock / 本地 / 直接注入的 MCP 工具（包含 2024-11-05 Stdio 兼容逻辑）
   */
  registerMcpTool(
    serverName: string,
    tool: McpToolDefinition,
    handler: (args: any) => Promise<string>,
    options?: { transport?: IMcpTransport; permission?: ToolPermission }
  ): ToolDefinition {
    // 显式传入的传输层优先（自定义/mock 场景），否则使用已注册 server 的传输层；
    // 都没有时创建 mock 兜底传输。execute 必须引用最终解析出的 transport，
    // 否则无 transport 注入场景下会捕获 undefined；同时不能把显式传入的
    // 非 Legacy 传输（如测试用 FlakyTransport）替换成 mock，否则健康跟踪失效。
    const explicitTransport = options?.transport;
    let transport = explicitTransport ?? this.transports.get(serverName);
    if (!transport) {
      const legacy = new LegacyStdioTransport({ command: "mock" });
      this.transports.set(serverName, legacy);
      transport = legacy;
    }
    const execTransport = transport;

    if (transport instanceof LegacyStdioTransport) {
      transport.registerTool(tool, handler);
    }

    const qualifiedName = `mcp_${serverName}_${tool.name}`;
    const serverConfig = this.servers.get(serverName);
    const permission = this.deriveToolPermission(tool, options?.permission, serverConfig);

    const toolDef: ToolDefinition = {
      name: qualifiedName,
      description: tool.description || `MCP [${serverName}] 工具: ${tool.name}`,
      permission,
      parameters: tool.inputSchema || { type: "object", properties: {} },
      // P0.2: 健康跟踪 + 降级熔断 + 自动恢复
      execute: async (args) => this.invokeTool(serverName, tool.name, args, execTransport),
    };

    this.mcpTools.set(qualifiedName, toolDef);
    this.toolOwners.set(qualifiedName, serverName);
    return toolDef;
  }

  /**
   * 从 MCP 工具注解推导 Hachimi 权限级别：
   * - 显式 server.permission / 调用方 permission 优先
   * - destructiveHint → dangerous；readOnlyHint → safe；默认 needs_confirm（保守）
   */
  private deriveToolPermission(
    tool: McpToolDefinition,
    explicit?: ToolPermission,
    serverConfig?: McpServerConfig
  ): ToolPermission {
    if (serverConfig?.permission) return serverConfig.permission;
    if (explicit) return explicit;
    if (tool.annotations?.destructiveHint) return "dangerous";
    if (tool.annotations?.readOnlyHint) return "safe";
    return "needs_confirm";
  }

  async list(): Promise<ToolDefinition[]> {
    // P0.2: degraded server 的工具不再公布给模型（模型不会调用失效工具）
    return Array.from(this.mcpTools.values()).filter((t) => {
      const owner = this.toolOwners.get(t.name);
      return !(owner && this.getHealth(owner).degraded);
    });
  }

  async resolve(name: string): Promise<ToolDefinition | undefined> {
    return this.mcpTools.get(name);
  }

  /**
   * 将已注册 MCP Server 的工具同步进 ToolRegistry（真实拉起 + 注册）。
   * 供 Daemon 启动与 /api/mcp/servers 变更时调用。
   */
  async syncTools(
    registry: import("../tools/registry.js").ToolRegistry,
    options?: { timeoutMs?: number }
  ): Promise<{ registered: string[]; failed: string[] }> {
    this.registryRef = registry;
    const timeoutMs = options?.timeoutMs ?? 8000;
    const registered: string[] = [];
    const failed: string[] = [];

    for (const [serverId, config] of this.servers.entries()) {
      if (config.enabled === false) continue;
      const transport = this.transports.get(serverId);
      if (!transport) {
        failed.push(serverId);
        continue;
      }

      try {
        const synced = await this.syncServerTools(serverId, transport, registry, timeoutMs);
        registered.push(...synced);
      } catch (err: unknown) {
        failed.push(serverId);
        this.recordFailure(serverId);
        console.warn(
          `[McpClientManager] Failed to list tools from '${serverId}': ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    return { registered, failed };
  }

  /** P0.2: 同步单个 server 的工具到 registry（供 syncTools 与 recoverServer 复用） */
  private async syncServerTools(
    serverId: string,
    transport: IMcpTransport,
    registry: import("../tools/registry.js").ToolRegistry,
    timeoutMs: number
  ): Promise<string[]> {
    const tools = await withTimeout(transport.listTools(), timeoutMs);
    const registered: string[] = [];
    for (const tool of tools ?? []) {
      const qualified = `mcp_${serverId}_${tool.name}`;
      if (registry.get(qualified)) continue;
      const def = this.registerMcpTool(
        serverId,
        tool,
        (args) => transport.callTool(tool.name, args),
        {
          transport,
        }
      );
      registry.register(def, "mcp");
      registered.push(qualified);
    }
    return registered;
  }

  // ── P0.2: 健康跟踪与自动恢复 ───────────────────────────────────────────────

  /** 读取 server 健康状态（惰性初始化） */
  getServerHealth(serverId: string): McpServerHealth | undefined {
    return this.health.get(serverId);
  }

  private getHealth(serverId: string): McpServerHealth {
    let h = this.health.get(serverId);
    if (!h) {
      h = { consecutiveFailures: 0, degraded: false };
      this.health.set(serverId, h);
    }
    return h;
  }

  private recordFailure(serverId: string): void {
    const h = this.getHealth(serverId);
    h.consecutiveFailures++;
    h.lastFailureAt = Date.now();
    if (h.consecutiveFailures >= this.maxFailuresBeforeDegrade) {
      h.degraded = true;
      h.nextRestartAt =
        Date.now() + Math.min(1000 * 2 ** (h.consecutiveFailures - 2), this.maxBackoffMs);
      console.warn(
        `[McpClientManager] '${serverId}' marked degraded (${h.consecutiveFailures} consecutive failures); auto-restart in ${Math.min(1000 * 2 ** (h.consecutiveFailures - 2), this.maxBackoffMs)}ms`
      );
    }
  }

  private recordSuccess(serverId: string): void {
    const h = this.getHealth(serverId);
    if (h.degraded) {
      h.degraded = false;
      h.nextRestartAt = undefined;
      console.warn(`[McpClientManager] '${serverId}' recovered (healthy again)`);
    }
    h.consecutiveFailures = 0;
  }

  /**
   * P0.2: 带健康跟踪的工具调用包装。
   * - degraded 期间返回明确降级提示（工具已从 manifest 隐藏，这是兜底）；
   * - 到达退避窗口时自动尝试恢复（重建传输 + 重新注册工具）。
   */
  private async invokeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    transport: IMcpTransport
  ): Promise<string> {
    const h = this.getHealth(serverId);
    if (h.degraded) {
      if (h.nextRestartAt !== undefined && Date.now() >= h.nextRestartAt) {
        await this.recoverServer(serverId);
        const fresh = this.transports.get(serverId);
        if (fresh && !this.getHealth(serverId).degraded) {
          return await fresh.callTool(toolName, args);
        }
      }
      return `[MCP 服务不可用] server '${serverId}' 处于降级状态，正在自动恢复中，请稍后重试。`;
    }

    try {
      const result = await transport.callTool(toolName, args);
      // 传输层错误会以 `[MCP Stdio Error]` 前缀返回；业务错误（`[MCP Error]`）不算故障
      if (typeof result === "string" && result.startsWith("[MCP Stdio Error]")) {
        this.recordFailure(serverId);
        return result;
      }
      this.recordSuccess(serverId);
      return result;
    } catch (err: unknown) {
      this.recordFailure(serverId);
      return `[MCP Stdio Error] ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** P0.2: 降级恢复 —— close 旧传输 → 重建 → 重新拉取工具注册 */
  private async recoverServer(serverId: string): Promise<void> {
    const config = this.servers.get(serverId);
    const old = this.transports.get(serverId);
    if (!config || !this.registryRef) return;
    try {
      await old?.close?.();
      const transport = this.createTransport(config);
      this.transports.set(serverId, transport);
      await this.syncServerTools(serverId, transport, this.registryRef, 8000);
      this.recordSuccess(serverId);
      console.warn(`[McpClientManager] '${serverId}' auto-recovered after restart`);
    } catch (err: unknown) {
      const h = this.getHealth(serverId);
      h.nextRestartAt =
        Date.now() + Math.min(1000 * 2 ** (h.consecutiveFailures - 1), this.maxBackoffMs);
      console.warn(
        `[McpClientManager] '${serverId}' recovery attempt failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /** 移除 Server 并反注册其同步到 ToolRegistry 的工具 */
  async removeServer(id: string): Promise<boolean> {
    const existed = this.servers.delete(id);
    this.transports.delete(id);
    this.health.delete(id);

    if (this.registryRef) {
      for (const [qualified, owner] of Array.from(this.toolOwners.entries())) {
        if (owner === id) {
          this.registryRef.unregister(qualified, "mcp");
          this.mcpTools.delete(qualified);
          this.toolOwners.delete(qualified);
        }
      }
    } else {
      for (const [qualified, owner] of Array.from(this.toolOwners.entries())) {
        if (owner === id) {
          this.mcpTools.delete(qualified);
          this.toolOwners.delete(qualified);
        }
      }
    }

    return existed;
  }

  listServers(): Array<{
    id: string;
    name: string;
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
    status: "connected" | "disabled";
  }> {
    const result = [];
    for (const [id, config] of this.servers.entries()) {
      result.push({
        id,
        name: config.name || id,
        command: config.command,
        args: config.args,
        url: config.url,
        enabled: config.enabled !== false,
        status: config.enabled === false ? ("disabled" as const) : ("connected" as const),
      });
    }
    return result;
  }

  async addServer(config: {
    id: string;
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    enabled?: boolean;
  }): Promise<void> {
    this.registerServer(config.id, {
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      enabled: config.enabled,
    });
  }

  async updateServer(
    id: string,
    patch: { enabled?: boolean; env?: Record<string, string> }
  ): Promise<void> {
    const config = this.servers.get(id);
    if (config && patch.env) {
      config.env = { ...config.env, ...patch.env };
    }
    if (config && patch.enabled !== undefined) {
      config.enabled = patch.enabled;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP listTools timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
