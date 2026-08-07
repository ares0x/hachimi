// packages/ui/src/components/usage-panel.tsx
/**
 * L1 (D4): 用量/费用面板 — GET /api/usage（buildUsageSummary 投影）。
 * 展示汇总指标、Top 工具、Top 模型与按会话分解；点击会话行跳转到对应 Work。
 */
import { BarChart3, Coins, Cpu, Layers, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { fetchUsage, type UsageSessionRow, type UsageSummaryData } from "../api";

const fmtTokens = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const fmtCost = (n: number): string => `$${n.toFixed(4)}`;

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">{sub}</div>}
    </div>
  );
}

function SessionRow({
  row,
  onOpenWork,
}: {
  row: UsageSessionRow;
  onOpenWork?: (workId: string) => void;
}) {
  const toolCalls = row.toolCalls ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpenWork?.(row.sessionId)}
      className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border/70 hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] text-foreground">
          {row.sessionId.slice(0, 16)}
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">
          {row.runs} runs · {toolCalls} tools · {row.failedRuns} failed
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[12px] text-foreground">
          {fmtTokens(row.totalTokens)} tok
        </div>
        <div className="font-mono text-[10.5px] text-muted-foreground">{fmtCost(row.costUsd)}</div>
      </div>
    </button>
  );
}

export function UsagePanel({
  open,
  onClose,
  onOpenWork,
  days = 7,
}: {
  open: boolean;
  onClose: () => void;
  onOpenWork?: (workId: string) => void;
  days?: number;
}) {
  const [summary, setSummary] = useState<UsageSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchUsage(days);
      if (data) {
        setSummary(data);
        setError(null);
      } else {
        setError("无法获取用量数据（daemon 可能离线）");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // 用量变化慢，10s 轮询足够
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [open, days]);

  const maxToolCalls = Math.max(1, ...(summary?.topTools ?? []).map((t) => t.calls));

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭用量面板"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20"
      />
      <motion.aside
        initial={{ x: 400, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
        className="absolute inset-y-0 right-0 flex w-[380px] flex-col border-l border-border bg-background"
      >
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <BarChart3 className="size-4 text-primary" />
          <h2 className="text-[14px] font-semibold text-foreground">用量与费用</h2>
          {summary && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {summary.periodFrom?.slice(0, 10)} ~ {summary.periodTo?.slice(0, 10)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          {!summary && !error && (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <Coins className="size-7 text-border-strong" />
              <p className="text-[13px] text-muted-foreground">正在加载用量数据…</p>
            </div>
          )}

          {summary && (
            <>
              {/* 汇总指标 */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={<Layers className="size-3" />}
                  label="回合 / 会话"
                  value={String(summary.runs)}
                  sub={`${summary.sessions} 会话 · ${summary.failedRuns} 失败`}
                />
                <StatCard
                  icon={<Cpu className="size-3" />}
                  label="Tokens"
                  value={fmtTokens(summary.tokens?.totalTokens ?? 0)}
                  sub={`in ${fmtTokens(summary.tokens?.inputTokens ?? 0)} · out ${fmtTokens(summary.tokens?.outputTokens ?? 0)}`}
                />
                <StatCard
                  icon={<Coins className="size-3" />}
                  label="费用"
                  value={fmtCost(summary.costUsd ?? 0)}
                  sub={`${(summary.topModels ?? []).length} 个模型`}
                />
                <StatCard
                  icon={<BarChart3 className="size-3" />}
                  label="工具调用"
                  value={String((summary.topTools ?? []).reduce((acc, t) => acc + t.calls, 0))}
                  sub={`${(summary.topTools ?? []).length} 种工具`}
                />
              </div>

              {/* Top 工具 */}
              {(summary.topTools ?? []).length > 0 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Top 工具
                  </h3>
                  <div className="space-y-1.5">
                    {summary.topTools.slice(0, 6).map((t) => (
                      <div key={t.name} className="flex items-center gap-2">
                        <span className="w-28 truncate font-mono text-[11.5px] text-foreground">
                          {t.name}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(t.calls / maxToolCalls) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
                          {t.calls}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Top 模型 */}
              {(summary.topModels ?? []).length > 0 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Top 模型
                  </h3>
                  <div className="space-y-1">
                    {summary.topModels.slice(0, 5).map((m) => (
                      <div
                        key={m.model}
                        className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[11.5px] text-foreground">
                            {m.model}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted-foreground">
                            {m.runs} runs · {fmtTokens(m.totalTokens)} tok
                          </div>
                        </div>
                        <span className="font-mono text-[11.5px] text-foreground">
                          {fmtCost(m.costUsd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 按会话分解 */}
              <section>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  按会话
                </h3>
                {(summary.bySession ?? []).length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">暂无会话用量数据</p>
                ) : (
                  <div className="space-y-0.5">
                    {summary.bySession.slice(0, 20).map((row) => (
                      <SessionRow key={row.sessionId} row={row} onOpenWork={onOpenWork} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
