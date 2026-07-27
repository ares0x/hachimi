/**
 * W2.1: PermissionPolicy — surface × toolClass 权限矩阵
 *
 * surface: web | desktop | tui | telegram | api | cli | proactive-trigger | ws | web-sse
 * permLevel: safe | needs_confirm | dangerous
 * policy: deny | allow-safe | allowlist | allow-all
 *
 * 规则:
 * - TUI 默认 allow-all（有真实用户在场）
 * - Web/Desktop allow-safe（needs_confirm / dangerous 工具需 UI Approve）
 * - Telegram/API/CLI allow-safe（非交互渠道，自动拒绝 needs_confirm+）
 * - allow-all 只允许在 TUI 使用
 */

import type { ToolPermission } from "../types/index.js";

export type SurfaceType =
  | "tui"
  | "web"
  | "web-sse"
  | "desktop"
  | "telegram"
  | "api"
  | "api-json"
  | "cli"
  | "ws"
  | "proactive-trigger"
  | "system"
  | (string & {});

export type PolicyLevel = "deny" | "allow-safe" | "allowlist" | "allow-all";

export interface ToolPolicyRule {
  policy: PolicyLevel;
  /** allowlist 时的工具白名单 */
  allowedTools?: string[];
}

/** 默认各 surface 的权限策略 */
const DEFAULT_SURFACE_POLICY: Record<string, PolicyLevel> = {
  tui: "allow-all",
  web: "allow-safe",
  "web-sse": "allow-safe",
  desktop: "allow-safe",
  telegram: "allow-safe",
  api: "allow-safe",
  "api-json": "allow-safe",
  cli: "allow-safe",
  ws: "allow-safe",
  "proactive-trigger": "allow-safe",
  system: "allow-all",
};

export class PermissionPolicy {
  private overrides: Map<string, ToolPolicyRule> = new Map();

  constructor(overrides?: Partial<Record<string, ToolPolicyRule>>) {
    if (overrides) {
      for (const [surface, rule] of Object.entries(overrides)) {
        if (rule) this.overrides.set(surface, rule);
      }
    }
  }

  /** 获取指定 surface 的有效策略 */
  getPolicy(surface: SurfaceType): ToolPolicyRule {
    return (
      this.overrides.get(surface) || {
        policy: DEFAULT_SURFACE_POLICY[surface] ?? "allow-safe",
      }
    );
  }

  /**
   * 判断某工具是否允许在指定 surface 上执行
   *
   * @param surface  来源渠道
   * @param toolName 工具名称
   * @param permLevel 工具自身的权限级别
   * @returns true = 允许, false = 拒绝
   */
  isAllowed(surface: SurfaceType, toolName: string, permLevel: ToolPermission): boolean {
    const rule = this.getPolicy(surface);

    switch (rule.policy) {
      case "deny":
        return false;

      case "allow-all":
        return true;

      case "allowlist":
        // allowlist: 只有白名单工具可执行，且只允许 safe 级别
        if (permLevel !== "safe") return false;
        return (rule.allowedTools ?? []).includes(toolName);

      case "allow-safe":
      default:
        // allow-safe: safe 直接通过，needs_confirm / dangerous 需 UI 审批（返回 false 触发 onToolApproval）
        return permLevel === "safe";
    }
  }

  /**
   * 设置 surface 级别的策略覆盖
   */
  setPolicy(surface: SurfaceType, rule: ToolPolicyRule): void {
    this.overrides.set(surface, rule);
  }

  /** 获取所有 surface 的策略快照（用于 /api/status） */
  getSnapshot(): Record<string, ToolPolicyRule> {
    const snapshot: Record<string, ToolPolicyRule> = {};
    const surfaces = Object.keys(DEFAULT_SURFACE_POLICY);
    for (const s of surfaces) {
      snapshot[s] = this.getPolicy(s);
    }
    // 加上用户自定义覆盖
    for (const [s, rule] of this.overrides.entries()) {
      snapshot[s] = rule;
    }
    return snapshot;
  }
}

/** 全局单例（由 createAppContext 初始化） */
export const defaultPermissionPolicy = new PermissionPolicy();
