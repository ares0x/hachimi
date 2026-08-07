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
