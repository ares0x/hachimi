// packages/core/src/runtime/context.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  getDefaultCredentialStore,
  type HachimiConfig,
  type LlmConnection,
  loadConfig,
  resolveContextPromptBudget,
  resolveCredentialReference,
  resolveLlmSelection,
  resolveModelContextWindow,
  saveConfig,
} from "@hachimi/config";
import { type Locale, log, setDefaultLocale } from "@hachimi/shared";
import { FileDirStore, FileJsonStore, SQLiteStore } from "@hachimi/storage";
import { Agent } from "../agent/agent.js";
import { createLLMFromConfig } from "../agent/llm-factory.js";
import { ContextBuilder } from "../context/builder.js";
import { PersonalContextLoader } from "../context/personal-context.js";
import type { IEventStore } from "../events/event-store.js";
import { FileEventStore } from "../events/file-event-store.js";
import { HookRegistry } from "../extensions/hooks.js";
import { registerBuiltinMcpServers } from "../extensions/mcp-builtin/index.js";
import { McpClientManager } from "../extensions/mcp-client.js";
import { SkillPackageLoader } from "../extensions/skill-package.js";
import { AutoDreamGate } from "../memory/autodream.js";
import { MemoryManager } from "../memory/manager.js";
import { MemdirStore } from "../memory/memdir.js";
import { ProjectManager } from "../project/manager.js";
import { FileHistoryStore } from "../rewind/file-history.js";
import { SessionManager } from "../session/manager.js";
import {
  bugFixerSkill,
  codeReviewSkill,
  contentFromBrainSkill,
  readmeGeneratorSkill,
  refactoringSkill,
  summarySkill,
  writingSkill,
} from "../skills/builtin/index.js";
import { SkillRegistry } from "../skills/registry.js";
import { ActivityPolicy } from "../tasks/activity-policy.js";
import { BackgroundTaskManager } from "../tasks/background-task-manager.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { registerBuiltinTools } from "../tools/builtin/index.js";
import { GrantStore } from "../tools/grant-store.js";
import {
  defaultPermissionPolicy,
  type PermissionPolicy,
  type SurfaceType,
} from "../tools/policy.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionRuleEngine } from "../tools/rule-engine.js";
import type { ToolApprovalHandler } from "../tools/types.js";
import type { ToolPermission } from "../types/index.js";
import { VisionCompanion } from "../vision/companion.js";
import { WorkManager } from "../work/work-manager.js";

export interface AppContext {
  config: HachimiConfig;
  memory: MemoryManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  skills: SkillRegistry;
  agent: Agent;
  contextBuilder: ContextBuilder;
  personalContextLoader: PersonalContextLoader;
  hooks: HookRegistry;
  mcp: McpClientManager;
  skillLoader: SkillPackageLoader;
  /** W0: Append-only event store (truth source) */
  events: IEventStore;
  /** W1: Work manager */
  works: WorkManager;
  /** V1.2: 项目管理器（绑定目录的项目集合实体） */
  projects: ProjectManager;
  /** W2.1: 权限策略表 */
  permissionPolicy: PermissionPolicy;
  /** P0-3: 后台任务管理器（后台命令任务） */
  backgroundTasks: BackgroundTaskManager;
  /** P1.7: 统一任务注册表（子代理 + 后台任务聚合查询） */
  tasks: TaskRegistry;
  /** P2.8: 电源/活动感知策略（后台/主动触发门控） */
  activityPolicy: ActivityPolicy;
  /** P2.6: 文件历史快照存储（/rewind 数据载体） */
  fileHistory: FileHistoryStore;
  getConfig(): HachimiConfig;
  setActiveConnection(connectionId: string, config?: Partial<LlmConnection>): void;
  getStatus(): Record<string, any>;
}

export interface CreateAppContextOptions {
  configPath?: string;
  configOverride?: Partial<HachimiConfig>;
  providerOverride?: string;
  /** 运行时用户可见文案语言（默认 zh-CN，与现有产品 UX 一致；可切换 en） */
  locale?: Locale;
  channelPolicy?: "deny" | "allow-safe" | "allowlist";
  allowedTools?: string[];
  permissionPolicy?: PermissionPolicy;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string,
    channel?: string
  ) => Promise<boolean>;
  /** 结构化向用户提问（透传给 Agent，供 ask_user_question 等工具使用） */
  onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  /** 技能包加载器（测试/自定义目录时注入，默认扫描 ~/.hachimi/skills 与项目 .hachimi/skills） */
  skillLoader?: SkillPackageLoader;
}

/**
 * 创建应用基础设施上下文 (Composition Root)
 */
export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  // 用户可见文案语言：默认 zh-CN 保持现有 UX，允许调用方切到 en
  setDefaultLocale(options.locale ?? "zh-CN");

  const config = loadConfig(options.configPath || "config.json");

  if (options.providerOverride) {
    config.llm.activeConnectionId = options.providerOverride;
  }
  if (options.configOverride) {
    Object.assign(config, options.configOverride);
  }

  const selection = resolveLlmSelection(config);
  log("info", "hachimi starting", {
    connectionId: selection.connectionId,
    providerType: selection.providerType,
    modelId: selection.modelId,
    dataDir: config.paths.dataDir,
    storage: "sqlite",
  });

  const sqlitePath = resolve(config.paths.dataDir, "hachimi.db");
  const sqliteStore = new SQLiteStore(sqlitePath);

  // P2.5: memdir（人可读长期记忆）+ autoDream 整合门控
  const memdir = new MemdirStore(config.paths.dataDir);
  const autoDream = new AutoDreamGate({ dataDir: config.paths.dataDir });
  const memory = new MemoryManager(config.paths.memoryFile, sqliteStore, { memdir, autoDream });
  memory.syncMemdir(); // 启动时同步一次（含恢复场景）
  const sessions = new SessionManager(config.paths.sessionsDir, sqliteStore);
  const grantStore = new GrantStore(join(config.paths.dataDir, "grants.json"));
  const ruleEngine = new PermissionRuleEngine(config.permissionRules ?? {});
  const tools = new ToolRegistry({ grantStore, ruleEngine });
  tools.setKnowledgeRoots(
    config.personalContext?.knowledgeRoot,
    config.personalContext?.knowledgeWriteRoot
  );
  const skills = new SkillRegistry();
  const hooks = new HookRegistry();
  const mcp = new McpClientManager();
  const skillLoader = options.skillLoader || new SkillPackageLoader();
  const personalContextLoader = new PersonalContextLoader(config.personalContext);
  const permissionPolicy = options.permissionPolicy || defaultPermissionPolicy;

  // P0-4: 从配置拉起已启用的 MCP Server，并异步把工具同步进 ToolRegistry。
  // 工具列表在 agent 每轮循环时重新读取，因此启动后短暂异步注册不会丢工具。
  const credStore = getDefaultCredentialStore();
  for (const [serverId, serverCfg] of Object.entries(config.mcpServers ?? {})) {
    if (serverCfg.enabled === false) continue;
    // envCredentials: resolve `<slug>:<kind>` references from the credential store.
    const resolvedEnv = { ...(serverCfg.env || {}) };
    for (const [envName, ref] of Object.entries(serverCfg.envCredentials || {})) {
      const secret = resolveCredentialReference(ref, credStore);
      if (secret !== undefined && !(envName in resolvedEnv)) {
        resolvedEnv[envName] = secret;
      }
    }
    mcp.registerServer(serverId, {
      id: serverId,
      name: serverId,
      command: serverCfg.command,
      args: serverCfg.args,
      env: resolvedEnv,
      url: serverCfg.url,
      enabled: true,
      permission: serverCfg.permission,
    });
  }
  if (mcp.listServers().length > 0) {
    void mcp
      .syncTools(tools)
      .then((result) => {
        if (result.registered.length > 0) {
          log("info", `MCP tools synced: ${result.registered.length} registered`, {
            failed: result.failed,
          });
        }
      })
      .catch((err) => {
        log("warn", "MCP tool sync failed during startup", { error: String(err) });
      });
  }

  // W0: 初始化 append-only 事件存储
  const events: IEventStore = new FileEventStore(config.paths.dataDir);
  // P2.6: 文件历史快照存储（写工具自动捕获 before 快照，供 /rewind 使用）
  const fileHistory = new FileHistoryStore(config.paths.dataDir, events);

  // W1: 初始化 Work 管理器
  const works = new WorkManager(config.paths.dataDir, events);
  // V1.2: 初始化项目管理器（{dataDir}/projects/，与 works 同级）
  const projects = new ProjectManager(config.paths.dataDir);

  skills.register(writingSkill);
  skills.register(summarySkill);
  skills.register(contentFromBrainSkill);
  skills.register(codeReviewSkill);
  skills.register(refactoringSkill);
  skills.register(bugFixerSkill);
  skills.register(readmeGeneratorSkill);

  registerBuiltinTools(tools, config.paths.dataDir);
  registerBuiltinMcpServers(tools);
  // P2-B3: 工具门控（load_tools）— 默认关闭；启用后仅公布未分组工具与已激活分组
  tools.setToolGating(
    config.agent.toolGating?.enabled ?? false,
    config.agent.toolGating?.defaultGroups ?? []
  );

  // 自动扫描加载外部技能包（同名冲突时保留先注册的内置技能，仅告警不崩溃）
  const externalSkills = skillLoader.loadPackages();
  for (const extSkill of externalSkills) {
    if (skills.get(extSkill.name)) {
      log("warn", `[Skill] 已存在同名技能，跳过外部加载: ${extSkill.name}`);
      continue;
    }
    skills.register(extSkill);
  }

  const seedDemoMemory =
    process.env.HACHIMI_SEED_DEMO_MEMORY === "true" || process.argv.includes("--demo");
  if (seedDemoMemory && memory.list("long_term").length === 0) {
    memory.remember("用户的名字是小明，喜欢简洁的回答", 0.9);
    memory.remember("用户正在开发一个叫 hachimi 的个人助理项目", 0.85);
  }

  let llm = createLLMFromConfig(config);
  // "模型的眼睛"：为无多模态能力的主模型提供视觉协助描述
  let visionCompanion = new VisionCompanion({ config });
  const contextBuilder = new ContextBuilder();

  // W2.1: 基于 PermissionPolicy 矩阵的权限校验兜底
  const defaultApprovalHandler: ToolApprovalHandler = async (
    toolName,
    _args,
    permission,
    _diff,
    policyContext
  ): Promise<boolean> => {
    // 修正：第 4 参是 diff 而非 channel；surface/trust/kind 由 policyContext 透传，
    // 否则 minimal 信任对 safe+kind=write 的收紧会被端到端绕过（静默写文件）。
    const surface = (policyContext?.channel || "cli") as SurfaceType;
    return permissionPolicy.isAllowed(
      surface,
      toolName,
      permission as ToolPermission,
      policyContext?.trustLevel,
      policyContext?.toolKind
    );
  };

  const effectiveToolApproval = options.onToolApproval || defaultApprovalHandler;

  // P2.9: 模型窗口（硬闸门基线）与 system prompt 组装预算（用户配置 + 下限保护）
  const agentMaxTokens = resolveModelContextWindow(selection.modelId, selection.connection);
  const contextPromptBudget = resolveContextPromptBudget(config.context.maxTokens, agentMaxTokens);
  if (contextPromptBudget !== config.context.maxTokens) {
    console.warn(
      `[ContextBuilder] context.maxTokens=${config.context.maxTokens} clamped to prompt budget ` +
        `${contextPromptBudget} (model window ${agentMaxTokens}) — keep system prompt assembly healthy`
    );
  }

  let agent = new Agent({
    llm,
    tools,
    memory,
    skills,
    contextBuilder,
    personalContextLoader,
    hooks,
    dataDir: config.paths.dataDir,
    maxToolRounds: config.agent.maxToolRounds,
    maxTokens: agentMaxTokens,
    contextPromptBudget,
    mode: config.context.defaultMode,
    summaryThreshold: config.context.summaryThreshold,
    onToolApproval: effectiveToolApproval,
    onUserQuestion: options.onUserQuestion,
    modelId: selection.modelId,
    fileHistory,
    availableModels: selection.connection?.enabledModels,
    autoModelRouting: config.agent.autoModelRouting,
    visionCompanion,
    modelHasVision: selection.connection?.supportsVision,
    deferredToolInjection: config.agent.deferredToolInjection?.enabled === true,
  });

  sessions.getOrCreate();
  const session = sessions.getCurrent();
  // P1.7: 统一任务注册表 — 子代理与后台任务共享同一实例（聚合查询路径）
  const taskRegistry = new TaskRegistry();
  // P2.8: 电源/活动感知策略 — 用户交互标记 + 后台触发门控
  const activityPolicy = new ActivityPolicy();

  log("info", "session ready", {
    id: session?.id,
    messages: session?.messages.length ?? 0,
  });

  const context: AppContext = {
    config,
    memory,
    sessions,
    tools,
    skills,
    agent,
    contextBuilder,
    personalContextLoader,
    hooks,
    mcp,
    skillLoader,
    events,
    works,
    projects,
    permissionPolicy,
    tasks: taskRegistry,
    activityPolicy,
    fileHistory,
    backgroundTasks: new BackgroundTaskManager({ registry: taskRegistry }),
    getConfig() {
      return config;
    },
    setActiveConnection(connectionId: string, connConfig?: Partial<LlmConnection>) {
      config.llm.activeConnectionId = connectionId;

      if (connConfig && config.llm.connections) {
        config.llm.connections[connectionId] = {
          ...(config.llm.connections[connectionId] || {
            id: connectionId,
            name: connectionId,
            providerType: "openai",
            enabled: true,
            defaultModelId: "default",
            models: [],
            enabledModels: [],
          }),
          ...connConfig,
        };
      }

      saveConfig(config, options.configPath || "config.json");
      llm = createLLMFromConfig(config);
      visionCompanion = new VisionCompanion({ config });
      const sel = resolveLlmSelection(config);
      const selAgentMaxTokens = resolveModelContextWindow(sel.modelId, sel.connection);
      const selPromptBudget = resolveContextPromptBudget(
        config.context.maxTokens,
        selAgentMaxTokens
      );
      agent = new Agent({
        llm,
        tools,
        memory,
        skills,
        contextBuilder,
        personalContextLoader,
        hooks,
        dataDir: config.paths.dataDir,
        maxToolRounds: config.agent.maxToolRounds,
        maxTokens: selAgentMaxTokens,
        contextPromptBudget: selPromptBudget,
        mode: config.context.defaultMode,
        summaryThreshold: config.context.summaryThreshold,
        onToolApproval: effectiveToolApproval,
        modelId: sel.modelId,
        fileHistory,
        availableModels: sel.connection?.enabledModels,
        autoModelRouting: config.agent.autoModelRouting,
        visionCompanion,
        modelHasVision: sel.connection?.supportsVision,
        deferredToolInjection: config.agent.deferredToolInjection?.enabled === true,
      });
      context.agent = agent;
    },
    getStatus() {
      const currentSession = sessions.getCurrent();
      const messages = currentSession?.messages ?? [];
      const longTerm = memory.list("long_term");
      const sessionMem = memory.list("session");

      const estimatedHistoryLength = JSON.stringify(messages).length;
      const approxTokens = Math.ceil(estimatedHistoryLength / 3.5);

      const sel = resolveLlmSelection(config);
      const credStore = getDefaultCredentialStore();
      const loadedPC = personalContextLoader.load();

      return {
        title: config.tui.title,
        llm: {
          connectionId: sel.connectionId,
          provider: sel.providerType,
          model: sel.modelId || "default",
          hasKey: credStore.has(sel.connectionId) || Boolean(sel.connection?.apiKey),
        },
        context: {
          maxTokens: config.context.maxTokens,
          mode: config.context.defaultMode,
          estimatedTokens: approxTokens,
          ratio: `${((approxTokens / config.context.maxTokens) * 100).toFixed(1)}%`,
        },
        personalContext: {
          hasSoul: loadedPC.hasSoul,
          hasTelos: loadedPC.hasTelos,
          soulPath: config.personalContext?.soulPath,
          telosRoot: config.personalContext?.telosRoot,
          knowledgeRoot: config.personalContext?.knowledgeRoot,
          knowledgeWriteRoot: config.personalContext?.knowledgeWriteRoot,
        },
        memory: {
          longTermCount: longTerm.length,
          sessionCount: sessionMem.length,
          totalCount: memory.list().length,
        },
        session: {
          id: currentSession?.id ?? "-",
          title: currentSession?.title ?? "默认会话",
          messageCount: messages.length,
        },
        skills: skills.list().map((s) => s.name),
        tools: tools.list().map((t) => ({ name: t.name, permission: t.permission ?? "safe" })),
        paths: {
          dataDir: config.paths.dataDir,
          memoryFile: config.paths.memoryFile,
          sessionsDir: config.paths.sessionsDir,
        },
      };
    },
  };

  return context;
}
