import { ToolSandbox } from "../sandbox/sandbox.js";
import type { ToolDefinition } from "../types/index.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private sandbox: ToolSandbox;

  constructor(sandbox?: ToolSandbox) {
    this.sandbox = sandbox ?? new ToolSandbox();
  }

  setSandbox(sandbox: ToolSandbox): void {
    this.sandbox = sandbox;
  }

  register(tool: ToolDefinition) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
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
    options?: { confirm?: boolean }
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);

    const level = tool.permission ?? "safe";

    if (level === "dangerous" && !options?.confirm) {
      return `需要确认才能执行危险工具: ${name}`;
    }

    if (level === "needs_confirm" && !options?.confirm) {
      return `需要确认才能执行工具: ${name}。请在后续版本中批准。`;
    }

    if (level === "dangerous") {
      return await this.sandbox.executeToolInSandbox(name, () => tool.execute(args));
    }

    try {
      return await tool.execute(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing tool ${name}: ${message}`;
    }
  }
}
