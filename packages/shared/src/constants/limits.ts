// packages/shared/src/constants/limits.ts
/**
 * Hachimi 全局系统数值阈值与上限配置
 */

/** 工具默认单次执行最大超时时间 (毫秒) */
export const DEFAULT_TOOL_TIMEOUT_MS = 30000;

/** 沙箱输出流控制台/输出字符缓冲区上限 (1MB) */
export const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

/** Circuit Breaker 熔断器触发连续失败次数阈值 */
export const CIRCUIT_BREAKER_MAX_FAILURES = 3;

/** ContextBuilder 默认的最大 Prompt Token 预算 (提升至 32k，适应现代 64k-200k 模型) */
export const DEFAULT_TOKEN_BUDGET = 32000;

/** Agent Loop 默认最大工具调用循环轮次（提升至 100 轮保底熔断，不人为切断正常任务） */
export const DEFAULT_MAX_TOOL_ROUNDS = 100;

/** 子代理内部执行会话 ID 前缀（与用户会话区分，列表/侧边栏需过滤） */
export const SUB_AGENT_SESSION_PREFIX = "sub_sess_";

/** SubAgentDelegator 默认最大并行运行中的子代理数（超额排队等待） */
export const DEFAULT_MAX_CONCURRENT_SUBAGENTS = 4;

/** P2: 子代理回传给父 Agent 的摘要最大字符数（超出截断并指向子会话事件流） */
export const SUBAGENT_SUMMARY_MAX_CHARS = 8000;

/** P2.8: async 子代理完成通知写入父会话的最大字符数（仅状态感知，完整内容留在子会话） */
export const SUBAGENT_NOTIFY_MAX_CHARS = 500;

/** P2: 父 Agent 注入子代理的 contextSummary 最大字符数（超出截断） */
export const SUBAGENT_CONTEXT_SUMMARY_MAX_CHARS = 8000;

/** SubAgent 隔离执行的最大工具调用循环轮次 */
export const SUBAGENT_MAX_TOOL_ROUNDS = 20;

/** Daemon API Server 默认监听端口 */
export const DAEMON_DEFAULT_PORT = 3700;

/** Daemon API Server 默认监听主机 */
export const DAEMON_DEFAULT_HOST = "127.0.0.1";
