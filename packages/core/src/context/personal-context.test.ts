import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextBuilder } from "./builder.js";
import { PersonalContextLoader } from "./personal-context.js";
import { PathJail } from "../sandbox/path-jail.js";
import { ToolRegistry } from "../tools/registry.js";

describe("Phase H7 & Phase PC: Multi-Root PathJail and PersonalContext (SOUL + TELOS) Suite", () => {
  const testDir = join(__dirname, "../../data-test-pc");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("H7.2: PathJail supports multi-named roots with read-only knowledgeRoot and write inbox", () => {
    const workspaceRoot = join(testDir, "workspace");
    const knowledgeRoot = join(testDir, "second-brain");
    const inbox = join(knowledgeRoot, "_inbox");
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(inbox, { recursive: true });

    const jail = new PathJail({
      workspaceRoot,
      knowledgeRoot,
    });

    // 1. Workspace is read/write allowed
    expect(jail.assertPathInJail(join(workspaceRoot, "src/main.ts"), "write", false)).toContain(
      "src/main.ts"
    );

    // 2. Second Brain vault is read-only allowed
    expect(jail.assertPathInJail(join(knowledgeRoot, "notes/idea.md"), "read", true)).toContain(
      "idea.md"
    );

    // 3. Second Brain vault root write is BLOCKED
    expect(() =>
      jail.assertPathInJail(join(knowledgeRoot, "notes/idea.md"), "write", false)
    ).toThrow("知识库只读保护");

    // 4. Second Brain _inbox folder write is ALLOWED
    expect(jail.assertPathInJail(join(inbox, "draft.md"), "write", false)).toContain("draft.md");
  });

  it("PC1: PersonalContextLoader loads SOUL.md and TELOS files into ContextBuilder static prefix", async () => {
    const soulPath = join(testDir, "SOUL.md");
    const telosRoot = join(testDir, "telos");
    mkdirSync(telosRoot, { recursive: true });

    writeFileSync(soulPath, "保持简洁地用 Markdown 回答。");
    writeFileSync(join(telosRoot, "MISSION.md"), "构建最强个人 Agent Runtime。");
    writeFileSync(join(telosRoot, "GOALS.md"), "1. 本地优先 2. 单脑多表面");

    const loader = new PersonalContextLoader({
      soulPath,
      telosRoot,
    });

    const ctx = loader.load();
    expect(ctx.hasSoul).toBe(true);
    expect(ctx.hasTelos).toBe(true);
    expect(ctx.soul).toContain("保持简洁");
    expect(ctx.telos).toContain("构建最强个人 Agent Runtime");

    const builder = new ContextBuilder();
    const built = await builder.build({
      personalContext: {
        soul: ctx.soul,
        telos: ctx.telos,
      },
    });

    expect(built.systemPrompt).toContain("【个人 SOUL 指引】");
    expect(built.systemPrompt).toContain("【TELOS 个人对齐】");
    expect(built.systemPrompt.indexOf("SOUL")).toBeLessThan(
      built.systemPrompt.indexOf("【可用工具")
    );
  });

  it("PC-W1 & PC-W2 & PC-W4: ToolRegistry sandbox and getStatus observability", () => {
    const registry = new ToolRegistry();
    const workspaceRoot = join(testDir, "workspace");
    const knowledgeRoot = join(testDir, "second-brain");
    const inbox = join(knowledgeRoot, "_inbox");
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(inbox, { recursive: true });

    registry.setWorkspaceRoot(workspaceRoot);
    registry.setKnowledgeRoots(knowledgeRoot, inbox);

    const execCtx = (registry as any).buildExecContext();
    expect(execCtx.jail.assertPathInJail(join(inbox, "draft.md"), "write", false)).toContain(
      "draft.md"
    );
    expect(() =>
      execCtx.jail.assertPathInJail(join(knowledgeRoot, "root.md"), "write", false)
    ).toThrow();
  });
});
