import { describe, expect, it } from "vitest";
import { calculateCosineSimilarity, searchSemanticRank } from "./semantic-search.js";

describe("Phase H4: Vector Cosine Similarity & Semantic RAG Search Unit Tests", () => {
  it("calculates exact cosine similarity between matching and orthogonal vectors", () => {
    expect(calculateCosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    expect(calculateCosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("ranks relevant semantic memory items using n-gram cosine similarity", () => {
    const memories = [
      { id: "1", content: "用户偏好：我不喜欢吃辣，偏好清淡饮食" },
      { id: "2", content: "开发环境配置：Node.js v20.10.0, pnpm package manager" },
      { id: "3", content: "项目架构：Hachimi 是一个 model-agnostic Agent Runtime" },
    ];

    const results = searchSemanticRank(memories, "用户口味与不吃辣的饮食偏好", (m) => m.content);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("1");
  });
});
