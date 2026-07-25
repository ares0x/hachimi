// packages/shared/src/logger.test.ts
import { describe, expect, it, vi } from "vitest";
import { createScopedLogger, log, setLogFormat, setLogLevel } from "./logger.js";

describe("Shared High-Performance Logger Suite", () => {
  it("filters logs by log level correctly", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setLogLevel("warn");
    log("info", "这条 info 应该被过滤掉");
    expect(infoSpy).not.toHaveBeenCalled();

    log("warn", "这条 warn 应该成功输出");
    expect(warnSpy).toHaveBeenCalled();

    infoSpy.mockRestore();
    warnSpy.mockRestore();
    setLogLevel("info");
  });

  it("creates scoped logger with module prefix", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const tgLogger = createScopedLogger("Telegram");
    tgLogger.info("Bot 上线成功");

    expect(infoSpy).toHaveBeenCalled();
    const loggedText = infoSpy.mock.calls[0][0];
    expect(loggedText).toContain("[Telegram]");

    infoSpy.mockRestore();
  });

  it("supports JSON structured logging output", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setLogFormat("json");
    log("info", "测试 JSON 结构化日志", { userId: 123 });

    expect(infoSpy).toHaveBeenCalled();
    const rawJson = infoSpy.mock.calls[0][0];
    const parsed = JSON.parse(rawJson);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("测试 JSON 结构化日志");
    expect(parsed.extra.userId).toBe(123);

    infoSpy.mockRestore();
    setLogFormat("text");
  });
});
