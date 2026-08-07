// packages/core/src/tools/builtin/meta/manage-config.ts
import type { ToolDefinition } from "../../types.js";

export const manageConfigTool: ToolDefinition = {
  name: "manage_config",
  kind: "read",
  description:
    "Inspects current Harness runtime configuration, environment variables, active providers, and PathJail sandbox settings.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "list_all"],
        description: "Action to perform ('get' or 'list_all')",
      },
      key: {
        type: "string",
        description: "Optional config key name to inspect (e.g. 'workspaceRoot', 'activeProvider')",
      },
    },
    required: ["action"],
  },
  async execute(args, ctx) {
    const action = String(args.action ?? "list_all");
    const key = args.key ? String(args.key).trim() : "";

    const configDump: Record<string, any> = {
      workspaceRoot: ctx?.jail?.getWorkspaceRoot() || process.cwd(),
      sessionId: ctx?.sessionId || "N/A",
      channel: (ctx as any)?.channel || "cli",
      nodeEnv: process.env.NODE_ENV || "development",
      platform: process.platform,
      arch: process.arch,
    };

    if (action === "get" && key) {
      const val = configDump[key] ?? process.env[key] ?? "[Key Not Found]";
      return `[Config Key "${key}"]: ${String(val)}`;
    }

    return `[Harness Runtime Config Dump]:\n${JSON.stringify(configDump, null, 2)}`;
  },
};
