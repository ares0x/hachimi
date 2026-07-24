// packages/core/src/tools/registry.ts
import { ToolSandbox } from "../sandbox/sandbox.js";
import type { ToolDefinition } from "../types/index.js";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private sandbox: ToolSandbox = new ToolSandbox();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    options?: { confirm?: boolean; context?: any }
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `未知工具: ${name}`;
    }

    const level = tool.permission ?? "safe";

    if (level === "dangerous" && !options?.confirm) {
      return `需要确认才能执行危险工具: ${name}`;
    }

    if (level === "needs_confirm" && !options?.confirm) {
      return `需要确认才能执行工具: ${name}。请在后续版本中批准。`;
    }

    const execCtx = options?.context || ({} as any);

    if (level === "dangerous") {
      return await this.sandbox.executeToolInSandbox(name, () => tool.execute(args, execCtx));
    }

    try {
      return await tool.execute(args, execCtx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing tool ${name}: ${message}`;
    }
  }
}
