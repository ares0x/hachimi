// packages/core/src/tools/builtin/meta/load-tools.ts
import type { ToolDefinition } from "../../../types/index.js";
import type { ToolRegistry } from "../../registry.js";

/**
 * P2-B3: load_tools — activates a tool group on demand (Maka economy pattern).
 * Registered via registerBuiltinTools so the closure can reach the registry.
 * Always advertised: it carries no `group`, and ToolRegistry.list() keeps it
 * visible even when tool gating is enabled.
 */
export function createLoadToolsTool(registry: ToolRegistry): ToolDefinition {
  return {
    name: "load_tools",
    kind: "meta",
    description:
      "Activates a gated tool group (e.g. 'browser', 'search', 'git', 'knowledge') so its tools become available for the rest of this session. Call this when the user asks for something the currently available tools cannot do. Returns the newly loaded tools and the list of available groups.",
    permission: "safe",
    readOnly: true,
    isIdempotent: true,
    isConcurrencySafe: true,
    parameters: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            "Tool group name to activate. Available: browser, search, git, knowledge (plus any MCP groups).",
        },
      },
      required: ["group"],
    },
    execute: async (args) => {
      const group = String(args.group ?? "").trim();
      const loaded = registry.loadToolGroup(group);
      if (loaded.length === 0) {
        const groups = registry.listGroups();
        if (!groups.some((g) => g.name === group)) {
          return `工具组 '${group}' 不存在。可用工具组: ${groups.map((g) => g.name).join(", ")}。`;
        }
        // 已激活/门控关闭场景：仍通过 addedToolNames 协议公布组内工具，
        // 保证延迟工具注入（P2.3）模式下模型能拿到组内工具名。
        const groupTools = groups.find((g) => g.name === group)?.tools ?? [];
        return (
          `[addedToolNames: ${groupTools.join(", ")}] 工具组 '${group}' 已激活。` +
          `组内工具: ${groupTools.join(", ")}。当前激活组: ${
            registry.getActivatedGroups().join(", ") || "（无）"
          }。`
        );
      }
      const active = registry.getActivatedGroups();
      return (
        `[addedToolNames: ${loaded.join(", ")}] 已激活工具组 '${group}'，新公布工具: ${loaded.join(", ")}。` +
        `当前激活组: ${active.join(", ") || "（无）"}。`
      );
    },
  };
}
