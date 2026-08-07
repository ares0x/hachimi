// packages/core/src/tools/rule-engine.test.ts
import { describe, expect, it } from "vitest";
import { matchWildcard, PermissionRuleEngine } from "./rule-engine.js";

describe("PermissionRuleEngine (P0-4)", () => {
  it("matches wildcards", () => {
    expect(matchWildcard("fs_*", "fs_write_file")).toBe(true);
    expect(matchWildcard("fs_*", "run_command")).toBe(false);
    expect(matchWildcard("*", "anything")).toBe(true);
    expect(matchWildcard("read_?ile", "read_file")).toBe(true);
  });

  it("evaluates deny > ask > allow > inherit", () => {
    const engine = new PermissionRuleEngine({
      deny: ["delete_file", "fs_*"],
      ask: ["read_file"],
      allow: ["get_current_datetime"],
    });
    expect(engine.evaluate("delete_file")).toBe("deny");
    expect(engine.evaluate("fs_write_file")).toBe("deny");
    expect(engine.evaluate("read_file")).toBe("ask");
    expect(engine.evaluate("get_current_datetime")).toBe("allow");
    expect(engine.evaluate("run_command")).toBe("inherit");
  });

  it("detects dangerous commands", () => {
    const engine = new PermissionRuleEngine();
    expect(engine.isDangerousCommand("rm -rf /tmp/x")).toBe(true);
    expect(engine.isDangerousCommand("sudo apt install x")).toBe(true);
    expect(engine.isDangerousCommand("git push --force origin main")).toBe(true);
    expect(engine.isDangerousCommand("npm run build")).toBe(false);
    expect(engine.isDangerousCommand("git status")).toBe(false);
  });

  it("supports custom dangerousCommands override", () => {
    const engine = new PermissionRuleEngine({ dangerousCommands: ["danger-tool"] });
    expect(engine.isDangerousCommand("danger-tool --force")).toBe(true);
    expect(engine.isDangerousCommand("rm -rf /")).toBe(false); // 自定义列表覆盖默认
  });
});
