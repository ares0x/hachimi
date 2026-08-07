// packages/core/src/tools/builtin/meta/plan-mode.ts
// P0-2: Plan Mode — 规划-审批-执行闭环（Grok Build / Claude Code plan 模式）
//
// 计划模式是只读探索 + 计划编写阶段：
//   - enter_plan_mode 需要用户批准，进入后除只读工具外仅允许计划/提问工具
//   - update_work_plan 是唯一允许的"写入"（写入 Work plan，由 PlanModeGuard 放行）
//   - exit_plan_mode 需要用户批准，退出后恢复完整工具能力
import type { ToolDefinition } from "../../types.js";

function planSummary(planText?: string): string {
  if (!planText) return "(尚无计划，请在计划模式下使用 update_work_plan 编写)";
  return planText.length > 800 ? `${planText.slice(0, 800)}…` : planText;
}

export const enterPlanModeTool: ToolDefinition = {
  name: "enter_plan_mode",
  kind: "meta",
  description:
    "Enters plan mode: read-only exploration and plan writing before making code changes. Requires user approval. While in plan mode, only read-only tools and plan updates are allowed.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "What to plan (e.g. feature, refactor, architecture decision)",
      },
    },
  },
  async execute(args, ctx) {
    if (!ctx?.sessionMode) {
      return "[Error] 计划模式需要运行时注入 sessionMode（当前执行链未提供）";
    }
    if (ctx.sessionMode.get() === "plan") {
      return "[Plan Mode] 已在计划模式中。使用 update_work_plan 编写/更新计划，完成后调用 exit_plan_mode。";
    }
    ctx.sessionMode.set("plan");
    const topic = String(args.topic ?? "").trim();
    return (
      `[Plan Mode] 已进入计划模式（需要你批准才能生效执行阶段）。\n` +
      (topic ? `主题: ${topic}\n` : "") +
      `规则：\n` +
      `  1. 只读探索代码库，禁止修改任何文件（仅 update_work_plan 例外）\n` +
      `  2. 使用 update_work_plan 编写分步实施计划\n` +
      `  3. 使用 ask_user_question 澄清歧义\n` +
      `  4. 完成计划后调用 exit_plan_mode 提交计划等待批准`
    );
  },
};

export const exitPlanModeTool: ToolDefinition = {
  name: "exit_plan_mode",
  kind: "meta",
  description:
    "Exits plan mode and presents the written plan for approval. Requires user approval. After approval, normal tool access (including file writes and shell commands) is restored.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute(args, ctx) {
    if (!ctx?.sessionMode) {
      return "[Error] 计划模式需要运行时注入 sessionMode（当前执行链未提供）";
    }
    if (ctx.sessionMode.get() !== "plan") {
      return "[Plan Mode] 当前不在计划模式中。如需要规划，请先调用 enter_plan_mode。";
    }
    let planText: string | undefined;
    const work = ctx.workManager?.get?.(ctx.workId);
    const steps = work?.plan;
    if (Array.isArray(steps)) {
      planText = steps
        .map(
          (s: { title?: string; status?: string; description?: string }, i: number) =>
            `${i + 1}. [${s.status ?? "pending"}] ${s.title ?? ""}${s.description ? ` — ${s.description}` : ""}`
        )
        .join("\n");
    }

    ctx.sessionMode.set("normal");
    return (
      `[Plan Mode] 已退出计划模式，计划如下（需你确认后开始执行）：\n\n` +
      planSummary(planText || undefined)
    );
  },
};
