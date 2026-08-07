import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getActiveProviderConfig,
  loadConfig,
  resolveContextPromptBudget,
  resolveLlmSelection,
  resolveModelContextWindow,
  saveConfig,
} from "./index.js";

describe("resolveModelContextWindow (P2.9)", () => {
  it("prefers the connection-level override", () => {
    expect(
      resolveModelContextWindow("deepseek-chat", {
        providerType: "deepseek",
        maxContextTokens: 64_000,
      })
    ).toBe(64_000);
  });

  it("matches catalog model ids exactly", () => {
    expect(resolveModelContextWindow("deepseek-chat", { providerType: "deepseek" })).toBe(128_000);
    expect(resolveModelContextWindow("gpt-4o", { providerType: "openai" })).toBe(128_000);
  });

  it("falls back to the provider-level max window for unknown dynamic models", () => {
    // deepseek-v4-flash 不在 catalog — 取 deepseek 提供商 catalog 模型窗口的 max
    expect(resolveModelContextWindow("deepseek-v4-flash", { providerType: "deepseek" })).toBe(
      128_000
    );
  });

  it("falls back to the global default when nothing matches", () => {
    expect(resolveModelContextWindow("some-unknown-model", { providerType: "unknown" })).toBe(
      32_000
    );
    expect(resolveModelContextWindow(undefined, undefined)).toBe(32_000);
  });
});

describe("resolveContextPromptBudget (P2.9)", () => {
  it("respects user budgets inside the [floor, cap] range", () => {
    // 32k 预算 + 128k 窗口 → 原样
    expect(resolveContextPromptBudget(32_000, 128_000)).toBe(32_000);
    expect(resolveContextPromptBudget(64_000, 128_000)).toBe(64_000);
  });

  it("lifts too-small budgets to the assembly floor", () => {
    // 用户 16k 装不下静态区（身份/工具清单/指引）→ 提升到 24k 下限
    expect(resolveContextPromptBudget(16_000, 128_000)).toBe(24_000);
  });

  it("caps budgets at 50% of the model window", () => {
    expect(resolveContextPromptBudget(96_000, 128_000)).toBe(64_000);
  });

  it("keeps small-window models from being forced above their window", () => {
    // 8k 窗口：floor = min(24k, 2.4k) = 2.4k, cap = 4k → 用户 32k 被压到 4k
    expect(resolveContextPromptBudget(32_000, 8_000)).toBe(4_000);
    // 16k 窗口用户预算原样（floor 4.8k < 16k < cap 8k? 不对 → 16k > 8k cap → 8k）
    expect(resolveContextPromptBudget(16_000, 16_000)).toBe(8_000);
  });
});

describe("Provider-isolated HachimiConfig", () => {
  it("isolates provider configurations per provider ID", () => {
    const config = loadConfig("non-existent-config.json");
    config.llm.activeProvider = "deepseek";
    config.llm.providers = {};
    config.llm.providers!.deepseek = {
      apiKey: "sk-deepseek-test",
      model: "deepseek-chat",
    };
    config.llm.providers!.openai = {
      apiKey: "sk-openai-test",
      model: "gpt-4o",
    };

    const active1 = getActiveProviderConfig(config);
    expect(active1.provider).toBe("deepseek");
    expect(active1.config.apiKey).toBe("sk-deepseek-test");

    config.llm.activeProvider = "openai";
    const active2 = getActiveProviderConfig(config);
    expect(active2.provider).toBe("openai");
    expect(active2.config.apiKey).toBe("sk-openai-test");
  });

  it("round-trips mcpServers through saveConfig/loadConfig", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      const cfg = loadConfig(configPath);
      cfg.mcpServers = {
        "my-server": {
          command: "npx",
          args: ["-y", "@some/mcp"],
          url: undefined,
          enabled: true,
          permission: "needs_confirm",
        },
      };
      saveConfig(cfg, configPath);

      const reloaded = loadConfig(configPath);
      expect(reloaded.mcpServers?.["my-server"]?.command).toBe("npx");
      expect(reloaded.mcpServers?.["my-server"]?.args).toEqual(["-y", "@some/mcp"]);
      expect(reloaded.mcpServers?.["my-server"]?.enabled).toBe(true);
      expect(reloaded.mcpServers?.["my-server"]?.permission).toBe("needs_confirm");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips permissionRules through saveConfig/loadConfig", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      const cfg = loadConfig(configPath);
      cfg.permissionRules = {
        deny: ["delete_file"],
        ask: ["read_file"],
        allow: ["get_current_datetime"],
        dangerousCommands: ["danger-tool"],
      };
      saveConfig(cfg, configPath);

      const reloaded = loadConfig(configPath);
      expect(reloaded.permissionRules?.deny).toEqual(["delete_file"]);
      expect(reloaded.permissionRules?.ask).toEqual(["read_file"]);
      expect(reloaded.permissionRules?.allow).toEqual(["get_current_datetime"]);
      expect(reloaded.permissionRules?.dangerousCommands).toEqual(["danger-tool"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips connection serverWebSearch through saveConfig/loadConfig", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      const cfg = loadConfig(configPath);
      cfg.llm.connections = {
        deepseek: {
          id: "deepseek",
          name: "DeepSeek",
          providerType: "deepseek",
          enabled: true,
          defaultModelId: "deepseek-v4-flash",
          models: ["deepseek-v4-flash"],
          enabledModels: ["deepseek-v4-flash"],
          serverWebSearch: true,
        },
      };
      saveConfig(cfg, configPath);

      const reloaded = loadConfig(configPath);
      expect(reloaded.llm.connections?.deepseek?.serverWebSearch).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveLlmSelection ACP readiness", () => {
  it("treats an ACP connection with a command as ready without an API key", () => {
    const config = loadConfig("non-existent-config.json");
    config.llm.activeConnectionId = undefined;
    config.llm.activeProvider = undefined;
    config.llm.connections = {
      acp: {
        id: "acp",
        name: "ACP Agent",
        providerType: "acp",
        enabled: true,
        command: "codex",
        commandArgs: ["exec"],
        cwd: "/tmp",
        defaultModelId: "external-agent",
        models: ["external-agent"],
        enabledModels: ["external-agent"],
      },
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        providerType: "deepseek",
        enabled: true,
        defaultModelId: "deepseek-chat",
        models: ["deepseek-chat"],
        enabledModels: ["deepseek-chat"],
      },
    };

    const selection = resolveLlmSelection(config);

    expect(selection.providerType).toBe("acp");
    expect(selection.connectionId).toBe("acp");
    expect(selection.connection?.command).toBe("codex");
  });

  it("does not treat an ACP connection without a command as ready", () => {
    const config = loadConfig("non-existent-config.json");
    config.llm.connections = {
      acp: {
        id: "acp",
        name: "ACP Agent",
        providerType: "acp",
        enabled: true,
        defaultModelId: "external-agent",
        models: ["external-agent"],
        enabledModels: ["external-agent"],
      },
    };
    config.llm.activeConnectionId = undefined;
    config.llm.activeProvider = undefined;

    const selection = resolveLlmSelection(config);
    expect(selection.connectionId).not.toBe("acp");
  });
});
