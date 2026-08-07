// packages/core/src/knowledge/__tests__/distiller.test.ts
/**
 * V1.3: KnowledgeDistiller — 记忆→知识提纯闭环单测
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HachimiConfig } from "@hachimi/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../runtime/context.js";
import type { Message } from "../../types/index.js";
import {
  DEFAULT_DISTILLATION,
  KnowledgeDistiller,
  resolveDistillationConfig,
} from "../distiller.js";

interface FakeSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

function makeFakeContext(dataDir: string, inboxRoot: string) {
  const sessions = new Map<string, FakeSession>();
  const appended: Array<Record<string, unknown>> = [];
  const context = {
    config: {
      llm: { activeConnectionId: "mock", connections: {} },
      paths: { dataDir },
      personalContext: { knowledgeWriteRoot: inboxRoot },
      knowledge: {},
    },
    sessions: {
      list: () =>
        Array.from(sessions.values()).map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
        })),
      load: (id: string) => sessions.get(id) ?? null,
    },
    events: {
      append: async (e: Record<string, unknown>) => {
        appended.push(e);
      },
    },
  } as unknown as AppContext;
  return { context, sessions, appended };
}

function makeMessages(turns: number): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < turns; i++) {
    messages.push({
      id: `u_${i}`,
      role: "user",
      content: `问题 ${i}`,
      timestamp: 1,
    });
    messages.push({
      id: `a_${i}`,
      role: "assistant",
      content: `回答 ${i}：这是一个有实质内容的回复，包含可沉淀的知识点。`,
      timestamp: 1,
    });
  }
  return messages;
}

let tmpDir: string;
let inboxRoot: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-distill-"));
  inboxRoot = join(tmpDir, "knowledge");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const fakeProvider = () => ({
  chat: vi.fn(async () => ({
    content:
      "# 会话提纯草稿\n\n## 摘要\n这次会话完成了核心模块的调研与方案设计。\n\n## 关键决策\n- 采用本地优先存储\n\n## 洞察与结论\n- 事件溯源是真相源\n\n## 后续行动\n- 无\n\n## 相关文件/工具\n- packages/core\n",
  })),
});

describe("V1.3 KnowledgeDistiller", () => {
  it("distills an idle, substantive session into an inbox draft and dedups", async () => {
    const { context, sessions, appended } = makeFakeContext(tmpDir, inboxRoot);
    sessions.set("sess_demo_001", {
      id: "sess_demo_001",
      title: "调研 Hachimi 架构",
      updatedAt: Date.now() - 5 * 3_600_000, // 5 小时前 → 空闲
      messages: makeMessages(8),
    });

    const distiller = new KnowledgeDistiller(
      context,
      { minScanIntervalMs: 0, idleHours: 0, maxDraftsPerScan: 2 },
      () => fakeProvider() as never
    );

    const first = await distiller.maybeDistillIdleSessions();
    expect(first.distilled).toEqual(["sess_demo_001"]);

    const inboxDir = join(inboxRoot, "_inbox");
    const files = readdirSync(inboxDir).filter((f) => f.endsWith(".md"));
    expect(files).toHaveLength(1);
    expect(readFileSync(join(inboxDir, files[0]), "utf-8")).toContain("# 会话提纯草稿");

    // 审计事件
    expect(appended.length).toBe(1);
    expect((appended[0] as any).payload?.kind).toBe("knowledge");

    // 去重：第二次扫描不再生成
    const second = await distiller.maybeDistillIdleSessions();
    expect(second.distilled).toEqual([]);
    expect(readdirSync(inboxDir).filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });

  it("skips sessions with too few user turns", async () => {
    const { context, sessions } = makeFakeContext(tmpDir, inboxRoot);
    sessions.set("sess_short", {
      id: "sess_short",
      title: "简短对话",
      updatedAt: Date.now() - 5 * 3_600_000,
      messages: makeMessages(2), // 2 轮 < 6
    });

    const distiller = new KnowledgeDistiller(
      context,
      { minScanIntervalMs: 0, idleHours: 0, maxDraftsPerScan: 2 },
      () => fakeProvider() as never
    );

    const result = await distiller.maybeDistillIdleSessions();
    expect(result.distilled).toEqual([]);
    expect(existsSync(join(inboxRoot, "_inbox"))).toBe(false);
  });

  it("skips recently active sessions (not yet idle)", async () => {
    const { context, sessions } = makeFakeContext(tmpDir, inboxRoot);
    sessions.set("sess_active", {
      id: "sess_active",
      title: "活跃对话",
      updatedAt: Date.now() - 1_000, // 刚更新 → 不空闲
      messages: makeMessages(8),
    });

    const distiller = new KnowledgeDistiller(
      context,
      { minScanIntervalMs: 0, idleHours: 1, maxDraftsPerScan: 2 },
      () => fakeProvider() as never
    );

    const result = await distiller.maybeDistillIdleSessions();
    expect(result.distilled).toEqual([]);
  });

  it("survives LLM failure gracefully (no draft, no crash)", async () => {
    const { context, sessions } = makeFakeContext(tmpDir, inboxRoot);
    sessions.set("sess_fail", {
      id: "sess_fail",
      title: "失败场景",
      updatedAt: Date.now() - 5 * 3_600_000,
      messages: makeMessages(8),
    });

    const distiller = new KnowledgeDistiller(
      context,
      { minScanIntervalMs: 0, idleHours: 0, maxDraftsPerScan: 2 },
      () =>
        ({
          chat: async () => {
            throw new Error("provider down");
          },
        }) as never
    );

    const result = await distiller.maybeDistillIdleSessions();
    expect(result.distilled).toEqual([]);
    expect(existsSync(join(inboxRoot, "_inbox"))).toBe(false);
  });

  it("no-ops when disabled", async () => {
    const { context, sessions } = makeFakeContext(tmpDir, inboxRoot);
    sessions.set("sess_off", {
      id: "sess_off",
      title: "关闭开关",
      updatedAt: Date.now() - 5 * 3_600_000,
      messages: makeMessages(8),
    });

    const distiller = new KnowledgeDistiller(
      context,
      { enabled: false, minScanIntervalMs: 0, idleHours: 0 },
      () => fakeProvider() as never
    );

    const result = await distiller.maybeDistillIdleSessions();
    expect(result.distilled).toEqual([]);
    expect(existsSync(join(inboxRoot, "_inbox"))).toBe(false);
  });

  it("resolveDistillationConfig merges config + options over defaults", () => {
    const cfg = {
      knowledge: { distillation: { minUserTurns: 10, enabled: true } },
    } as unknown as HachimiConfig;
    const resolved = resolveDistillationConfig(cfg, { idleHours: 5 });
    expect(resolved.minUserTurns).toBe(10);
    expect(resolved.idleHours).toBe(5);
    expect(resolved.maxDraftsPerScan).toBe(DEFAULT_DISTILLATION.maxDraftsPerScan);
  });
});
