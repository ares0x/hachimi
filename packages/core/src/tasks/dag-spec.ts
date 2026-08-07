// packages/core/src/tasks/dag-spec.ts
//
// P2.2: DAG 任务编排 — spec 类型、解析（JSON / 精简 YAML 子集）与校验。
//
// 支持的 YAML 形状（对应 craft-agents-oss `task.yaml`）：
//   name: demo
//   max_parallel: 2
//   nodes:
//     - id: research
//       task: 调研 xxx
//       depends_on: [a, b]        # 或空
//       subagent_type: explore
//     - id: implement
//       task: 基于 ${nodes.research.output} 实现 yyy
//       depends_on: [research]
// JSON 输入（DagSpec 对象或字符串）同样支持，优先解析 JSON。

import type { SubAgentType } from "@hachimi/shared";

export interface DagNodeSpec {
  id: string;
  /** 节点任务描述（支持 ${nodes.<id>.output} 插值） */
  task: string;
  /** 依赖节点 id（对应 depends_on） */
  dependsOn?: string[];
  /** 子代理角色（默认 general-purpose） */
  subagentType?: SubAgentType;
  maxTokens?: number;
  maxCostUSD?: number;
}

export interface DagSpec {
  name?: string;
  nodes: DagNodeSpec[];
  /** 全局并行上限（默认 2） */
  maxParallel?: number;
}

export interface DagValidationError extends Error {
  code: "parse" | "validate";
}

function fail(code: "parse" | "validate", msg: string): never {
  const err = new Error(msg) as DagValidationError;
  err.code = code;
  throw err;
}

/**
 * 归一化：兼容 camelCase（对象/JSON）与 snake_case（task.yaml 风格）字段名。
 * 输入可以是 DagSpec 或任意 shape 的 Record。
 */
export function normalizeSpec(raw: unknown): DagSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const nodesRaw = Array.isArray(r["nodes"]) ? r["nodes"] : [];
  const nodes = nodesRaw.map((nRaw) => {
    const n = (nRaw ?? {}) as Record<string, unknown>;
    return {
      id: String(n["id"] ?? ""),
      task: String(n["task"] ?? ""),
      ...(n["dependsOn"] !== undefined
        ? { dependsOn: (n["dependsOn"] as string[]).map(String) }
        : n["depends_on"] !== undefined
          ? { dependsOn: (n["depends_on"] as string[]).map(String) }
          : {}),
      ...(n["subagentType"] !== undefined
        ? { subagentType: n["subagentType"] as SubAgentType }
        : n["subagent_type"] !== undefined
          ? { subagentType: n["subagent_type"] as SubAgentType }
          : {}),
      ...(n["maxTokens"] !== undefined
        ? { maxTokens: Number(n["maxTokens"]) }
        : n["max_tokens"] !== undefined
          ? { maxTokens: Number(n["max_tokens"]) }
          : {}),
      ...(n["maxCostUSD"] !== undefined
        ? { maxCostUSD: Number(n["maxCostUSD"]) }
        : n["max_cost_usd"] !== undefined
          ? { maxCostUSD: Number(n["max_cost_usd"]) }
          : {}),
    };
  });
  return {
    ...(r["name"] !== undefined ? { name: String(r["name"]) } : {}),
    ...(r["maxParallel"] !== undefined
      ? { maxParallel: Number(r["maxParallel"]) }
      : r["max_parallel"] !== undefined
        ? { maxParallel: Number(r["max_parallel"]) }
        : {}),
    nodes,
  };
}

/** 解析 DAG spec：优先 JSON，回退精简 YAML 子集 */
export function parseDagSpec(input: string | DagSpec): DagSpec {
  if (typeof input !== "string") {
    return validateDagSpec(normalizeSpec(input));
  }
  const trimmed = input.trim();
  if (!trimmed) fail("parse", "DAG spec 为空");

  // JSON 通道
  if (trimmed.startsWith("{")) {
    try {
      return validateDagSpec(normalizeSpec(JSON.parse(trimmed)));
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as DagValidationError).code === "validate"
      ) {
        throw err;
      }
      fail("parse", `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return validateDagSpec(parseMiniYaml(trimmed));
}

/** 校验：节点 id 唯一、depends_on 必须指向已声明的节点 */
export function validateDagSpec(spec: DagSpec): DagSpec {
  if (!spec || !Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    fail("validate", "DAG spec 必须包含非空 nodes 数组");
  }
  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!node.id || !node.task) fail("validate", `节点缺少 id 或 task: ${JSON.stringify(node)}`);
    if (ids.has(node.id)) fail("validate", `节点 id 重复: ${node.id}`);
    ids.add(node.id);
    for (const dep of node.dependsOn ?? []) {
      if (!ids.has(dep)) {
        // depends_on 可以是前向声明（按顺序），但指向未知节点则报错
        if (!spec.nodes.some((n) => n.id === dep)) {
          fail("validate", `节点 ${node.id} 的 depends_on 指向不存在的节点: ${dep}`);
        }
      }
    }
  }
  detectCycle(spec);
  return spec;
}

/** 拓扑环检测（DFS 三色标记） */
export function detectCycle(spec: DagSpec): void {
  const index = new Map(spec.nodes.map((n) => [n.id, n]));
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    const c = color.get(id) ?? 0;
    if (c === 2) return;
    if (c === 1) {
      const cycle = [...stack.slice(stack.indexOf(id)), id].join(" → ");
      fail("validate", `DAG 存在环: ${cycle}`);
    }
    color.set(id, 1);
    stack.push(id);
    for (const dep of index.get(id)?.dependsOn ?? []) {
      if (index.has(dep)) visit(dep);
    }
    stack.pop();
    color.set(id, 2);
  };

  for (const node of spec.nodes) visit(node.id);
}

/**
 * 精简 YAML 子集解析（仅覆盖 DAG spec 需要的形状）：
 * - 2 空格缩进的嵌套映射
 * - `- ` 列表项（可带 `- id: x` 内联键）
 * - `key: value` 标量 / 数字 / 内联列表 `[a, b]` / 空值
 * 不支持锚点、多行块、引用等完整 YAML 特性。
 */
export function parseMiniYaml(text: string): DagSpec {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));

  interface YamlNode {
    key: string;
    value: unknown;
    indent: number;
    children: YamlNode[];
  }

  const root: YamlNode[] = [];
  const stack: Array<{ indent: number; node: YamlNode[] }> = [{ indent: -1, node: root }];

  const parseValue = (raw: string): unknown => {
    const v = raw.trim();
    if (v === "" || v === "null" || v === "~") return undefined;
    if (v.startsWith("[") && v.endsWith("]")) {
      return v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v === "true" || v === "false") return v === "true";
    return v.replace(/^["']|["']$/g, "");
  };

  for (const line of lines) {
    const indent = line.search(/\S|$/);
    const content = line.slice(indent).trim();
    const m = content.match(/^-\s*(.+)$/);
    if (m) {
      // 列表项：`- id: x`（内联键作为子条目，后续缩进键并入同一记录）或 `- 标量`
      const inline = m[1];
      const kv = inline.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].node;
      const entry: YamlNode = { key: "", value: undefined, indent, children: [] };
      if (kv) {
        entry.children.push({ key: kv[1], value: parseValue(kv[2]), indent, children: [] });
      } else {
        entry.value = parseValue(inline);
      }
      parent.push(entry);
      stack.push({ indent, node: entry.children });
      continue;
    }
    const kv = content.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) fail("parse", `无法解析的 YAML 行: ${line}`);
    const key = kv[1];
    const value = parseValue(kv[2]);
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const entry: YamlNode = { key, value, indent, children: [] };
    parent.push(entry);
    stack.push({ indent, node: entry.children });
  }

  /** 统一节点树 → 值：全空键子节点视为列表，否则为映射 */
  const toValue = (nodes: YamlNode[]): unknown => {
    if (nodes.length === 0) return undefined;
    if (nodes.every((n) => n.key === "")) {
      return nodes.map((n) => (n.children.length > 0 ? toValue(n.children) : n.value));
    }
    const rec: Record<string, unknown> = {};
    for (const n of nodes) rec[n.key] = n.children.length > 0 ? toValue(n.children) : n.value;
    return rec;
  };

  const top = toValue(root) as Record<string, unknown>;
  const nodesRaw = top["nodes"];
  if (!Array.isArray(nodesRaw)) fail("parse", "YAML 缺少 nodes 列表");

  const nodes = nodesRaw.map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("parse", "nodes 项必须是映射");
    const r = raw as Record<string, unknown>;
    const dependsOn = r["depends_on"];
    const subagentType = r["subagent_type"];
    return {
      id: String(r["id"] ?? ""),
      task: String(r["task"] ?? ""),
      ...(dependsOn !== undefined ? { dependsOn: (dependsOn as string[]).map(String) } : {}),
      ...(subagentType !== undefined ? { subagentType: subagentType as SubAgentType } : {}),
      ...(r["max_tokens"] !== undefined ? { maxTokens: Number(r["max_tokens"]) } : {}),
      ...(r["max_cost_usd"] !== undefined ? { maxCostUSD: Number(r["max_cost_usd"]) } : {}),
    };
  });

  return validateDagSpec({
    ...(top["name"] !== undefined ? { name: String(top["name"]) } : {}),
    ...(top["max_parallel"] !== undefined ? { maxParallel: Number(top["max_parallel"]) } : {}),
    nodes,
  });
}
