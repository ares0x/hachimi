// packages/core/src/tasks/activity-policy.ts
//
// P2.8: 电源/活动感知后台策略（t3code background/BackgroundPolicy 模式）。
//
// 规则：
//   - 用户交互租约（activity lease，默认 90s）内 → 视为活跃，跳过后台/主动触发
//   - 电池供电 → 跳过（省电）
//   - 屏幕锁定 → 跳过（设备不可用）
// 电源/锁定状态检测带缓存（默认 30s），失败时保守视为可用（不阻断触发）。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { log } from "@hachimi/shared";

export interface ActivityPolicyOptions {
  /** 活动租约 TTL（ms），默认 90_000（45–120s 区间） */
  activityLeaseMs?: number;
  /** 电源/锁定检测缓存时长（ms），默认 30_000 */
  powerCheckCacheMs?: number;
  /** 测试/无检测环境注入的电源状态（覆盖平台检测） */
  powerStateOverride?: { onBattery: boolean; locked: boolean };
}

export interface HostPowerState {
  onBattery: boolean;
  locked: boolean;
  checkedAt: number;
}

export class ActivityPolicy {
  private lastActivityAt: number = Date.now();
  private readonly activityLeaseMs: number;
  private readonly powerCheckCacheMs: number;
  private readonly powerStateOverride?: { onBattery: boolean; locked: boolean };
  private cachedPower?: HostPowerState;

  constructor(options: ActivityPolicyOptions = {}) {
    this.activityLeaseMs = options.activityLeaseMs ?? 90_000;
    this.powerCheckCacheMs = options.powerCheckCacheMs ?? 30_000;
    this.powerStateOverride = options.powerStateOverride;
  }

  /** 记录一次用户交互（channel 收到用户消息时调用） */
  markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /** 用户是否处于活跃租约期内 */
  isUserActive(): boolean {
    return Date.now() - this.lastActivityAt <= this.activityLeaseMs;
  }

  /** 读取主机电源/锁定状态（带缓存） */
  getPowerState(): HostPowerState {
    const now = Date.now();
    if (this.cachedPower && now - this.cachedPower.checkedAt <= this.powerCheckCacheMs) {
      return this.cachedPower;
    }
    const state = this.detectPowerState();
    this.cachedPower = { ...state, checkedAt: now };
    return this.cachedPower;
  }

  /**
   * 后台/主动触发是否允许：
   * 用户活跃 或 电池 或 锁定 → false；否则 true。
   */
  shouldRunBackground(): boolean {
    if (this.isUserActive()) {
      log("debug", "[ActivityPolicy] skip: user active within lease");
      return false;
    }
    const power = this.getPowerState();
    if (power.onBattery) {
      log("debug", "[ActivityPolicy] skip: on battery power");
      return false;
    }
    if (power.locked) {
      log("debug", "[ActivityPolicy] skip: screen locked");
      return false;
    }
    return true;
  }

  private detectPowerState(): { onBattery: boolean; locked: boolean } {
    if (this.powerStateOverride) return this.powerStateOverride;
    const platform = process.platform;
    try {
      if (platform === "darwin") {
        // pmset -g batt: "Now drawing from 'Battery Power'" / "AC Power"
        const batt = execFileSync("pmset", ["-g", "batt"], {
          encoding: "utf-8",
          timeout: 2000,
        });
        const onBattery = batt.includes("Battery Power");
        // pmset -g powerstate IODisplayWrangler 或 CGSession: 检查锁定
        let locked = false;
        try {
          const cgs = execFileSync(
            "/usr/bin/python3",
            ["-c", "import Quartz; print(Quartz.CGSessionCopyCurrentDictionary())"],
            { encoding: "utf-8", timeout: 2000 }
          );
          locked = !cgs.includes("CGSSessionScreenIsLocked = 0");
        } catch {
          locked = false; // 检测失败不阻断
        }
        return { onBattery, locked };
      }
      if (platform === "linux") {
        let onBattery = false;
        try {
          const status = readFileSync("/sys/class/power_supply/AC/online", "utf-8").trim();
          onBattery = status !== "1";
        } catch {
          onBattery = false;
        }
        return { onBattery, locked: false };
      }
    } catch (err) {
      log("warn", "[ActivityPolicy] power state detection failed", err);
    }
    return { onBattery: false, locked: false };
  }
}
