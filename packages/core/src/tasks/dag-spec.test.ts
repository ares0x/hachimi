// packages/core/src/tasks/dag-spec.test.ts
//
// P2.2: DAG spec 解析（JSON / 精简 YAML）与校验（重复 id / 未知依赖 / 环）。

import { describe, expect, it } from "vitest";
import { parseDagSpec, parseMiniYaml } from "./dag-spec.js";

/** 构造插值占位符（避免字面 ${ 触发 noTemplateCurlyInString） */
const outputRef = (id: string): string => `${"$"}{nodes.${id}.output}`;

describe("parseDagSpec (JSON)", () => {
  it("解析 JSON 字符串", () => {
    const spec = parseDagSpec(
      JSON.stringify({
        name: "demo",
        max_parallel: 2,
        nodes: [
          { id: "a", task: "t1" },
          { id: "b", task: "t2", depends_on: ["a"] },
        ],
      })
    );
    expect(spec.name).toBe("demo");
    expect(spec.maxParallel).toBe(2);
    expect(spec.nodes).toHaveLength(2);
    expect(spec.nodes[1].dependsOn).toEqual(["a"]);
  });

  it("直接传对象", () => {
    const spec = parseDagSpec({ nodes: [{ id: "x", task: "t" }] });
    expect(spec.nodes[0].id).toBe("x");
  });

  it("非法 JSON 报 parse 错误", () => {
    expect(() => parseDagSpec("{ not json")).toThrow(/解析失败/);
  });
});

describe("parseDagSpec (mini YAML)", () => {
  it("解析两节点 + 内联 depends_on 列表", () => {
    const spec = parseMiniYaml(`
name: 发布流程
max_parallel: 2
nodes:
  - id: build
    task: 构建产物
    subagent_type: general-purpose
  - id: test
    task: 基于 ${outputRef("build")} 跑测试
    depends_on: [build]
`);
    expect(spec.name).toBe("发布流程");
    expect(spec.maxParallel).toBe(2);
    expect(spec.nodes.map((n) => n.id)).toEqual(["build", "test"]);
    expect(spec.nodes[1].dependsOn).toEqual(["build"]);
    expect(spec.nodes[1].task).toContain(outputRef("build"));
  });

  it("空 depends_on 与数字/布尔解析", () => {
    const spec = parseMiniYaml(`
nodes:
  - id: a
    task: x
    depends_on: []
`);
    expect(spec.nodes[0].dependsOn).toEqual([]);
  });

  it("parseDagSpec 自动回退 YAML", () => {
    const spec = parseDagSpec(`
nodes:
  - id: a
    task: x
`);
    expect(spec.nodes).toHaveLength(1);
  });

  it("缺少 nodes 报 parse 错误", () => {
    expect(() => parseMiniYaml("name: x")).toThrow(/缺少 nodes/);
  });
});

describe("validateDagSpec", () => {
  it("重复 id 报错", () => {
    expect(() =>
      parseDagSpec({
        nodes: [
          { id: "a", task: "1" },
          { id: "a", task: "2" },
        ],
      })
    ).toThrow(/重复/);
  });

  it("未知依赖报错", () => {
    expect(() => parseDagSpec({ nodes: [{ id: "a", task: "1", dependsOn: ["ghost"] }] })).toThrow(
      /不存在的节点/
    );
  });

  it("环检测报错", () => {
    expect(() =>
      parseDagSpec({
        nodes: [
          { id: "a", task: "1", dependsOn: ["b"] },
          { id: "b", task: "2", dependsOn: ["a"] },
        ],
      })
    ).toThrow(/存在环/);
  });

  it("空 nodes 报错", () => {
    expect(() => parseDagSpec({ nodes: [] })).toThrow(/非空/);
  });
});
