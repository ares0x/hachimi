import { describe, it, expect } from "vitest";
import { SkillRegistry } from "./registry.js";

describe("SkillRegistry model-driven activation tool", () => {
  it("generates activate_skill tool definition and executes skill activation", async () => {
    const registry = new SkillRegistry();
    registry.register({
      name: "writing",
      description: "帮助用户润色文章",
      permission: "safe",
      async load() {
        return {
          instructions: "请提升表达文采。",
        };
      },
    });

    let activatedName = "";
    const tool = registry.getActivationTool((name) => {
      activatedName = name;
    });

    expect(tool.name).toBe("activate_skill");

    const result = await tool.execute({ skill_name: "writing" }, {} as any);
    expect(result).toContain("writing");
    expect(result).toContain("请提升表达文采");
    expect(activatedName).toBe("writing");
  });
});
