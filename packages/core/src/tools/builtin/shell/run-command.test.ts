import { afterEach, describe, expect, it } from "vitest";
import { PathJail } from "../../../sandbox/path-jail.js";
import { ToolSandbox } from "../../../sandbox/sandbox.js";
import { runCommandTool } from "./run-command.js";

describe("run_command env scrubbing", () => {
  const originalKeys: string[] = [];

  afterEach(() => {
    for (const key of originalKeys) {
      delete process.env[key];
    }
    originalKeys.length = 0;
  });

  it("does not leak custom credential env vars to the child shell", async () => {
    process.env.MY_CUSTOM_API_KEY = "super-secret-value";
    originalKeys.push("MY_CUSTOM_API_KEY");

    const jail = new PathJail({ workspaceRoot: process.cwd() });
    const res = await runCommandTool.execute(
      { command: 'echo "KEY=$MY_CUSTOM_API_KEY CI=$CI"' },
      {
        jail,
        workspaceRoot: process.cwd(),
        env: ToolSandbox.scrubEnv(process.env),
      }
    );

    expect(res).not.toContain("super-secret-value");
    expect(res).toContain("KEY=");
    expect(res).toContain("CI=true");
  });

  it("keeps benign env vars like PATH and HOME for the child shell", async () => {
    const jail = new PathJail({ workspaceRoot: process.cwd() });
    const res = await runCommandTool.execute(
      { command: 'echo "HOME=$HOME PATH_SET=$PATH"' },
      {
        jail,
        workspaceRoot: process.cwd(),
        env: ToolSandbox.scrubEnv(process.env),
      }
    );

    expect(res).toContain("HOME=");
    expect(res).toContain("PATH_SET=");
  });
});
