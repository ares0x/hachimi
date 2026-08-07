// packages/core/src/tools/builtin/meta/todo-write.ts
import { generateId } from "@hachimi/shared";
import type { ToolDefinition } from "../../types.js";

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

// In-session memory store for active session todos
const activeSessionTodos = new Map<string, TodoItem[]>();

export const todoWriteTool: ToolDefinition = {
  name: "todo_write",
  kind: "write",
  description:
    "Creates or updates a structured task/todo list for tracking multi-step coding plans and operations. Mark tasks as 'in_progress' when starting and 'completed' when done.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        description: "List of todo items to set or update",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Optional todo ID" },
            text: { type: "string", description: "Task description" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "Status of the todo task",
            },
          },
          required: ["text", "status"],
        },
      },
    },
    required: ["todos"],
  },
  async execute(args, ctx) {
    const rawTodos = (args.todos as any[]) || [];
    const sessionId = ctx?.sessionId || "default_session";

    const formattedTodos: TodoItem[] = rawTodos.map((t, idx) => ({
      id: t.id ? String(t.id) : `todo_${idx + 1}_${generateId().slice(0, 4)}`,
      text: String(t.text ?? ""),
      status: (["pending", "in_progress", "completed"].includes(t.status)
        ? t.status
        : "pending") as TodoItem["status"],
    }));

    activeSessionTodos.set(sessionId, formattedTodos);

    const completed = formattedTodos.filter((t) => t.status === "completed").length;
    const inProgress = formattedTodos.filter((t) => t.status === "in_progress").length;
    const pending = formattedTodos.filter((t) => t.status === "pending").length;

    const summaryList = formattedTodos
      .map((t) => {
        const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "⏳" : "○";
        return `  ${icon} [${t.status}] ${t.text}`;
      })
      .join("\n");

    return `[Todo List Updated] (${completed}/${formattedTodos.length} completed, ${inProgress} in progress, ${pending} pending):\n${summaryList}`;
  },
};

export function getSessionTodos(sessionId: string): TodoItem[] {
  return activeSessionTodos.get(sessionId) || [];
}
