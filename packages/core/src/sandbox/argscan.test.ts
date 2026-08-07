import { describe, expect, it } from "vitest";
import { ToolSandbox } from "./sandbox.js";

const ws = process.cwd();

describe("sandbox arg-scan (path keys only)", () => {
  const sandbox = new ToolSandbox({ workspaceRoot: ws });

  it("no longer false-positives on write_file content starting with an absolute path", async () => {
    const r = await sandbox.executeToolInSandbox("write_file", async () => "ok", {
      args: { path: "a.json", content: "/Users/jace/some/absolute/path\n/etc/hosts" },
      workspaceRoot: ws,
    });
    expect(r).toBe("ok");
  });

  it("still blocks write_file path that escapes the workspace", async () => {
    const r = await sandbox.executeToolInSandbox("write_file", async () => "ok", {
      args: { path: "/Users/other/out.txt", content: "x" },
      workspaceRoot: ws,
    });
    expect(r).toContain("[Sandbox Blocked]");
    expect(r).toContain("路径越界");
  });

  it("blocks shell commands referencing sensitive system paths", async () => {
    const r = await sandbox.executeToolInSandbox("run_command", async () => "ran", {
      args: { command: "cat /etc/hosts" },
      workspaceRoot: ws,
    });
    expect(r).toContain("[Sandbox Blocked]");
    expect(r).toContain("系统敏感目录");
  });

  it("allows shell commands referencing benign home paths (read semantics)", async () => {
    const r = await sandbox.executeToolInSandbox("run_command", async () => "ran", {
      args: { command: "ls ~/Documents" },
      workspaceRoot: ws,
    });
    expect(r).toBe("ran");
  });
});
