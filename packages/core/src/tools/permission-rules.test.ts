// packages/core/src/tools/permission-rules.test.ts
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerBuiltinTools } from "./builtin/index.js";
import { GrantStore } from "./grant-store.js";
import { ToolRegistry } from "./registry.js";
import { PermissionRuleEngine } from "./rule-engine.js";

const dir = join(process.cwd(), "data-test-permrules");

function makeRegistry(rules?: Parameters<typeof PermissionRuleEngine.prototype.update>[0]) {
  const registry = new ToolRegistry({
    workspaceRoot: dir,
    grantStore: new GrantStore(join(dir, "grants.json")),
    ruleEngine: new PermissionRuleEngine(rules),
  });
  registerBuiltinTools(registry);
  return registry;
}

describe("Permission rules + remembered grants integration (P0-4)", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("deny rule blocks a tool even with confirm", async () => {
    const registry = makeRegistry({ deny: ["delete_file"] });
    const res = await registry.execute(
      "delete_file",
      { path: join(dir, "x.txt") },
      { confirm: true, workspaceRoot: dir }
    );
    expect(res).toContain("permissionRules.deny");
  });

  it("ask rule forces approval for a safe read-only tool", async () => {
    const registry = makeRegistry({ ask: ["get_current_datetime"] });
    let prompted = false;
    const res = await registry.execute(
      "get_current_datetime",
      {},
      {
        workspaceRoot: dir,
        onToolApproval: async () => {
          prompted = true;
          return true;
        },
      }
    );
    expect(prompted).toBe(true);
    expect(res).toContain("当前本地时间");
  });

  it("allow rule auto-approves a needs_confirm tool", async () => {
    const registry = makeRegistry({ allow: ["run_command"] });
    const res = await registry.execute(
      "run_command",
      { command: "echo allowed-by-rule" },
      { workspaceRoot: dir }
    );
    expect(res).toContain("allowed-by-rule");
  });

  it("remembers approved command per workspace and auto-approves next time", async () => {
    const registry = makeRegistry();
    const approve = async () => true;

    // 第一次：需要审批，批准后记录 grant
    const first = await registry.execute(
      "run_command",
      { command: "echo hello" },
      { workspaceRoot: dir, onToolApproval: approve }
    );
    expect(first).toContain("hello");
    expect(registry.getGrantStore()!.list(dir).length).toBe(1);

    // 第二次：同项目同前缀自动放行（不再触发审批）
    let prompted = false;
    const second = await registry.execute(
      "run_command",
      { command: "echo hello again" },
      {
        workspaceRoot: dir,
        onToolApproval: async () => {
          prompted = true;
          return true;
        },
      }
    );
    expect(second).toContain("hello again");
    expect(prompted).toBe(false);

    // 不同项目：仍然需要审批
    let promptedB = false;
    const otherProj = join(dir, "other");
    await registry.execute(
      "run_command",
      { command: "echo other" },
      {
        workspaceRoot: otherProj,
        onToolApproval: async () => {
          promptedB = true;
          return true;
        },
      }
    );
    expect(promptedB).toBe(true);
  });

  it("does not remember dangerous commands even when approved", async () => {
    const registry = makeRegistry();
    await registry.execute(
      "run_command",
      { command: "rm -rf /tmp/danger-test" },
      { workspaceRoot: dir, onToolApproval: async () => true }
    );
    expect(registry.getGrantStore()!.list(dir).length).toBe(0);
  });
});
