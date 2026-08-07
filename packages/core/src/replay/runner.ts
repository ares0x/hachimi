// packages/core/src/replay/runner.ts
//
// P1.4: 轨迹评估器 — ReplayExpect 逐项校验（maka scorer taxonomy）。
// 纯函数：Jaccard 相似度 / 工具面 / 禁止行为 / 错误数 / 时长 / 成本。
import type { ReplayCheck, ReplayExpect, ReplayTrajectory, ReplayVerdict } from "./types.js";

/** Jaccard 相似度（集合交集 / 集合并集；两集皆空视为 1） */
export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const union = new Set([...setA, ...setB]);
  const inter = [...setA].filter((x) => setB.has(x));
  return union.size === 0 ? 1 : inter.length / union.size;
}

/** argsMatch 子集匹配：expect 中的键值全部出现在实际 args 中 */
function argsMatch(args: Record<string, unknown>, expect: Record<string, unknown>): boolean {
  return Object.entries(expect).every(
    ([k, v]) => args[k] !== undefined && String(args[k]) === String(v)
  );
}

export function evaluateTrajectory(
  suiteId: string,
  suiteName: string,
  trajectory: ReplayTrajectory,
  expect: ReplayExpect
): ReplayVerdict {
  const checks: ReplayCheck[] = [];
  const toolNames = new Set(trajectory.toolCalls.map((t) => t.name));

  // 1. 必需工具
  if (expect.requiredTools && expect.requiredTools.length > 0) {
    const missing = expect.requiredTools.filter((t) => !toolNames.has(t));
    checks.push({
      name: "requiredTools",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `全部出现: ${expect.requiredTools.join(", ")}`
          : `缺失: ${missing.join(", ")}`,
    });
  }

  // 2. 禁止行为
  if (expect.forbiddenBehaviors && expect.forbiddenBehaviors.length > 0) {
    const violated = expect.forbiddenBehaviors.filter(
      (f) =>
        toolNames.has(f.tool) &&
        trajectory.toolCalls.some((t) => t.name === f.tool && argsMatch(t.args, f.argsMatch ?? {}))
    );
    checks.push({
      name: "forbiddenBehaviors",
      passed: violated.length === 0,
      detail:
        violated.length === 0
          ? "未触发任何禁止行为"
          : `触发了 ${violated.map((v) => v.tool).join(", ")}`,
    });
  }

  // 3. 文件改动 Jaccard
  if (expect.expectedChangedFiles && expect.expectedChangedFiles.length > 0) {
    const sim = jaccard(expect.expectedChangedFiles, trajectory.changedFiles);
    checks.push({
      name: "expectedChangedFiles",
      passed: sim >= 0.5,
      detail: `Jaccard=${sim.toFixed(2)}（期望 ${expect.expectedChangedFiles.length} 个，实际 ${trajectory.changedFiles.length} 个）`,
    });
  }

  // 4. 错误事件上限
  if (expect.maxErrorEvents !== undefined) {
    checks.push({
      name: "maxErrorEvents",
      passed: trajectory.errorEvents <= expect.maxErrorEvents,
      detail: `错误事件 ${trajectory.errorEvents}/${expect.maxErrorEvents}`,
    });
  }

  // 5. 时长上限
  if (expect.maxTotalMs !== undefined) {
    checks.push({
      name: "maxTotalMs",
      passed: trajectory.durationMs <= expect.maxTotalMs,
      detail: `耗时 ${trajectory.durationMs}ms/${expect.maxTotalMs}ms`,
    });
  }

  // 6. 成本上限
  if (expect.maxCostUsd !== undefined) {
    checks.push({
      name: "maxCostUsd",
      passed: trajectory.costUsd <= expect.maxCostUsd,
      detail: `成本 $${trajectory.costUsd.toFixed(6)}/$${expect.maxCostUsd}`,
    });
  }

  const passed = checks.every((c) => c.passed);
  const score = checks.length === 0 ? 1 : checks.filter((c) => c.passed).length / checks.length;
  return { suiteId, suiteName, trajectory, passed, score, checks };
}
