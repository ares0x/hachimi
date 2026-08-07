// packages/core/src/sandbox/shell-ast-guard.ts
/**
 * H5.1: Shell 命令预审器与安全隔离防护
 * 深度解析 Shell 命令 token，拦截 rm -rf /、网络管道 curl | bash、环境变量污染与危险逃逸语法
 */

export interface ShellAuditResult {
  allowed: boolean;
  reason?: string;
  command: string;
}

/** P0.1: 命令嵌套/包装解析的最大深度，超过即 fail-closed（grok bash_command_splitting 模式） */
export const MAX_SHELL_NESTING_DEPTH = 8;

/** P0.1: 可剥离的 wrapper 前缀（timeout/env/nice/nohup/setsid/stdbuf） */
const WRAPPER_COMMANDS = new Set(["timeout", "env", "nice", "nohup", "setsid", "stdbuf"]);

/** P0.1: 可递归解析的 `-c` 子 shell 解释器 */
const SHELL_C_COMMANDS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

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
      /(cat|less|more|head|tail|grep)\s+.*(~|\/Users\/[^/]+|\/home\/[^/]+)\/\.(ssh|aws|gnupg|kube)\//i,
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
    pattern: /\bchmod\s+(-[a-zA-Z]*[Rr][a-zA-Z]*\s+)?777\s+(\/|~)/,
    reason: "Blocked dangerous root permission override (chmod 777 /).",
  },
  { pattern: /\bsudo\s+/, reason: "Blocked elevated privilege execution (sudo)." },
  {
    pattern: />\s*\.git\/(config|hooks\/)/i,
    reason: "Blocked arbitrary modification of Git hooks or Git config (.git/hooks).",
  },
  {
    pattern: /\b(shutdown|reboot|init\s+0|poweroff)\b/i,
    reason: "Blocked system shutdown/reboot command.",
  },
  {
    pattern: /\bchown\s+-R\s+[^ ]+\s+\//i,
    reason: "Blocked recursive ownership change on filesystem root.",
  },
  {
    pattern: /\b(>\s*)?\/dev\/sd[a-z][0-9]?/i,
    reason: "Blocked direct writes to raw disk devices.",
  },
];

/**
 * 将命令按空白切分为 token，并尽量还原引号包裹的变量/路径形态，
 * 用于检测 `rm -rf "$HOME"`、`rm -rf -- /`、`rm -r -f $HOME/...` 等正则难以覆盖的绕过。
 */
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\$\{[^}]+\})|(\$[A-Za-z_][A-Za-z0-9_]*)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

function stripOuterQuotes(token: string): string {
  // "..." / '...'（含内部转义解码）
  if (token.length >= 2) {
    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1).replace(/\\(["'\\$`])/g, "$1");
    }
  }
  // \"...\" 转义引号形态（嵌套 bash -c 时由 tokenizer 保留的反斜杠引号）
  if (token.startsWith('\\"') && token.endsWith('\\"') && token.length >= 4) {
    return token.slice(2, -2).replace(/\\(["'\\$`])/g, "$1");
  }
  return token;
}

/** 判断 rm 目标是否为危险路径（根 /、家目录、环境变量展开、通配符、父目录逃逸） */
function isDangerousRmTarget(rawTarget: string): boolean {
  const target = stripOuterQuotes(rawTarget).trim();
  if (!target) return false;

  // 环境变量展开形态：$HOME / ${HOME} / $PWD / ${PWD}（含其后缀路径）
  if (/^(\$HOME|\$\{HOME\}|\$PWD|\$\{PWD\})(\/|$)/.test(target)) return true;
  // 直接使用 ~ 家目录或 ~/...
  if (target === "~" || target.startsWith("~/") || target === "~/*") return true;
  // 根目录或任意绝对路径（与既有 rm -rf /<path> 拦截语义一致）
  if (target.startsWith("/")) return true;
  // 父目录逃逸
  if (target === ".." || target.startsWith("../")) return true;
  // 当前目录通配删除（cd / && rm -rf *）
  if (target === "*" || target === "./*" || target === ".*") return true;

  return false;
}

/** 检测 rm/rmdir 递归强制删除危险目标（覆盖 --、-r -f 拆分、引号与变量展开绕过） */
function detectDestructiveRm(command: string): { blocked: boolean; reason: string } {
  const tokens = tokenizeCommand(command);

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].replace(/^["']|["']$/g, "");
    if (word !== "rm" && word !== "rmdir") continue;

    const flags: string[] = [];
    let j = i + 1;
    // 收集紧随其后的 flag token（含 -- 分隔符）
    while (j < tokens.length && (/^-{1,2}[A-Za-z]/.test(tokens[j]) || tokens[j] === "--")) {
      flags.push(tokens[j]);
      j++;
    }

    const hasRecursive = flags.some((f) => {
      if (f === "--recursive" || f === "-R" || f === "-r") return true;
      const chars = f.replace(/^-+/, "");
      return chars.includes("r");
    });
    const hasForce = flags.some((f) => {
      if (f === "--force") return true;
      const chars = f.replace(/^-+/, "");
      return chars.includes("f");
    });
    if (!hasRecursive || !hasForce) continue;

    // 找到第一个非 flag 参数作为目标
    const target = j < tokens.length ? tokens[j] : "";
    if (target && isDangerousRmTarget(target)) {
      return {
        blocked: true,
        reason: "Blocked destructive recursive deletion on root/home/workspace-escape path.",
      };
    }
  }

  return { blocked: false, reason: "" };
}

/**
 * P0.1: 剥离一层 wrapper（timeout / env / nice / nohup / setsid / stdbuf），
 * 返回内部实际执行的命令；无法识别或没有内部命令时返回 null。
 */
function stripCommandWrapper(command: string): string | null {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return null;
  const head = stripOuterQuotes(tokens[0]);
  if (!WRAPPER_COMMANDS.has(head)) return null;

  let i = 1;
  if (head === "timeout") {
    // timeout [-s SIG] [--preserve-status] <duration> <cmd...>
    while (
      i < tokens.length &&
      (tokens[i].startsWith("-") || /^\d+(\.\d+)?[smhd]?$/.test(stripOuterQuotes(tokens[i])))
    ) {
      i++;
    }
  } else if (head === "env") {
    // env [-i] [-S 'A=1 cmd...'] [NAME=VALUE ...] <cmd...>
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === "-S" || t === "--split-string") {
        i += 2;
        continue;
      }
      if (t.startsWith("-") || stripOuterQuotes(t).includes("=")) {
        i++;
        continue;
      }
      break;
    }
  } else if (head === "nice") {
    // nice [-n N] <cmd...>
    while (i < tokens.length && tokens[i].startsWith("-")) {
      i += tokens[i] === "-n" || tokens[i] === "--adjustment" ? 2 : 1;
    }
  }

  if (i >= tokens.length) return null;
  const rest = tokens.slice(i).join(" ");
  return rest || null;
}

/**
 * P0.1: 提取 `bash -c '<script>'` / `sh -c` 等子 shell 内层脚本；
 * 找到即返回（安全方向：宁可多审）。
 */
function extractShellCInner(command: string): string | null {
  const tokens = tokenizeCommand(command);
  for (let i = 0; i < tokens.length; i++) {
    const word = stripOuterQuotes(tokens[i]);
    if (!SHELL_C_COMMANDS.has(word)) continue;
    const next = tokens[i + 1];
    if (next !== "-c" && next !== "--command") continue;
    const inner = i + 2 < tokens.length ? stripOuterQuotes(tokens[i + 2]) : "";
    if (inner) return inner;
  }
  return null;
}

/** P0.1: 分层审计核心 —— 每层跑既有规则，再递归 wrapper 与 `-c` 内层 */
function auditShellCommandLayered(command: string, depth: number): ShellAuditResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: true, command: trimmed };
  }

  if (depth >= MAX_SHELL_NESTING_DEPTH) {
    return {
      allowed: false,
      reason: `[Shell Safety Audit] 命令嵌套层级过深（>= ${MAX_SHELL_NESTING_DEPTH}），按安全默认拒绝执行。`,
      command: trimmed,
    };
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

  const rmCheck = detectDestructiveRm(trimmed);
  if (rmCheck.blocked) {
    return {
      allowed: false,
      reason: `[Shell Safety Audit] ${rmCheck.reason}`,
      command: trimmed,
    };
  }

  // 递归审计 wrapper 内层（timeout/env/nice/... 包裹的命令）
  const stripped = stripCommandWrapper(trimmed);
  if (stripped && stripped !== trimmed) {
    const inner = auditShellCommandLayered(stripped, depth + 1);
    if (!inner.allowed) return inner;
  }

  // 递归审计 bash -c / sh -c 子 shell 脚本
  const innerScript = extractShellCInner(trimmed);
  if (innerScript) {
    const inner = auditShellCommandLayered(innerScript, depth + 1);
    if (!inner.allowed) return inner;
  }

  return { allowed: true, command: trimmed };
}

export function auditShellCommandAST(command: string): ShellAuditResult {
  return auditShellCommandLayered(command, 0);
}
