/**
 * PermissionPolicy — surface × tool permission 矩阵
 *
 * policy:
 * - deny: 一律不允许（含 safe）
 * - allow-safe: safe 直接允许；needs_confirm/dangerous → require_approval（有 UI 则问，无 UI 则拒）
 * - allowlist: 仅白名单内工具；默认只允许其 safe（见下）
 * - allow-all: 全部直接允许（仅建议 TUI 等真人在场）
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

/** 策略引擎对单次调用的裁决（避免 boolean 歧义） */
export type PolicyDecision = "allow" | "deny" | "require_approval";

export interface ToolPolicyRule {
  policy: PolicyLevel;
  /** allowlist 时的工具白名单 */
  allowedTools?: string[];
  /**
   * allowlist 时是否允许白名单内的 needs_confirm（仍建议走审批）
   * 默认 false：白名单也只放行 safe
   */
  allowlistPermitsConfirm?: boolean;
}

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
  // 后台/系统任务不默认同 TUI
  system: "allow-safe",
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

  getPolicy(surface: SurfaceType): ToolPolicyRule {
    return (
      this.overrides.get(surface) || {
        policy: DEFAULT_SURFACE_POLICY[surface] ?? "allow-safe",
      }
    );
  }

  /**
   * 核心裁决：allow | deny | require_approval
   */
  decide(surface: SurfaceType, toolName: string, permLevel: ToolPermission): PolicyDecision {
    const level = permLevel ?? "safe";
    const rule = this.getPolicy(surface);

    switch (rule.policy) {
      case "deny":
        return "deny";

      case "allow-all":
        return "allow";

      case "allowlist": {
        const listed = (rule.allowedTools ?? []).includes(toolName);
        if (!listed) return "deny";
        if (level === "safe") return "allow";
        if (rule.allowlistPermitsConfirm && level === "needs_confirm") {
          return "require_approval";
        }
        // dangerous 或未开启 confirm：拒绝
        return "deny";
      }

      case "allow-safe":
      default: {
        if (level === "safe") return "allow";
        // needs_confirm / dangerous：需要人批；无 UI 时由 Registry 转 deny
        return "require_approval";
      }
    }
  }

  /**
   * 兼容旧调用：仅表示「策略是否直接放行」。
   * require_approval → false（不等于最终拒绝，见 Registry）
   */
  isAllowed(surface: SurfaceType, toolName: string, permLevel: ToolPermission): boolean {
    return this.decide(surface, toolName, permLevel) === "allow";
  }

  /** 是否应走 UI/回调审批（而非直接拒绝） */
  requiresApproval(surface: SurfaceType, toolName: string, permLevel: ToolPermission): boolean {
    return this.decide(surface, toolName, permLevel) === "require_approval";
  }

  setPolicy(surface: SurfaceType, rule: ToolPolicyRule): void {
    this.overrides.set(surface, rule);
  }

  getSnapshot(): Record<string, ToolPolicyRule> {
    const snapshot: Record<string, ToolPolicyRule> = {};
    for (const s of Object.keys(DEFAULT_SURFACE_POLICY)) {
      snapshot[s] = this.getPolicy(s);
    }
    for (const [s, rule] of this.overrides.entries()) {
      snapshot[s] = rule;
    }
    return snapshot;
  }
}

/**
 * 默认实例：便于现有 createAppContext。
 * 测试与多 Runtime 请 prefer `new PermissionPolicy()` 注入，避免并行用例互相 setPolicy。
 */
export const defaultPermissionPolicy = new PermissionPolicy();
