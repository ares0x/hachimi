import { describe, expect, it } from "vitest";
import { PathJail } from "../../../sandbox/path-jail.js";
import { askUserQuestionTool } from "../meta/ask-user-question.js";
import { todoWriteTool } from "../meta/todo-write.js";
import { captureTerminalTool } from "../shell/capture-terminal.js";
import { codeSnipTool } from "./code-snip.js";
import { globFilesTool } from "./glob-files.js";

describe("Migrated Claude Code Tools Suite", () => {
  const jail = new PathJail({ workspaceRoot: process.cwd() });
  const ctx = { jail, sessionId: "test_session_123" } as any;

  it("glob_files matches file patterns in workspace", async () => {
    const res = await globFilesTool.execute({ pattern: "package.json" }, ctx);
    expect(res).toContain("package.json");
  });

  it("code_snip extracts symbols from source file", async () => {
    const res = await codeSnipTool.execute({ path: "packages/core/src/index.ts" }, ctx);
    expect(res).toContain("Code Snip Outline");
    expect(res.length).toBeGreaterThan(30);
  });

  it("todo_write tracks dynamic in-session todos", async () => {
    const res = await todoWriteTool.execute(
      {
        todos: [
          { text: "Fix UI layout", status: "completed" },
          { text: "Run unit tests", status: "in_progress" },
        ],
      },
      ctx
    );
    expect(res).toContain("Todo List Updated");
    expect(res).toContain("Fix UI layout");
  });

  it("ask_user_question formats question with choices", async () => {
    const res = await askUserQuestionTool.execute(
      {
        question: "Select database dialect",
        options: ["SQLite", "PostgreSQL"],
      },
      ctx
    );
    expect(res).toContain("User Question Prompted");
    expect(res).toContain("1. SQLite");
  });

  it("capture_terminal_output lists subshell processes", async () => {
    const res = await captureTerminalTool.execute({}, ctx);
    expect(res).toBeDefined();
    expect(typeof res).toBe("string");
  });
});
