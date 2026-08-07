// packages/core/src/tasks/background-task-manager.ts
// P0-3: Background Task Manager — 后台命令任务（Grok Build background tasks 模式）
//
// 设计：
//   - startCommand() 立即返回 taskId，命令在后台运行（不阻塞 Agent 循环）
//   - 输出按上限截断（首部保留），避免无限增长
//   - getOutput(taskId, timeoutMs) / wait(taskIds, mode) / kill(taskId) 供工具使用
//   - 环境变量默认经过 ToolSandbox.scrubEnv 脱敏
import { spawn } from "node:child_process";
import { generateId } from "@hachimi/shared";
import { ToolSandbox } from "../sandbox/sandbox.js";
import type { TaskRegistry, TaskStateBase, TaskStatus } from "./task-registry.js";

export type BackgroundTaskStatus = Extract<
  TaskStatus,
  "running" | "completed" | "failed" | "killed"
>;

export interface BackgroundTask extends TaskStateBase {
  taskId: string;
  taskKind: "background";
  status: BackgroundTaskStatus;
  startedAt: number;
  completedAt?: number;
  exitCode?: number | null;
  /** 合并后的命令输出（stdout + stderr，含截断标记） */
  output: string;
  label?: string;
  /** 进程 PID（kill 用） */
  pid?: number;
}

/** L1 (B10): 后台任务状态事件 — daemon 可转发为桌面通知 / SSE */
export interface BackgroundTaskEvent {
  taskId: string;
  status: BackgroundTaskStatus;
  label?: string;
  exitCode?: number | null;
  startedAt: number;
  completedAt?: number;
}

export type BackgroundTaskListener = (event: BackgroundTaskEvent) => void;

export interface BackgroundTaskManagerOptions {
  /** 单任务输出上限（字节），超出后丢弃最早部分 */
  maxBufferBytes?: number;
  /** 默认等待超时（ms） */
  defaultWaitTimeoutMs?: number;
  /** P1.7: 统一任务注册表（UI/Activity 聚合查询路径） */
  registry?: TaskRegistry;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class BackgroundTaskManager {
  private tasks = new Map<string, BackgroundTask>();
  private completions = new Map<string, Promise<void>>();
  private listeners = new Set<BackgroundTaskListener>();
  private maxBufferBytes: number;
  private defaultWaitTimeoutMs: number;
  private registry?: TaskRegistry;

  constructor(options: BackgroundTaskManagerOptions = {}) {
    this.maxBufferBytes = options.maxBufferBytes ?? 1_000_000;
    this.defaultWaitTimeoutMs = options.defaultWaitTimeoutMs ?? 30_000;
    this.registry = options.registry;
  }

  /** 订阅后台任务状态变化；返回取消订阅函数 */
  onTaskEvent(listener: BackgroundTaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: BackgroundTaskEvent): void {
    for (const l of this.listeners) {
      queueMicrotask(() => l(event));
    }
  }

  /** 启动后台命令，立即返回任务 */
  startCommand(
    command: string,
    opts: { cwd?: string; env?: Record<string, string>; label?: string } = {}
  ): BackgroundTask {
    const taskId = generateId("bg_");
    const task: BackgroundTask = {
      taskId,
      taskKind: "background",
      status: "running",
      startedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      output: "",
      label: opts.label ?? command.slice(0, 80),
    };
    this.tasks.set(taskId, task);
    this.registry?.registerTask(task);
    this.emit({
      taskId,
      status: "running",
      label: task.label,
      startedAt: task.startedAt,
    });

    let resolveCompletion: (value: void | PromiseLike<void>) => void = () => {};
    this.completions.set(taskId, new Promise<void>((r) => (resolveCompletion = r)));

    const child = spawn("/bin/sh", ["-c", command], {
      cwd: opts.cwd ?? process.cwd(),
      env: {
        ...(opts.env ?? ToolSandbox.scrubEnv(process.env)),
        CI: "true",
        NONINTERACTIVE: "1",
        DEBIAN_FRONTEND: "noninteractive",
        PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    task.pid = child.pid;

    const appendCapped = (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (task.output.length + text.length <= this.maxBufferBytes) {
        task.output += text;
      } else {
        const room = this.maxBufferBytes - task.output.length;
        task.output += room > 0 ? text.slice(0, room) : "";
        task.output += `\n...[后台任务输出已截断 max_bytes≈${this.maxBufferBytes}]`;
      }
    };

    child.stdout?.on("data", appendCapped);
    child.stderr?.on("data", appendCapped);

    child.on("close", (code, signal) => {
      task.exitCode = code;
      task.completedAt = Date.now();
      task.status =
        code === 0
          ? "completed"
          : signal === "SIGTERM" || signal === "SIGKILL"
            ? "killed"
            : "failed";
      if (task.status === "failed") {
        task.output += `\n[后台命令退出 code=${code}${signal ? ` signal=${signal}` : ""}]`;
      }
      task.updatedAt = Date.now();
      this.registry?.updateTaskState<BackgroundTask>(taskId, {
        status: task.status,
        completedAt: task.completedAt,
        exitCode: task.exitCode,
        output: task.output,
      });
      this.emit({
        taskId,
        status: task.status,
        label: task.label,
        exitCode: task.exitCode,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      });
      resolveCompletion();
    });

    child.on("error", (err) => {
      task.status = "failed";
      task.completedAt = Date.now();
      task.output += `\n[后台命令启动失败] ${String(err.message ?? err)}`;
      task.updatedAt = Date.now();
      this.registry?.updateTaskState<BackgroundTask>(taskId, {
        status: "failed",
        completedAt: task.completedAt,
        output: task.output,
        error: String(err.message ?? err),
      });
      this.emit({
        taskId,
        status: "failed",
        label: task.label,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      });
      resolveCompletion();
    });

    return task;
  }

  get(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /** 获取任务状态与输出；可选等待至完成或超时 */
  async getOutput(taskId: string, timeoutMs?: number): Promise<BackgroundTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    if (timeoutMs && task.status === "running") {
      const completion = this.completions.get(taskId);
      await Promise.race([completion ?? Promise.resolve(), sleep(timeoutMs)]);
    }
    return task;
  }

  /** 等待多个任务：mode=any 首个完成即返回；mode=all 全部完成返回；超时返回当前状态 */
  async wait(
    taskIds: string[],
    mode: "any" | "all" = "any",
    timeoutMs?: number
  ): Promise<BackgroundTask[]> {
    const targets = taskIds.map((id) => this.tasks.get(id)).filter(Boolean) as BackgroundTask[];
    if (targets.length === 0) return [];
    const deadline = Date.now() + (timeoutMs ?? this.defaultWaitTimeoutMs);

    while (Date.now() < deadline) {
      const done = targets.filter((t) => t.status !== "running");
      if (mode === "any" && done.length > 0) return done;
      if (mode === "all" && done.length === targets.length) return done;
      const remain = Math.min(100, Math.max(10, deadline - Date.now()));
      if (remain <= 0) break;
      await sleep(remain);
    }
    return targets;
  }

  /** 终止后台任务：SIGTERM → 1.5s 后 SIGKILL */
  async kill(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running" || !task.pid) return false;
    try {
      process.kill(task.pid, "SIGTERM");
    } catch {
      /* 进程可能已退出 */
    }
    await sleep(1500);
    const current = this.tasks.get(taskId);
    if (current?.status === "running") {
      try {
        process.kill(task.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  list(): BackgroundTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
  }
}
