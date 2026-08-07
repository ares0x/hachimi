/**
 * P0: Session Recovery Pipeline — 会话恢复流水线
 *
 * 原则：事件流是执行真相源（append-only），会话 JSON 是工作副本（可能被压缩）。
 * 恢复层负责复杂性：
 *   - 会话文件丢失但事件流存在 → 从事件流重建（crash / 文件损坏场景）
 *   - 会话存在但消息为空而事件流有内容 → 重建消息列表
 *   - 其余情况保持原样（compaction 会合法地精简消息）
 */
import { generateId } from "@hachimi/shared";
import type { IEventStore } from "../events/event-store.js";
import type { RuntimeEvent } from "../types/event.js";
import type { Message, Session } from "../types/index.js";
import { classifySessionInterruption, type SessionInterruption } from "./interruption.js";
import type { SessionManager } from "./manager.js";

export type SessionRecoveryStatus = "ok" | "rebuilt" | "missing";

export interface SessionRecoveryReport {
  sessionId: string;
  status: SessionRecoveryStatus;
  issues: string[];
  messageCount: number;
  eventCount: number;
  /** 本次是否从事件流重建了会话 */
  rebuiltFromEvents?: boolean;
  title?: string;
  /** P2-B1: 上次运行的结束方式分类（用于恢复提示/UI 解释） */
  interruption?: SessionInterruption;
}

export interface SessionRecoveryDeps {
  sessions: SessionManager;
  events: IEventStore;
}

/** 将 user_message / assistant_message 事件转换为会话消息（用于重建） */
export function messageFromEvent(ev: RuntimeEvent): Message | null {
  if (ev.type === "user_message") {
    return {
      id: ev.payload.messageId || generateId("msg_"),
      role: "user",
      content: ev.payload.content,
      timestamp: new Date(ev.timestamp).getTime(),
      channel: (ev.payload.channel as Message["channel"]) || undefined,
    };
  }
  if (ev.type === "assistant_message") {
    // P1: 子代理完成通知只用于 UI 投影，不进入会话消息历史（避免回流模型上下文）
    if (ev.payload.kind === "subagent_notification") return null;
    return {
      id: ev.payload.messageId || generateId("msg_"),
      role: "assistant",
      content: ev.payload.content,
      timestamp: new Date(ev.timestamp).getTime(),
      channel: undefined,
    };
  }
  return null;
}

/** 从事件流重建会话对象（保留标题与时间元数据） */
export function rebuildSessionFromEvents(
  sessionId: string,
  events: RuntimeEvent[],
  existing?: Session | null
): Session {
  const messages: Message[] = [];
  let title: string | undefined = existing?.title;
  let createdAt = existing?.createdAt ?? Date.now();

  for (const ev of events) {
    if (ev.type === "session_started") {
      title = title ?? ev.payload.title;
      createdAt = Math.min(createdAt, new Date(ev.timestamp).getTime());
    }
    const msg = messageFromEvent(ev);
    if (msg) messages.push(msg);
  }

  return {
    id: sessionId,
    title: title || `会话 ${new Date(createdAt).toLocaleTimeString()}`,
    messages,
    createdAt,
    updatedAt: Date.now(),
  };
}

/**
 * 恢复指定会话：
 * - 会话文件存在且事件流存在 → ok（compaction 合法精简消息，不强行补齐）
 * - 会话文件缺失但事件流存在 → 重建（rebuilt）
 * - 会话存在但消息为空且事件流有 user/assistant 消息 → 重建消息列表（rebuilt）
 * - 两者都不存在 → missing
 */
export async function recoverSession(
  sessionId: string,
  deps: SessionRecoveryDeps
): Promise<{ session: Session | null; report: SessionRecoveryReport }> {
  const { sessions, events } = deps;
  const issues: string[] = [];

  const existing = sessions.load(sessionId);
  const allEvents = (await events.list(sessionId, { limit: 100000 })).events;
  const eventCount = allEvents.length;
  const convEvents = allEvents.filter(
    (e) => e.type === "user_message" || e.type === "assistant_message"
  );
  const interruption = classifySessionInterruption(allEvents);

  // 会话文件存在
  if (existing) {
    const hasConv = convEvents.length > 0;
    const hasMessages = existing.messages.length > 0;
    if (hasConv && !hasMessages) {
      // 消息列表为空但事件流有对话内容 → 重建
      const rebuilt = rebuildSessionFromEvents(sessionId, allEvents, existing);
      sessions.save(rebuilt);
      return {
        session: rebuilt,
        report: {
          sessionId,
          status: "rebuilt",
          issues: [...issues, "会话消息列表为空，已从事件流重建"],
          messageCount: rebuilt.messages.length,
          eventCount,
          rebuiltFromEvents: true,
          title: rebuilt.title,
          interruption,
        },
      };
    }
    if (!hasConv) {
      issues.push("该会话没有事件流记录（legacy 会话，仅保留消息文件）");
    }
    return {
      session: existing,
      report: {
        sessionId,
        status: "ok",
        issues,
        messageCount: existing.messages.length,
        eventCount,
        title: existing.title,
        interruption,
      },
    };
  }

  // 会话文件缺失
  if (eventCount > 0) {
    const rebuilt = rebuildSessionFromEvents(sessionId, allEvents);
    sessions.save(rebuilt);
    return {
      session: rebuilt,
      report: {
        sessionId,
        status: "rebuilt",
        issues: [...issues, "会话文件缺失，已从事件流重建"],
        messageCount: rebuilt.messages.length,
        eventCount,
        rebuiltFromEvents: true,
        title: rebuilt.title,
        interruption,
      },
    };
  }

  return {
    session: null,
    report: {
      sessionId,
      status: "missing",
      issues: ["会话文件与事件流均不存在"],
      messageCount: 0,
      eventCount: 0,
      interruption,
    },
  };
}
