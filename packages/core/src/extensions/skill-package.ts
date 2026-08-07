// packages/core/src/extensions/skill-package.ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { getProjectSkillsDir, getUserSkillsDir } from "../skills/skill-paths.js";
import type { SkillContent, SkillDefinition, SkillSource } from "../types/index.js";

export interface SkillPackageLoaderOptions {
  customDirs?: string[];
  /** Where create/update/delete write. Defaults to the last search dir (user root). */
  writeDir?: string;
}

export interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  tags?: string[];
  version?: string;
  license?: string;
  author?: string;
  homepage?: string;
  allowedTools?: string[];
  priority?: number;
  triggers?: { commands?: string[]; promptPatterns?: string[]; fileTypes?: string[] };
  source?: SkillSource;
  [key: string]: unknown;
}

const LIST_KEYS = new Set([
  "tags",
  "tools",
  "allowedtools",
  "commands",
  "promptpatterns",
  "filetypes",
]);

/** Canonical output key for lowercased frontmatter keys. */
const CANONICAL_KEYS: Record<string, string> = {
  allowedtools: "allowedTools",
  promptpatterns: "promptPatterns",
  filetypes: "fileTypes",
};

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** Minimal YAML-ish frontmatter parser: scalar keys, inline lists, and dash lists. */
export function parseSkillFrontmatter(content: string): {
  frontmatter: ParsedSkillFrontmatter;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: {}, body: content.trim() };
  const yamlBlock = match[1] ?? "";
  const body = content.slice(match[0].length).trim();
  const frontmatter: ParsedSkillFrontmatter = {};
  const lines = yamlBlock.split(/\r?\n/);
  let activeListKey: string | null = null;

  const pushListItem = (key: string, raw: string) => {
    const value = stripQuotes(raw);
    if (!value) return;
    const current = frontmatter[key];
    if (Array.isArray(current)) {
      current.push(value);
    } else {
      frontmatter[key] = [value];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Dash list continuation under the previous key: - item
    const listMatch = /^-\s*(.+?)\s*$/.exec(trimmed);
    if (listMatch && activeListKey) {
      pushListItem(activeListKey, listMatch[1] ?? "");
      continue;
    }

    const keyMatch = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(trimmed);
    if (!keyMatch) {
      activeListKey = null;
      continue;
    }
    const key = (keyMatch[1] ?? "").toLowerCase();
    const rawValue = keyMatch[2] ?? "";

    if (LIST_KEYS.has(key)) {
      const canonicalKey = CANONICAL_KEYS[key] || key;
      activeListKey = canonicalKey;
      // Inline list: [a, b, c]
      const inline = /^\[(.*)\]$/.exec(rawValue.trim());
      if (inline && inline[1]) {
        for (const item of inline[1].split(",")) {
          pushListItem(canonicalKey, item);
        }
      } else if (rawValue.trim() === "") {
        // items come on following dash lines
      } else {
        pushListItem(canonicalKey, rawValue);
      }
      continue;
    }

    activeListKey = null;
    if (key === "priority") {
      const num = Number(rawValue.trim());
      if (Number.isFinite(num)) frontmatter.priority = num;
      continue;
    }
    if (key === "triggers") continue; // triggers use sub-keys; handled via LIST_KEYS
    frontmatter[CANONICAL_KEYS[key] || key] = stripQuotes(rawValue);
  }

  // Fold tools → allowedTools for compatibility with both field names.
  if (Array.isArray(frontmatter.tools) && !Array.isArray(frontmatter.allowedTools)) {
    frontmatter.allowedTools = frontmatter.tools;
  }
  return { frontmatter, body };
}

/**
 * 解析 SKILL.md 文件的 YAML Frontmatter 头部与 Markdown 主体
 */
export function parseSkillMarkdown(content: string, fallbackName: string): SkillDefinition {
  const { frontmatter, body } = parseSkillFrontmatter(content);
  const name = (frontmatter.name || fallbackName).trim();
  const description =
    frontmatter.description?.trim() ||
    body
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim()
      .slice(0, 120) ||
    "" ||
    `外部加载的技能: ${fallbackName}`;

  return {
    name,
    description,
    tags: frontmatter.tags || ["external"],
    version: frontmatter.version || "0.0.0",
    license: frontmatter.license,
    author: frontmatter.author,
    homepage: frontmatter.homepage,
    allowedTools: frontmatter.allowedTools,
    priority: frontmatter.priority,
    triggers: frontmatter.triggers,
    source: frontmatter.source || "external",
    load: () =>
      ({
        instructions: body,
      }) satisfies SkillContent,
  };
}

export interface GithubSkillSource {
  name: string;
  description: string;
  version: string;
  license?: string;
  author?: string;
  homepage?: string;
  tags: string[];
  allowedTools?: string[];
  priority?: number;
  content: string;
  sourcePath: string;
  sourceUrl: string;
}

interface GitHubTreeEntry {
  path?: string;
  type?: string;
  url?: string;
}

interface JsDelivrFileEntry {
  name?: string;
  type?: string;
  size?: number;
  files?: JsDelivrFileEntry[];
}

function parseGitHubUrl(
  url: string
): { owner: string; repo: string; ref: string; subPath: string } | null {
  const m = /github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/#?]+))?(?:\/(.*))?/.exec(url);
  if (!m) return null;
  const owner = m[1] ?? "";
  const repo = (m[2] ?? "").replace(/\.git$/, "");
  const ref = m[3] || "HEAD";
  const subPath = (m[4] || "").split("?")[0].replace(/\/+$/, "");
  if (!owner || !repo) return null;
  return { owner, repo, ref: ref === "HEAD" ? "HEAD" : ref, subPath };
}

function skillNameFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (/^skill\.md$/i.test(last)) {
    return segments[segments.length - 2] || last.replace(/\.md$/i, "");
  }
  return last.replace(/\.md$/i, "");
}

/** Best-effort JSON GET; null on network error or non-2xx (source switching). */
async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown | null> {
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Best-effort text GET; null on network error or non-2xx (source switching). */
async function fetchText(url: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Resolve the default branch: GitHub API meta → jsDelivr package default → "main".
 * jsDelivr is a China-reachable CDN fallback when api.github.com is blocked.
 */
async function resolveDefaultRef(
  owner: string,
  repo: string,
  fetcher: typeof fetch
): Promise<string> {
  const meta = (await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, fetcher)) as {
    default_branch?: string;
  } | null;
  if (meta && typeof meta.default_branch === "string" && meta.default_branch) {
    return meta.default_branch;
  }
  const pkg = (await fetchJson(
    `https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}`,
    fetcher
  )) as { default?: string } | null;
  if (pkg && typeof pkg.default === "string" && pkg.default) return pkg.default;
  return "main";
}

/** Flatten a jsDelivr file listing (nested `files` arrays) into paths. */
function walkJsDelivrFiles(entries: JsDelivrFileEntry[], prefix: string, out: string[]): void {
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    const full = prefix ? `${prefix}/${name}` : name;
    if (Array.isArray(entry.files) && entry.files.length > 0) {
      walkJsDelivrFiles(entry.files, full, out);
    } else if (entry.type === "file" || typeof entry.size === "number") {
      out.push(full);
    }
  }
}

/**
 * List repository file paths matching the skill heuristics. Primary source is the
 * GitHub git-trees API; when it is unreachable (e.g. blocked in CN networks) it
 * falls back to the jsDelivr Data API listing.
 */
async function listRepoFiles(
  owner: string,
  repo: string,
  ref: string,
  fetcher: typeof fetch
): Promise<string[]> {
  const tree = (await fetchJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    fetcher
  )) as { tree?: GitHubTreeEntry[]; truncated?: boolean } | null;
  if (tree && Array.isArray(tree.tree)) {
    const paths = tree.tree.filter((e) => e.type === "blob" && e.path).map((e) => e.path as string);
    // Return whatever GitHub gave us; an empty/truncated tree falls through to jsDelivr.
    if (paths.length > 0) return paths;
  }
  // jsDelivr fallback: nested tree walk
  const listing = (await fetchJson(
    `https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${encodeURIComponent(ref)}`,
    fetcher
  )) as { files?: JsDelivrFileEntry[] } | null;
  const paths: string[] = [];
  if (listing && Array.isArray(listing.files)) {
    walkJsDelivrFiles(listing.files, "", paths);
  }
  return paths;
}

/** Fetch raw file content: raw.githubusercontent.com → cdn.jsdelivr.net fallback. */
async function fetchRawContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  fetcher: typeof fetch
): Promise<string | null> {
  const gh = await fetchText(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path}`,
    fetcher
  );
  if (gh !== null) return gh;
  return fetchText(
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${encodeURIComponent(ref)}/${path}`,
    fetcher
  );
}

/**
 * 从 GitHub 仓库/目录安装技能包（参考 Kun 的 github-skill-import）。
 * 接受 repo、tree/<ref>[/path]、blob/<ref>/... 形式的 URL，拉取 skills/ 下的
 * SKILL.md（或子目录中的 markdown）并解析为技能源。
 *
 * 网络策略：GitHub API/raw 不可达（如国内网络）时自动回退到 jsDelivr
 * （data.jsdelivr.com 列表 + cdn.jsdelivr.net 内容），保证国内可用。
 */
export async function installSkillsFromGitHub(
  url: string,
  fetcher: typeof fetch = fetch
): Promise<GithubSkillSource[]> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("无效的 GitHub URL：请使用仓库、tree 或 blob 链接。");
  const { owner, repo } = parsed;

  // Resolve default branch when ref is HEAD.
  let ref = parsed.ref;
  if (ref === "HEAD") {
    ref = await resolveDefaultRef(owner, repo, fetcher);
  }

  const allPaths = await listRepoFiles(owner, repo, ref, fetcher);
  if (allPaths.length === 0) {
    throw new Error(
      `无法读取仓库文件列表（${owner}/${repo}）。请检查仓库是否存在、是否为公开仓库，或稍后重试。`
    );
  }

  const directFile = /\.md$/i.test(parsed.subPath) ? parsed.subPath : "";
  // When the subPath is a direct file, do not treat it as a directory prefix.
  const base = directFile ? "" : parsed.subPath ? `${parsed.subPath}/` : "";
  const candidates = allPaths.filter((p) => {
    if (base && !p.startsWith(base)) return false;
    if (!/\.md$/i.test(p)) return false;
    if (directFile && p === directFile) return true;
    const relative = base ? p.slice(base.length) : p;
    // Pick SKILL.md entries, or markdown under a skills/ folder.
    return /skill\.md$/i.test(relative) || /(^|\/)skills\//.test(p) || /(^|\/)skill(s)?\//.test(p);
  });

  if (candidates.length === 0) {
    throw new Error(
      "未在仓库中找到技能文件（SKILL.md 或 skills/ 目录下的 Markdown）。" +
        (directFile ? ` 目标文件 ${directFile} 不存在。` : "")
    );
  }

  const usedNames = new Set<string>();
  const results: GithubSkillSource[] = [];
  let fetched = 0;
  let failed = 0;
  for (const filePath of candidates) {
    const content = await fetchRawContent(owner, repo, ref, filePath, fetcher);
    if (content === null) {
      failed += 1;
      continue;
    }
    fetched += 1;
    const fallbackName = skillNameFromPath(filePath);
    const def = parseSkillMarkdown(content, fallbackName);
    const baseName = def.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || fallbackName;
    let name = baseName;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${baseName}-${i++}`;
    }
    usedNames.add(name);
    results.push({
      name,
      description: def.description,
      version: def.version || "0.0.0",
      license: def.license,
      author: def.author,
      homepage: def.homepage,
      tags: def.tags || ["external"],
      allowedTools: def.allowedTools,
      priority: def.priority,
      content: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") || `# ${name}\n`,
      sourcePath: filePath,
      sourceUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
    });
  }

  if (results.length === 0) {
    throw new Error(
      `已找到 ${candidates.length} 个技能文件但内容拉取失败（网络不可达 ${failed} 个）。` +
        "请检查网络连接后重试。"
    );
  }
  if (failed > 0) {
    // Some files failed but we still have results — log and continue.
    console.warn(`[skill-install] ${failed} 个技能文件拉取失败（${owner}/${repo}）`);
  }
  return results;
}

/**
 * E2: 可安装技能包加载器 (SkillPackageLoader)
 */
export class SkillPackageLoader {
  private searchDirs: string[];
  private writeDir: string;

  constructor(options: SkillPackageLoaderOptions = {}) {
    // Project skills take precedence over user skills (claude-code / codex convention).
    this.searchDirs = options.customDirs || [getProjectSkillsDir(), getUserSkillsDir()];
    this.writeDir =
      options.writeDir || options.customDirs?.[options.customDirs.length - 1] || getUserSkillsDir();
  }

  /** 用户级技能根目录（~/.hachimi/skills） */
  getUserSkillsDir(): string {
    return this.writeDir;
  }

  /**
   * 扫描多级目录并载入所有匹配的外部 Skill 技能包。
   * 同名冲突：project 优先于 user（先出现者胜）。
   */
  loadPackages(): SkillDefinition[] {
    const loadedSkills: SkillDefinition[] = [];
    const seenNames = new Set<string>();

    for (const [index, searchDir] of this.searchDirs.entries()) {
      if (!existsSync(searchDir)) continue;
      // Position-based labeling: the first root is "project", the rest are user/external.
      const source: SkillSource = index === 0 ? "project" : "external";

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
                loadedSkills.push({
                  ...skill,
                  source: skill.source === "external" ? source : skill.source,
                  sourceDir: searchDir,
                });
              }
            }
          } else if (entry.endsWith(".md")) {
            const fileContent = readFileSync(fullPath, "utf-8");
            const fallbackName = entry.replace(/\.md$/, "");
            const skill = parseSkillMarkdown(fileContent, fallbackName);

            if (!seenNames.has(skill.name)) {
              seenNames.add(skill.name);
              loadedSkills.push({
                ...skill,
                source: skill.source === "external" ? source : skill.source,
                sourceDir: searchDir,
              });
            }
          }
        }
      } catch {
        /* ignore read errors */
      }
    }

    return loadedSkills;
  }

  /** Resolve the on-disk package dir for a skill name in the user skills root. */
  resolveUserSkillPath(name: string): string {
    return join(this.writeDir, name);
  }

  /** 手工创建技能（写入 ~/.hachimi/skills/<name>/SKILL.md）。 */
  createSkill(input: {
    name: string;
    description?: string;
    instructions: string;
    tags?: string[];
    version?: string;
    license?: string;
    author?: string;
    homepage?: string;
  }): { name: string; path: string } {
    const cleanName = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");
    if (!cleanName) throw new Error("技能名称不能为空");
    const targetDir = this.resolveUserSkillPath(cleanName);
    if (existsSync(targetDir)) {
      throw new Error(`技能 ${cleanName} 已存在，请使用更新操作`);
    }
    mkdirSync(targetDir, { recursive: true });
    const frontmatter = [
      "---",
      `name: ${cleanName}`,
      `description: ${(input.description || input.instructions.slice(0, 80)).replace(/\n/g, " ")}`,
      `version: ${input.version || "0.0.1"}`,
      ...(input.tags?.length ? [`tags: [${input.tags.join(", ")}]`] : []),
      ...(input.license ? [`license: ${input.license}`] : []),
      ...(input.author ? [`author: ${input.author}`] : []),
      ...(input.homepage ? [`homepage: ${input.homepage}`] : []),
      "---",
      "",
      input.instructions.trim(),
      "",
    ].join("\n");
    const skillMdPath = join(targetDir, "SKILL.md");
    writeFileSync(skillMdPath, frontmatter, "utf-8");
    return { name: cleanName, path: skillMdPath };
  }

  /** 更新技能内容（按名称定位到用户技能根目录）。 */
  updateSkill(name: string, content: string): { path: string } {
    const targetDir = this.resolveUserSkillPath(name);
    const skillMdPath = join(targetDir, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      throw new Error(`技能 ${name} 不存在或不是用户技能`);
    }
    writeFileSync(skillMdPath, content, "utf-8");
    return { path: skillMdPath };
  }

  /** 删除用户技能（含目录）。 */
  deleteSkill(name: string): { success: boolean; message: string } {
    const targetDir = this.resolveUserSkillPath(name);
    if (!existsSync(targetDir)) {
      return { success: false, message: `技能 ${name} 不存在` };
    }
    rmSync(targetDir, { recursive: true, force: true });
    return { success: true, message: `已删除技能 ${name}` };
  }
}
