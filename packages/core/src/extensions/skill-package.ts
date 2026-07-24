// packages/core/src/extensions/skill-package.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillDefinition } from "../types/index.js";

export interface SkillPackageLoaderOptions {
  customDirs?: string[];
}

/**
 * 解析 SKILL.md 文件的 YAML Frontmatter 头部与 Markdown 主体
 */
export function parseSkillMarkdown(content: string, fallbackName: string): SkillDefinition {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  let name = fallbackName;
  let description = `外部加载的技能: ${fallbackName}`;
  let tags: string[] = ["external"];
  let body = content;

  if (match) {
    const yamlBlock = match[1];
    body = match[2].trim();

    const nameMatch = yamlBlock.match(/name:\s*(.+)/i);
    const descMatch = yamlBlock.match(/description:\s*(.+)/i);
    const tagsMatch = yamlBlock.match(/tags:\s*\[(.*)\]/i);

    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
  }

  return {
    name,
    description,
    tags,
    load: () => ({
      prompt: body,
    }),
  };
}

/**
 * E2: 可安装技能包加载器 (SkillPackageLoader)
 */
export class SkillPackageLoader {
  private searchDirs: string[];

  constructor(options: SkillPackageLoaderOptions = {}) {
    const homeSkillsDir = join(homedir(), ".hachimi", "skills");
    const localSkillsDir = resolve(process.cwd(), ".hachimi", "skills");

    this.searchDirs = options.customDirs || [homeSkillsDir, localSkillsDir];
  }

  /**
   * 扫描多级目录并载入所有匹配的外部 Skill 技能包
   */
  loadPackages(): SkillDefinition[] {
    const loadedSkills: SkillDefinition[] = [];
    const seenNames = new Set<string>();

    for (const searchDir of this.searchDirs) {
      if (!existsSync(searchDir)) continue;

      try {
        const entries = readdirSync(searchDir);
        for (const entry of entries) {
          const fullPath = join(searchDir, entry);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            const skillMdPath = join(fullPath, "SKILL.md");
            if (existsSync(skillMdPath)) {
              const fileContent = readFileSync(skillMdPath, "utf-8");
              const skill = parseSkillMarkdown(fileContent, entry);

              if (!seenNames.has(skill.name)) {
                seenNames.add(skill.name);
                loadedSkills.push(skill);
              }
            }
          } else if (entry.endsWith(".md")) {
            const fileContent = readFileSync(fullPath, "utf-8");
            const fallbackName = entry.replace(/\.md$/, "");
            const skill = parseSkillMarkdown(fileContent, fallbackName);

            if (!seenNames.has(skill.name)) {
              seenNames.add(skill.name);
              loadedSkills.push(skill);
            }
          }
        }
      } catch {
        /* ignore read errors */
      }
    }

    return loadedSkills;
  }
}
