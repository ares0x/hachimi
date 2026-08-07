// packages/core/src/memory/autodream.ts
//
// P2.5: autoDream 门控 — 会话记忆向长期记忆整合（consolidation）的准入策略。
//
// 最便宜优先（grok 模式）：
//   1. 配置变化（记忆目录/开关变更）→ 立即允许
//   2. 距上次整合超过 minIntervalMs（默认 6h）→ 允许
//   3. 会话条目数达到 minSessionCount（默认 20）→ 允许
// 锁文件 {dataDir}/memdir/.dream.lock 防止多进程/高频重复整合。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AutoDreamGateOptions {
  dataDir: string;
  /** 距上次整合最短间隔（ms），默认 6h */
  minIntervalMs?: number;
  /** 会话条目数阈值，默认 20 */
  minSessionCount?: number;
  /** 锁文件 TTL（ms），默认 60s */
  lockTtlMs?: number;
  /** 测试注入：上次整合时间 */
  lastRunAt?: number;
}

export type DreamDecision = {
  allowed: boolean;
  reason: string;
};

export class AutoDreamGate {
  private readonly dataDir: string;
  private readonly minIntervalMs: number;
  private readonly minSessionCount: number;
  private readonly lockTtlMs: number;
  private lastRunAt: number;

  constructor(options: AutoDreamGateOptions) {
    this.dataDir = options.dataDir;
    this.minIntervalMs = options.minIntervalMs ?? 6 * 60 * 60 * 1000;
    this.minSessionCount = options.minSessionCount ?? 20;
    this.lockTtlMs = options.lockTtlMs ?? 60_000;
    this.lastRunAt = options.lastRunAt ?? this.readLastRunFromLock();
  }

  private lockFile(): string {
    return join(this.dataDir, "memdir", ".dream.lock");
  }

  private readLastRunFromLock(): number {
    try {
      const raw = readFileSync(this.lockFile(), "utf-8").trim();
      return Number(raw) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 是否允许本次整合。configChanged 为最便宜检查（调用方已知配置是否变化）。
   */
  decide(options: { configChanged?: boolean; sessionEntryCount: number }): DreamDecision {
    // 1. 配置变化 → 立即允许
    if (options.configChanged) {
      return { allowed: true, reason: "config-change" };
    }
    // 2. 时间间隔
    if (Date.now() - this.lastRunAt >= this.minIntervalMs) {
      return { allowed: true, reason: "interval-elapsed" };
    }
    // 3. 会话条目数
    if (options.sessionEntryCount >= this.minSessionCount) {
      return { allowed: true, reason: "session-count" };
    }
    return { allowed: false, reason: "not-due" };
  }

  /** 整合完成后写入锁（记录本次运行时间） */
  touchLock(): void {
    this.lastRunAt = Date.now();
    try {
      mkdirSync(join(this.dataDir, "memdir"), { recursive: true });
      writeFileSync(this.lockFile(), String(this.lastRunAt), "utf-8");
    } catch {
      /* 锁写入失败不阻断 */
    }
  }

  /** 锁是否在 TTL 内（防止刚整合完又立即触发） */
  isLockedFresh(): boolean {
    return Date.now() - this.lastRunAt < this.lockTtlMs;
  }
}
