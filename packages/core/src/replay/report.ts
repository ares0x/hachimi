// packages/core/src/replay/report.ts
//
// P1.4: Markdown 报告渲染 — 供 CLI `hachimi eval` 输出与基线比对。
import type { ReplayReport, ReplayVerdict } from "./types.js";

function renderVerdict(v: ReplayVerdict): string {
  const lines = [
    `### ${v.suiteName} (${v.suiteId}) — ${v.passed ? "✅ PASS" : "❌ FAIL"} · score ${v.score.toFixed(2)}`,
    ``,
    `- 输入: ${v.trajectory.prompt.slice(0, 120) || "(空)"}`,
    `- 工具调用: ${v.trajectory.toolCalls.length} 次 | 错误事件: ${v.trajectory.errorEvents}`,
    `- 耗时: ${v.trajectory.durationMs}ms | tokens: ${v.trajectory.totalTokens} | cost: $${v.trajectory.costUsd.toFixed(6)}`,
    `- 变更文件: ${v.trajectory.changedFiles.length > 0 ? v.trajectory.changedFiles.join(", ") : "(无)"}`,
    ``,
    `| 检查 | 结果 | 详情 |`,
    `|------|------|------|`,
    ...v.checks.map((c) => `| ${c.name} | ${c.passed ? "✅" : "❌"} | ${c.detail} |`),
  ];
  return lines.join("\n");
}

export function renderMarkdown(report: Omit<ReplayReport, "markdown">): string {
  const lines = [
    `# Hachimi Replay 评估报告`,
    ``,
    `- 生成时间: ${report.generatedAt}`,
    `- 整体结论: ${report.overallPassed ? "✅ 全部通过" : "❌ 存在失败"}`,
    ``,
    ...report.verdicts.flatMap((v) => [renderVerdict(v), ``]),
  ];
  return lines.join("\n");
}
