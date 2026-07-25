// packages/shared/src/constants/security.ts
/**
 * Hachimi 全局安全与敏感环境变量 Key 配置
 */

/** 默认需要从工具执行环境中剥离脱敏的敏感 API Key 与 Token 列表 */
export const DEFAULT_SENSITIVE_ENV_KEYS: readonly string[] = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "HACHIMI_API_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "DATABASE_URL",
  "SECRET_KEY",
  "PRIVATE_KEY",
];
