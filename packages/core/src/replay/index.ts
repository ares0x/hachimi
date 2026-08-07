// packages/core/src/replay/index.ts
//
// P1.4: Replay 基准模块统一出口。

export type { ReplayBaseline } from "./baseline.js";
export { findRegressions, loadBaseline, saveBaseline } from "./baseline.js";
export { renderMarkdown } from "./report.js";
export { evaluateTrajectory, jaccard } from "./runner.js";
export { BUILTIN_REPLAY_SUITES, findSuite, listSuites } from "./suites.js";
export { recordTrajectoryFromEvents } from "./trajectory.js";
export type {
  ReplayCheck,
  ReplayExpect,
  ReplayReport,
  ReplaySuite,
  ReplayToolCall,
  ReplayTrajectory,
  ReplayVerdict,
} from "./types.js";
