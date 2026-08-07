// packages/core/src/rewind/file-history.test.ts
//
// P2.6: FileHistoryStore + rebuildSnapshotChain + 写工具自动 before 快照。

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileEventStore } from "../events/file-event-store.js";
import { PathJail } from "../sandbox/path-jail.js";
import { writeFileTool } from "../tools/builtin/fs/write-file.js";
import {
  fileHistoryListTool,
  fileHistorySnapshotTool,
  restoreFileSnapshotTool,
} from "../tools/builtin/meta/file-history-tools.js";
import type { ToolExecContext } from "../tools/types.js";
import type { RuntimeEvent } from "../types/event.js";
import {
  FILE_HISTORY_MAX_SNAPSHOTS,
  FileHistoryStore,
  rebuildSnapshotChain,
} from "./file-history.js";

describe("FileHistoryStore", () => {
  let dir: string;
  let events: FileEventStore;
  let store: FileHistoryStore;
  const sessionId = "sess_test_rewind";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hachimi-rewind-"));
    events = new FileEventStore(dir);
    store = new FileHistoryStore(dir, events);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("capture 落盘内容 + 追加事件，readContent 可回读", async () => {
    const ev = await store.capture({
      sessionId,
      filePath: "src/a.ts",
      content: "line1\nline2",
      mode: "before",
      toolName: "write_file",
    });
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe("file_history_snapshot");
    expect(ev!.payload.ref).toBe(`${sessionId}/${ev!.id}`);
    expect(ev!.payload.sha).toHaveLength(64);

    expect(store.readContent(ev!.payload.ref)).toBe("line1\nline2");
    expect(store.hasContent(ev!.payload.ref)).toBe(true);

    const events2 = await events.list(sessionId, { types: ["file_history_snapshot"] });
    expect(events2.total).toBe(1);
  });

  it("同文件同 sha 的 before 快照去重，manual 不与其互相去重", async () => {
    const a = await store.capture({
      sessionId,
      filePath: "a.txt",
      content: "same",
      mode: "before",
      toolName: "write_file",
    });
    const dup = await store.capture({
      sessionId,
      filePath: "a.txt",
      content: "same",
      mode: "before",
      toolName: "write_file",
    });
    expect(dup).toBeNull();

    const manual = await store.capture({
      sessionId,
      filePath: "a.txt",
      content: "same",
      mode: "manual",
    });
    expect(manual).not.toBeNull();

    const changed = await store.capture({
      sessionId,
      filePath: "a.txt",
      content: "changed",
      mode: "before",
      toolName: "write_file",
    });
    expect(changed).not.toBeNull();

    const all = await events.list(sessionId, { types: ["file_history_snapshot"] });
    expect(all.total).toBe(3);
    expect(a!.id).not.toBe(manual!.id);
  });

  it("rebuildSnapshotChain 纯函数按文件分组且保序", () => {
    const mk = (id: string, filePath: string, content: string): RuntimeEvent => ({
      id,
      sessionId,
      timestamp: `2026-08-07T00:00:0${id.slice(-1)}.000Z`,
      type: "file_history_snapshot",
      payload: {
        filePath,
        mode: "before",
        ref: `${sessionId}/${id}`,
        sha: `sha_${content}`,
        size: content.length,
        toolName: "write_file",
      },
    });
    const chain = rebuildSnapshotChain([
      mk("evt_1", "b.txt", "b1"),
      mk("evt_2", "a.txt", "a1"),
      mk("evt_3", "b.txt", "b2"),
    ]);
    expect(chain.files.map((f) => f.filePath)).toEqual(["a.txt", "b.txt"]);
    expect(chain.files[1].snapshots.map((s) => s.sha)).toEqual(["sha_b1", "sha_b2"]);
    expect(chain.files[1].snapshots[0].mode).toBe("before");
  });

  it("容量上限：超出后保留 100 份内容，最旧被淘汰且事件仍在", async () => {
    const refs: string[] = [];
    for (let i = 0; i < FILE_HISTORY_MAX_SNAPSHOTS + 5; i++) {
      const ev = await store.capture({
        sessionId,
        filePath: "f.txt",
        content: `version-${i}`,
        mode: "before",
        toolName: "write_file",
      });
      expect(ev).not.toBeNull();
      refs.push(ev!.payload.ref);
      // 保证 mtime 可区分（低精度文件系统兜底）
      await new Promise((r) => setTimeout(r, 2));
    }
    const dir2 = join(dir, "rewind", sessionId);
    expect(readdirSync(dir2).filter((f) => f.endsWith(".md"))).toHaveLength(
      FILE_HISTORY_MAX_SNAPSHOTS
    );
    // 最旧的 5 份被淘汰，最新 5 份可用
    for (let i = 0; i < 5; i++) expect(store.hasContent(refs[i])).toBe(false);
    for (let i = refs.length - 5; i < refs.length; i++) {
      expect(store.hasContent(refs[i])).toBe(true);
    }
    // 事件流完整（append-only，共 105 条）
    const all = await events.list(sessionId, { types: ["file_history_snapshot"] });
    expect(all.total).toBe(FILE_HISTORY_MAX_SNAPSHOTS + 5);
  });

  it("readContent 拒绝路径穿越", () => {
    expect(() => store.readContent("../../evil")).toThrow();
    expect(() => store.readContent("sess/x/../../etc/passwd")).toThrow();
    expect(() => store.readContent("a/b/c")).toThrow();
  });

  it("listChain 支持按路径过滤", async () => {
    await store.capture({
      sessionId,
      filePath: "x.txt",
      content: "1",
      mode: "before",
      toolName: "w",
    });
    await store.capture({
      sessionId,
      filePath: "y.txt",
      content: "2",
      mode: "before",
      toolName: "w",
    });
    const all = await store.listChain(sessionId);
    expect(all.files).toHaveLength(2);
    const filtered = await store.listChain(sessionId, "y.txt");
    expect(filtered.files.map((f) => f.filePath)).toEqual(["y.txt"]);
  });

  it("write_file 自动捕获 before 快照", async () => {
    const ws = join(dir, "workspace");
    const filePath = "src/app.ts";
    const abs = join(ws, filePath);
    const jail = new PathJail({ workspaceRoot: ws });
    const ctx: ToolExecContext = {
      jail,
      workspaceRoot: ws,
      sessionId,
      fileHistory: store,
    };
    mkdirSync(join(ws, "src"), { recursive: true });
    writeFileSync(abs, "v1");

    await writeFileTool.execute({ path: filePath, content: "v2" }, ctx as any);
    const chain = await store.listChain(sessionId, filePath);
    expect(chain.files[0].snapshots).toHaveLength(1);
    expect(store.readContent(chain.files[0].snapshots[0].ref)).toBe("v1");
    expect(existsSync(abs) && readFileSync(abs, "utf-8")).toBe("v2");
  });

  it("meta 工具：手动快照 → 列表 → 恢复闭环", async () => {
    const ws = join(dir, "workspace2");
    const filePath = "notes.md";
    const abs = join(ws, filePath);
    mkdirSync(ws, { recursive: true });
    writeFileSync(abs, "original");
    const jail = new PathJail({ workspaceRoot: ws });
    const ctx: ToolExecContext = {
      jail,
      workspaceRoot: ws,
      sessionId,
      fileHistory: store,
    };

    const snap = await fileHistorySnapshotTool.execute({ path: filePath }, ctx as any);
    expect(snap).toContain("[Snapshot Saved]");
    const ref = snap.match(/ref=(\S+)/)?.[1];
    expect(ref).toBeTruthy();

    writeFileSync(abs, "mutated");
    const listed = await fileHistoryListTool.execute({ path: filePath }, ctx as any);
    expect(listed).toContain(filePath);
    expect(listed).toContain(ref);

    const restored = await restoreFileSnapshotTool.execute({ ref: ref! }, ctx as any);
    expect(restored).toContain("[Restore Success]");
    expect(readFileSync(abs, "utf-8")).toBe("original");
  });
});
