/**
 * W0.6 — FileEventStore 单测套件
 *
 * 测试项:
 * 1. append 顺序保证
 * 2. 多 session 隔离（A 的事件不混入 B）
 * 3. cursor 分页正确性
 * 4. tail() 返回最后 N 条
 * 5. hasEvents() 判断
 * 6. type 过滤
 * 7. listSessionIds() 列举
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssistantMessageEvent, RuntimeEvent, UserMessageEvent } from "../../types/event.js";
import { FileEventStore } from "../file-event-store.js";

function makeUserEvent(sessionId: string, content: string): UserMessageEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    sessionId,
    type: "user_message",
    timestamp: new Date().toISOString(),
    payload: { content },
  };
}

function makeAssistantEvent(sessionId: string, content: string): AssistantMessageEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    sessionId,
    type: "assistant_message",
    timestamp: new Date().toISOString(),
    payload: { content, durationMs: 100 },
  };
}

let tmpDir: string;
let store: FileEventStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-event-test-"));
  store = new FileEventStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("FileEventStore", () => {
  it("顺序写入后读出顺序一致", async () => {
    const sid = "sess_test_order";
    const events: RuntimeEvent[] = [
      makeUserEvent(sid, "hello"),
      makeAssistantEvent(sid, "world"),
      makeUserEvent(sid, "foo"),
    ];

    for (const e of events) {
      await store.append(e);
    }

    const result = await store.list(sid, { limit: 10 });
    expect(result.events).toHaveLength(3);
    expect(result.events[0].payload).toEqual(events[0].payload);
    expect(result.events[1].payload).toEqual(events[1].payload);
    expect(result.events[2].payload).toEqual(events[2].payload);
  });

  it("多 session 完全隔离：A 的事件不混入 B", async () => {
    const sidA = "sess_A";
    const sidB = "sess_B";

    await store.append(makeUserEvent(sidA, "from A"));
    await store.append(makeUserEvent(sidA, "from A again"));
    await store.append(makeUserEvent(sidB, "from B"));

    const resultA = await store.list(sidA, { limit: 10 });
    const resultB = await store.list(sidB, { limit: 10 });

    expect(resultA.events).toHaveLength(2);
    expect(resultB.events).toHaveLength(1);
    expect(resultA.events.every((e) => e.sessionId === sidA)).toBe(true);
    expect(resultB.events.every((e) => e.sessionId === sidB)).toBe(true);
  });

  it("cursor 分页：可以正确翻页", async () => {
    const sid = "sess_page";
    for (let i = 0; i < 5; i++) {
      await store.append(makeUserEvent(sid, `msg ${i}`));
    }

    // 第一页：2 条
    const page1 = await store.list(sid, { limit: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.nextCursor).toBeDefined();

    // 第二页：从 cursor 继续
    const page2 = await store.list(sid, { limit: 2, cursor: page1.nextCursor });
    expect(page2.events).toHaveLength(2);
    expect(page2.nextCursor).toBeDefined();

    // 第三页：最后一条
    const page3 = await store.list(sid, { limit: 2, cursor: page2.nextCursor });
    expect(page3.events).toHaveLength(1);
    expect(page3.nextCursor).toBeUndefined();
  });

  it("tail() 返回最后 N 条", async () => {
    const sid = "sess_tail";
    for (let i = 0; i < 6; i++) {
      await store.append(makeUserEvent(sid, `msg ${i}`));
    }

    const last3 = await store.tail(sid, 3);
    expect(last3).toHaveLength(3);
    expect((last3[0].payload as any).content).toBe("msg 3");
    expect((last3[2].payload as any).content).toBe("msg 5");
  });

  it("hasEvents() 无事件时返回 false", async () => {
    expect(await store.hasEvents("nonexistent_session")).toBe(false);
  });

  it("hasEvents() 有事件时返回 true", async () => {
    const sid = "sess_has";
    await store.append(makeUserEvent(sid, "hello"));
    expect(await store.hasEvents(sid)).toBe(true);
  });

  it("按 type 过滤", async () => {
    const sid = "sess_filter";
    await store.append(makeUserEvent(sid, "q"));
    await store.append(makeAssistantEvent(sid, "a"));
    await store.append(makeUserEvent(sid, "q2"));

    const userOnly = await store.list(sid, { types: ["user_message"] });
    expect(userOnly.events).toHaveLength(2);
    expect(userOnly.events.every((e) => e.type === "user_message")).toBe(true);

    const assistantOnly = await store.list(sid, { types: ["assistant_message"] });
    expect(assistantOnly.events).toHaveLength(1);
  });

  it("listSessionIds() 列出所有有事件的 session", async () => {
    await store.append(makeUserEvent("sess_x", "hi"));
    await store.append(makeUserEvent("sess_y", "hello"));

    const ids = await store.listSessionIds();
    expect(ids).toContain("sess_x");
    expect(ids).toContain("sess_y");
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it("空 session 返回空列表，total=0", async () => {
    const result = await store.list("sess_empty_xyz");
    expect(result.events).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.nextCursor).toBeUndefined();
  });
});
