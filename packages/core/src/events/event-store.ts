/**
 * W0.2: IEventStore — Append-only 事件存储接口
 *
 * 事件流是执行真相源：只追加，不修改，不删除。
 */
import type { RuntimeEvent, RuntimeEventType } from "../types/event.js";

export interface EventListOptions {
  /** 游标（上次返回的最后一个事件 ID），用于分页 */
  cursor?: string;
  /** 每页最大条数，默认 50 */
  limit?: number;
  /** 按 type 过滤 */
  types?: RuntimeEventType[];
}

export interface EventListResult {
  events: RuntimeEvent[];
  /** 下一页游标（若无更多数据则为 undefined） */
  nextCursor?: string;
  total: number;
}

export interface IEventStore {
  /**
   * 追加一条事件（append-only，幂等写入）
   */
  append(event: RuntimeEvent): Promise<void>;

  /**
   * 分页列出指定 session 的事件
   */
  list(sessionId: string, options?: EventListOptions): Promise<EventListResult>;

  /**
   * 获取最新 N 条事件（tail，用于恢复场景快速读取）
   */
  tail(sessionId: string, n?: number): Promise<RuntimeEvent[]>;

  /**
   * 检查指定 session 是否有历史事件（用于 legacy 判断）
   */
  hasEvents(sessionId: string): Promise<boolean>;

  /**
   * 获取所有包含事件的 sessionId 列表
   */
  listSessionIds(): Promise<string[]>;

  /**
   * 删除指定 session 的事件日志文件/记录
   */
  delete(sessionId: string): Promise<void>;
}
