import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { generateId } from "@hachimi/shared";
import type { Session, Message } from "../types/index.js";

export class SessionManager {
  private dir: string;
  private current: Session | null = null;

  constructor(dir = "data/sessions") {
    this.dir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** 创建新会话 */
  create(title?: string): Session {
    const session: Session = {
      id: generateId("sess_"),
      title: title || `会话 ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.current = session;
    this.save(session);
    return session;
  }

  /** 获取当前会话，没有则创建 */
  getOrCreate(): Session {
    if (this.current) return this.current;
    return this.create();
  }

  /** 加载指定会话 */
  load(id: string): Session | null {
    const file = join(this.dir, `${id}.json`);
    if (!existsSync(file)) return null;

    const data = JSON.parse(readFileSync(file, "utf-8"));
    this.current = data;
    return data;
  }

  /** 保存会话 */
  save(session?: Session) {
    const target = session || this.current;
    if (!target) return;

    target.updatedAt = Date.now();
    const file = join(this.dir, `${target.id}.json`);
    writeFileSync(file, JSON.stringify(target, null, 2), "utf-8");
  }

  /** 追加消息并保存 */
  appendMessage(message: Message) {
    const session = this.getOrCreate();
    session.messages.push(message);
    this.save(session);
  }

  /** 获取当前会话的消息历史 */
  getHistory(): Message[] {
    return this.current?.messages ?? [];
  }

  /** 列出所有会话（简单版） */
  list(): Array<{ id: string; title?: string; updatedAt: number }> {
    try {
      if (!existsSync(this.dir)) return [];

      return readdirSync(this.dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          try {
            const data = JSON.parse(readFileSync(join(this.dir, f), "utf-8"));
            return {
              id: data.id,
              title: data.title,
              updatedAt: data.updatedAt,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => (b!.updatedAt - a!.updatedAt)) as Array<{
          id: string;
          title?: string;
          updatedAt: number;
        }>;
    } catch (err) {
      console.error("[Session] list 失败:", err);
      return [];
    }
  }

  getCurrent(): Session | null {
    return this.current;
  }
}
