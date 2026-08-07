import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { PathJail } from "./path-jail.js";

describe("V1.4 Request-Scoped & Work-Scoped PathJail Cross-Project Isolation", () => {
  it("allows access within scopedWorkspaceRoot and rejects outside access", () => {
    const jail = new PathJail({
      workspaceRoot: "/tmp/default_project",
      allowOutsideWorkspace: false,
      allowOutsideRead: false,
    });

    // Work A: /tmp/project_a
    expect(
      jail.assertPathInJail("/tmp/project_a/src/main.ts", "read", false, "/tmp/project_a")
    ).toBe("/tmp/project_a/src/main.ts");

    // Cross-project access: Work A reading /tmp/project_b is rejected
    expect(() =>
      jail.assertPathInJail("/tmp/project_b/secret.key", "read", false, "/tmp/project_a")
    ).toThrow("[沙箱拦截: 路径越界保护]");
  });

  it("ToolRegistry respects options.work.workspaceRoot during sandbox execution", async () => {
    const registry = new ToolRegistry({
      allowOutsideWorkspace: false,
    });

    registry.register({
      name: "write_project_file",
      description: "Write project file",
      permission: "safe",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      execute: async (args) => `Wrote to ${args.path}`,
    });

    // Execution under Work A (root: /tmp/project_a) trying to write to /tmp/project_b
    const result = await registry.execute(
      "write_project_file",
      { path: "/tmp/project_b/hacked.txt" },
      {
        work: {
          id: "work_a",
          title: "Project A",
          uiKind: "project",
          workspaceRoot: "/tmp/project_a",
          status: "active",
          plan: [],
          sessionIds: ["sess_a"],
          kind: "primary",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    expect(result).toContain("[Sandbox Blocked]");
    expect(result).toContain("越界保护");
  });
});
