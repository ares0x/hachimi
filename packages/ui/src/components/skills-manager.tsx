import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Github,
  Lightbulb,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { SkillProposalCard, type SkillProposalItem } from "./skill-proposal-card";

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  content?: string;
  source?: "builtin" | "learned" | "external" | "project";
  sourceDir?: string;
  version?: string;
  author?: string;
  license?: string;
  homepage?: string;
  tags?: string[];
  allowedTools?: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  builtin: "内置",
  external: "用户",
  project: "项目",
  learned: "习得",
};

export function SkillsManager() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [proposals, setProposals] = useState<SkillProposalItem[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "proposals">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  // Install from GitHub
  const [installOpen, setInstallOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");

  // Create / edit
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SkillItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.skills)) {
          setSkills(data.skills);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/skills/proposals?status=pending");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.proposals)) {
          setProposals(data.proposals);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
    void fetchProposals();
  }, [fetchSkills, fetchProposals]);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  const handleAcceptProposal = async (id: string) => {
    try {
      await fetch(`/api/skills/proposals/${id}/accept`, { method: "POST" });
      await fetchSkills();
      await fetchProposals();
    } catch {
      /* ignore */
    }
  };

  const handleRejectProposal = async (id: string) => {
    try {
      await fetch(`/api/skills/proposals/${id}/reject`, { method: "POST" });
      await fetchProposals();
    } catch {
      /* ignore */
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleSkill = async (id: string) => {
    const target = skills.find((s) => s.id === id);
    if (!target) return;
    const nextState = !target.enabled;
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: nextState } : s)));
    try {
      await fetch(`/api/skills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });
    } catch {
      /* ignore */
    }
  };

  const handleOpenFolder = async () => {
    try {
      await fetch("/api/skills/open-folder", { method: "POST" });
    } catch {
      /* ignore */
    }
  };

  const handleInstall = async () => {
    const url = installUrl.trim();
    if (!url) return;
    setInstalling(true);
    setInstallError("");
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { success?: boolean; count?: number; error?: string };
      if (res.ok && data.success) {
        setInstallOpen(false);
        setInstallUrl("");
        await fetchSkills();
        flashNotice(`已从 GitHub 安装 ${data.count ?? 0} 个技能`);
      } else {
        setInstallError(data.error || "安装失败，请检查 URL");
      }
    } catch {
      setInstallError("安装失败，请检查网络或 URL");
    } finally {
      setInstalling(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormDescription("");
    setFormContent("");
    setEditorOpen(true);
  };

  const openEdit = (skill: SkillItem) => {
    setEditing(skill);
    setFormName(skill.name);
    setFormDescription(skill.description);
    setFormContent(skill.content || "");
    setEditorOpen(true);
  };

  const handleSaveSkill = async () => {
    if (!formName.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/skills/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: formContent }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setNotice(`保存失败：${data.error || "未知错误"}`);
          return;
        }
      } else {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription,
            instructions: formContent,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setNotice(`创建失败：${data.error || "未知错误"}`);
          return;
        }
      }
      setEditorOpen(false);
      await fetchSkills();
      flashNotice(editing ? "技能已更新" : "技能已创建");
    } catch {
      setNotice("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: SkillItem) => {
    if (!window.confirm(`确定删除技能「${skill.name}」？此操作不可撤销。`)) return;
    const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchSkills();
      flashNotice(`技能「${skill.name}」已删除`);
    } else {
      const data = (await res.json()) as { error?: string };
      setNotice(data.error || "删除失败");
    }
  };

  const pendingProposals = proposals.filter((p) => p.status === "pending");

  return (
    <div className="flex h-full flex-col overflow-hidden pr-10">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-1 rounded-xl bg-surface-hover/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]",
              activeTab === "active"
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            已激活技能 ({skills.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("proposals")}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]",
              activeTab === "proposals"
                ? "bg-surface-elevated text-amber-500 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Lightbulb className="size-3.5 shrink-0 text-amber-500" />
            待审核提案 {pendingProposals.length > 0 && `(${pendingProposals.length})`}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "active" && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索技能…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8.5 w-44 rounded-xl border border-border/50 bg-surface/80 pl-8 pr-3 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <button
                type="button"
                onClick={() => setInstallOpen(true)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs"
              >
                <Github className="size-3.5 text-muted-foreground shrink-0" />从 GitHub 安装
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.97] hover:opacity-90 shadow-xs"
              >
                <Plus className="size-3.5 shrink-0" />
                新建技能
              </button>
              <button
                type="button"
                onClick={handleOpenFolder}
                title="打开技能文件夹"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs"
              >
                <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
                文件夹
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              void fetchSkills();
              void fetchProposals();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-surface/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover"
          >
            <RefreshCw className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          {notice}
        </div>
      )}

      {/* Main Cards List */}
      <div className="flex-1 space-y-3 overflow-y-auto pt-4 scroll-quiet">
        {activeTab === "proposals" ? (
          pendingProposals.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-6 text-center">
              <Lightbulb className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">暂无待审核的技能提案</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                当完成复杂 Work 后，可通过“从 Work 提炼 Skill”自动生成技能提案，在此处进行人审确认。
              </p>
            </div>
          ) : (
            pendingProposals.map((proposal) => (
              <SkillProposalCard
                key={proposal.id}
                proposal={proposal}
                onAccept={handleAcceptProposal}
                onReject={handleRejectProposal}
              />
            ))
          )
        ) : filteredSkills.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-6 text-center">
            <Sparkles className="size-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground">暂无匹配的技能</p>
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const isExpanded = expandedSkillId === skill.id;
            const canEdit = skill.source === "external" || skill.source === "project";
            return (
              <div
                key={skill.id}
                className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs backdrop-blur-xs transition-all hover:border-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      <h4 className="text-sm font-medium font-mono text-foreground">
                        {skill.name}
                      </h4>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                          skill.source === "builtin"
                            ? "border-border/40 bg-surface-hover/70 text-muted-foreground"
                            : "border-primary/30 bg-primary/10 text-primary"
                        )}
                      >
                        {SOURCE_LABELS[skill.source || "builtin"] || skill.source}
                      </span>
                      {skill.version && (
                        <span className="rounded-md bg-surface-hover/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          v{skill.version}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                      {skill.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(skill)}
                        title="编辑技能"
                        className="rounded-lg p-1.5 text-muted-foreground transition-all active:scale-[0.95] hover:bg-surface-hover hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDelete(skill)}
                        title="删除技能"
                        className="rounded-lg p-1.5 text-muted-foreground transition-all active:scale-[0.95] hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleSkill(skill.id)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors active:scale-[0.97]",
                        skill.enabled ? "bg-primary" : "bg-surface-hover border border-border/60"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-md transition-transform",
                          skill.enabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Path & Preview Header */}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/20 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                    className="flex items-center gap-1 whitespace-nowrap shrink-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-3 shrink-0" />
                    ) : (
                      <ChevronDown className="size-3 shrink-0" />
                    )}
                    {isExpanded ? "收起内容" : "查看内容"}
                  </button>

                  <span
                    title={skill.path}
                    className="truncate max-w-[260px] sm:max-w-[340px] rounded-lg bg-surface-hover/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {skill.path}
                  </span>
                </div>

                {/* SKILL.md Preview Drawer */}
                {isExpanded && (
                  <div className="mt-3 rounded-xl border border-border/40 bg-surface/90 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                      {skill.content || "暂无 SKILL.md 内容预览"}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Install from GitHub modal */}
      {installOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/28 p-4 dark:bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface-elevated p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">从 GitHub 安装技能</h4>
              <button
                type="button"
                onClick={() => setInstallOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              支持仓库、tree、blob 链接；自动识别 skills/ 目录下的 SKILL.md。国内网络自动回退
              jsDelivr 通道。
            </p>
            <input
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              placeholder="https://github.com/owner/repo 或 /tree/main/skills"
              className="mt-3 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
            />
            {installError && <p className="mt-2 text-xs text-destructive">{installError}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInstallOpen(false)}
                className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-all active:scale-[0.97] hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                disabled={installing || !installUrl.trim()}
                onClick={() => void handleInstall()}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.97] hover:opacity-90 disabled:opacity-50"
              >
                {installing ? "安装中…" : "安装"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/28 p-4 dark:bg-black/50">
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-border/50 bg-surface-elevated p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                {editing ? `编辑技能 ${editing.name}` : "新建技能"}
              </h4>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {!editing && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      技能名称
                    </label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="如 daily-report"
                      className="mt-1 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">描述</label>
                    <input
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="一句话说明技能用途"
                      className="mt-1 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 text-xs text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-1 flex-col">
                <label className="text-[11px] font-medium text-muted-foreground">
                  SKILL.md 内容 {editing && "（含 frontmatter）"}
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder={
                    editing ? "---\nname: xxx\ndescription: xxx\n---\n\n技能指令…" : "技能指令…"
                  }
                  className="mt-1 flex-1 min-h-[300px] w-full resize-none rounded-xl border border-border/50 bg-surface p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-all active:scale-[0.97] hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving || !formName.trim() || !formContent.trim()}
                onClick={() => void handleSaveSkill()}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.97] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
