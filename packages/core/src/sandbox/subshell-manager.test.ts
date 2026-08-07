// packages/core/src/sandbox/subshell-manager.test.ts
import { describe, expect, it } from "vitest";
import { SubshellManager } from "./subshell-manager.js";

describe("SubshellManager Process Pool", () => {
  it("spawns command and captures stdout output", async () => {
    const manager = new SubshellManager();
    const task = manager.spawnSubshell("echo 'hello subshell'");

    expect(task.id).toMatch(/^task_proc_/);
    expect(task.status).toBe("running");

    await new Promise((resolve) => setTimeout(resolve, 500));

    const updated = manager.getTask(task.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.outputBuffer.join("\n")).toContain("hello subshell");
  });

  it("can list running tasks and kill process cleanly", async () => {
    const manager = new SubshellManager();
    const task = manager.spawnSubshell("sleep 10");

    expect(task.status).toBe("running");
    expect(manager.listTasks().length).toBeGreaterThan(0);

    const killed = manager.killProcess(task.id);
    expect(killed).toBe(true);

    const updated = manager.getTask(task.id);
    expect(updated?.status).toBe("killed");
  });
});
