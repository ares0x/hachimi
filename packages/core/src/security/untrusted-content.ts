/**
 * P2-B2: Untrusted-content tagging.
 *
 * External content (web pages, MCP server output, fetched documents) is a
 * prompt-injection vector. Before it enters the model context, wrap it so the
 * model can tell "instructions from the operator" from "bytes from the
 * internet". Pattern: Kun `wrapUntrustedContent`.
 *
 * The tag is applied at the context-assembly seam only — the raw tool result
 * stays untagged in RuntimeEvent / Activity so the UI shows clean output.
 */

/** Tool names treated as untrusted sources by default. */
export const UNTRUSTED_TOOL_NAMES: ReadonlySet<string> = new Set([
  "web_search",
  "stock_quote",
  "fetch_url",
  "capture_terminal",
]);

/** Tool-name prefixes treated as untrusted (MCP servers are external code). */
export const UNTRUSTED_TOOL_PREFIXES: readonly string[] = ["mcp_", "mcp__"];

/** True if a tool's output should be treated as untrusted content. */
export function isUntrustedTool(toolName: string | undefined): boolean {
  if (!toolName) return false;
  if (UNTRUSTED_TOOL_NAMES.has(toolName)) return true;
  return UNTRUSTED_TOOL_PREFIXES.some((p) => toolName.startsWith(p));
}

/** Wrap untrusted content so the model treats it as data, not instructions. */
export function wrapUntrustedContent(content: string, source: string): string {
  const safeSource = source.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return [`<untrusted-content source="${safeSource}">`, content, "</untrusted-content>"].join("\n");
}

/** Convenience wrapper for tool results (uses the tool name as source). */
export function wrapToolResultIfUntrusted(toolName: string | undefined, content: string): string {
  if (!isUntrustedTool(toolName)) return content;
  return wrapUntrustedContent(content, toolName ?? "external");
}
