// packages/core/src/portable/redact.ts
// P0-5: 导出脱敏 — 便携包导出前扫描全部字符串，剥离凭据形态内容
//
// 原则（Kun workflow-dsl stripSecrets / maka redaction 模式）：
//   导出的数据包是"可分发资产"，任何 API key / token / 密码形态的值都不得出现在导出内容中。
//   保守优先：宁可误伤（把长随机串打码），不可泄露。

const SECRET_PATTERNS: RegExp[] = [
  // OpenAI / Anthropic / DeepSeek 等 sk-* API keys
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  // Anthropic Claude keys
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  // AWS access keys
  /\bAKIA[0-9A-Z]{16}\b/g,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  // Slack tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
  // 通用键值对：key=value / key: value / key "value"
  /((?:api[_-]?key|apikey|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|session[_-]?token))\s*[:=]\s*["']?[^\s"',;{}]{8,}/gi,
  // PEM 私钥块
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

/** 对单个字符串执行脱敏；返回脱敏后的字符串 */
export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      // 键值对形态：保留键名，值打码
      const kv = match.match(
        /^((?:api[_-]?key|apikey|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|session[_-]?token))\s*[:=]\s*(.*)$/i
      );
      if (kv) {
        return `${kv[1]}=[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }
  return out;
}

/** 深度遍历对象/数组，脱敏所有字符串值（保留结构） */
export function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactDeep(v);
    }
    return out;
  }
  return value;
}
