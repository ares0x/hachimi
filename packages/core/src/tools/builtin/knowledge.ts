import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { generateId } from "@hachimi/shared";
import type { ToolDefinition } from "../types.js";

/**
 * Built-in Personal Knowledge Base Tools.
 * Provides dedicated, safe access to the user's knowledge base directory (notes / vault)
 * without requiring arbitrary shell commands or manual path resolution.
 */

export const searchKnowledgeNotesTool: ToolDefinition = {
  name: "search_knowledge_notes",
  kind: "search",
  group: "knowledge",
  description: "Searches markdown notes inside the user's personal knowledge base by keyword.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  isConcurrencySafe: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term or keyword to find in notes" },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = String(args.query ?? "").trim();
    if (!query) return "[Error] Query cannot be empty";

    const knowledgeRoot = ctx?.jail?.getKnowledgeRoot();
    if (!knowledgeRoot || !existsSync(knowledgeRoot)) {
      return "[知识库] 未挂载知识库路径，请先在配置中指定 knowledgeRoot（个人知识库路径）。";
    }

    const matches: Array<{ file: string; line: number; text: string }> = [];

    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
          try {
            const raw = readFileSync(full, "utf-8");
            const lines = raw.split("\n");
            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query.toLowerCase())) {
                matches.push({
                  file: relative(knowledgeRoot, full),
                  line: idx + 1,
                  text: line.trim().slice(0, 150),
                });
              }
            });
          } catch {
            /* ignore read error */
          }
        }
      }
    };

    try {
      walk(knowledgeRoot);
      if (matches.length === 0) {
        return `[知识库检索] 未在知识库中找到包含 "${query}" 的笔记。`;
      }

      const capped = matches.slice(0, 20);
      const formatted = capped.map((m) => `- \`${m.file}\` (L${m.line}): ${m.text}`).join("\n");
      return `[知识库检索 (${matches.length} 处匹配)]\n${formatted}`;
    } catch (err: any) {
      return `[知识库检索错误]: ${err?.message || String(err)}`;
    }
  },
};

export const readKnowledgeNoteTool: ToolDefinition = {
  name: "read_knowledge_note",
  kind: "read",
  group: "knowledge",
  description: "Reads the full content of a specific markdown note in the personal knowledge base.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  isConcurrencySafe: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative file path of the note within the knowledge base (e.g. 'Projects/Hachimi.md')",
      },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const relativePath = String(args.path ?? "").trim();
    if (!relativePath) return "[Error] Note path cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const knowledgeRoot = ctx.jail.getKnowledgeRoot();
      const safePath = ctx.jail.assertPathInJail(
        relativePath,
        "read_knowledge_note",
        true,
        knowledgeRoot
      );

      if (!existsSync(safePath)) {
        return `[Note Not Found] 未在知识库中找到笔记: ${relativePath}`;
      }

      const content = readFileSync(safePath, "utf-8");
      return `=== Knowledge Note: ${relativePath} ===\n${content}`;
    } catch (err: any) {
      return `[Read Note Error]: ${err?.message || String(err)}`;
    }
  },
};

export const createInboxNoteTool: ToolDefinition = {
  name: "create_inbox_note",
  kind: "write",
  group: "knowledge",
  description:
    "Creates or appends a new markdown note in the user's knowledge inbox (_inbox) directory.",
  permission: "safe", // Inbox writes are safe and isolated to knowledgeWriteRoot
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the note (used as filename)" },
      content: { type: "string", description: "Markdown body content for the note" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of tags (e.g. ['#hachimi', '#idea'])",
      },
    },
    required: ["title", "content"],
  },
  async execute(args, ctx) {
    const title = String(args.title ?? "").trim();
    const content = String(args.content ?? "").trim();
    const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];

    if (!title) return "[Error] Title cannot be empty";

    const knowledgeWriteRoot =
      ctx?.jail?.getKnowledgeWriteRoot() ||
      (ctx?.jail?.getKnowledgeRoot() ? join(ctx.jail.getKnowledgeRoot()!, "_inbox") : null);

    if (!knowledgeWriteRoot) {
      return "[知识库] 未配置知识库收件箱写入路径 (knowledgeWriteRoot)。";
    }

    try {
      if (!existsSync(knowledgeWriteRoot)) {
        mkdirSync(knowledgeWriteRoot, { recursive: true });
      }

      const cleanFileName = title.replace(/[/\\?%*:|"<>]/g, "-").replace(/\.md$/i, "");
      const targetPath = join(knowledgeWriteRoot, `${cleanFileName}.md`);

      const dateStr = new Date().toISOString().slice(0, 10);
      const tagStr = tags.length > 0 ? tags.join(" ") : "#hachimi/inbox";

      const fileHeader = `---
title: "${title}"
created: ${dateStr}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
---

# ${title}

${tagStr}

`;

      const fullBody = `${fileHeader}${content}\n`;
      writeFileSync(targetPath, fullBody, "utf-8");

      return `[Inbox Note Created] 已成功在知识库收件箱创建笔记: \`${cleanFileName}.md\`\n路径: \`${targetPath}\``;
    } catch (err: any) {
      return `[Create Note Error]: ${err?.message || String(err)}`;
    }
  },
};
