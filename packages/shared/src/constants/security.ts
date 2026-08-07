// packages/shared/src/constants/security.ts
/**
 * Hachimi 全局安全与敏感环境变量 Key 配置
 */

/** 默认需要从工具执行环境中剥离脱敏的敏感 API Key 与 Token 列表 */
export const DEFAULT_SENSITIVE_ENV_KEYS: readonly string[] = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "HACHIMI_API_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SESSION_TOKEN",
  "DATABASE_URL",
  "SECRET_KEY",
  "PRIVATE_KEY",
];

/**
 * 判断环境变量 Key 是否属于敏感凭据（精确匹配 + 模式匹配）。
 * 模式覆盖 *_API_KEY / *_TOKEN / *_SECRET / *_PASSWORD / *_PRIVATE_KEY 等常见形态，
 * 防止自定义命名的凭据（如 MYAPP_API_KEY）被透传给工具子进程。
 */
export function isSensitiveEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (DEFAULT_SENSITIVE_ENV_KEYS.includes(upper)) return true;
  return /(API_KEY|_TOKEN$|_SECRET|_PASSWORD|PRIVATE_KEY|CREDENTIALS?|ACCESS_KEY|SESSION_TOKEN)/.test(
    upper
  );
}
