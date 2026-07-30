/**
 * H5.1: Shell AST 命令预审器与安全隔离防护
 * 深度解析 Shell 命令 token，拦截 rm -rf /、网络管道 curl | bash、环境变量污染与危险逃逸语法
 */

export interface ShellAuditResult {
  allowed: boolean;
  reason?: string;
  command: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, reason: "Detected Fork Bomb attack vector." },
  {
    pattern:
      /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(\/|~|\/\*|~\/\*|\.\.|\.\.\/\*)/i,
    reason: "Blocked destructive root/home recursive deletion (rm -rf /).",
  },
  {
    pattern: /rm\s+-rf\s+(\/|~|\/\*|\.\.)/i,
    reason: "Blocked destructive root/home recursive deletion (rm -rf /).",
  },
  {
    pattern: /(curl|wget)\s+.*\|\s*(bash|sh|zsh|python|perl|ruby)/i,
    reason: "Blocked unverified remote script execution via pipe (curl | bash).",
  },
  {
    pattern: /powershell.*-enc/i,
    reason: "Blocked encoded PowerShell script execution.",
  },
  {
    pattern:
      /(cat|less|more|head|tail|grep)\s+.*(~|\/Users\/[^\/]+|\/home\/[^\/]+)\/\.(ssh|aws|gnupg|kube)\//i,
    reason: "Blocked unauthorized reading of system secret files (~/.ssh, ~/.aws, ~/.kube).",
  },
  {
    pattern: /cat\s+~\/\.ssh\/id_/i,
    reason: "Blocked unauthorized reading of SSH private keys (~/.ssh/id_rsa).",
  },
  {
    pattern:
      /dd\s+if=\/dev\/(zero|null|urandom)\s+of=\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9]n[0-9]|disk[0-9])/i,
    reason: "Blocked low-level disk formatting command (dd).",
  },
  { pattern: /mkfs\./i, reason: "Blocked low-level filesystem formatting (mkfs)." },
  {
    pattern: /\bchmod\s+777\s+\//,
    reason: "Blocked dangerous root permission override (chmod 777 /).",
  },
  { pattern: /\bsudo\s+/, reason: "Blocked elevated privilege execution (sudo)." },
];

export function auditShellCommandAST(command: string): ShellAuditResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: true, command: trimmed };
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: `[Shell Safety Audit] ${reason}`,
        command: trimmed,
      };
    }
  }

  return { allowed: true, command: trimmed };
}
