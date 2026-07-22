import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { generateId } from "@hachimi/shared";
import type { Session, Message } from "../types/index.js";
import type { JsonDirStore } from "@hachimi/storage";
import { FileDirStore } from "@hachimi/storage";

export class SessionManager {
    private dir: string;
    private store: JsonDirStore;
  private current: Session | null = null;

  constructor(dir = "data/sessions", store: JsonDirStore = new FileDirStore()) {
      this.dir = dir;
          this.store = store;
          this.store.ensureDir(dir);
  }


  private fileOf(id: string) {
      return join(this.dir, `${id}.json`);
    }

    save(session?: Session) {
      const target = session || this.current;
      if (!target) return;
      target.updatedAt = Date.now();
      this.store.write(this.fileOf(target.id), target);
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
      const data = this.store.read<Session>(this.fileOf(id));
      if (!data) return null;
      this.current = data;
      return data;
    }

    list() {
      return this.store
        .list(this.dir)
        .map((name) => this.store.read<Session>(join(this.dir, name)))
        .filter((s): s is Session => !!s)
        .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
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

  getCurrent(): Session | null {
    return this.current;
  }
}
