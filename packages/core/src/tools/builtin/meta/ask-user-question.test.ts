import { describe, expect, it } from "vitest";
import { askUserQuestionTool } from "./ask-user-question.js";

describe("ask_user_question", () => {
  it("returns the user's selected option when an interactive handler is wired", async () => {
    const res = await askUserQuestionTool.execute(
      { question: "用哪个方案？", options: ["A", "B", "C"] },
      {
        onUserQuestion: async (_q: string, opts: string[]) => opts[1],
      } as any
    );
    expect(res).toBe("[User Answered] B");
  });

  it("reports skipped question when handler returns undefined", async () => {
    const res = await askUserQuestionTool.execute({ question: "继续吗？", options: ["是", "否"] }, {
      onUserQuestion: async () => undefined,
    } as any);
    expect(res).toContain("[User Question Skipped]");
  });

  it("degrades gracefully without an interactive handler", async () => {
    const res = await askUserQuestionTool.execute(
      { question: "继续吗？", options: ["是", "否"] },
      undefined
    );
    expect(res).toContain("[User Question Prompted]");
    expect(res).toContain("Awaiting user selection");
  });
});
