#!/usr/bin/env node
// packages/channels/cli/src/cli.ts
import { createInterface } from "node:readline";
import type { Work, WorkSummary } from "@hachimi/core";
import {
  buildUsageSummary,
  evaluateTrajectory,
  findRegressions,
  findSuite,
  getOrCreateHarnessRuntime,
  type HarnessRuntime,
  interruptionHint,
  listSuites,
  loadBaseline,
  recordTrajectoryFromEvents,
  renderMarkdown,
  saveBaseline,
  type WorkStatus,
} from "@hachimi/core";
import { runCliChannel } from "./index.js";
import { clearLocalData } from "./memory-clear.js";

function printHelp() {
  console.log(`
🌾 Hachimi CLI - Embedded Non-Interactive Single-Turn Entrypoint & Work Management Tool

━━━ CHAT / RUN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi [options] <prompt>        Single-turn agent run
  echo "text" | hachimi [options]   Read prompt from stdin

  Options:
    -p, --print        Plaintext output (default)
    -j, --json         Structured JSON output
    -s, --session <id> Specify target session ID
    -r, --resume <id>  Resume an existing session (repairs/rebuilds if needed)
    -c, --continue     Continue the most recent session

━━━ SESSION MANAGEMENT (P0 Resume Pipeline) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi session list                 List recent sessions
  hachimi session show <id>            Show session messages + recovery status
  hachimi session resume <id> ".."     Run a turn on an existing session
  hachimi session recover <id>         Repair / rebuild a session from event stream

━━━ MEMORY MANAGEMENT (P2-B9) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi memory clear                 Clear memories (default; --sessions for sessions, --all for both)
      [--memories|--sessions|--all] [--yes]

━━━ USAGE SUMMARY (P2-B8) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi usage [--days N]             Rolling usage summary (tokens / cost / tools)
  hachimi usage --all                  Full-history usage summary

━━━ REPLAY EVAL (P1.4) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi eval --suite <id> [--session <sid>] [--write-baseline] [--fail-on-regression]
                                       Evaluate event trajectories against suite expectations

━━━ WORK MANAGEMENT (W1.6) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hachimi work list                 List primary Works (title + status + time)
  hachimi work show <id>            Show Work goal / plan / recent activities
  hachimi work audit <id>           Print approval / denial audit log
  hachimi work create --intent ".." Create a new Work with an intent

━━━ DATA PORTABILITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  --export <file>                   Export memory + sessions to a bundle JSON
  --import <file>                   Import bundle with additive merge

━━━ GLOBAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -h, --help                        Display help information

Examples:
  pnpm dev:cli "Summarize this article"
  pnpm dev:cli -j "Check system status"
  pnpm dev:cli work list
  pnpm dev:cli work show work_abc123
  pnpm dev:cli work audit work_abc123
  pnpm dev:cli work create --intent "分析项目目录结构"
  pnpm dev:cli session list
  pnpm dev:cli session resume sess_abc123 "继续刚才的分析"
  pnpm dev:cli --resume sess_abc123 "再检查一下 README"
  pnpm dev:cli --continue "继续上一个会话"
  pnpm dev:cli memory clear --all --yes
  pnpm dev:cli --export ./my-backup.json
  pnpm dev:cli --import ./my-backup.json
`);
}

// ─── Utils ──────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return new Promise((res) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      res(Buffer.concat(chunks).toString("utf-8").trim());
    }, 50);

    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    process.stdin.on("end", () => {
      clearTimeout(timer);
      res(Buffer.concat(chunks).toString("utf-8").trim());
    });
  });
}

const STATUS_LABEL: Record<WorkStatus, string> = {
  active: "进行中",
  waiting: "等待中",
  blocked: "阻塞中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "已失败",
  archived: "已归档",
};

const STATUS_COLOR: Record<WorkStatus, string> = {
  active: "\x1b[34m",
  waiting: "\x1b[33m",
  blocked: "\x1b[31m",
  completed: "\x1b[32m",
  cancelled: "\x1b[90m",
  failed: "\x1b[35m",
  archived: "\x1b[90m",
};

function colorize(status: WorkStatus, text: string): string {
  return `${STATUS_COLOR[status]}${text}\x1b[0m`;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  return `${d} 天前`;
}

function pad(s: string, n: number): string {
  const len = Array.from(s).length;
  if (len >= n) return s.slice(0, n);
  return s + " ".repeat(n - len);
}

// ─── Work subcommand handlers (W1.6 + W2.6) ─────────────────────────────────

async function handleWorkList(runtime: HarnessRuntime) {
  const works = runtime.works.list({ kind: "primary", limit: 50 });
  if (works.length === 0) {
    console.log('(尚无工作，创建一个: hachimi work create --intent "...")\n');
    process.exit(0);
  }

  console.log("ID\t\t\t状态\t标题\t\t\t\t\t更新于");
  console.log("─".repeat(90));
  for (const w of works as WorkSummary[]) {
    const idShort = w.id.length > 12 ? `${w.id.slice(0, 12)}…` : w.id;
    const title = w.title.length > 42 ? `${w.title.slice(0, 42)}…` : w.title;
    console.log(
      `${pad(idShort, 14)}\t${colorize(w.status, pad(STATUS_LABEL[w.status], 6))}\t${pad(title, 42)}\t${formatRelativeTime(w.updatedAt)}`
    );
  }
  console.log(`\n共 ${works.length} 个主 Work。显示详情: hachimi work show <id>`);
}

async function handleWorkShow(runtime: HarnessRuntime, workId: string) {
  const work = runtime.works.get(workId) as Work | null;
  if (!work) {
    console.error(`❌ Work '${workId}' 不存在`);
    process.exit(1);
  }

  console.log(`\n━━━ Work: ${work.id} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`标题     : ${work.title}`);
  console.log(`状态     : ${colorize(work.status, STATUS_LABEL[work.status])}`);
  console.log(
    `类型     : ${work.kind}${work.parentWorkId ? ` (parent: ${work.parentWorkId})` : ""}`
  );
  console.log(`创建于   : ${new Date(work.createdAt).toLocaleString()}`);
  console.log(
    `更新于   : ${new Date(work.updatedAt).toLocaleString()} (${formatRelativeTime(work.updatedAt)})`
  );
  console.log(`会话数   : ${work.sessionIds.length}`);
  if (work.goal) {
    console.log(`\n━━━ Goal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(work.goal);
  }

  if (work.plan && work.plan.length > 0) {
    console.log(
      `\n━━━ Plan (${work.plan.filter((s) => s.status === "done").length}/${work.plan.length}) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
    const STEP_STATUS: Record<string, string> = {
      pending: "⬜",
      running: "🔵",
      done: "✅",
      skipped: "⏭️",
    };
    for (const step of work.plan) {
      console.log(`  ${STEP_STATUS[step.status] || "•"}  ${step.title}`);
      if (step.description) {
        console.log(`      ${step.description}`);
      }
    }
  }

  console.log(`\n━━━ Recent Activities (top 15) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const { activities } = await runtime.works.listActivities(workId, {
    limit: 15,
  });
  if (activities.length === 0) {
    console.log("(尚无活动记录)");
  } else {
    for (const act of activities) {
      const t = new Date(act.timestamp).toLocaleTimeString();
      let tag = "";
      let body = "";
      switch (act.type) {
        case "message":
          tag = act.role === "user" ? "\x1b[36m[用户]\x1b[0m" : "\x1b[35m[助理]\x1b[0m";
          body = act.content.length > 100 ? `${act.content.slice(0, 100)}…` : act.content;
          break;
        case "tool":
          tag = act.isToolError ? "\x1b[31m[工具×]\x1b[0m" : "\x1b[32m[工具√]\x1b[0m";
          body = `${act.toolName} → ${(act.content || "").slice(0, 80)}`;
          break;
        case "approval": {
          const dec = act.approvalDecision;
          const label =
            dec === "granted"
              ? "\x1b[32m[批准]\x1b[0m"
              : dec === "denied"
                ? "\x1b[31m[拒绝]\x1b[0m"
                : "\x1b[33m[待审]\x1b[0m";
          tag = label;
          body = `${act.toolName} — ${act.content.slice(0, 80)}`;
          break;
        }
        case "steer":
          tag = "\x1b[33m[纠偏]\x1b[0m";
          body = act.content.slice(0, 100);
          break;
        case "error":
          tag = "\x1b[31m[错误]\x1b[0m";
          body = act.content.slice(0, 100);
          break;
        default:
          tag = "[系统]";
          body = String(act.content || "").slice(0, 80);
      }
      console.log(`  ${t}  ${tag} ${body.replace(/\n/g, " ")}`);
    }
  }

  console.log("");
}

// W2.6: 审计查询
async function handleWorkAudit(runtime: HarnessRuntime, workId: string) {
  const work = runtime.works.get(workId);
  if (!work) {
    console.error(`❌ Work '${workId}' 不存在`);
    process.exit(1);
  }

  const sessionIds = work.sessionIds.length > 0 ? work.sessionIds : [workId];
  const auditEvents: Array<{
    timestamp: string;
    toolName: string;
    decision: string;
    surface: string;
  }> = [];

  for (const sid of sessionIds) {
    const r = await runtime.events.list(sid, {
      limit: 500,
      types: ["approval_granted", "approval_denied"],
    });
    for (const ev of r.events) {
      if (ev.type === "approval_granted" || ev.type === "approval_denied") {
        auditEvents.push({
          timestamp: ev.timestamp,
          toolName: ev.payload.toolName,
          decision: ev.type === "approval_granted" ? "GRANTED" : "DENIED",
          surface: (ev.payload as any).surface || "-",
        });
      }
    }
  }

  auditEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  console.log(`\n审计记录: Work ${workId} — ${work.title}`);
  console.log("─".repeat(100));
  if (auditEvents.length === 0) {
    console.log("  (尚无批准/拒绝记录，该 Work 可能不需要 HITL 工具。)\n");
    process.exit(0);
  }

  console.log(`${pad("时间", 22)} | ${pad("决策", 8)} | ${pad("来源 surface", 14)} | 工具`);
  console.log("─".repeat(100));
  for (const e of auditEvents) {
    const decColor =
      e.decision === "GRANTED" ? `\x1b[32m${e.decision}\x1b[0m` : `\x1b[31m${e.decision}\x1b[0m`;
    const t = new Date(e.timestamp).toLocaleString();
    console.log(
      `${pad(t, 22)} | ${pad("", 0)}${decColor}${pad("", 8 - e.decision.length)} | ${pad(e.surface, 14)} | ${e.toolName}`
    );
  }
  console.log(`\n共 ${auditEvents.length} 条审计记录。\n`);
}

async function handleWorkCreate(runtime: HarnessRuntime, intent: string) {
  if (!intent.trim()) {
    console.error('❌ 创建 Work 需要提供 --intent "..." 或位置参数');
    process.exit(1);
  }
  const work = runtime.works.create({ intent: intent.trim(), kind: "primary" });
  console.log(`✅ Work 已创建: ${work.id}`);
  console.log(`   标题 : ${work.title}`);
  console.log(`   Goal : ${work.goal || "(未设置)"}`);
  console.log(`\n对其发言运行: hachimi -s ${work.id} "..."\n`);
}

// ─── Session subcommand handlers (P0 Resume Pipeline) ────────────────────────

const RECOVERY_STATUS_LABEL: Record<string, string> = {
  ok: "正常",
  rebuilt: "已重建",
  missing: "缺失",
};

async function handleSessionList(runtime: HarnessRuntime) {
  const sessions = runtime.sessions.list();
  if (sessions.length === 0) {
    console.log('(暂无会话。创建第一个会话: hachimi "你好")\n');
    process.exit(0);
  }

  console.log("ID\t\t\t标题\t\t\t\t\t\t更新于");
  console.log("─".repeat(100));
  for (const s of sessions.slice(0, 30)) {
    const idShort = s.id.length > 16 ? `${s.id.slice(0, 16)}…` : s.id;
    const rawTitle = s.title || "";
    const title = rawTitle.length > 46 ? `${rawTitle.slice(0, 46)}…` : rawTitle;
    console.log(
      `${pad(idShort, 18)}\t${pad(title, 46)}\t${formatRelativeTime(new Date(s.updatedAt).toISOString())}`
    );
  }
  console.log(`\n共 ${sessions.length} 个会话。继续最近会话: hachimi --continue "..."`);
}

async function handleSessionShow(runtime: HarnessRuntime, sessionId: string) {
  const report = await runtime.recoverSession(sessionId);
  const session = runtime.sessions.load(sessionId);
  if (!session) {
    console.error(`❌ 会话 '${sessionId}' 不存在`);
    process.exit(1);
  }

  console.log(`\n━━━ Session: ${session.id} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`标题     : ${session.title}`);
  console.log(`状态     : ${RECOVERY_STATUS_LABEL[report.status] || report.status}`);
  console.log(`创建于   : ${new Date(session.createdAt).toLocaleString()}`);
  console.log(`更新于   : ${new Date(session.updatedAt).toLocaleString()}`);
  console.log(`消息数   : ${session.messages.length} | 事件数: ${report.eventCount}`);
  if (report.interruption) {
    console.log(`上次运行 : ${interruptionHint(report.interruption)}`);
  }
  if (report.issues.length > 0) {
    console.log(`恢复说明 : ${report.issues.join("; ")}`);
  }

  console.log(`\n━━━ Messages (last 20) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const m of session.messages.slice(-20)) {
    const role = m.role === "user" ? "\x1b[36m[用户]\x1b[0m" : "\x1b[35m[助理]\x1b[0m";
    const body =
      String(m.content).length > 160 ? `${String(m.content).slice(0, 160)}…` : String(m.content);
    console.log(
      `  ${new Date(m.timestamp).toLocaleTimeString()}  ${role} ${body.replace(/\n/g, " ")}`
    );
  }
  console.log("");
}

async function handleSessionRecover(runtime: HarnessRuntime, sessionId: string) {
  const report = await runtime.recoverSession(sessionId);
  console.log(`\n━━━ 会话恢复报告: ${sessionId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`状态     : ${RECOVERY_STATUS_LABEL[report.status] || report.status}`);
  console.log(`消息数   : ${report.messageCount} | 事件数: ${report.eventCount}`);
  if (report.interruption) {
    console.log(`上次运行 : ${interruptionHint(report.interruption)}`);
  }
  if (report.rebuiltFromEvents) {
    console.log(`标题     : ${report.title || "(无)"}`);
  }
  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      console.log(`  • ${issue}`);
    }
  }
  if (report.status === "rebuilt") {
    console.log(`\n✅ 已从事件流重建。继续对话: hachimi -r ${sessionId} "..."`);
  } else if (report.status === "missing") {
    console.log(`\n❌ 该会话不存在。`);
    process.exit(1);
  }
  console.log("");
}

// ─── Memory subcommand handlers (P2-B9) ─────────────────────────────────────

async function confirmOrExit(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    console.error(`❌ 非交互环境需要显式确认: ${question}（加 --yes 跳过确认）`);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      const ok = answer.trim().toLowerCase() === "y";
      if (!ok) console.log("已取消。");
      resolve(ok);
    });
  });
}

async function handleMemoryClear(runtime: HarnessRuntime, args: string[]) {
  const dataDir = runtime.context.config.paths.dataDir;
  const yes = args.includes("--yes") || args.includes("-y");
  const wantsAll = args.includes("--all");
  const wantsSessions = wantsAll || args.includes("--sessions");
  const wantsMemories =
    wantsAll ||
    args.includes("--memories") ||
    (!args.includes("--sessions") && !args.includes("--all"));

  const targets: string[] = [];
  if (wantsMemories) targets.push("记忆 (memory.json + SQLite memories)");
  if (wantsSessions) targets.push("会话 (sessions/*.json + events/*.jsonl)");

  const ok = await confirmOrExit(
    `确定要清除以下本地数据吗？\n  - ${targets.join("\n  - ")}\n数据目录: ${dataDir}`,
    yes
  );
  if (!ok) process.exit(0);

  const result = clearLocalData(dataDir, {
    memories: wantsMemories,
    sessions: wantsSessions,
  });
  console.log(
    `✅ 已清除 ${result.removed} 项本地数据（记忆 ${result.memoriesRemoved} 项、会话 ${result.sessionsRemoved} 项）。`
  );
}

// ─── Usage subcommand handlers (P2-B8) ──────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

async function handleUsage(runtime: HarnessRuntime, args: string[]) {
  let days = 7;
  const daysIdx = args.indexOf("--days");
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    const parsed = Number(args[daysIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) days = Math.floor(parsed);
  }
  if (args.includes("--all")) days = 0;

  // 从事件流聚合（truth source）：run_finished / error / tool_call
  const sessionIds = await runtime.events.listSessionIds();
  const events = [];
  for (const sid of sessionIds) {
    const page = await runtime.events.list(sid, {
      types: ["run_finished", "error", "tool_call"],
      limit: 100_000,
    });
    events.push(...page.events);
  }

  const summary = buildUsageSummary(events, { days });
  const periodLabel =
    days > 0
      ? `近 ${summary.days} 天 (${summary.periodFrom} ~ ${summary.periodTo})`
      : `全部历史 (截至 ${summary.periodTo})`;

  console.log(`\n━━━ 用量汇总 · ${periodLabel} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`会话数   : ${summary.sessions}`);
  console.log(
    `执行轮次 : ${summary.runs}（成功 ${summary.runs - summary.failedRuns} / 失败 ${summary.failedRuns}）`
  );
  console.log(
    `Tokens   : 输入 ${formatNumber(summary.tokens.inputTokens)} | 输出 ${formatNumber(summary.tokens.outputTokens)}` +
      ` | 缓存读 ${formatNumber(summary.tokens.cacheReadTokens)} | 缓存写 ${formatNumber(summary.tokens.cacheWriteTokens)}` +
      ` | 总计 ${formatNumber(summary.tokens.totalTokens)}`
  );
  console.log(`费用     : $${summary.costUsd.toFixed(6)}`);

  if (summary.topTools.length > 0) {
    console.log(
      `常用工具 : ${summary.topTools
        .slice(0, 6)
        .map((t) => `${t.name} ×${t.calls}`)
        .join(", ")}`
    );
  }
  if (summary.topModels.length > 0) {
    console.log(
      `常用模型 : ${summary.topModels
        .slice(0, 6)
        .map((m) => `${m.model} ×${m.runs} ($${m.costUsd.toFixed(4)})`)
        .join(", ")}`
    );
  }

  if (summary.bySession.length > 0) {
    console.log(`\n── 按会话 ──`);
    for (const row of summary.bySession.slice(0, 10)) {
      console.log(
        `  ${row.sessionId}  runs=${row.runs} tokens=${formatNumber(row.totalTokens)}` +
          ` tools=${row.toolCalls} $${row.costUsd.toFixed(4)}`
      );
    }
  }
}

// ─── Replay eval subcommand handlers (P1.4) ─────────────────────────────────

/**
 * `hachimi eval --suite <id> [--session <sid>] [--write-baseline] [--fail-on-regression]`
 * 从既有事件流投影轨迹并对照 ReplayExpect 评估，输出 Markdown 报告。
 */
async function handleEval(runtime: HarnessRuntime, args: string[]) {
  const suiteIdx = args.indexOf("--suite");
  const suiteId = suiteIdx !== -1 ? args[suiteIdx + 1] : "all";
  const sessionIdx = args.indexOf("--session");
  const sessionOverride = sessionIdx !== -1 ? args[sessionIdx + 1] : undefined;
  const writeBaseline = args.includes("--write-baseline");
  const failOnRegression = args.includes("--fail-on-regression");
  const dataDir = runtime.context.config.paths?.dataDir ?? "./data";

  const suites = suiteId === "all" ? listSuites() : findSuite(suiteId) ? [findSuite(suiteId)!] : [];
  if (suites.length === 0) {
    console.error(
      `❌ 未知 suite: ${suiteId}。可用: ${listSuites()
        .map((s) => s.id)
        .join(", ")}`
    );
    process.exit(1);
  }

  const verdicts = [];
  for (const suite of suites) {
    const sessionIds = sessionOverride ? [sessionOverride] : (suite.sourceSessionIds ?? []);
    if (sessionIds.length === 0) {
      console.warn(`⚠️ suite ${suite.id} 未指定 sourceSessionIds，使用 --session <id> 提供轨迹来源`);
      continue;
    }
    for (const sid of sessionIds) {
      const { events } = await runtime.events.list(sid, { limit: 100_000 });
      if (events.length === 0) {
        console.warn(`⚠️ 会话 ${sid} 无事件，跳过`);
        continue;
      }
      const trajectory = recordTrajectoryFromEvents(sid, events);
      verdicts.push(evaluateTrajectory(suite.id, suite.name, trajectory, suite.expect));
    }
  }

  if (verdicts.length === 0) {
    console.error("❌ 没有可评估的轨迹。请提供 --session <id> 或配置 suite.sourceSessionIds。");
    process.exit(1);
  }

  const report = renderMarkdown({
    generatedAt: new Date().toISOString(),
    overallPassed: verdicts.every((v) => v.passed),
    verdicts,
  });
  console.log(report);

  if (writeBaseline) {
    const file = saveBaseline(dataDir, verdicts);
    console.log(`\n✅ 基线已写入: ${file}`);
  }
  if (failOnRegression) {
    const regressions = findRegressions(loadBaseline(dataDir), verdicts);
    if (regressions.length > 0) {
      console.error(`\n❌ 回归检测失败: ${regressions.join(", ")} 此前通过、本次失败`);
      process.exit(1);
    }
  }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  // 1) Work subcommand
  if (args[0] === "work") {
    const sub = args[1];
    const runtime = getOrCreateHarnessRuntime();

    if (sub === "list" || !sub) {
      await handleWorkList(runtime);
      return;
    }
    if (sub === "show") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供 Work ID: hachimi work show <id>");
        process.exit(1);
      }
      await handleWorkShow(runtime, id);
      return;
    }
    if (sub === "audit") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供 Work ID: hachimi work audit <id>");
        process.exit(1);
      }
      await handleWorkAudit(runtime, id);
      return;
    }
    if (sub === "create") {
      const intentIdx = args.indexOf("--intent");
      const intent = intentIdx !== -1 ? args[intentIdx + 1] : args[2];
      await handleWorkCreate(runtime, intent || "");
      return;
    }
    console.error(`未知 work 子命令: ${sub}`);
    printHelp();
    process.exit(1);
  }

  // 1.5) Skills subcommand (F5: Proposal Management)
  if (args[0] === "skills" || args[0] === "skill") {
    const sub = args[1];
    const { SkillProposalManager } = await import("@hachimi/core");
    const runtime = getOrCreateHarnessRuntime();
    const pm = new SkillProposalManager(runtime.context.config.paths.dataDir, runtime.skills);

    if (!sub || sub === "list") {
      const skills = runtime.skills.list();
      console.log(`\n━━━ 当前已激活技能 (${skills.length}) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      for (const s of skills) {
        console.log(`  • \x1b[36m${s.name}\x1b[0m — ${s.description}`);
      }
      console.log("\n查看待审核技能提案: hachimi skills proposals\n");
      return;
    }

    if (sub === "proposals") {
      const proposals = pm.listProposals("pending");
      console.log(
        `\n━━━ 待审核技能提案 (${proposals.length}) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      if (proposals.length === 0) {
        console.log("  (暂无待审核的技能提案)\n");
        return;
      }
      for (const p of proposals) {
        console.log(`  ID         : \x1b[33m${p.id}\x1b[0m`);
        console.log(`  名称       : ${p.name}`);
        console.log(`  描述       : ${p.description}`);
        console.log(`  触发条件   : ${p.triggerCondition || "无"}`);
        console.log(`  接受提案   : hachimi skills accept ${p.id}`);
        console.log("  ─".repeat(50));
      }
      return;
    }

    if (sub === "accept") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供提案 ID: hachimi skills accept <id>");
        process.exit(1);
      }
      const res = pm.acceptProposal(id);
      if (res.success) {
        console.log(`✅ 成功接受并激活技能: ${res.skillPath || id}`);
      } else {
        console.error(`❌ 接受失败: ${res.message}`);
      }
      return;
    }

    if (sub === "reject") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供提案 ID: hachimi skills reject <id>");
        process.exit(1);
      }
      const res = pm.rejectProposal(id);
      if (res.success) {
        console.log(`✅ 成功丢弃技能提案: ${id}`);
      } else {
        console.error(`❌ 丢弃失败: ${res.message}`);
      }
      return;
    }
  }

  // 1.75) Session subcommand (P0 Resume Pipeline)
  if (args[0] === "session") {
    const sub = args[1];
    const runtime = getOrCreateHarnessRuntime();

    if (sub === "list" || !sub) {
      await handleSessionList(runtime);
      return;
    }
    if (sub === "show") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供会话 ID: hachimi session show <id>");
        process.exit(1);
      }
      await handleSessionShow(runtime, id);
      return;
    }
    if (sub === "recover") {
      const id = args[2];
      if (!id) {
        console.error("❌ 请提供会话 ID: hachimi session recover <id>");
        process.exit(1);
      }
      await handleSessionRecover(runtime, id);
      return;
    }
    if (sub === "resume") {
      const id = args[2];
      const promptParts = args.slice(3);
      if (!id) {
        console.error('❌ 用法: hachimi session resume <id> "prompt"');
        process.exit(1);
      }
      const prompt = promptParts.join(" ").trim();
      if (!prompt) {
        console.error('❌ 用法: hachimi session resume <id> "prompt"');
        process.exit(1);
      }
      await handleSessionRecover(runtime, id);
      const result = await runCliChannel({
        prompt,
        sessionId: id,
        runtime,
        onChunk: (chunk) => process.stdout.write(chunk),
      });
      if (!result.content) {
        process.stdout.write("\n");
      }
      process.exit(result.success ? 0 : 1);
      return;
    }
    console.error(`未知 session 子命令: ${sub}`);
    printHelp();
    process.exit(1);
  }

  // 1.75) Memory subcommand (P2-B9)
  if (args[0] === "memory") {
    const sub = args[1];
    const runtime = getOrCreateHarnessRuntime();
    if (sub === "clear" || !sub) {
      await handleMemoryClear(runtime, args.slice(2));
      return;
    }
    console.error(`未知 memory 子命令: ${sub}`);
    printHelp();
    process.exit(1);
  }

  // 1.8) Usage subcommand (P2-B8)
  if (args[0] === "usage") {
    const runtime = getOrCreateHarnessRuntime();
    await handleUsage(runtime, args.slice(1));
    return;
  }

  // 1.9) Replay eval subcommand (P1.4)
  if (args[0] === "eval") {
    const runtime = getOrCreateHarnessRuntime();
    await handleEval(runtime, args.slice(1));
    return;
  }

  // 2) Process --export option
  const exportIdx = args.indexOf("--export");
  if (exportIdx !== -1) {
    const filePath = args[exportIdx + 1];
    if (!filePath) {
      console.error("❌ Error: --export option requires specifying output file path.");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const bundle = await runtime.exportBundle({ filePath });
    console.log(`✅ Successfully exported Hachimi data bundle to: ${filePath}`);
    console.log(
      `   Contains long-term memories: ${bundle.memory.longTerm.length} | Sessions: ${bundle.sessions.length}`
    );
    process.exit(0);
  }

  // 3) Process --import option
  const importIdx = args.indexOf("--import");
  if (importIdx !== -1) {
    const filePath = args[importIdx + 1];
    if (!filePath) {
      console.error("❌ Error: --import option requires specifying import file path.");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const result = await runtime.importBundle(filePath);
    console.log(`✅ Successfully imported and merged data bundle: ${filePath}`);
    console.log(
      `   Imported new memories: ${result.importedMemoriesCount} | Skipped duplicate: ${result.skippedMemoriesCount} | Merged sessions: ${result.importedSessionsCount}`
    );
    process.exit(0);
  }

  // 4) Chat / single-run mode
  let outputFormat: "text" | "json" = "text";
  let sessionId: string | undefined;
  let showRecovery = false;
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--print") {
      outputFormat = "text";
    } else if (arg === "-j" || arg === "--json") {
      outputFormat = "json";
    } else if (arg === "-s" || arg === "--session") {
      sessionId = args[++i];
    } else if (arg === "-r" || arg === "--resume") {
      sessionId = args[++i];
      showRecovery = true;
    } else if (arg === "-c" || arg === "--continue") {
      showRecovery = true;
    } else if (!arg.startsWith("-")) {
      promptParts.push(arg);
    }
  }

  const stdinContent = await readStdin();
  const inlinePrompt = promptParts.join(" ").trim();

  let finalPrompt = "";
  if (stdinContent && inlinePrompt) {
    finalPrompt = `${inlinePrompt}\n\n${stdinContent}`;
  } else {
    finalPrompt = inlinePrompt || stdinContent;
  }

  if (!finalPrompt) {
    printHelp();
    process.exit(0);
  }

  const runtime = getOrCreateHarnessRuntime();

  // --continue: 使用最近的会话；--resume/--session: 校验并（如需）重建会话
  if (showRecovery) {
    let targetId = sessionId;
    if (!targetId) {
      const recent = runtime.sessions.list()[0];
      if (!recent) {
        console.error("❌ 没有可继续的会话。先用普通模式发起一次对话。");
        process.exit(1);
      }
      targetId = recent.id;
    }
    const report = await runtime.recoverSession(targetId);
    const statusLabel = RECOVERY_STATUS_LABEL[report.status] || report.status;
    console.error(
      `[会话] ${targetId} — ${statusLabel}（消息 ${report.messageCount} / 事件 ${report.eventCount}）`
    );
    if (report.status === "missing") {
      console.error(`❌ 会话 '${targetId}' 不存在。`);
      process.exit(1);
    }
    if (report.issues.length > 0) {
      for (const issue of report.issues) {
        console.error(`  • ${issue}`);
      }
    }
    sessionId = targetId;
  }

  const isStreamText = outputFormat === "text";

  const result = await runCliChannel({
    prompt: finalPrompt,
    outputFormat,
    sessionId,
    stream: isStreamText,
    runtime,
    onChunk: isStreamText
      ? (chunk) => {
          process.stdout.write(chunk);
        }
      : undefined,
  });

  if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (!isStreamText) {
    console.log(result.content);
  } else {
    process.stdout.write("\n");
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
