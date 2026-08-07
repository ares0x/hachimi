import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryManager } from "./manager.js";

describe("Candidate Draft Memory Guard Suite (Maka 9-Gate pattern)", () => {
  const testMemFile = join(process.cwd(), "data/test_draft_memory.json");
  let memory: MemoryManager;

  beforeEach(() => {
    memory = new MemoryManager(testMemFile);
  });

  afterEach(() => {
    if (existsSync(testMemFile)) {
      rmSync(testMemFile, { force: true });
    }
  });

  it("adds candidate draft memory and excludes it from default search prompts", () => {
    memory.add({
      layer: "long_term",
      content: "Unconfirmed candidate memory draft",
      status: "draft",
    });

    memory.add({
      layer: "long_term",
      content: "Confirmed active user preference memory",
      status: "active",
    });

    const activeResults = memory.search("memory");
    expect(activeResults.length).toBe(1);
    expect(activeResults[0].content).toBe("Confirmed active user preference memory");
  });

  it("promotes candidate draft memory to active status after user confirmation", () => {
    const draft = memory.add({
      layer: "long_term",
      content: "Learned coding preference: prefer TypeScript strict mode",
      status: "draft",
    });

    expect(memory.search("TypeScript").length).toBe(0);

    const confirmed = memory.confirmDraft(draft.id);
    expect(confirmed).toBe(true);

    const activeResults = memory.search("TypeScript");
    expect(activeResults.length).toBe(1);
    expect(activeResults[0].content).toBe(
      "Learned coding preference: prefer TypeScript strict mode"
    );
  });
});
