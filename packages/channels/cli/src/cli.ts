#!/usr/bin/env node
// packages/channels/cli/src/cli.ts
import type { Work, WorkSummary } from "@hachimi/core";
import { getOrCreateHarnessRuntime, type HarnessRuntime, type WorkStatus } from "@hachimi/core";
import { runCliChannel } from "./index.js";

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
  failed: "已失败",
  archived: "已归档",
};

const STATUS_COLOR: Record<WorkStatus, string> = {
  active: "\x1b[34m",
  waiting: "\x1b[33m",
  blocked: "\x1b[31m",
  completed: "\x1b[32m",
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
    const idShort = w.id.length > 12 ? w.id.slice(0, 12) + "…" : w.id;
    const title = w.title.length > 42 ? w.title.slice(0, 42) + "…" : w.title;
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
          body = act.content.length > 100 ? act.content.slice(0, 100) + "…" : act.content;
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

    if (!sub || sub === "-h" || sub === "--help") {
      console.log(`
Usage:
  hachimi work list
  hachimi work show   <workId>
  hachimi work audit  <workId>
  hachimi work create --intent "..."
`);
      process.exit(0);
    }

    switch (sub) {
      case "list":
        await handleWorkList(runtime);
        process.exit(0);
        break;
      case "show": {
        const id = args[2];
        if (!id) {
          console.error("❌ hachimi work show <workId>");
          process.exit(1);
        }
        await handleWorkShow(runtime, id);
        process.exit(0);
        break;
      }
      case "audit": {
        const id = args[2];
        if (!id) {
          console.error("❌ hachimi work audit <workId>");
          process.exit(1);
        }
        await handleWorkAudit(runtime, id);
        process.exit(0);
        break;
      }
      case "create": {
        const intentIdx = args.indexOf("--intent");
        const intent = intentIdx !== -1 ? args[intentIdx + 1] : args.slice(2).join(" ");
        await handleWorkCreate(runtime, intent || "");
        process.exit(0);
        break;
      }
      default:
        console.error(`❌ 未知 work 子命令: ${sub}。支持 list / show / audit / create`);
        process.exit(1);
        break;
    }
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
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--print") {
      outputFormat = "text";
    } else if (arg === "-j" || arg === "--json") {
      outputFormat = "json";
    } else if (arg === "-s" || arg === "--session") {
      sessionId = args[++i];
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
