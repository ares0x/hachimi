/**
 * Demo data + scripted agent run for the Hachimi prototype.
 * No backend: this file simulates one agent turn (plan -> tools -> streamed answer).
 */

export type Mode = "chat" | "code" | "research" | "write";

export type RunStatus = "todo" | "running" | "waiting" | "done" | "error";

export type ToolCall = {
  id: string;
  name: string;
  args: string;
  status: RunStatus;
  result?: string;
  ms?: number;
  sandbox?: boolean;
};

export type PlanStep = { id: string; label: string; status: RunStatus };

export type Message = {
  id: string;
  role: "user" | "assistant";
  time?: string;
  text: string;
  plan?: PlanStep[];
  tools?: ToolCall[];
  streaming?: boolean;
};

export type Session = {
  id: string;
  title: string;
  time?: string;
  mode?: Mode;
  runs?: number;
  updatedAt?: number;
};

export type ActivityStep = {
  id: string;
  label: string;
  meta?: string;
  status: RunStatus;
};

export type MemoryItem = {
  id: string;
  kind: "preference" | "fact" | "constraint" | "project";
  text: string;
  when: string;
  hits: number;
};

export type Source = {
  id: number;
  title: string;
  domain: string;
  url: string;
};

export const MODE_LABEL: Record<Mode, string> = {
  chat: "对话 (Chat)",
  code: "代码 (Code)",
  research: "研究 (Research)",
  write: "写作 (Write)",
};

export const sessions: Session[] = [
  { id: "s1", title: "请总结今日工作与活动要点", time: "刚刚", mode: "chat", runs: 3 },
  { id: "s2", title: "重构 gateway 的重试策略", time: "12 分钟前", mode: "code", runs: 9 },
  { id: "s3", title: "本地优先 Agent 架构调研", time: "1 小时前", mode: "research", runs: 14 },
  { id: "s4", title: "现在几点啦", time: "昨天", mode: "chat", runs: 1 },
];

export const initialMessages: Message[] = [
  {
    id: "m1",
    role: "user",
    time: "14:27:41",
    text: "请总结今日工作与活动要点，并标注你没有把握的地方。",
  },
  {
    id: "m2",
    role: "assistant",
    time: "14:27:53",
    plan: [
      { id: "p1", label: "读取工作区索引与今日会话历史", status: "done" },
      { id: "p2", label: "检索长期记忆中与今日相关的条目", status: "done" },
      { id: "p3", label: "汇总为要点，标注不确定项", status: "done" },
    ],
    tools: [
      {
        id: "t1",
        name: "workspace.scan",
        args: '{ "root": "~/workspace/hachimi", "since": "today" }',
        status: "done",
        result: "18 files touched · 0 activity log found",
        ms: 240,
        sandbox: true,
      },
      {
        id: "t2",
        name: "memory.search",
        args: '{ "query": "今日 任务 偏好", "k": 6 }',
        status: "done",
        result: "3 hits (2 preference, 1 project)",
        ms: 86,
      },
    ],
    text: `## 今日总结 · 2026-07-26（星期日）

**结论先行** — 工作区里没有今天的活动日志文件，所以下面的要点来自会话历史与工具可读取的状态，不是完整记录。

### 要点

1. **时间基线** — 系统时间 2026-07-26 14:27，时区 \`Asia/Shanghai\`。
2. **今日交互** — 讨论了咖啡偏好（记忆：手冲）、尝试调用 \`delegate_subagent\`（参数缺失失败）、请求读取 \`~/.ssh/id_rsa\`（被 PathJail 拒绝）[1]。
3. **工作区状态** — \`~/workspace/hachimi\` 有 18 个文件改动，但没有任何 \`daily/\` 或 \`activity.log\`。

### 不确定的地方

- 我无法确认这 18 个改动是否都由你今天完成，提交记录不在我的可读范围内。

> 如果你把今天的任务清单或日志给我，我可以把它整理成可归档的日报，并写入长期记忆。`,
  },
];

export const activity: ActivityStep[] = [
  { id: "a1", label: "Intent parsed", meta: "chat · gemini-3.6-flash", status: "done" },
  { id: "a2", label: "Plan drafted", meta: "3 steps", status: "done" },
  { id: "a3", label: "workspace.scan", meta: "240ms · sandbox", status: "done" },
  { id: "a4", label: "memory.search", meta: "86ms · 3 hits", status: "done" },
  { id: "a5", label: "Answer streamed", meta: "612 tokens", status: "done" },
];

export const memories: MemoryItem[] = [
  { id: "mem1", kind: "preference", text: "喜欢手冲咖啡，不喝速溶", when: "3 天前", hits: 4 },
  { id: "mem2", kind: "constraint", text: "禁止读取 ~/.ssh 与任何私钥路径", when: "今天", hits: 1 },
  {
    id: "mem3",
    kind: "project",
    text: "hachimi 采用 single-brain runtime + 工具沙箱",
    when: "上周",
    hits: 9,
  },
  { id: "mem4", kind: "preference", text: "回答先给结论，再给依据", when: "2 周前", hits: 22 },
];

export const sources: Source[] = [
  { id: 1, title: "PathJail 拒绝记录 · audit.log", domain: "local", url: "#" },
  { id: 2, title: "Single Brain Runtime 设计说明", domain: "workspace", url: "#" },
];

/* ---------- scripted second turn ---------- */

export const scriptedPrompt = "帮我把今日总结写成日报，并检查 gateway 的重试逻辑";

export const scriptedTools: ToolCall[] = [
  {
    id: "st1",
    name: "workspace.read",
    args: '{ "path": "src/gateway/retry.ts" }',
    status: "running",
    result: "142 lines · exponential backoff, no jitter",
    ms: 180,
    sandbox: true,
  },
  {
    id: "st2",
    name: "report.compose",
    args: '{ "template": "daily", "locale": "zh-CN" }',
    status: "todo",
    result: "draft ready · 268 words",
    ms: 940,
  },
];

export const scriptedPlan: PlanStep[] = [
  { id: "sp1", label: "读取 gateway 重试实现", status: "running" },
  { id: "sp2", label: "生成日报草稿（等待写入授权）", status: "todo" },
  { id: "sp3", label: "输出结论与改动建议", status: "todo" },
];

export const scriptedAnswer = `**结论** — 日报草稿已就绪，\`retry.ts\` 有一个真实缺陷：退避没有抖动，并发失败时会同时重试。

### 建议改动

\`\`\`ts
const delay = base * 2 ** attempt;
const jitter = delay * (0.5 + Math.random() * 0.5); // full jitter
await sleep(Math.min(jitter, ceiling));
\`\`\`

日报草稿需要写入 \`daily/2026-07-26.md\`，这是一次文件写入，我已经把授权请求放在输入框上方等你确认。`;

export const timeNow = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
