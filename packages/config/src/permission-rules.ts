// packages/config/src/permission-rules.ts
// P0-4: 权限规则配置类型与归一化
export interface PermissionRulesConfig {
  /** 工具名或通配符：永远拒绝 */
  deny?: string[];
  /** 工具名或通配符：强制询问 */
  ask?: string[];
  /** 工具名或通配符：永远放行 */
  allow?: string[];
  /** 命令前缀：即使批准过也永远复问（默认含 rm/sudo/git push 等） */
  dangerousCommands?: string[];
}

export function normalizePermissionRules(
  raw?: Partial<PermissionRulesConfig>
): PermissionRulesConfig {
  return {
    deny: dedupe(raw?.deny),
    ask: dedupe(raw?.ask),
    allow: dedupe(raw?.allow),
    dangerousCommands: dedupe(raw?.dangerousCommands),
  };
}

function dedupe(list?: string[]): string[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = String(item).trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.length > 0 ? out : undefined;
}
