// packages/core/src/tools/w5-5-harness-patches.test.ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { PathJail } from "../sandbox/path-jail.js";
import { readFileTool } from "./builtin/fs/read-file.js";
import { ToolRegistry } from "./registry.js";
import { PermissionPolicy } from "./policy.js";
import type { ToolExecContext } from "./types.js";

describe("Phase W5.5 — Harness Correctness Pre-Patches Suite", () => {
  const testDir = join(__dirname, "../../../data-test-w5-5");
  const jail = new PathJail({ workspaceRoot: testDir });
  const execContext: ToolExecContext = {
    jail,
    workspaceRoot: testDir,
  };

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("W5.5.1: read_file binary check reads 8KB head without reading entire large file into memory", async () => {
    // 建立 10MB 的测试二进制文件（首字节为 0）
    const largeBinaryPath = join(testDir, "large_binary.bin");
    const buf = Buffer.alloc(10 * 1024 * 1024);
    buf[0] = 0; // null byte -> binary
    buf.fill(0x65, 1);
    writeFileSync(largeBinaryPath, buf);

    const memBefore = process.memoryUsage().heapUsed;
    const res = await readFileTool.execute(
      { path: "large_binary.bin" },
      execContext,
    );
    const memAfter = process.memoryUsage().heapUsed;

    expect(res).toContain("[二进制文件]");
    // 内存增长远小于 10MB
    expect(memAfter - memBefore).toBeLessThan(5 * 1024 * 1024);

    // 建立大型纯文本文件 (5MB)
    const largeTextPath = join(testDir, "large_text.txt");
    const textLines = Array.from({ length: 50000 }, (_, i) => `line ${i + 1}: Hello Hachimi`).join("\n");
    writeFileSync(largeTextPath, textLines);

    const textRes = await readFileTool.execute(
      { path: "large_text.txt", offset: 1, limit: 10 },
      execContext,
    );
    expect(textRes).toContain("path: large_text.txt");
    expect(textRes).toContain("line 1: Hello Hachimi");
  });

  it("W5.5.2 & W5.5.3: double-checking contract consistency for headless require_approval tools", async () => {
    const registry = new ToolRegistry();
    const policy = new PermissionPolicy(); // default: api -> allow-safe

    registry.register({
      name: "risky_op",
      description: "高风险操作",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "executed";
      },
    });

    // 1) 第一层 Agent.run() / Policy 判定：
    const firstLayerDecision = policy.decide("api", "risky_op", "needs_confirm");
    expect(firstLayerDecision).toBe("require_approval");

    // 2) 第二层 ToolRegistry.execute() 判定（未授权场景）：
    const unapprovedRes = await registry.execute("risky_op", {}, { channel: "api" });
    expect(unapprovedRes).toContain("需要确认才能执行工具");

    // 3) 第二层 ToolRegistry.execute() 判定（已授权 confirm: true 场景）：
    const approvedRes = await registry.execute("risky_op", {}, { channel: "api", confirm: true });
    expect(approvedRes).toBe("executed");

    // 验证两层判决逻辑 100% 规则一致
  });

  it("W5.5.4: '请记住' natural language shortcut calls save_memory tool and writes RuntimeEvents", async () => {
    const runtime = createHarnessRuntime({
      configOverride: {
        llm: {
          activeProvider: "mock",
          providers: { mock: { apiKey: "mock-key", model: "mock" } },
        },
        paths: {
          dataDir: testDir,
          memoryFile: join(testDir, "memories.json"),
          sessionsDir: join(testDir, "sessions"),
        },
      },
    });

    const output = await runtime.execute({
      prompt: "请记住我喜欢使用 TypeScript 开发 Agent 项目",
      channel: "api",
    });

    expect(output.content).toContain("我已经记住了");

    // 验证事件流中留有 save_memory 工具的 tool_call / tool_result 记录
    const eventsResult = await runtime.events.list(output.sessionId);
    const toolCallEvt = eventsResult.events.find(
      (e) => e.type === "tool_call" && (e.payload as any).toolName === "save_memory",
    );
    const toolResultEvt = eventsResult.events.find(
      (e) => e.type === "tool_result" && (e.payload as any).toolName === "save_memory",
    );

    expect(toolCallEvt).toBeDefined();
    expect(toolResultEvt).toBeDefined();
    expect((toolCallEvt?.payload as any).args.content).toBe("我喜欢使用 TypeScript 开发 Agent 项目");
  });
});
