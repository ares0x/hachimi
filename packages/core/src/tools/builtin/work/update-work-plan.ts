import type { ToolDefinition } from "../../types.js";

export const updateWorkPlanTool: ToolDefinition = {
  name: "update_work_plan",
  description:
    "Updates the step-by-step plan for the current Work (status: pending | running | done | skipped).",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "List of plan steps",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Step title" },
            status: {
              type: "string",
              enum: ["pending", "running", "done", "skipped"],
              description: "Step status",
            },
            description: { type: "string", description: "Optional detailed description" },
          },
          required: ["title", "status"],
        },
      },
    },
    required: ["steps"],
  },
  async execute(args, ctx) {
    const steps = args.steps as
      | Array<{ title: string; status: string; description?: string }>
      | undefined;
    if (!Array.isArray(steps) || steps.length === 0) {
      return "更新失败：steps 必须为非空数组";
    }
    if (ctx?.workManager && ctx.workId) {
      try {
        await ctx.workManager.updatePlan(ctx.workId, steps);
      } catch {
        /* 无 Work 时仅回显 */
      }
    }
    return (
      `[Plan 已更新]: ${steps.length} 步\n` +
      steps.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n")
    );
  },
};
