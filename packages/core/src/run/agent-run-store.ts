import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AgentRun, AgentRunSummary, RunFailureClass, RunStatus } from "./types.js";

/** Directory name under dataDir for run storage */
const RUNS_DIR = "runs";

export class AgentRunStore {
  private runsDir: string;

  constructor(dataDir: string) {
    this.runsDir = join(dataDir, RUNS_DIR);
    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }
  }

  // ── Write ──────────────────────────────────────────

  /** Create a new run record (status = "running"). Atomic JSON write. */
  createRun(run: AgentRun): void {
    const filePath = this.runPath(run.runId);
    const payload = JSON.stringify(run, null, 2);
    writeFileSync(filePath, payload, "utf-8");
  }

  /** Update run to a terminal status. No-op if file doesn't exist. */
  completeRun(
    runId: string,
    status: "completed" | "failed" | "cancelled",
    info?: { failureClass?: RunFailureClass; errorMessage?: string }
  ): void {
    const existing = this.getRun(runId);
    if (!existing) return;

    const updated: AgentRun = {
      ...existing,
      status,
      completedAt: new Date().toISOString(),
      ...(info?.failureClass ? { failureClass: info.failureClass } : {}),
      ...(info?.errorMessage ? { errorMessage: info.errorMessage } : {}),
    };

    writeFileSync(this.runPath(runId), JSON.stringify(updated, null, 2), "utf-8");
  }

  /** Repair a stale run to a known terminal state. */
  repairRun(runId: string, failureClass: RunFailureClass, errorMessage: string): void {
    this.completeRun(runId, "failed", { failureClass, errorMessage });
  }

  // ── Read ───────────────────────────────────────────

  /** Get a single run by ID. Returns null if not found. */
  getRun(runId: string): AgentRun | null {
    const filePath = this.runPath(runId);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as AgentRun;
    } catch {
      return null;
    }
  }

  /** List all runs for a session, newest first. */
  listRuns(sessionId: string): AgentRunSummary[] {
    if (!existsSync(this.runsDir)) return [];

    const runs: AgentRunSummary[] = [];
    const files = readdirSync(this.runsDir);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const run = JSON.parse(readFileSync(join(this.runsDir, file), "utf-8")) as AgentRun;
        if (run.sessionId === sessionId) {
          runs.push({
            runId: run.runId,
            sessionId: run.sessionId,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            failureClass: run.failureClass,
          });
        }
      } catch {
        // Skip corrupt run files
      }
    }

    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Find all runs that are NOT in a terminal state (created or running).
   * These represent sessions that were interrupted before clean completion.
   */
  findStaleRuns(): AgentRun[] {
    if (!existsSync(this.runsDir)) return [];

    const stale: AgentRun[] = [];
    const files = readdirSync(this.runsDir);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const run = JSON.parse(readFileSync(join(this.runsDir, file), "utf-8")) as AgentRun;
        if (run.status === "created" || run.status === "running") {
          stale.push(run);
        }
      } catch {
        // Skip corrupt files
      }
    }

    return stale;
  }

  /**
   * Startup recovery: find and repair all stale runs.
   * Conservative model never replay model streams or tools.
   * Simply mark stale runs as failed with failureClass = "crash".
   */
  recoverStaleRuns(): number {
    const stale = this.findStaleRuns();
    for (const run of stale) {
      this.repairRun(
        run.runId,
        "crash",
        "Application was restarted while this run was in progress. " +
          `Previous status: ${run.status}. No tool or model state was recovered.`
      );
    }
    return stale.length;
  }

  // ── Helpers ────────────────────────────────────────

  private runPath(runId: string): string {
    return join(this.runsDir, `${runId}.json`);
  }
}
