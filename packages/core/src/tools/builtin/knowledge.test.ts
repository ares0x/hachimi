import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathJail } from "../../sandbox/path-jail.js";
import {
  createInboxNoteTool,
  readKnowledgeNoteTool,
  searchKnowledgeNotesTool,
} from "./knowledge.js";

describe("Second Brain / Obsidian Native Tools Suite", () => {
  const testVaultDir = join(process.cwd(), "data/test_obsidian_vault");
  const inboxDir = join(testVaultDir, "_inbox");
  let jail: PathJail;

  beforeEach(() => {
    if (!existsSync(testVaultDir)) {
      mkdirSync(testVaultDir, { recursive: true });
    }
    if (!existsSync(inboxDir)) {
      mkdirSync(inboxDir, { recursive: true });
    }
    writeFileSync(
      join(testVaultDir, "Architecture.md"),
      "# Hachimi Architecture\n- Subsystem: Core Runtime\n- Goal: Production Usable Agent Harness",
      "utf-8"
    );
    jail = new PathJail({
      workspaceRoot: process.cwd(),
      knowledgeRoot: testVaultDir,
      knowledgeWriteRoot: inboxDir,
    });
  });

  afterEach(() => {
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }
  });

  it("searches markdown notes inside Obsidian Vault by query", async () => {
    const result = await searchKnowledgeNotesTool.execute(
      { query: "Production Usable" },
      { jail, workspaceRoot: process.cwd() }
    );
    expect(result).includes("Architecture.md");
    expect(result).includes("Production Usable Agent Harness");
  });

  it("reads content of a specific note inside the knowledge base", async () => {
    const result = await readKnowledgeNoteTool.execute(
      { path: "Architecture.md" },
      { jail, workspaceRoot: process.cwd() }
    );
    expect(result).includes("=== Knowledge Note: Architecture.md ===");
    expect(result).includes("Core Runtime");
  });

  it("creates a new markdown note in the knowledge inbox", async () => {
    const result = await createInboxNoteTool.execute(
      {
        title: "Daily Reflections",
        content: "Completed Phase 2 and Phase 3 harness hardening.",
        tags: ["#hachimi", "#roadmap"],
      },
      { jail, workspaceRoot: process.cwd() }
    );

    expect(result).includes("已成功在知识库收件箱创建笔记");
    const targetFile = join(inboxDir, "Daily Reflections.md");
    expect(existsSync(targetFile)).toBe(true);
    const content = readFileSync(targetFile, "utf-8");
    expect(content).includes("Completed Phase 2 and Phase 3");
    expect(content).includes("#hachimi");
  });
});
