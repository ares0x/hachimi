import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

export interface SkillProposalItem {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  instructions: string;
  triggerCondition?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  sourceWorkId?: string;
}

export interface SkillProposalCardProps {
  proposal: SkillProposalItem;
  onAccept: (id: string) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  className?: string;
}

export function SkillProposalCard({
  proposal,
  onAccept,
  onReject,
  className,
}: SkillProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    setBusy(true);
    try {
      await onAccept(proposal.id);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await onReject(proposal.id);
    } finally {
      setBusy(false);
    }
  };

  if (proposal.status !== "pending") return null;

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-xs backdrop-blur-xs transition-all hover:border-amber-500/50",
        className
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0">
                <Sparkles className="size-3 shrink-0" /> 💡 技能提案待审核
              </span>
              <h4 className="text-sm font-medium font-mono text-foreground">{proposal.name}</h4>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              {proposal.description}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={handleReject}
              className="flex items-center gap-1 rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all active:scale-[0.97] hover:bg-destructive/10 hover:text-destructive whitespace-nowrap"
            >
              <X className="size-3" /> 拒绝
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleAccept}
              className="flex items-center gap-1 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-xs transition-transform active:scale-[0.97] hover:opacity-90 whitespace-nowrap"
            >
              <Check className="size-3" /> 接受提案
            </button>
          </div>
        </div>

        {proposal.triggerCondition && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/70">触发条件:</span>
            <span className="font-mono text-muted-foreground">{proposal.triggerCondition}</span>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-amber-500/20 pt-2.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {expanded ? "收起 SKILL.md 指令" : "查看提炼的 SKILL.md 指令"}
        </button>

        {expanded && (
          <div className="mt-2.5 rounded-xl border border-amber-500/20 bg-surface/90 p-3">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
              {proposal.instructions}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
