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

/** ContextBuilder 默认的最大 Prompt Token 预算 */
export const DEFAULT_TOKEN_BUDGET = 12000;

/** Agent Loop 默认最大工具调用循环轮次 */
export const DEFAULT_MAX_TOOL_ROUNDS = 10;

/** SubAgent 隔离执行的最大工具调用循环轮次 */
export const SUBAGENT_MAX_TOOL_ROUNDS = 5;

/** Daemon API Server 默认监听端口 */
export const DAEMON_DEFAULT_PORT = 3700;

/** Daemon API Server 默认监听主机 */
export const DAEMON_DEFAULT_HOST = "127.0.0.1";
