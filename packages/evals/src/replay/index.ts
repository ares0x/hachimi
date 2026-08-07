// packages/evals/src/replay/index.ts
//
// P1.4: Replay 基准 — 从 @hachimi/core 转发（实现位于 core/src/replay，
// 供 CLI 与 evals 共用，避免循环依赖）。

export type {
  ReplayCheck,
  ReplayExpect,
  ReplayReport,
  ReplaySuite,
  ReplayToolCall,
  ReplayTrajectory,
  ReplayVerdict,
} from "@hachimi/core";
export {
  BUILTIN_REPLAY_SUITES,
  evaluateTrajectory,
  findRegressions,
  findSuite,
  jaccard,
  listSuites,
  loadBaseline,
  recordTrajectoryFromEvents,
  renderMarkdown,
  saveBaseline,
} from "@hachimi/core";
