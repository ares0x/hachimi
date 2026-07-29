// packages/core/src/skills/f5-evolution.test.ts
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../types/index.js";
import { SkillProposalManager } from "./skill-proposal-manager.js";
import { TrajectoryCompressor } from "./trajectory-compressor.js";
import { SkillRegistry } from "./registry.js";

describe("Phase W4 — 演化闭环 F5 (Trajectory -> Proposal -> Human Confirmation -> Skill Registration)", () => {
  const testDataDir = join(__dirname, "../../../data-test-w4");
  const testSkillsDir = join(testDataDir, "skills");
  let manager: SkillProposalManager;
  let registry: SkillRegistry;

  beforeEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    registry = new SkillRegistry();
    manager = new SkillProposalManager(testDataDir, registry, undefined, testSkillsDir);
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("W4.1: TrajectoryCompressor 从 Work 事件流提取技能候选", () => {
    const compressor = new TrajectoryCompressor();
    const mockEvents: RuntimeEvent[] = [
      {
        id: "evt_1",
        sessionId: "work_123",
        timestamp: new Date().toISOString(),
        type: "session_started",
        payload: { title: "数据备份与压缩" },
      },
      {
        id: "evt_2",
        sessionId: "work_123",
        timestamp: new Date().toISOString(),
        type: "user_message",
        payload: { content: "请备份数据库并导出日志文件" },
      },
      {
        id: "evt_3",
        sessionId: "work_123",
        timestamp: new Date().toISOString(),
        type: "tool_call",
        payload: {
          toolCallId: "call_1",
          toolName: "read_file",
          args: { path: "db.sqlite" },
        },
      },
      {
        id: "evt_4",
        sessionId: "work_123",
        timestamp: new Date().toISOString(),
        type: "tool_call",
        payload: {
          toolCallId: "call_2",
          toolName: "run_command",
          args: { command: "tar -czf backup.tar.gz db.sqlite" },
        },
      },
      {
        id: "evt_5",
        sessionId: "work_123",
        timestamp: new Date().toISOString(),
        type: "steer",
        payload: { prompt: "请在压缩包里加上时间戳" },
      },
    ];

    const candidates = compressor.compressEvents(mockEvents);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const toolChainCandidate = candidates.find((c) => c.toolChain.length >= 2);
    expect(toolChainCandidate).toBeDefined();
    expect(toolChainCandidate?.name).toContain("read_file_run_command");
    expect(toolChainCandidate?.sourceWorkId).toBe("work_123");

    const steerCandidate = candidates.find((c) => c.reason.includes("steer"));
    expect(steerCandidate).toBeDefined();
  });

  it("W4.2: 提案默认 pending，无确认绝不注册入 SkillRegistry", () => {
    const candidate = {
      name: "custom_auto_skill",
      description: "自动工具链提案",
      instructions: "步骤 1: read_file, 步骤 2: write_file",
      triggerCondition: "当需要文件处理时",
      toolChain: ["read_file", "write_file"],
      reason: "工具重复调用",
    };

    const proposal = manager.createProposal(candidate);

    expect(proposal.status).toBe("pending");

    const pendingProposals = manager.listProposals("pending");
    expect(pendingProposals).toHaveLength(1);
    expect(pendingProposals[0].id).toBe(proposal.id);

    // 确认未放行前，SkillRegistry 中绝无该技能
    expect(registry.get("custom_auto_skill")).toBeUndefined();
    expect(registry.list().some((s) => s.name === "custom_auto_skill")).toBe(false);
  });

  it("W4.3: Accept 确认后写入物理 SKILL.md，注册至 SkillRegistry 并标注 source: learned", async () => {
    const candidate = {
      name: "data_clean_process",
      description: "数据清洗流程技能",
      instructions: "1. 过滤无效字符\n2. 格式化 JSON 输出",
      triggerCondition: "当用户要求清洗日志数据时",
      toolChain: ["read_file", "write_file"],
      reason: "多次清洗操作重用",
    };

    const proposal = manager.createProposal(candidate);
    const result = manager.acceptProposal(proposal.id);

    expect(result.success).toBe(true);
    expect(result.skillPath).toBeDefined();
    expect(existsSync(result.skillPath!)).toBe(true);

    // 状态更新为 approved
    const approvedProposals = manager.listProposals("approved");
    expect(approvedProposals.some((p) => p.id === proposal.id)).toBe(true);

    // 在 SkillRegistry 中被动态注册，且 source 为 learned
    const registeredSkill = registry.get("data_clean_process");
    expect(registeredSkill).toBeDefined();
    expect(registeredSkill?.source).toBe("learned");
    expect(registeredSkill?.description).toBe("数据清洗流程技能");

    const loaded = await registeredSkill?.load();
    expect(loaded?.instructions).toContain("过滤无效字符");
  });

  it("W4.4: Reject 拒绝提案后状态更名，不落盘且不注册至 SkillRegistry", () => {
    const candidate = {
      name: "unsafe_scratch_script",
      description: "一次性脚本过程",
      instructions: "执行 rm -rf",
      triggerCondition: "清理临时文件",
      toolChain: ["run_command"],
      reason: "临时行为",
    };

    const proposal = manager.createProposal(candidate);
    const result = manager.rejectProposal(proposal.id);

    expect(result.success).toBe(true);

    const rejectedProposals = manager.listProposals("rejected");
    expect(rejectedProposals.some((p) => p.id === proposal.id)).toBe(true);

    // SkillRegistry 中不可用
    expect(registry.get("unsafe_scratch_script")).toBeUndefined();

    // 物理 SKILL.md 不被创建
    const targetSkillMd = join(testSkillsDir, "unsafe_scratch_script", "SKILL.md");
    expect(existsSync(targetSkillMd)).toBe(false);
  });
});
