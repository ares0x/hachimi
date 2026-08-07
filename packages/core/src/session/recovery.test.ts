// packages/core/src/session/recovery.test.ts
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateId } from "@hachimi/shared";
import { FileDirStore } from "@hachimi/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileEventStore } from "../events/file-event-store.js";
import type { RuntimeEvent } from "../types/event.js";
import { SessionManager } from "./manager.js";
import { messageFromEvent, rebuildSessionFromEvents, recoverSession } from "./recovery.js";

const dir = join(process.cwd(), "data-test-recovery");

function makeDeps() {
  const sessions = new SessionManager(join(dir, "sessions"), new FileDirStore());
  const events = new FileEventStore(dir);
  return { sessions, events };
}

function ev(
  sessionId: string,
  type: "session_started" | "user_message" | "assistant_message",
  content?: string,
  messageId?: string
): RuntimeEvent {
  const base = {
    id: generateId("evt_"),
    sessionId,
    timestamp: new Date(Date.now() + Math.random() * 1000).toISOString(),
  };
  if (type === "session_started") {
    return { ...base, type, payload: { title: "恢复测试" } } as RuntimeEvent;
  }
  if (type === "user_message") {
    return {
      ...base,
      type,
      payload: { content: content ?? "你好", channel: "cli", messageId },
    } as RuntimeEvent;
  }
  return { ...base, type, payload: { content: content ?? "回复", messageId } } as RuntimeEvent;
}

describe("Session Recovery Pipeline (P0)", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("rebuilds a session from events when the session file is missing", async () => {
    const deps = makeDeps();
    const sid = generateId("sess_");
    await deps.events.append(ev(sid, "session_started"));
    await deps.events.append(ev(sid, "user_message", "第一个问题", "msg_1"));
    await deps.events.append(ev(sid, "assistant_message", "第一个回答", "msg_2"));
    await deps.events.append(ev(sid, "user_message", "继续", "msg_3"));

    // 会话文件不存在（crash 场景）
    expect(deps.sessions.load(sid)).toBeNull();

    const { session, report } = await recoverSession(sid, deps);
    expect(report.status).toBe("rebuilt");
    expect(report.rebuiltFromEvents).toBe(true);
    expect(report.eventCount).toBe(4);
    expect(report.messageCount).toBe(3);
    expect(session).not.toBeNull();
    expect(session!.title).toBe("恢复测试");
    expect(session!.messages.map((m) => m.content)).toEqual(["第一个问题", "第一个回答", "继续"]);
    expect(session!.messages[0].role).toBe("user");
    expect(session!.messages[1].role).toBe("assistant");

    // 重建后已持久化
    expect(deps.sessions.load(sid)).not.toBeNull();
  });

  it("keeps an existing session with messages untouched (ok)", async () => {
    const deps = makeDeps();
    const sid = generateId("sess_");
    const session = deps.sessions.create("既有会话", sid);
    session.messages.push({
      id: generateId("msg_"),
      role: "user",
      content: "历史消息",
      timestamp: Date.now(),
    });
    deps.sessions.save(session);

    await deps.events.append(ev(sid, "user_message", "历史消息", "msg_1"));

    const { report } = await recoverSession(sid, deps);
    expect(report.status).toBe("ok");
    expect(report.messageCount).toBe(1);
  });

  it("rebuilds messages when the session exists but messages are empty while events have conversation", async () => {
    const deps = makeDeps();
    const sid = generateId("sess_");
    const session = deps.sessions.create("空消息会话", sid);
    deps.sessions.save(session);

    await deps.events.append(ev(sid, "user_message", "只有事件有内容", "msg_1"));

    const { report, session: recovered } = await recoverSession(sid, deps);
    expect(report.status).toBe("rebuilt");
    expect(recovered!.messages[0].content).toBe("只有事件有内容");
  });

  it("reports missing when neither session file nor events exist", async () => {
    const deps = makeDeps();
    const { session, report } = await recoverSession(generateId("sess_"), deps);
    expect(session).toBeNull();
    expect(report.status).toBe("missing");
  });

  it("messageFromEvent maps user/assistant events and skips tool events", () => {
    const sid = generateId("sess_");
    const user = messageFromEvent(ev(sid, "user_message", "内容", "m1"));
    expect(user?.role).toBe("user");
    expect(user?.content).toBe("内容");
    expect(user?.id).toBe("m1");

    const asst = messageFromEvent(ev(sid, "assistant_message", "回答"));
    expect(asst?.role).toBe("assistant");

    // P1: 子代理完成通知不进入会话消息历史（仅 UI 投影为系统行）
    const notif = messageFromEvent({
      ...ev(sid, "assistant_message", "通知"),
      payload: {
        content: "[子 Agent 完成通知] TaskId: task_sub_1\n状态：completed",
        kind: "subagent_notification",
        subSessionId: "sub_sess_1",
      },
    } as RuntimeEvent);
    expect(notif).toBeNull();

    const tool = { ...ev(sid, "user_message"), type: "tool_call" as const };
    expect(
      messageFromEvent({
        ...tool,
        payload: { toolCallId: "c1", toolName: "x", args: {} },
      } as RuntimeEvent)
    ).toBeNull();
  });

  it("rebuildSessionFromEvents keeps existing title when session_started has none", () => {
    const sid = generateId("sess_");
    const events: RuntimeEvent[] = [
      { ...ev(sid, "user_message", "hi"), timestamp: new Date().toISOString() },
    ];
    const rebuilt = rebuildSessionFromEvents(sid, events, {
      id: sid,
      title: "原标题",
      messages: [],
      createdAt: 123,
      updatedAt: 123,
    });
    expect(rebuilt.title).toBe("原标题");
    expect(rebuilt.messages.length).toBe(1);
  });
});

// ─── HarnessRuntime.execute 自动修复集成 ──────────────────────────────────────

describe("HarnessRuntime execute auto-repair", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("rebuilds a session from its event stream when the session file is lost", async () => {
    const { createHarnessRuntime } = await import("../runtime/harness-runtime.js");
    const dataDir = join(dir, "runtime");
    const runtime = createHarnessRuntime({
      providerOverride: "mock",
      configOverride: {
        paths: {
          dataDir,
          memoryFile: join(dataDir, "memory.json"),
          sessionsDir: join(dataDir, "sessions"),
        },
      } as never,
    });
    const sid = generateId("sess_");

    // 第一轮：创建会话 + 事件流
    await runtime.execute({ prompt: "第一轮", sessionId: sid, channel: "cli" });

    // 模拟崩溃：会话文件丢失，但事件流仍在
    runtime.sessions.delete(sid);
    expect(await runtime.events.hasEvents(sid)).toBe(true);

    // 第二轮：execute 应自动从事件流重建会话再继续
    const out = await runtime.execute({ prompt: "第二轮", sessionId: sid, channel: "cli" });
    expect(out.sessionId).toBe(sid);

    const recovered = runtime.sessions.load(sid);
    expect(recovered).not.toBeNull();
    expect(recovered!.messages.some((m) => m.content === "第一轮")).toBe(true);
    expect(recovered!.messages.some((m) => m.content === "第二轮")).toBe(true);

    // 恢复报告接口可用
    const report = await runtime.recoverSession(sid);
    expect(report.sessionId).toBe(sid);
    expect(["ok", "rebuilt"]).toContain(report.status);
  });
});
