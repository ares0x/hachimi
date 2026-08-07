// packages/core/src/replay/baseline.ts
//
// P1.4: 基线存储 — {dataDir}/evals/baseline.json
// failOnRegression：当前通过率低于基线 → 视为回归（CI 可据退出码判断）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReplayVerdict } from "./types.js";

export interface ReplayBaseline {
  generatedAt: string;
  suites: Array<{ suiteId: string; passed: boolean; score: number }>;
}

export function loadBaseline(dataDir: string): ReplayBaseline | undefined {
  const file = join(dataDir, "evals", "baseline.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as ReplayBaseline;
  } catch {
    return undefined;
  }
}

export function saveBaseline(dataDir: string, verdicts: ReplayVerdict[]): string {
  const dir = join(dataDir, "evals");
  mkdirSync(dir, { recursive: true });
  const baseline: ReplayBaseline = {
    generatedAt: new Date().toISOString(),
    suites: verdicts.map((v) => ({ suiteId: v.suiteId, passed: v.passed, score: v.score })),
  };
  const file = join(dir, "baseline.json");
  writeFileSync(file, JSON.stringify(baseline, null, 2), "utf-8");
  return file;
}

/**
 * 与基线比对：某 suite 之前通过而现在失败 → 回归。
 * 无基线时返回空回归列表（首次运行建立基线）。
 */
export function findRegressions(
  baseline: ReplayBaseline | undefined,
  verdicts: ReplayVerdict[]
): string[] {
  if (!baseline) return [];
  const prev = new Map(baseline.suites.map((s) => [s.suiteId, s]));
  return verdicts
    .filter((v) => {
      const p = prev.get(v.suiteId);
      return p !== undefined && p.passed && !v.passed;
    })
    .map((v) => v.suiteId);
}
