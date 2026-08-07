// packages/core/src/tools/rule-engine.ts
// P0-4: 权限规则引擎（Grok Build deny > ask > allow 管线）
//
// 规则优先级（与权限策略叠加）：
//   deny  >  ask  >  allow  >  记忆授权(remembered grants)  >  内置只读  >  模式策略
// 规则用于工具名精确匹配或通配符（* 与 ?）。
export type RuleDecision = "deny" | "ask" | "allow" | "inherit";

export interface PermissionRules {
  /** 工具名或通配符：永远拒绝（deny 最高优先级，不可被记忆授权绕过） */
  deny?: string[];
  /** 工具名或通配符：强制询问（即使该工具是只读安全工具） */
  ask?: string[];
  /** 工具名或通配符：永远放行（仍受 deny 规则与 hooks 约束） */
  allow?: string[];
  /** 命令前缀列表：即使批准过也永远复问（不记忆授权） */
  dangerousCommands?: string[];
}

/** 默认危险命令前缀：命中则不写入记忆授权，每次都复问 */
export const DEFAULT_DANGEROUS_COMMAND_PREFIXES = [
  "rm",
  "rmdir",
  "dd",
  "mkfs",
  "shred",
  "sudo",
  "chmod",
  "chown",
  "git push",
  "git reset --hard",
  "git clean",
  "git checkout --",
  "curl",
  "wget",
  "pv",
  "kill",
  "pkill",
  "systemctl",
] as const;

/** 简单通配符匹配：* 匹配任意字符序列，? 匹配单个字符 */
export function matchWildcard(pattern: string, value: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split("*")
      .map((p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, "."))
      .join(".*")}$`
  );
  return re.test(value);
}

function matchesAny(patterns: string[] | undefined, value: string): boolean {
  if (!patterns) return false;
  return patterns.some((p) => p === value || matchWildcard(p, value));
}

export class PermissionRuleEngine {
  private rules: PermissionRules;

  constructor(rules: PermissionRules = {}) {
    this.rules = rules;
  }

  /** 更新规则（配置热更新） */
  update(rules: PermissionRules): void {
    this.rules = rules;
  }

  getRules(): PermissionRules {
    return this.rules;
  }

  /** 工具级规则判定：deny > ask > allow > inherit */
  evaluate(toolName: string): RuleDecision {
    if (matchesAny(this.rules.deny, toolName)) return "deny";
    if (matchesAny(this.rules.ask, toolName)) return "ask";
    if (matchesAny(this.rules.allow, toolName)) return "allow";
    return "inherit";
  }

  /** 命令是否危险（命中 dangerousCommands 或默认危险前缀）→ 不得使用记忆授权 */
  isDangerousCommand(command: string): boolean {
    const prefixes = this.rules.dangerousCommands?.length
      ? this.rules.dangerousCommands
      : [...DEFAULT_DANGEROUS_COMMAND_PREFIXES];
    const normalized = command.trim().replace(/\s+/g, " ");
    if (!normalized) return true;
    return prefixes.some(
      (p) => normalized === p || normalized.startsWith(`${p} `) || normalized.startsWith(`${p}\n`)
    );
  }
}
