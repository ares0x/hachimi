// packages/core/src/skills/trajectory-compressor.ts
import type { RuntimeEvent, ToolCallEvent } from "../types/index.js";

export interface SkillProposalCandidate {
  name: string;
  description: string;
  instructions: string;
  triggerCondition: string;
  toolChain: string[];
  reason: string;
  sourceWorkId?: string;
}

export interface TrajectoryTurn {
  userGoal: string;
  toolCalls: string[];
  hasUserCorrection: boolean;
  assistantResponse: string;
}

/**
 * W4.1: TrajectoryCompressor — 从 Work Events 事件流提取技能候选
 * 规则优先（重复模式 / 纠偏检测），提取高频工具链与用户偏好。
 */
export class TrajectoryCompressor {
  private history: TrajectoryTurn[] = [];

  recordTurn(userGoal: string, toolCalls: string[], assistantResponse: string) {
    const isCorrection =
      userGoal.includes("不对") ||
      userGoal.includes("修改一下") ||
      userGoal.includes("重新") ||
      userGoal.includes("修正");

    this.history.push({
      userGoal,
      toolCalls,
      hasUserCorrection: isCorrection,
      assistantResponse,
    });

    if (this.history.length > 20) {
      this.history.shift();
    }
  }

  getHistory(): TrajectoryTurn[] {
    return [...this.history];
  }

  /**
   * 检测重复模式与用户纠正迹象（兼容旧版按轮次检测）
   */
  detectPattern(): { matched: boolean; toolChain: string[]; reason: string } | null {
    if (this.history.length < 2) return null;

    const recent = this.history.slice(-3);
    const corrections = recent.filter((t) => t.hasUserCorrection).length;

    if (corrections >= 2) {
      const toolChain = recent.flatMap((t) => t.toolCalls);
      return {
        matched: true,
        toolChain,
        reason: "检测到用户多次纠正交互，可提取最佳修正流程为技能",
      };
    }

    const toolChains = this.history.map((t) => t.toolCalls.join("->")).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const chain of toolChains) {
      counts[chain] = (counts[chain] || 0) + 1;
      if (counts[chain] >= 2) {
        return {
          matched: true,
          toolChain: chain.split("->"),
          reason: `检测到工具链 [${chain}] 被重复高效使用 2 次以上`,
        };
      }
    }

    return null;
  }

  /**
   * 从 completed Work 的 events 事件流中自动提取技能提案候选
   */
  compressEvents(events: RuntimeEvent[]): SkillProposalCandidate[] {
    const candidates: SkillProposalCandidate[] = [];
    if (!events || events.length === 0) return candidates;

    // 1. 提取事件中的 tool_call 与 steer/user_message
    const toolCalls = events.filter((e): e is ToolCallEvent => e.type === "tool_call");
    const userMsgEvent = events.find((e) => e.type === "user_message");
    const firstUserMsg = (userMsgEvent?.payload as any)?.content || "工作任务";
    const workId = events[0]?.sessionId;

    // 规则 A: 工具组合调用链提取（2 个或以上工具调用）
    if (toolCalls.length >= 2) {
      const toolNames = toolCalls.map((tc) => tc.payload.toolName);
      const uniqueNames = Array.from(new Set(toolNames));

      const stepsDescription = toolCalls
        .map(
          (tc, idx) =>
            `${idx + 1}. 调用 ${tc.payload.toolName} (参数: ${JSON.stringify(tc.payload.args)})`
        )
        .join("\n");

      const cleanName = `skill_${uniqueNames.join("_")}`.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      candidates.push({
        name: cleanName,
        description: `从 Work 轨迹中自动提取的工具序列: ${uniqueNames.join(" -> ")}`,
        instructions: `针对【${firstUserMsg.slice(0, 40)}】任务，按以下流程执行:\n${stepsDescription}`,
        triggerCondition: `当用户提出涉及 ${firstUserMsg.slice(0, 20)} 的相似需求时自动激活`,
        toolChain: toolNames,
        reason: `检测到任务中包含有序的工具调用序列: ${toolNames.join(" -> ")}`,
        sourceWorkId: workId,
      });
    }

    // 规则 B: 纠偏 / steer 迹象提取
    const steerEvents = events.filter((e) => e.type === "steer");
    if (steerEvents.length > 0) {
      const steerNotes = steerEvents
        .map(
          (se) =>
            (se.payload as any)?.prompt ||
            (se.payload as any)?.content ||
            (se as any).summary ||
            "用户人工干预"
        )
        .join("; ");

      candidates.push({
        name: `steer_fix_${workId ? workId.slice(-6) : Date.now().toString(36)}`,
        description: `基于用户干预修正提取的规则偏好`,
        instructions: `处理【${firstUserMsg.slice(0, 40)}】时，请遵循用户中途修正意见:\n${steerNotes}`,
        triggerCondition: `匹配涉及 ${firstUserMsg.slice(0, 20)} 的纠偏模式`,
        toolChain: toolCalls.map((tc) => tc.payload.toolName),
        reason: `检测到 Work 执行期间存在 ${steerEvents.length} 次用户 steer 干预`,
        sourceWorkId: workId,
      });
    }

    return candidates;
  }
}
