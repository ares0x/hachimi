// packages/core/src/triggers/scheduler.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateId, log } from "@hachimi/shared";

export interface TriggerTask {
  id: string;
  name: string;
  prompt: string;
  intervalMs?: number;
  cronExpression?: string;
  nextRunAt: number;
  channel?: string;
  enabled: boolean;
  createdAt: number;
}

/**
 * F6: 主动触发器调度器 (ProactiveScheduler)
 * 支持基于定时间隔/Cron 的主动提醒与任务触发，通过 Channel 给用户主动推送消息
 */
export class ProactiveScheduler {
  private filePath: string;
  private tasks: Map<string, TriggerTask> = new Map();
  private timerHandle: NodeJS.Timeout | null = null;
  private checkIntervalMs = 5000;

  constructor(dataDir = "data") {
    this.filePath = resolve(dataDir, "triggers", "scheduler.json");
    this.loadTasks();
  }

  private loadTasks() {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const list = JSON.parse(raw) as TriggerTask[];
      for (const task of list) {
        this.tasks.set(task.id, task);
      }
    } catch {
      /* ignore read error */
    }
  }

  private saveTasks() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const list = Array.from(this.tasks.values());
      writeFileSync(this.filePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      log("error", "保存主动触发器列表失败", err);
    }
  }

  /**
   * 添加主动定时/提醒任务
   */
  addTask(input: {
    name: string;
    prompt: string;
    intervalMs?: number;
    cronExpression?: string;
    channel?: string;
    delayMs?: number;
  }): TriggerTask {
    const delay = input.delayMs || input.intervalMs || 60000;
    const task: TriggerTask = {
      id: generateId("trig_"),
      name: input.name,
      prompt: input.prompt,
      intervalMs: input.intervalMs,
      cronExpression: input.cronExpression,
      nextRunAt: Date.now() + delay,
      channel: input.channel || "telegram",
      enabled: true,
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.saveTasks();

    log(
      "info",
      `⏰ [Trigger Scheduled] '${task.name}' next run at ${new Date(task.nextRunAt).toISOString()}`
    );
    return task;
  }

  listTasks(): TriggerTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => a.nextRunAt - b.nextRunAt);
  }

  removeTask(id: string): boolean {
    const deleted = this.tasks.delete(id);
    if (deleted) {
      this.saveTasks();
    }
    return deleted;
  }

  /**
   * 轮询检查并触发到期任务
   */
  async checkAndFire(onTrigger: (task: TriggerTask) => Promise<void>) {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;

      if (now >= task.nextRunAt) {
        log("info", `🔔 [Proactive Trigger Fired] Task '${task.name}' (Prompt: "${task.prompt}")`);

        try {
          await onTrigger(task);
        } catch (err) {
          log("error", `❌ [Proactive Trigger Error] Task '${task.name}'`, err);
        }

        // 更新下次触发时间
        if (task.intervalMs) {
          task.nextRunAt = Date.now() + task.intervalMs;
        } else {
          task.enabled = false; // 一次性任务触发后禁用
        }
        this.saveTasks();
      }
    }
  }

  /**
   * 启动后台轮询调度循环
   */
  start(onTrigger: (task: TriggerTask) => Promise<void>) {
    if (this.timerHandle) return;

    this.timerHandle = setInterval(async () => {
      await this.checkAndFire(onTrigger);
    }, this.checkIntervalMs);

    log("info", "🚀 [Proactive Scheduler Started] Polling every 5s...");
  }

  stop() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      log("info", "🛑 [Proactive Scheduler Stopped]");
    }
  }
}
