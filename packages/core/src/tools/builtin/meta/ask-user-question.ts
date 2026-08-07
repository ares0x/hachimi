// packages/core/src/tools/builtin/meta/ask-user-question.ts
import type { ToolDefinition } from "../../types.js";

export const askUserQuestionTool: ToolDefinition = {
  name: "ask_user_question",
  kind: "read",
  description:
    "Asks the user a structured multi-choice question to clarify design decisions, pick solutions, or resolve ambiguous requirements.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question prompt to ask the user" },
      options: {
        type: "array",
        description: "Array of selectable option strings for the user to choose from",
        items: { type: "string" },
      },
    },
    required: ["question", "options"],
  },
  async execute(args, ctx) {
    const question = String(args.question ?? "").trim();
    const options = (args.options as string[]) || [];

    if (!question) return "[Error] Question cannot be empty";
    if (options.length === 0) return "[Error] At least one option must be provided";

    // P1: 若交互面注入了 onUserQuestion，真正向用户提问并返回其选择
    if (ctx?.onUserQuestion) {
      const answer = await ctx.onUserQuestion(question, options);
      if (answer !== undefined && answer.trim() !== "") {
        return `[User Answered] ${answer.trim()}`;
      }
      return `[User Question Skipped] 用户跳过了问题：${question}`;
    }

    const formattedOpts = options.map((opt, idx) => `  ${idx + 1}. ${opt}`).join("\n");
    return `[User Question Prompted]\nQuestion: ${question}\nOptions:\n${formattedOpts}\nAwaiting user selection...`;
  },
};
