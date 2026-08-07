// packages/core/src/usage/usage-summary.ts
/**
 * P2-B8: Daily / rolling usage summary built from the append-only event stream.
 *
 * Event sources:
 * - run_finished: run count + normalized usage + cost + model (usage recorded
 *   going forward; legacy events simply contribute zeros)
 * - error: failed runs that never produced run_finished
 * - tool_call: per-tool invocation counts
 *
 * Pure functions over RuntimeEvent[] — no I/O, easily unit-testable.
 */
import type { NormalizedUsage } from "@hachimi/shared";
import type { RuntimeEvent } from "../types/event.js";

export interface UsageSummaryOptions {
  /** Rolling window in days (default 7). 0 / negative = all history. */
  days?: number;
  /** Reference "now" for tests; defaults to new Date() */
  now?: Date;
}

export interface SessionUsageRow {
  sessionId: string;
  runs: number;
  failedRuns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number;
}

export interface ModelUsageRow {
  model: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  periodFrom: string;
  periodTo: string;
  days: number;
  sessions: number;
  runs: number;
  failedRuns: number;
  tokens: NormalizedUsage & { totalTokens: number };
  costUsd: number;
  topTools: Array<{ name: string; calls: number }>;
  topModels: ModelUsageRow[];
  bySession: SessionUsageRow[];
}

export interface RunUsageRecord {
  usage?: NormalizedUsage & { costUsd?: number };
  model?: string;
  success: boolean;
}

/** Extract run-level usage records from an event array (run_finished + error) */
export function collectRunUsage(events: RuntimeEvent[]): RunUsageRecord[] {
  const records: RunUsageRecord[] = [];
  for (const ev of events) {
    if (ev.type === "run_finished") {
      records.push({
        usage: ev.payload.usage,
        model: ev.payload.model,
        success: ev.payload.success !== false,
      });
    } else if (ev.type === "error") {
      records.push({ success: false });
    }
  }
  return records;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Aggregate a window of events into a usage summary.
 * Events outside the rolling window are ignored; per-session rows are sorted
 * by total tokens descending; tools/models by usage descending.
 */
export function buildUsageSummary(
  events: RuntimeEvent[],
  options: UsageSummaryOptions = {}
): UsageSummary {
  const days = options.days ?? 7;
  const now = options.now ?? new Date();
  const windowStart = days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : new Date(0);

  const inWindow = (ts: string): boolean => {
    const t = new Date(ts).getTime();
    return t >= windowStart.getTime() && t <= now.getTime();
  };

  const filtered = events.filter((e) => inWindow(e.timestamp));

  const bySession = new Map<string, SessionUsageRow>();

  const modelStats = new Map<
    string,
    {
      runs: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
    }
  >();
  const toolStats = new Map<string, number>();

  let runs = 0;
  let failedRuns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const ev of filtered) {
    if (ev.type === "run_finished") {
      runs += 1;
      const row = getOrInitSession(bySession, ev.sessionId);
      row.runs += 1;
      if (ev.payload.success === false) {
        failedRuns += 1;
        row.failedRuns += 1;
      }
      const usage = ev.payload.usage;
      if (usage) {
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        cacheReadTokens += usage.cacheReadTokens;
        cacheWriteTokens += usage.cacheWriteTokens;
        totalTokens += usage.totalTokens;
        costUsd += usage.costUsd ?? 0;
        row.inputTokens += usage.inputTokens;
        row.outputTokens += usage.outputTokens;
        row.cacheReadTokens += usage.cacheReadTokens;
        row.cacheWriteTokens += usage.cacheWriteTokens;
        row.totalTokens += usage.totalTokens;
        row.costUsd += usage.costUsd ?? 0;
      }
      const model = ev.payload.model;
      if (model) {
        const m = modelStats.get(model) ?? {
          runs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        };
        m.runs += 1;
        if (usage) {
          m.inputTokens += usage.inputTokens;
          m.outputTokens += usage.outputTokens;
          m.totalTokens += usage.totalTokens;
          m.costUsd += usage.costUsd ?? 0;
        }
        modelStats.set(model, m);
      }
    } else if (ev.type === "error") {
      runs += 1;
      failedRuns += 1;
      const row = getOrInitSession(bySession, ev.sessionId);
      row.runs += 1;
      row.failedRuns += 1;
    } else if (ev.type === "tool_call") {
      const name = ev.payload.toolName;
      toolStats.set(name, (toolStats.get(name) ?? 0) + 1);
      const row = getOrInitSession(bySession, ev.sessionId);
      row.toolCalls += 1;
    }
  }

  const topTools = [...toolStats.entries()]
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  const topModels = [...modelStats.entries()]
    .map(([model, s]) => ({ model, ...s }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);

  const bySessionRows = [...bySession.values()].sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    periodFrom: toDateKey(new Date(windowStart.getTime()).toISOString()),
    periodTo: toDateKey(now.toISOString()),
    days,
    sessions: bySession.size,
    runs,
    failedRuns,
    tokens: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
    },
    costUsd: Number(costUsd.toFixed(6)),
    topTools,
    topModels,
    bySession: bySessionRows,
  };
}

function getOrInitSession(map: Map<string, SessionUsageRow>, sessionId: string): SessionUsageRow {
  let row = map.get(sessionId);
  if (!row) {
    row = {
      sessionId,
      runs: 0,
      failedRuns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      toolCalls: 0,
    };
    map.set(sessionId, row);
  }
  return row;
}
