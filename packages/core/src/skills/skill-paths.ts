// packages/core/src/skills/skill-paths.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** ~/.hachimi 用户数据根目录 */
export function getHachimiHome(): string {
  return resolve(homedir(), ".hachimi");
}

/** 用户级技能目录 ~/.hachimi/skills */
export function getUserSkillsDir(): string {
  return join(getHachimiHome(), "skills");
}

/** 项目级技能目录 <cwd>/.hachimi/skills */
export function getProjectSkillsDir(): string {
  return resolve(process.cwd(), ".hachimi", "skills");
}

/** 搜索顺序：项目优先，其次用户（同名时项目覆盖用户）。 */
export function getSkillsSearchDirs(): string[] {
  return [getProjectSkillsDir(), getUserSkillsDir()];
}
