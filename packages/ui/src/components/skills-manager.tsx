import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  RefreshCw,
  Search,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { SkillProposalCard, type SkillProposalItem } from "./skill-proposal-card";

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  content?: string;
}

export function SkillsManager() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [proposals, setProposals] = useState<SkillProposalItem[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "proposals">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  const fetchSkills = async () => {
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
  };

  const fetchProposals = async () => {
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
  };

  useEffect(() => {
    void fetchSkills();
    void fetchProposals();
  }, []);

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
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索技能名称、描述或路径..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8.5 w-56 rounded-xl border border-border/50 bg-surface/80 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs"
          >
            <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
            打开文件夹
          </button>
        </div>
      </div>

      {/* Main Cards List */}
      <div className="flex-1 space-y-3 overflow-y-auto pt-4 scroll-quiet">
        {activeTab === "proposals" ? (
          pendingProposals.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-6 text-center">
              <Lightbulb className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">暂无待审核的技能提案</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                当完成复杂 Work 后，可通过“从 Work 提炼
                Skill”自动生成技能提案，在此处进行人审人导确认。
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
        ) : (
          filteredSkills.map((skill) => {
            const isExpanded = expandedSkillId === skill.id;
            return (
              <div
                key={skill.id}
                className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs backdrop-blur-xs transition-all hover:border-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <h4 className="text-sm font-medium font-mono text-foreground">
                        {skill.name}
                      </h4>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                      {skill.description}
                    </p>
                  </div>

                  {/* Toggle Switch */}
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
    </div>
  );
}
