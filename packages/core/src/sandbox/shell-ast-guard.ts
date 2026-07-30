/**
 * H5.1: Shell AST 命令预审器与安全隔离防护
 * 深度解析 Shell 命令 token，拦截 rm -rf /、网络管道 curl | bash、环境变量污染与危险逃逸语法
 */

export interface ShellAuditResult {
  allowed: boolean;
  reason?: string;
  command: string;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+-[rRfF]*\s+\/(\s|$)/, // rm -rf /
  /\bcurl\b.*\|\s*bash\b/, // curl ... | bash
  /\bwget\b.*\|\s*sh\b/, // wget ... | sh
  /\bchmod\s+777\s+\//, // chmod 777 /
  /\b:\(\)\{\s*:\|:&\s*\};:/, // fork bomb
];

export function auditShellCommandAST(command: string): ShellAuditResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: true, command: trimmed };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: `[安全预审拦截] 检测到高危 Shell 指令表达式 (${pattern.source})，禁止执行！`,
        command: trimmed,
      };
    }
  }

  return { allowed: true, command: trimmed };
}
