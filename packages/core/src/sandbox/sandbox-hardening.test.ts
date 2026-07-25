// packages/core/src/sandbox/sandbox-hardening.test.ts
import { describe, expect, it } from "vitest";
import { PathJail } from "./path-jail.js";
import { ToolSandbox } from "./sandbox.js";

describe("Phase G1 Sandbox Hardening Suite (Env Scrubbing & PathJail)", () => {
  it("G1.1: scrubs sensitive API keys from environment variables", () => {
    const rawEnv = {
      DEEPSEEK_API_KEY: "sk-secret-deepseek",
      OPENAI_API_KEY: "sk-secret-openai",
      TELEGRAM_BOT_TOKEN: "bot-token-123",
      PATH: "/usr/bin:/bin",
      NODE_ENV: "test",
    };

    const clean = ToolSandbox.scrubEnv(rawEnv);

    expect(clean.DEEPSEEK_API_KEY).toBeUndefined();
    expect(clean.OPENAI_API_KEY).toBeUndefined();
    expect(clean.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(clean.PATH).toBe("/usr/bin:/bin");
    expect(clean.NODE_ENV).toBe("test");
  });

  it("G1.2: PathJail allows files inside workspace root and blocks directory traversal attempts", () => {
    const jail = new PathJail({ workspaceRoot: "/workspace/my-app" });

    // 允许合法工作区路径
    const valid = jail.assertPathInJail("./data/output.txt");
    expect(valid).toContain("my-app");

    // 拦截 ../ 目录穿越越界企图
    expect(() => {
      jail.assertPathInJail("../../.ssh/id_rsa");
    }).toThrow("[沙箱拦截: 路径越界保护]");

    // 拦截绝对路径越界企图
    expect(() => {
      jail.assertPathInJail("/etc/passwd");
    }).toThrow("[沙箱拦截: 路径越界保护]");
  });

  it("G1.3: ToolSandbox truncates oversized console buffer", async () => {
    const sandbox = new ToolSandbox({ maxBuffer: 20 });

    const result = await sandbox.executeToolInSandbox("oversized_tool", async () => {
      return "012345678901234567890123456789";
    });

    expect(result).toContain("[沙箱提示] 工具 oversized_tool 输出内容过长");
  });
});
