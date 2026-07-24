// packages/core/src/runtime/runtime.test.ts
import { describe, expect, it } from "vitest";
import { createAgentSession, createAppContext } from "./index.js";

describe("Core Runtime SDK Exports", () => {
  it("createAppContext instantiates full infrastructure context", () => {
    const ctx = createAppContext({ providerOverride: "mock" });

    expect(ctx.config).toBeDefined();
    expect(ctx.agent).toBeDefined();
    expect(ctx.memory).toBeDefined();
    expect(ctx.sessions).toBeDefined();
    expect(ctx.tools).toBeDefined();
    expect(ctx.skills).toBeDefined();
  });

  it("createAgentSession creates and runs a session", async () => {
    const session = createAgentSession({ provider: "mock" });

    expect(session.sessionId).toBeDefined();
    const reply = await session.run("Hello from SDK test");
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);
  });
});
