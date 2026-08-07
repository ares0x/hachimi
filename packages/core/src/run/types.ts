/** Terminal statuses for an AgentRun */
export type RunStatus = "created" | "running" | "completed" | "failed" | "cancelled";

/**
 * Classification for why a run failed:
 * - crash: app/external restart, unknown tool/progress state
 * - tool_timeout: sandbox timeout or tool execution timeout
 * - permission_denied: user rejected tool execution
 * - max_rounds: agent hit tool call round limit
 * - user_cancelled: explicit user cancellation
 * - error: generic/unexpected error
 */
export type RunFailureClass =
  | "crash"
  | "tool_timeout"
  | "permission_denied"
  | "max_rounds"
  | "user_cancelled"
  | "error";

/**
 * Durable record of a single agent execution turn.
 * One HarnessRuntime.execute() call = one AgentRun.
 * Stored at data/runs/{runId}.json — atomic write, independent of event stream.
 */
export interface AgentRun {
  runId: string;
  sessionId: string;
  workId?: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  failureClass?: RunFailureClass;
  errorMessage?: string;
  /** Sequence number for ordering within a session (1-based) */
  runSeq?: number;
  /** Checkpoint snapshot for session resumption */
  checkpoint?: {
    lastCompletedStep?: string;
    checkpointTime: string;
    summary?: string;
  };
}

/** Summary for list queries (lighter than full AgentRun) */
export interface AgentRunSummary {
  runId: string;
  sessionId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  failureClass?: RunFailureClass;
}
