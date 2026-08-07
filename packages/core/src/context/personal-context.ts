// packages/core/src/context/personal-context.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { log } from "@hachimi/shared";

export interface PersonalContextOptions {
  soulPath?: string;
  telosRoot?: string;
  knowledgeRoot?: string;
  knowledgeWriteRoot?: string;
  soulMaxChars?: number;
  telosMaxChars?: number;
}

export interface PersonalContextContent {
  soul?: string;
  telos?: string;
  knowledgeRoot?: string;
  knowledgeWriteRoot?: string;
  hasSoul: boolean;
  hasTelos: boolean;
}

/**
 * PC1.1: PersonalContextLoader — 加载 SOUL.md 与 TELOS 稳定上下文
 * - SOUL.md: 语气与行为边界 (~/.hachimi/SOUL.md)
 * - TELOS: MISSION.md, GOALS.md, PROJECTS.md (~/.hachimi/telos/)
 * 稳定前缀插入 ContextBuilder，保持 LLM Prompt Cache 命中率。
 */
export class PersonalContextLoader {
  private soulPath: string;
  private telosRoot: string;
  private knowledgeRoot?: string;
  private knowledgeWriteRoot?: string;
  private soulMaxChars: number;
  private telosMaxChars: number;

  private cache: PersonalContextContent | null = null;
  private lastMtimes: Record<string, number> = {};

  constructor(options: PersonalContextOptions = {}) {
    const defaultUserDir = join(homedir(), ".hachimi");
    this.soulPath = resolve(options.soulPath || join(defaultUserDir, "SOUL.md"));
    this.telosRoot = resolve(options.telosRoot || join(defaultUserDir, "telos"));
    if (options.knowledgeRoot) this.knowledgeRoot = resolve(options.knowledgeRoot);
    if (options.knowledgeWriteRoot) this.knowledgeWriteRoot = resolve(options.knowledgeWriteRoot);
    this.soulMaxChars = options.soulMaxChars || 1000;
    this.telosMaxChars = options.telosMaxChars || 3000;
  }

  load(): PersonalContextContent {
    let soulText = "";
    let hasSoul = false;

    if (existsSync(this.soulPath)) {
      try {
        const raw = readFileSync(this.soulPath, "utf-8").trim();
        if (raw) {
          soulText =
            raw.length > this.soulMaxChars
              ? `${raw.slice(0, this.soulMaxChars)}\n...(SOUL 截断)`
              : raw;
          hasSoul = true;
        }
      } catch (err) {
        log("warn", `PersonalContextLoader 读取 SOUL 失败: ${err}`);
      }
    }

    const telosFiles = ["MISSION.md", "GOALS.md", "PROJECTS.md"];
    const telosParts: string[] = [];
    let hasTelos = false;

    for (const filename of telosFiles) {
      const filePath = join(this.telosRoot, filename);
      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, "utf-8").trim();
          if (raw) {
            telosParts.push(`### ${filename.replace(".md", "")}\n${raw}`);
            hasTelos = true;
          }
        } catch (err) {
          log("warn", `PersonalContextLoader 读取 TELOS ${filename} 失败: ${err}`);
        }
      }
    }

    let telosText = "";
    if (telosParts.length > 0) {
      const combined = telosParts.join("\n\n");
      telosText =
        combined.length > this.telosMaxChars
          ? `${combined.slice(0, this.telosMaxChars)}\n...(TELOS 截断)`
          : combined;
    }

    return {
      soul: hasSoul ? `【个人 SOUL 指引】\n${soulText}` : undefined,
      telos: hasTelos ? `【TELOS 个人对齐】\n${telosText}` : undefined,
      knowledgeRoot: this.knowledgeRoot,
      knowledgeWriteRoot: this.knowledgeWriteRoot,
      hasSoul,
      hasTelos,
    };
  }
}
