// packages/core/src/tools/builtin/memory.ts
import type { MemoryManager } from "../../memory/manager.js";
import type { ToolDefinition } from "../../types/index.js";

export function createMemoryTools(memory: MemoryManager): ToolDefinition[] {
  return [
    {
      name: "save_memory",
      description: "保存重要的用户偏好、事实或决策到长期记忆中",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "需要记住的具体信息" },
        },
        required: ["content"],
      },
      async execute(args: Record<string, unknown>) {
        const content = String(args.content ?? "").trim();
        if (!content) return "[错误] 记忆内容不能为空";
        memory.remember(content, 0.75);
        return `好的，我已经记住了：${content}`;
      },
    },
  ];
}
