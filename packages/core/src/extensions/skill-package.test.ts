// packages/core/src/extensions/skill-package.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installSkillsFromGitHub,
  parseSkillMarkdown,
  SkillPackageLoader,
} from "./skill-package.js";

describe("parseSkillMarkdown", () => {
  it("parses rich frontmatter: version, license, author, allowedTools, priority", async () => {
    const md = `---
name: my-skill
description: 一个自愈排错技能
version: 1.2.3
license: MIT
author: jace
homepage: https://example.com
tags: [debug, infra]
allowedTools:
  - bash
  - grep
priority: 5
---

# My Skill

主体内容
`;
    const skill = parseSkillMarkdown(md, "fallback");
    expect(skill.name).toBe("my-skill");
    expect(skill.description).toBe("一个自愈排错技能");
    expect(skill.version).toBe("1.2.3");
    expect(skill.license).toBe("MIT");
    expect(skill.author).toBe("jace");
    expect(skill.homepage).toBe("https://example.com");
    expect(skill.tags).toEqual(["debug", "infra"]);
    expect(skill.allowedTools).toEqual(["bash", "grep"]);
    expect(skill.priority).toBe(5);
    const content = await skill.load();
    expect(content.instructions).toContain("主体内容");
  });

  it("aliases tools → allowedTools and falls back to a first-line description", () => {
    const md = `---
name: bare-skill
tools: [bash]
---

第一行即描述

正文
`;
    const skill = parseSkillMarkdown(md, "fallback");
    expect(skill.allowedTools).toEqual(["bash"]);
    expect(skill.description).toContain("第一行即描述");
  });
});

describe("SkillPackageLoader", () => {
  let tempRoot: string;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  function makeRoot(): string {
    tempRoot = mkdtempSync(join(tmpdir(), "hachimi-skill-"));
    return tempRoot;
  }

  it("loads skill packages from custom dirs with project precedence", () => {
    const root = makeRoot();
    const project = join(root, "project-skills");
    const user = join(root, "user-skills");
    mkdirSync(join(project, "shared-skill"), { recursive: true });
    mkdirSync(join(user, "shared-skill"), { recursive: true });
    mkdirSync(join(user, "user-only"), { recursive: true });

    writeFileSync(
      join(project, "shared-skill", "SKILL.md"),
      "---\nname: shared-skill\ndescription: project version\n---\n\nproject body\n",
      "utf-8"
    );
    writeFileSync(
      join(user, "shared-skill", "SKILL.md"),
      "---\nname: shared-skill\ndescription: user version\n---\n\nuser body\n",
      "utf-8"
    );
    writeFileSync(
      join(user, "user-only", "SKILL.md"),
      "---\nname: user-only\ndescription: user only\n---\n\nbody\n",
      "utf-8"
    );

    const loader = new SkillPackageLoader({ customDirs: [project, user] });
    const skills = loader.loadPackages();
    expect(skills).toHaveLength(2);
    const shared = skills.find((s) => s.name === "shared-skill");
    expect(shared?.description).toBe("project version"); // project wins
    expect(shared?.source).toBe("project");
    expect(shared?.sourceDir).toBe(project);
    expect(skills.find((s) => s.name === "user-only")?.source).toBe("external");
  });

  it("create / update / delete round-trips a user skill", () => {
    const root = makeRoot();
    const loader = new SkillPackageLoader({
      customDirs: [join(root, "user-skills")],
    });
    const created = loader.createSkill({
      name: "My Custom Skill",
      description: "自定义技能",
      instructions: "按以下步骤执行…",
      tags: ["custom"],
      version: "0.1.0",
      author: "jace",
    });
    expect(created.name).toBe("my_custom_skill");
    expect(existsSync(created.path)).toBe(true);
    const raw = readFileSync(created.path, "utf-8");
    expect(raw).toContain("version: 0.1.0");
    expect(raw).toContain("author: jace");

    loader.updateSkill(
      "my_custom_skill",
      "---\nname: my_custom_skill\ndescription: v2\n---\n\n新内容\n"
    );
    const updated = readFileSync(created.path, "utf-8");
    expect(updated).toContain("新内容");

    const del = loader.deleteSkill("my_custom_skill");
    expect(del.success).toBe(true);
    expect(existsSync(join(loader.getUserSkillsDir(), "my_custom_skill"))).toBe(false);
  });
});

describe("installSkillsFromGitHub", () => {
  it("fetches skills from a GitHub skills folder via mock fetcher", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/repos/owner/repo") && !u.includes("/git/trees/")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      if (u.includes("/git/trees/main?recursive=1")) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/awesome-skill/SKILL.md", type: "blob" },
              { path: "skills/other-skill/SKILL.md", type: "blob" },
              { path: "README.md", type: "blob" },
              { path: "src/index.ts", type: "blob" },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes("raw.githubusercontent.com/owner/repo/main/skills/awesome-skill/SKILL.md")) {
        return new Response(
          "---\nname: awesome-skill\ndescription: 超棒技能\nversion: 2.0.0\nlicense: Apache-2.0\n---\n\n技能正文\n",
          { status: 200 }
        );
      }
      if (u.includes("raw.githubusercontent.com/owner/repo/main/skills/other-skill/SKILL.md")) {
        return new Response("---\nname: other-skill\ndescription: 另一个\n---\n\n其他正文\n", {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const skills = await installSkillsFromGitHub("https://github.com/owner/repo", fetcher);
    expect(skills).toHaveLength(2);
    const awesome = skills.find((s) => s.name === "awesome-skill");
    expect(awesome?.version).toBe("2.0.0");
    expect(awesome?.license).toBe("Apache-2.0");
    expect(awesome?.description).toBe("超棒技能");
    expect(awesome?.content).toContain("技能正文");
    expect(awesome?.sourceUrl).toContain("/blob/main/skills/awesome-skill/SKILL.md");
    // README / non-md files are skipped
    expect(fetcher.mock.calls.some(([u]) => String(u).includes("README.md"))).toBe(false);
  });

  it("rejects invalid URLs and repos without skill files", async () => {
    await expect(installSkillsFromGitHub("https://example.com/not-github")).rejects.toThrow(
      /无效的 GitHub URL/
    );

    const emptyFetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/repos/owner/repo") && !u.includes("/git/trees/")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      return new Response(JSON.stringify({ tree: [{ path: "README.md", type: "blob" }] }), {
        status: 200,
      });
    });
    await expect(
      installSkillsFromGitHub("https://github.com/owner/repo", emptyFetcher)
    ).rejects.toThrow(/未在仓库中找到技能文件/);
  });
});

describe("installSkillsFromGitHub — network fallbacks", () => {
  it("falls back to jsDelivr when the GitHub API is unreachable", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      // GitHub API / raw are "blocked": network error
      if (u.includes("api.github.com") || u.includes("raw.githubusercontent.com")) {
        throw new TypeError("fetch failed");
      }
      if (u.includes("data.jsdelivr.com/v1/packages/gh/owner/repo") && !u.includes("@")) {
        return new Response(JSON.stringify({ default: "main" }), { status: 200 });
      }
      if (u.includes("data.jsdelivr.com/v1/packages/gh/owner/repo@main")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                name: "skills",
                type: "directory",
                files: [
                  {
                    name: "awesome-skill",
                    type: "directory",
                    files: [{ name: "SKILL.md", type: "file", size: 100 }],
                  },
                ],
              },
              { name: "README.md", type: "file", size: 50 },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes("cdn.jsdelivr.net/gh/owner/repo@main/skills/awesome-skill/SKILL.md")) {
        return new Response(
          "---\nname: awesome-skill\ndescription: jsDelivr 安装\nversion: 3.0.0\n---\n\n正文\n",
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });

    const skills = await installSkillsFromGitHub("https://github.com/owner/repo", fetcher);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("awesome-skill");
    expect(skills[0].version).toBe("3.0.0");
    expect(skills[0].content).toContain("正文");
  });

  it("installs a single SKILL.md from a blob URL", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/repos/owner/repo") && !u.includes("/git/trees/")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      if (u.includes("/git/trees/main?recursive=1")) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/awesome-skill/SKILL.md", type: "blob" },
              { path: "docs/notes.md", type: "blob" },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes("raw.githubusercontent.com/owner/repo/main/skills/awesome-skill/SKILL.md")) {
        return new Response("---\nname: awesome-skill\ndescription: 直链安装\n---\n\n正文\n", {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const skills = await installSkillsFromGitHub(
      "https://github.com/owner/repo/blob/main/skills/awesome-skill/SKILL.md",
      fetcher
    );
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("awesome-skill");
  });

  it("resolves HEAD ref via jsDelivr when GitHub API is down", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("api.github.com")) throw new TypeError("fetch failed");
      if (u.includes("data.jsdelivr.com/v1/packages/gh/owner/repo") && !u.includes("@")) {
        return new Response(JSON.stringify({ default: "main" }), { status: 200 });
      }
      if (u.includes("data.jsdelivr.com/v1/packages/gh/owner/repo@main")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                name: "skills",
                type: "directory",
                files: [
                  {
                    name: "solo",
                    type: "directory",
                    files: [{ name: "SKILL.md", type: "file", size: 1 }],
                  },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes("cdn.jsdelivr.net/gh/owner/repo@main/skills/solo/SKILL.md")) {
        return new Response("---\nname: solo\ndescription: 单技能\n---\n\n正文\n", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const skills = await installSkillsFromGitHub("https://github.com/owner/repo", fetcher);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("solo");
  });
});
