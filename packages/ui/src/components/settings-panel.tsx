import { Check, Download, KeyRound, Moon, Palette, Sparkles, Sun, Upload, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "../lib/utils";
import { Meta, SectionLabel } from "./primitives";

export type ThemeTone = "light" | "dark";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  /** p/m tokens per second est. (relative, for badge only) */
  speed?: "fast" | "balanced" | "thorough";
  /** W3.7: associated provider ID from daemon config */
  providerId?: string;
}

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;

  /** 主题 */
  theme: ThemeTone;
  onThemeChange: (t: ThemeTone) => void;
  accentColor?: string;
  onAccentChange?: (hex: string) => void;

  /** 模型选择 */
  models: ModelOption[];
  selectedModelId: string;
  onModelChange: (id: string) => void;

  /** Secret / Daemon 授权 */
  secretConfigured?: boolean;
  secretPreview?: string;
  onSecretClear?: () => void;
  onSecretPaste?: (raw: string) => void;

  /** Bundle Import / Export */
  onExportBundle?: () => Promise<unknown> | unknown;
  onImportBundle?: (file: File) => Promise<unknown> | unknown;
  bundleBusy?: boolean;

  className?: string;
}

const SPEED_BADGE: Record<NonNullable<ModelOption["speed"]>, string> = {
  fast: "border-info/40 bg-info/10 text-info",
  balanced: "border-primary/40 bg-primary/10 text-primary",
  thorough: "border-mode-research/40 bg-mode-research/10 text-mode-research",
};

const ACCENT_PRESETS = [
  { hex: "#3b82f6", label: "Azure" },
  { hex: "#0d9488", label: "Ink Teal" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Ruby" },
  { hex: "#10b981", label: "Emerald" },
];

export function SettingsPanel({
  open,
  onClose,
  theme,
  onThemeChange,
  accentColor = "#0d9488",
  onAccentChange,
  models,
  selectedModelId,
  onModelChange,
  secretConfigured = false,
  secretPreview,
  onSecretClear,
  onSecretPaste,
  onExportBundle,
  onImportBundle,
  bundleBusy = false,
  className,
}: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secretPasteRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-40 opacity-0 transition-opacity duration-200",
        open && "pointer-events-auto opacity-100"
      )}
      aria-hidden={!open}
    >
      {/* scrim */}
      <button
        type="button"
        aria-label="关闭设置"
        onClick={onClose}
        className="absolute inset-0 bg-backdrop/40 backdrop-blur-[2px]"
      />

      {/* sheet */}
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[26rem] flex-col border-l border-border bg-surface shadow-[0_0_60px_oklch(0.2_0.01_260_/0.12)] transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-[14.5px] font-medium tracking-tight text-foreground">设置</h3>
            <Meta>外观 · 模型 · 授权 · 数据</Meta>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {/* ─── 外观 ────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5">
              <Palette className="size-3.5 text-primary" />
              <SectionLabel>外观</SectionLabel>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onThemeChange("light")}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  theme === "light"
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-surface-elevated/50 hover:border-border-strong"
                )}
              >
                <Sun className="mt-0.5 size-4 text-amber-500" />
                <div>
                  <div className="text-[13px] font-medium text-foreground">Light</div>
                  <Meta>默认，遵循设计系统</Meta>
                </div>
                {theme === "light" && <Check className="ml-auto size-4 text-primary" />}
              </button>
              <button
                type="button"
                onClick={() => onThemeChange("dark")}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  theme === "dark"
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-surface-elevated/50 hover:border-border-strong"
                )}
              >
                <Moon className="mt-0.5 size-4 text-indigo-400" />
                <div>
                  <div className="text-[13px] font-medium text-foreground">Dark</div>
                  <Meta>高对比度夜间模式</Meta>
                </div>
                {theme === "dark" && <Check className="ml-auto size-4 text-primary" />}
              </button>
            </div>

            {onAccentChange && (
              <div className="mt-4">
                <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">主色</div>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => onAccentChange(p.hex)}
                      className={cn(
                        "group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11.5px]",
                        accentColor.toLowerCase() === p.hex.toLowerCase()
                          ? "border-primary/60 bg-primary/5"
                          : "border-border hover:border-border-strong"
                      )}
                    >
                      <span
                        className="size-3.5 rounded-full border border-black/10"
                        style={{ background: p.hex }}
                      />
                      <span className="text-foreground/90">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ─── 模型 ────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-mode-research" />
              <SectionLabel>模型</SectionLabel>
            </div>

            <ul className="mt-3 space-y-1.5">
              {models.map((m) => {
                const selected = m.id === selectedModelId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onModelChange(m.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border bg-surface-elevated/50 hover:border-border-strong"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">{m.name}</span>
                          {m.speed && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded border px-1.5 py-0 font-mono text-[9.5px] uppercase tracking-wider",
                                SPEED_BADGE[m.speed]
                              )}
                            >
                              {m.speed}
                            </span>
                          )}
                        </div>
                        {m.description && <Meta className="mt-0.5">{m.description}</Meta>}
                      </div>
                      {selected && <Check className="size-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ─── Secret / Daemon 授权 ───────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-success" />
              <SectionLabel>Daemon / API Secret</SectionLabel>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-surface-elevated/60 p-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-2 items-center rounded-full",
                    secretConfigured ? "bg-success" : "bg-warning"
                  )}
                />
                <span className="text-[13px] font-medium text-foreground">
                  {secretConfigured ? "已配置 Secret" : "尚未配置 Secret"}
                </span>
                {secretPreview && secretConfigured && (
                  <Meta className="ml-auto font-mono">{secretPreview}</Meta>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={secretPasteRef}
                  type="password"
                  autoComplete="off"
                  placeholder="粘贴 API secret…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && onSecretPaste) {
                      const v = (e.currentTarget.value || "").trim();
                      if (v) {
                        onSecretPaste(v);
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
                {onSecretPaste && (
                  <button
                    type="button"
                    onClick={() => {
                      const v = (secretPasteRef.current?.value || "").trim();
                      if (v) {
                        onSecretPaste(v);
                        if (secretPasteRef.current) secretPasteRef.current.value = "";
                      }
                    }}
                    className="h-9 rounded-md border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-hover"
                  >
                    保存
                  </button>
                )}
                {onSecretClear && secretConfigured && (
                  <button
                    type="button"
                    onClick={onSecretClear}
                    className="h-9 rounded-md border border-danger/40 px-3 text-[12px] font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    清除
                  </button>
                )}
              </div>
              <Meta className="mt-2">
                用于和远端 Hachimi Daemon / API 通道之间的可信请求。保存于本地，不会导出到 Bundle。
              </Meta>
            </div>
          </section>

          {/* ─── Bundle 导入 / 导出 ──────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-info" />
              <SectionLabel>数据 Bundle</SectionLabel>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportBundle}
                disabled={bundleBusy}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-60"
              >
                <Download className="size-3.5" />
                <span>导出 Bundle…</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={bundleBusy}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-60"
              >
                <Upload className="size-3.5" />
                <span>导入 Bundle…</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && onImportBundle) onImportBundle(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Meta className="mt-2">
              Bundle 包含 Works · 事件日志 · 长期记忆 · 技能清单。用于跨设备迁移与备份。
            </Meta>
          </section>
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <Meta>Hachimi · Local-first</Meta>
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ModelOption as SettingsModelOption };
