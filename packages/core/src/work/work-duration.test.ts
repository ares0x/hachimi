// packages/core/src/work/work-duration.test.ts
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IEventStore } from "../events/event-store.js";
import type { RuntimeEvent } from "../types/event.js";
import { WorkManager } from "./work-manager.js";

function makeFakeStore(events: RuntimeEvent[]): IEventStore {
  return {
    async append() {
      /* no-op */
    },
    async list() {
      return { events, total: events.length };
    },
    async tail() {
      return events;
    },
    async hasEvents() {
      return events.length > 0;
    },
    async listSessionIds() {
      return ["sess_1"];
    },
    async delete() {
      /* no-op */
    },
  };
}

describe("WorkManager Activity duration projection", () => {
  const testDir = join(process.cwd(), "data-test-v1-duration");

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("propagates tool_result.durationMs into the timeline activity", async () => {
    const events: RuntimeEvent[] = [
      {
        id: "evt_1",
        sessionId: "sess_1",
        type: "tool_call",
        timestamp: "2026-08-06T08:00:00.000Z",
        payload: { toolCallId: "call_1", toolName: "web_search", args: { query: "金价" } },
      },
      {
        id: "evt_2",
        sessionId: "sess_1",
        type: "tool_result",
        timestamp: "2026-08-06T08:00:01.200Z",
        payload: {
          toolCallId: "call_1",
          toolName: "web_search",
          result: "results",
          isError: false,
          durationMs: 1200,
        },
      },
      {
        id: "evt_3",
        sessionId: "sess_1",
        type: "thinking",
        timestamp: "2026-08-06T08:00:01.500Z",
        payload: { content: "先搜索，再补充行情", durationMs: 800 },
      },
    ];

    const wm = new WorkManager(testDir, makeFakeStore(events));
    wm.create({ intent: "金价", sessionId: "sess_1" });

    const { activities } = await wm.listActivities("sess_1");
    const tool = activities.find((a) => a.type === "tool");
    expect(tool?.durationMs).toBe(1200);
    const thinking = activities.find((a) => a.type === "thinking");
    expect(thinking?.durationMs).toBe(800);
  });
});
