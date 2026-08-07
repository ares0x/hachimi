// packages/core/src/tools/builtin/git/git-tools.ts
import { execSync } from "node:child_process";
import type { ToolDefinition } from "../../types.js";

export const gitStatusTool: ToolDefinition = {
  name: "git_status",
  kind: "read",
  group: "git",
  description: "Runs git status to check modified, untracked, and staged files in the workspace.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Optional working directory path" },
    },
  },
  async execute(args, ctx) {
    try {
      const cwd = (args.cwd as string) || (ctx?.jail ? ctx.jail.getWorkspaceRoot() : process.cwd());
      const out = execSync("git status --short", { cwd, encoding: "utf-8" });
      return out.trim() ? `[Git Status]:\n${out.trim()}` : "[Git Status]: Working tree clean.";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Git Status Error]: ${msg}`;
    }
  },
};

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  kind: "read",
  group: "git",
  description: "Runs git diff to inspect pending uncommitted line changes.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Optional specific file path to diff" },
    },
  },
  async execute(args, ctx) {
    try {
      const cwd = ctx?.jail ? ctx.jail.getWorkspaceRoot() : process.cwd();
      const filePath = args.path ? String(args.path) : "";
      const cmd = filePath ? `git diff -- "${filePath}"` : "git diff";
      const out = execSync(cmd, { cwd, encoding: "utf-8" });
      return out.trim()
        ? `[Git Diff]:\n${out.slice(0, 4000)}${out.length > 4000 ? "\n...[Diff Truncated]" : ""}`
        : "[Git Diff]: No uncommitted changes.";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Git Diff Error]: ${msg}`;
    }
  },
};

export const gitLogTool: ToolDefinition = {
  name: "git_log",
  kind: "read",
  group: "git",
  description: "Inspects recent git commits history.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      maxCount: { type: "number", description: "Number of commits to retrieve (default 5)" },
    },
  },
  async execute(args, ctx) {
    try {
      const cwd = ctx?.jail ? ctx.jail.getWorkspaceRoot() : process.cwd();
      const count = Number(args.maxCount || 5);
      const out = execSync(`git log -n ${count} --oneline`, { cwd, encoding: "utf-8" });
      return `[Git Log (Last ${count} Commits)]:\n${out.trim()}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Git Log Error]: ${msg}`;
    }
  },
};
