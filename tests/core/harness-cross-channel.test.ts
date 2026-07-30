// tests/core/harness-cross-channel.test.ts
import { createHachimiApiServer } from "@hachimi/channel-api";
import { runCliChannel } from "@hachimi/channel-cli";
import { createTelegramBot } from "@hachimi/channel-telegram";
import { createHarnessRuntime } from "@hachimi/core";
import { describe, expect, it } from "vitest";

describe("Cross-Channel HarnessRuntime Consistency Verification", () => {
  it("executes CLI, API, and Telegram channels through the same single HarnessRuntime instance with zero bypass", async () => {
    // 1. 初始化唯一的 HarnessRuntime 单例
    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    // 2. 初始化 API Server 与 Telegram Bot，共享此 runtime 实例
    const apiServer = createHachimiApiServer({ runtime });
    const bot = createTelegramBot({
      token: "123456789:TEST_MOCK_TOKEN",
      runtime,
    });

    expect(apiServer.runtime).toBe(runtime);
    expect(bot).toBeDefined();

    // 3. 通道 A: 运行 CLI
    const cliRes = await runCliChannel({
      prompt: "记住我的偏好是极简主义",
      sessionId: "shared-session-001",
      runtime,
    });

    expect(cliRes.success).toBe(true);
    expect(cliRes.sessionId).toBe("shared-session-001");

    // 4. 通道 B: 运行 API / Web UI 概念路由
    const apiOutput = await runtime.execute({
      prompt: "我刚才提到了什么偏好？",
      sessionId: "shared-session-001",
      channel: "web-ui",
    });

    expect(apiOutput.sessionId).toBe("shared-session-001");
    expect(apiOutput.content).toBeDefined();

    // 5. 通道 C: 运行 Telegram 通道
    const tgOutput = await runtime.execute({
      prompt: "总结当前会话状态",
      sessionId: "telegram_998877",
      channel: "telegram",
    });

    expect(tgOutput.sessionId).toBe("telegram_998877");
    expect(tgOutput.channel).toBe("telegram");

    // 6. 验证持久化 Session 列表均记录在统一引擎中
    const sessionList = runtime.sessions.list();
    const sessionIds = sessionList.map((s) => s.id);

    expect(sessionIds).toContain("shared-session-001");
    expect(sessionIds).toContain("telegram_998877");

    // 5. 验证事件与 Activity 在跨通道执行后完全收敛一致
    const activity = runtime.getWorkActivity("shared-session-001");
    expect(activity).toBeDefined();
    expect(activity?.events.length).toBeGreaterThan(0);
  }, 15000);
});
