// packages/ui/src/components/credentials-manager.tsx
import { KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils";

export interface CredentialEntry {
  slug: string;
  kind: string;
  kindLabel: string;
  preview: string;
  hasValue: boolean;
}

const CREDENTIAL_KINDS = [
  "api_key",
  "bot_token",
  "app_secret",
  "proxy_password",
  "oauth_token",
  "env_secret",
] as const;

const QUICK_ADD = [
  { slug: "tavily", kind: "api_key", label: "Tavily 搜索", hint: "web_search 优先服务商" },
  { slug: "brave", kind: "api_key", label: "Brave 搜索", hint: "web_search 备用服务商" },
  { slug: "exa", kind: "api_key", label: "Exa 搜索", hint: "web_search 备用服务商" },
  { slug: "serper", kind: "api_key", label: "Serper 搜索", hint: "web_search 备用服务商" },
  { slug: "telegram", kind: "bot_token", label: "Telegram Bot", hint: "Telegram 网关 Bot Token" },
  { slug: "github", kind: "env_secret", label: "GitHub Token", hint: "MCP github 环境变量引用" },
  { slug: "firecrawl", kind: "api_key", label: "Firecrawl", hint: "MCP firecrawl 环境变量引用" },
] as const;

export function CredentialsManager() {
  const [entries, setEntries] = useState<CredentialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formSlug, setFormSlug] = useState("");
  const [formKind, setFormKind] = useState<string>("api_key");
  const [formValue, setFormValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/credentials");
      if (res.ok) {
        const data = (await res.json()) as { entries: CredentialEntry[] };
        setEntries(data.entries);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const handleSave = async () => {
    const slug = formSlug.trim().toLowerCase();
    const value = formValue.trim();
    if (!slug || !value) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/credentials/${slug}/${formKind}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        setModalOpen(false);
        setFormSlug("");
        setFormValue("");
        setFormKind("api_key");
        await fetchEntries();
        flashNotice("凭据已保存到本机凭据库");
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = (slug: string, kind: string) => {
    setFormSlug(slug);
    setFormKind(kind);
    setFormValue("");
    setModalOpen(true);
  };

  const handleDelete = async (slug: string, kind: string) => {
    if (!window.confirm(`确定删除凭据「${slug}」(${kind})？`)) return;
    const res = await fetch(`/api/credentials/${slug}/${kind}`, { method: "DELETE" });
    if (res.ok) {
      await fetchEntries();
      flashNotice("凭据已删除");
    }
  };

  const quickItems = QUICK_ADD.filter(
    (q) => !entries.some((e) => e.slug === q.slug && e.kind === q.kind)
  );

  return (
    <div className="flex h-full flex-col overflow-hidden pr-10">
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">凭据库 ({entries.length})</h3>
          <span className="rounded-lg bg-surface-hover/80 px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
            0600 加密文件 · 不写入 config.json
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchEntries()}
            className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs"
          >
            <RefreshCw className="size-3.5 text-muted-foreground shrink-0" />
            刷新
          </button>
          <button
            type="button"
            onClick={() => {
              setFormSlug("");
              setFormKind("api_key");
              setFormValue("");
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.97] hover:opacity-90 shadow-xs"
          >
            <Plus className="size-3.5 shrink-0" />
            添加凭据
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          {notice}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pt-4 scroll-quiet">
        {/* Existing credentials */}
        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            加载中…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-6 text-center">
            <KeyRound className="size-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground">暂无已保存的凭据</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              模型 API Key 在「模型与密钥」中管理；这里统一管理搜索服务、Telegram、MCP 等其它密钥。
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={`${entry.slug}:${entry.kind}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-surface-elevated/70 p-3.5 shadow-xs transition-all hover:border-border"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-hover/80">
                  <KeyRound className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {entry.slug}
                    </span>
                    <span className="rounded-md border border-border/40 bg-surface-hover/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {entry.kindLabel || entry.kind}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {entry.hasValue ? entry.preview : "未设置"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(entry.slug, entry.kind)}
                className="flex shrink-0 items-center gap-1 rounded-xl border border-border/50 bg-surface px-2.5 py-1.5 text-xs text-muted-foreground transition-all active:scale-[0.97] hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5 shrink-0" />
                删除
              </button>
            </div>
          ))
        )}

        {/* Quick add presets */}
        {quickItems.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-medium text-muted-foreground">常用服务商快捷添加</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickItems.map((q) => (
                <button
                  key={`${q.slug}:${q.kind}`}
                  type="button"
                  onClick={() => handleQuickAdd(q.slug, q.kind)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-surface/70 px-3 py-2.5 text-left transition-all active:scale-[0.97] hover:border-primary/40 hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-foreground">{q.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{q.hint}</p>
                  </div>
                  <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/28 p-4 dark:bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface-elevated p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">添加凭据</h4>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">标识 (slug)</label>
                <input
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="如 tavily / telegram / mcp-github"
                  className="mt-1 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">类型 (kind)</label>
                <select
                  value={formKind}
                  onChange={(e) => setFormKind(e.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  {CREDENTIAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">密钥值</label>
                <input
                  type="password"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="粘贴密钥…"
                  className="mt-1 h-9 w-full rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-all active:scale-[0.97] hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving || !formSlug.trim() || !formValue.trim()}
                onClick={() => void handleSave()}
                className={cn(
                  "rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.97] hover:opacity-90",
                  (saving || !formSlug.trim() || !formValue.trim()) &&
                    "opacity-50 cursor-not-allowed"
                )}
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
