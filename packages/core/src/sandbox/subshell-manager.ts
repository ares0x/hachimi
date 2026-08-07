// packages/core/src/sandbox/subshell-manager.ts
import type { ChildProcess } from "node:child_process";
import { exec, spawn } from "node:child_process";
import { generateId, log } from "@hachimi/shared";
import { ToolSandbox } from "./sandbox.js";

export interface SubshellTask {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number | null;
  startedAt: string;
  endedAt?: string;
  outputBuffer: string[];
}

export interface SubshellSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** 是否剥离敏感环境变量（默认 true） */
  scrubEnv?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (exitCode: number | null, signal: string | null) => void;
}

export class SubshellManager {
  private tasks = new Map<string, SubshellTask>();
  private processes = new Map<string, ChildProcess>();
  private readonly maxBufferLines = 2000;

  /**
   * 启动并托管一个后台子进程/Terminal 指令
   */
  spawnSubshell(command: string, options: SubshellSpawnOptions = {}): SubshellTask {
    const id = generateId("task_proc_");
    const cwd = options.cwd || process.cwd();
    const startedAt = new Date().toISOString();

    const task: SubshellTask = {
      id,
      command,
      cwd,
      status: "running",
      startedAt,
      outputBuffer: [],
    };

    this.tasks.set(id, task);

    try {
      const childEnv =
        options.scrubEnv === false
          ? { ...process.env, ...options.env, FORCE_COLOR: "1" }
          : { ...ToolSandbox.scrubEnv(process.env), ...options.env, FORCE_COLOR: "1" };
      const child = spawn(command, {
        cwd,
        shell: true,
        env: childEnv,
        detached: false,
      });

      task.pid = child.pid;
      this.processes.set(id, child);

      const appendOutput = (chunk: string) => {
        const lines = chunk.split("\n");
        task.outputBuffer.push(...lines);
        if (task.outputBuffer.length > this.maxBufferLines) {
          task.outputBuffer = task.outputBuffer.slice(-this.maxBufferLines);
        }
      };

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString("utf-8");
        appendOutput(text);
        if (options.onStdout) options.onStdout(text);
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString("utf-8");
        appendOutput(text);
        if (options.onStderr) options.onStderr(text);
      });

      child.on("error", (err: Error) => {
        log("error", `[SubshellManager] Task ${id} process error:`, err);
        task.status = "failed";
        task.endedAt = new Date().toISOString();
        this.processes.delete(id);
      });

      child.on("exit", (code: number | null, signal: string | null) => {
        if (task.status === "running") {
          task.status = code === 0 ? "completed" : "failed";
        }
        task.exitCode = code;
        task.endedAt = new Date().toISOString();
        this.processes.delete(id);
        if (options.onExit) options.onExit(code, signal);
      });
    } catch (err: unknown) {
      task.status = "failed";
      task.endedAt = new Date().toISOString();
      log("error", `[SubshellManager] Failed to spawn command: ${command}`, err);
    }

    return task;
  }

  /**
   * 向运行中的子进程 stdin 发送文本交互输入
   */
  sendInput(taskId: string, input: string): boolean {
    const child = this.processes.get(taskId);
    if (!child || !child.stdin || child.killed) return false;
    try {
      child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 优雅或强行杀死指定子进程
   */
  killProcess(taskId: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const task = this.tasks.get(taskId);
    const child = this.processes.get(taskId);

    if (!task) return false;

    if (child && !child.killed) {
      try {
        child.kill(signal);
        // 如果是 macOS/Linux，可尝试杀整个进程组
        if (child.pid) {
          try {
            process.kill(-child.pid, signal);
          } catch {
            /* ignore group kill error */
          }
        }
      } catch {
        /* ignore kill error */
      }
    }

    task.status = "killed";
    task.endedAt = new Date().toISOString();
    this.processes.delete(taskId);
    return true;
  }

  /**
   * 获取指定 Task 状态与缓冲区输出
   */
  getTask(taskId: string): SubshellTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 列出所有子进程 Task
   */
  listTasks(): SubshellTask[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }
}

let defaultSubshellManagerInstance: SubshellManager | null = null;

export function getSubshellManager(): SubshellManager {
  if (!defaultSubshellManagerInstance) {
    defaultSubshellManagerInstance = new SubshellManager();
  }
  return defaultSubshellManagerInstance;
}
