/**
 * PermissionPolicy — surface × tool permission matrix
 *
 * PolicyLevel:
 * - deny:       never allow (even safe)
 * - allow-safe: safe → allow; needs_confirm/dangerous → require_approval (or deny if no UI)
 * - allowlist:  only whitelisted tools; safe by default, see allowlistPermitsConfirm
 * - allow-all:  allow everything immediately (TUI / fully-trusted sessions)
 *
 * SessionTrustLevel (new — overrides surface default per session/turn):
 * - minimal:   safe only; needs_confirm/dangerous always require_approval → mirrors deny-except-safe
 * - standard:  workspace-aware writes skip confirmation; other needs_confirm still asks
 *              (Desktop default after user picks a workspace)
 * - elevated:  needs_confirm → allow; only dangerous still asks
 *              (user explicitly said "go ahead, write freely")
 * - full:      equivalent to allow-all (local TUI, fully trusted env)
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

/**
 * Session-scoped trust level.
 * Injected per execute() call; overrides the surface default if set.
 *
 * - minimal:  read-only safe only; any write/confirm → require_approval
 * - standard: workspace-internal writes are auto-allowed; other needs_confirm still asks
 *             (Desktop default once user selects a workspace)
 * - elevated: all needs_confirm → allow; only `dangerous` still asks
 *             (user explicitly granted broader trust this session)
 * - full:     equivalent to allow-all (TUI / local single-user)
 */
export type SessionTrustLevel = "minimal" | "standard" | "elevated" | "full";

/** Policy engine verdict for one tool call */
export type PolicyDecision = "allow" | "deny" | "require_approval";

export interface ToolPolicyRule {
  policy: PolicyLevel;
  /** Whitelist for "allowlist" policy */
  allowedTools?: string[];
  /**
   * Whether allowlisted tools with needs_confirm are allowed (still goes to approval).
   * Default false: allowlist only permits safe.
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
   * Core verdict: allow | deny | require_approval
   *
   * Resolution order (highest priority first):
   *  1. SessionTrustLevel (if provided) — per-session dynamic override
   *  2. Surface PolicyLevel (static surface default or override)
   */
  decide(
    surface: SurfaceType,
    toolName: string,
    permLevel: ToolPermission,
    trustLevel?: SessionTrustLevel,
    /** 工具语义分类（read/write/delete/shell…），用于 minimal 面按类别收紧 */
    toolKind?: string
  ): PolicyDecision {
    const level = permLevel ?? "safe";

    // ── 1. Session Trust Level (dynamic, per-session override) ────────────────
    if (trustLevel) {
      switch (trustLevel) {
        case "full":
          return "allow";

        case "elevated":
          // needs_confirm → allow; dangerous → require_approval
          if (level === "safe" || level === "needs_confirm") return "allow";
          return "require_approval"; // dangerous

        case "standard":
          // safe → always allow
          // needs_confirm → require_approval (caller may auto-allow workspace-aware writes)
          // dangerous → require_approval
          if (level === "safe") return "allow";
          return "require_approval";

        case "minimal":
          // safe → allow（但文件写/删除类工具仍需审批，防止远程/自动化面静默改动文件）
          if (level === "safe" && toolKind !== "write" && toolKind !== "delete") return "allow";
          return "require_approval";
      }
    }

    // ── 2. Surface-level policy (static default) ──────────────────────────────
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
        return "deny";
      }

      case "allow-safe":
      default: {
        if (level === "safe") return "allow";
        // needs_confirm / dangerous: escalate to approval; no-UI callers will deny
        return "require_approval";
      }
    }
  }

  /**
   * Compat shim: returns true only if the policy directly allows (no approval needed).
   * require_approval → false (not the same as denied; see Registry).
   */
  isAllowed(
    surface: SurfaceType,
    toolName: string,
    permLevel: ToolPermission,
    trustLevel?: SessionTrustLevel,
    toolKind?: string
  ): boolean {
    return this.decide(surface, toolName, permLevel, trustLevel, toolKind) === "allow";
  }

  /** Whether this call should go to an approval UI rather than be denied outright */
  requiresApproval(
    surface: SurfaceType,
    toolName: string,
    permLevel: ToolPermission,
    trustLevel?: SessionTrustLevel,
    toolKind?: string
  ): boolean {
    return this.decide(surface, toolName, permLevel, trustLevel, toolKind) === "require_approval";
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
 * Shared default instance for createAppContext convenience.
 * Tests and multi-Runtime setups should prefer `new PermissionPolicy()` to avoid
 * parallel test cases interfering via setPolicy().
 */
export const defaultPermissionPolicy = new PermissionPolicy();
