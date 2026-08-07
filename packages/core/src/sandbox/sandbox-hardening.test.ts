// packages/core/src/sandbox/sandbox-hardening.test.ts
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("G1.1b: scrubs pattern-matched credential keys (custom names) and keeps benign vars", () => {
    const rawEnv = {
      MYAPP_API_KEY: "sk-custom-secret",
      GITHUB_TOKEN: "ghp_xxx",
      DB_PASSWORD: "hunter2",
      PRIVATE_KEY: "-----BEGIN RSA-----",
      HOME: "/Users/test",
      PATH: "/usr/local/bin:/usr/bin",
      CI: "true",
      GIT_TERMINAL_PROMPT: "0",
    };

    const clean = ToolSandbox.scrubEnv(rawEnv);

    expect(clean.MYAPP_API_KEY).toBeUndefined();
    expect(clean.GITHUB_TOKEN).toBeUndefined();
    expect(clean.DB_PASSWORD).toBeUndefined();
    expect(clean.PRIVATE_KEY).toBeUndefined();
    expect(clean.HOME).toBe("/Users/test");
    expect(clean.PATH).toBe("/usr/local/bin:/usr/bin");
    expect(clean.CI).toBe("true");
    expect(clean.GIT_TERMINAL_PROMPT).toBe("0");
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

    // 允许非敏感外部路径的只读操作 (read_file / list_dir)
    const extRead = jail.assertPathInJail("/Users/jace/workspace/other-repo/src", "list_dir", true);
    expect(extRead).toBe("/Users/jace/workspace/other-repo/src");

    // 拒绝非敏感外部路径的写/删操作 (write_file / delete_file)
    expect(() => {
      jail.assertPathInJail("/Users/jace/workspace/other-repo/src", "write_file", false);
    }).toThrow("[沙箱拦截: 路径越界保护]");
  });

  it("G1.2b: PathJail blocks symlink escapes out of the workspace (realpath check)", () => {
    const ws = mkdtempSync(join(tmpdir(), "hachimi-jail-"));
    const outside = mkdtempSync(join(tmpdir(), "hachimi-outside-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "top-secret");
      symlinkSync(outside, join(ws, "evil-link"));

      const jail = new PathJail({ workspaceRoot: ws });

      // 词法上在工作区内，但真实路径逃逸到工作区外 → 必须拦截（即使只读）
      expect(() => {
        jail.assertPathInJail("evil-link/secret.txt", "read_file", true);
      }).toThrow("[沙箱拦截: 路径越界保护]");

      // 正常工作区内文件不受影响
      const ok = jail.assertPathInJail("normal/file.txt", "write_file", false);
      expect(ok).toContain("normal/file.txt");
    } finally {
      rmSync(ws, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("G1.2c: PathJail blocks symlinks pointing at system-sensitive paths", () => {
    const ws = mkdtempSync(join(tmpdir(), "hachimi-jail2-"));
    try {
      symlinkSync("/etc", join(ws, "etc-link"));
      const jail = new PathJail({ workspaceRoot: ws });

      expect(() => {
        jail.assertPathInJail("etc-link/hosts", "read_file", true);
      }).toThrow("[沙箱拦截: 路径越界保护]");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("G1.3: ToolSandbox truncates oversized console buffer", async () => {
    const sandbox = new ToolSandbox({ maxBuffer: 20 });

    const result = await sandbox.executeToolInSandbox("oversized_tool", async () => {
      return "012345678901234567890123456789";
    });

    expect(result).toMatch(/\[(沙箱提示|Sandbox Info)\]/);
  });

  it("G1.4: ToolSandbox allows read_file / list_dir on external non-sensitive paths", async () => {
    const sandbox = new ToolSandbox({ workspaceRoot: "/workspace/my-app" });

    const result = await sandbox.executeToolInSandbox("list_dir", async () => "dir_contents", {
      args: { path: "/Users/jace/workspace/other-repo" },
    });

    expect(result).toBe("dir_contents");
  });
});
