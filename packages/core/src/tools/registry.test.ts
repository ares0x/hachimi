import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("ToolRegistry permissions", () => {
  it("blocks dangerous tool without confirm", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "rm",
      description: "danger",
      permission: "dangerous",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "should not run";
      },
    });

    const result = await reg.execute("rm", {});
    expect(result).toMatch(/确认|危险/);
  });

  it("runs dangerous tool with confirm", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "rm",
      description: "danger",
      permission: "dangerous",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "done";
      },
    });

    const result = await reg.execute("rm", {}, { confirm: true });
    expect(result).toBe("done");
  });
});
