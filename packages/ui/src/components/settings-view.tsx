// packages/ui/src/components/settings-view.tsx

import { Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils.js";
import { CredentialsManager } from "./credentials-manager.js";
import { McpManager } from "./mcp-manager.js";
import { SkillsManager } from "./skills-manager.js";

export type SettingsViewTab =
  | "appearance"
  | "general"
  | "connections"
  | "credentials"
  | "skills"
  | "mcp"
  | "browser"
  | "personal_context"
  | "memory"
  | "sandbox"
  | "permission_rules"
  | "audit"
  | "data_bundle"
  | "about";

export interface SettingsViewProps {
  open?: boolean;
  onClose?: () => void;
  /** @deprecated — use onClose instead */
  onBack?: () => void;
  theme: "light" | "dark";
  onThemeChange: (t: "light" | "dark") => void;
  accentColor?: string;
  onAccentChange?: (hex: string) => void;
  selectedModelId?: string;
  onModelChange?: (id: string) => void;
  onExportBundle?: () => Promise<unknown> | unknown;
  onImportBundle?: (file: File) => Promise<unknown> | unknown;
  bundleBusy?: boolean;
  initialTab?: SettingsViewTab;
  /** Daemon API 密钥（web 直连 daemon 时使用；desktop 不传则隐藏） */
  secretConfigured?: boolean;
  secretPreview?: string;
  onSecretClear?: () => void;
  onSecretPaste?: (secret: string) => void;
}

const ACCENT_PRESETS = [
  { hex: "#0d9488", label: "Ink Teal" },
  { hex: "#3b82f6", label: "Azure" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Ruby" },
  { hex: "#10b981", label: "Emerald" },
];

/* ───────────────────── Controls Primitives (Native Specs) ───────────────────── */

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-150 active:scale-[0.97]",
        checked ? "bg-primary" : "bg-muted/70 border border-border/40"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-2xs transition-transform duration-150",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex h-[26px] items-center rounded-md border border-border/40 bg-surface/80 p-0.5 gap-0.5 select-none">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative h-full px-2.5 text-[13px] font-medium transition-all active:scale-[0.97] rounded-[4px]",
              active
                ? "bg-surface-elevated text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorDots({
  selectedHex,
  onChange,
}: {
  selectedHex?: string;
  onChange?: (hex: string) => void;
}) {
  if (!onChange) return null;
  return (
    <div className="flex items-center gap-2">
      {ACCENT_PRESETS.map((preset) => {
        const active = selectedHex?.toLowerCase() === preset.hex.toLowerCase();
        return (
          <button
            key={preset.hex}
            type="button"
            onClick={() => onChange(preset.hex)}
            title={preset.label}
            className={cn(
              "size-[18px] rounded-full transition-all active:scale-[0.97] cursor-pointer",
              active
                ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-elevated"
                : "hover:scale-110"
            )}
            style={{ backgroundColor: preset.hex }}
          />
        );
      })}
    </div>
  );
}

function SettingSection({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {title && (
        <div className="flex items-center justify-between gap-2 px-3.5 text-[11px] font-medium text-muted-foreground">
          <span>{title}</span>
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className="rounded-xl border border-border/40 bg-surface-elevated/80 shadow-2xs overflow-hidden divide-y divide-border/40">
        {children}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  subtext,
  children,
  warningDot = false,
}: {
  label: string;
  subtext?: string;
  children?: React.ReactNode;
  warningDot?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-3.5 py-2 transition-colors",
        subtext ? "min-h-[52px]" : "min-h-[40px]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          <span>{label}</span>
          {warningDot && <span className="size-2 rounded-full bg-amber-500 shrink-0" />}
        </div>
        {subtext && (
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{subtext}</div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ───────────────────── Main Settings Container ───────────────────── */

export function SettingsView({
  open = true,
  onClose,
  onBack,
  theme,
  onThemeChange,
  accentColor = "#0d9488",
  onAccentChange,
  selectedModelId = "deepseek:deepseek-v4-flash",
  onModelChange,
  onExportBundle,
  onImportBundle,
  bundleBusy = false,
  initialTab = "appearance",
  secretConfigured,
  secretPreview,
  onSecretClear,
  onSecretPaste,
}: SettingsViewProps) {
  const handleClose = onClose || onBack || (() => {});
  const [activeTab, setActiveTab] = useState<SettingsViewTab>(initialTab);
  const [savedToast, setSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Secondary push view for "connections"
  const [pushProvider, setPushProvider] = useState<string | null>(null);

  const triggerSavedNotice = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1200);
  };

  // Keyboard shortcut Esc listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pushProvider) {
          setPushProvider(null);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pushProvider, handleClose]);

  const NAV_GROUPS: Array<{
    title: string;
    items: Array<{ id: SettingsViewTab; label: string }>;
  }> = [
    {
      title: "偏好设置",
      items: [
        { id: "appearance", label: "外观" },
        { id: "general", label: "通用" },
        { id: "personal_context", label: "人设与记忆库" },
        { id: "memory", label: "记忆库" },
      ],
    },
    {
      title: "智能引擎",
      items: [
        { id: "connections", label: "模型" },
        { id: "credentials", label: "凭据与密钥" },
        { id: "skills", label: "技能库" },
        { id: "mcp", label: "MCP 协议" },
      ],
    },
    {
      title: "系统能力",
      items: [
        { id: "browser", label: "浏览器与自动化" },
        { id: "sandbox", label: "安全与权限" },
        { id: "permission_rules", label: "权限规则" },
        { id: "audit", label: "审计日志" },
      ],
    },
    {
      title: "集成与数据",
      items: [
        { id: "data_bundle", label: "数据与备份" },
        { id: "about", label: "关于" },
      ],
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
      {/* Scrim Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/28 dark:bg-black/50 backdrop-blur-[2px]"
      />

      {/* Modal Sheet Window Container */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
        className="relative z-10 flex flex-col w-[min(920px,92vw)] h-[min(680px,88vh)] rounded-2xl border border-border-alpha bg-background overflow-hidden"
      >
        {/* Titlebar (52px) */}
        <div className="relative flex h-[52px] shrink-0 items-center justify-between border-b border-border/40 bg-surface/50 px-4">
          <div className="w-20" />
          <h2 className="text-[15px] font-semibold text-foreground tracking-tight">偏好设置</h2>
          <div className="flex items-center gap-3 w-20 justify-end">
            {savedToast && (
              <span className="font-mono text-[11px] text-muted-foreground/80 transition-opacity">
                已保存
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground active:scale-[0.97] transition-all cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Main Split Body: Sidebar (200px) + Content Canvas */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="flex w-[200px] shrink-0 flex-col border-r border-border/40 bg-surface/50 p-2 overflow-y-auto scroll-quiet">
            <nav className="space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <div className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setPushProvider(null);
                        }}
                        className={cn(
                          "relative flex h-[30px] w-full items-center justify-between rounded-md px-3 text-[13px] transition-all active:scale-[0.97] cursor-pointer",
                          active
                            ? "bg-surface-active text-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-primary before:rounded-r"
                            : "text-muted-foreground hover:text-foreground hover:bg-surface-hover/60"
                        )}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>

          {/* Right Content Canvas Area */}
          <main className="relative flex-1 overflow-y-auto bg-background p-6 scroll-quiet">
            <div className="mx-auto max-w-[50rem] space-y-6">
              {activeTab === "appearance" && (
                <AppearanceSection
                  theme={theme}
                  onThemeChange={(t) => {
                    onThemeChange(t);
                    triggerSavedNotice();
                  }}
                  accentColor={accentColor}
                  onAccentChange={(hex) => {
                    if (onAccentChange) onAccentChange(hex);
                    triggerSavedNotice();
                  }}
                />
              )}

              {activeTab === "general" && (
                <GeneralSection
                  onNotice={triggerSavedNotice}
                  secretConfigured={secretConfigured}
                  secretPreview={secretPreview}
                  onSecretClear={onSecretClear}
                  onSecretPaste={onSecretPaste}
                />
              )}

              {activeTab === "personal_context" && (
                <PersonalContextSection onNotice={triggerSavedNotice} />
              )}

              {activeTab === "connections" && (
                <ConnectionsSection
                  pushProvider={pushProvider}
                  setPushProvider={setPushProvider}
                  selectedModelId={selectedModelId}
                  onModelChange={(id) => {
                    if (onModelChange) onModelChange(id);
                    triggerSavedNotice();
                  }}
                />
              )}

              {activeTab === "credentials" && <CredentialsManager />}

              {activeTab === "skills" && <SkillsManager />}

              {activeTab === "mcp" && <McpManager />}

              {activeTab === "browser" && <BrowserSection onNotice={triggerSavedNotice} />}

              {activeTab === "sandbox" && <SandboxSection onNotice={triggerSavedNotice} />}

              {activeTab === "permission_rules" && (
                <PermissionRulesSection onNotice={triggerSavedNotice} />
              )}

              {activeTab === "audit" && <AuditSection onNotice={triggerSavedNotice} />}

              {activeTab === "memory" && <MemorySection onNotice={triggerSavedNotice} />}

              {activeTab === "data_bundle" && (
                <DataBundleSection
                  onExportBundle={onExportBundle}
                  onImportBundle={onImportBundle}
                  bundleBusy={bundleBusy}
                  fileInputRef={fileInputRef}
                  onNotice={triggerSavedNotice}
                />
              )}

              {activeTab === "about" && <AboutSection />}
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
}

/* ───────────────────── 1. 外观 (Appearance) ───────────────────── */

function AppearanceSection({
  theme,
  onThemeChange,
  accentColor,
  onAccentChange,
}: {
  theme: "light" | "dark";
  onThemeChange: (t: "light" | "dark") => void;
  accentColor?: string;
  onAccentChange?: (hex: string) => void;
}) {
  const [density, setDensity] = useState("comfortable");
  const [fontSize, setFontSize] = useState("13px");

  const activePreset = ACCENT_PRESETS.find(
    (p) => p.hex.toLowerCase() === accentColor?.toLowerCase()
  );

  return (
    <div className="space-y-6">
      <SettingSection title="外观界面">
        <SettingRow label="主题外观">
          <SegmentedControl
            value={theme}
            onChange={(val) => onThemeChange(val as "light" | "dark")}
            options={[
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="主色"
          subtext={`当前色调：${activePreset ? activePreset.label : "Ink Teal"}`}
        >
          <ColorDots selectedHex={accentColor} onChange={onAccentChange} />
        </SettingRow>

        <SettingRow label="界面密度">
          <SegmentedControl
            value={density}
            onChange={setDensity}
            options={[
              { value: "compact", label: "紧凑" },
              { value: "comfortable", label: "舒适" },
              { value: "relaxed", label: "松散" },
            ]}
          />
        </SettingRow>

        <SettingRow label="字号大小">
          <SegmentedControl
            value={fontSize}
            onChange={setFontSize}
            options={[
              { value: "12px", label: "12px" },
              { value: "13px", label: "13px" },
              { value: "14px", label: "14px" },
            ]}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 2. 通用 (General) ───────────────────── */

function GeneralSection({
  onNotice,
  secretConfigured,
  secretPreview,
  onSecretClear,
  onSecretPaste,
}: {
  onNotice: () => void;
  secretConfigured?: boolean;
  secretPreview?: string;
  onSecretClear?: () => void;
  onSecretPaste?: (secret: string) => void;
}) {
  const [autoRestore, setAutoRestore] = useState(true);
  const [lang, setLang] = useState("zh-CN");
  const [secretInput, setSecretInput] = useState("");

  return (
    <div className="space-y-6">
      <SettingSection title="常规偏好">
        <SettingRow label="启动行为" subtext="启动桌面应用时自动加载上次的工作区与会话">
          <ToggleSwitch
            checked={autoRestore}
            onChange={(v) => {
              setAutoRestore(v);
              onNotice();
            }}
          />
        </SettingRow>

        <SettingRow label="系统语言" subtext="界面与内置工具提示信息的语言">
          <button
            type="button"
            onClick={() => {
              setLang(lang === "zh-CN" ? "en-US" : "zh-CN");
              onNotice();
            }}
            className="flex h-7 items-center gap-1 px-2.5 text-[13px] font-medium text-foreground bg-surface-elevated border border-border/50 rounded-md hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
          >
            <span>{lang === "zh-CN" ? "简体中文" : "English"}</span>
          </button>
        </SettingRow>

        <SettingRow label="唤醒全局面板快捷键">
          <span className="font-mono text-[11px] px-2 py-1 rounded bg-surface border border-border/40 text-muted-foreground">
            ⌥ Space
          </span>
        </SettingRow>
      </SettingSection>

      {onSecretPaste && (
        <SettingSection title="Daemon 连接">
          <SettingRow
            label="API 密钥"
            subtext={
              secretConfigured
                ? `已配置${secretPreview ? `（${secretPreview}）` : ""}，所有请求将携带 Bearer 认证`
                : "配置后用于访问本地 daemon API（未配置则明文访问）"
            }
          >
            <div className="flex items-center gap-2">
              {secretConfigured && (
                <span className="font-mono text-[11px] text-emerald-500">已配置</span>
              )}
              <input
                type="password"
                placeholder="粘贴 daemon API 密钥..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && secretInput.trim()) {
                    onSecretPaste(secretInput.trim());
                    setSecretInput("");
                    onNotice();
                  }
                }}
                className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary outline-none"
              />
              <button
                type="button"
                disabled={!secretInput.trim()}
                onClick={() => {
                  onSecretPaste(secretInput.trim());
                  setSecretInput("");
                  onNotice();
                }}
                className="flex h-7 items-center gap-1 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
              >
                保存
              </button>
              {onSecretClear && (
                <button
                  type="button"
                  onClick={() => {
                    onSecretClear();
                    onNotice();
                  }}
                  className="flex h-7 items-center gap-1 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
                >
                  清除
                </button>
              )}
            </div>
          </SettingRow>
        </SettingSection>
      )}
    </div>
  );
}

/* ───────────────────── 3. 人设与记忆库 (Personal Context) ───────────────────── */

function PersonalContextSection({ onNotice }: { onNotice: () => void }) {
  const [vaultPath, setVaultPath] = useState("");
  const [inboxPath, setInboxPath] = useState("");
  const [soulPrompt, setSoulPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"paths" | "soul" | null>(null);

  const fetchContext = async () => {
    try {
      const [configRes, soulRes] = await Promise.all([
        fetch("/api/personal-context/config"),
        fetch("/api/personal-context/soul"),
      ]);
      if (configRes.ok) {
        const data = await configRes.json();
        if (data.knowledgeRoot) setVaultPath(data.knowledgeRoot);
        if (data.knowledgeWriteRoot) setInboxPath(data.knowledgeWriteRoot);
      }
      if (soulRes.ok) {
        const data = await soulRes.json();
        if (typeof data.content === "string") setSoulPrompt(data.content);
      }
    } catch {
      /* ignore fallback */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const handleSavePaths = async () => {
    setSaving("paths");
    try {
      const res = await fetch("/api/personal-context/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeRoot: vaultPath,
          knowledgeWriteRoot: inboxPath,
        }),
      });
      if (res.ok) onNotice();
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  };

  const handleSaveSoul = async () => {
    setSaving("soul");
    try {
      const res = await fetch("/api/personal-context/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: soulPrompt }),
      });
      if (res.ok) onNotice();
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection title="个人知识库 (Knowledge Base)">
        <SettingRow label="知识库根路径" subtext="个人知识库（笔记/资料）的本地存放绝对路径">
          <input
            type="text"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            onBlur={handleSavePaths}
            placeholder="~/.hachimi/second-brain"
            className="h-7 w-64 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </SettingRow>

        <SettingRow label="收件箱与草稿目录" subtext="新总结、卡片与提炼草稿的临时归档入口">
          <input
            type="text"
            value={inboxPath}
            onChange={(e) => setInboxPath(e.target.value)}
            onBlur={handleSavePaths}
            placeholder="~/.hachimi/second-brain/_inbox"
            className="h-7 w-64 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </SettingRow>
      </SettingSection>

      <SettingSection
        title="SOUL.md 人设 Core System Prompt"
        action={
          <button
            type="button"
            onClick={handleSaveSoul}
            disabled={saving === "soul"}
            className="flex h-6 items-center gap-1 rounded-md bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/15 active:scale-[0.97] disabled:opacity-50 cursor-pointer transition-all"
          >
            {saving === "soul" ? (
              <RefreshCw className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            {saving === "soul" ? "保存中" : "保存"}
          </button>
        }
      >
        <div className="p-3.5 space-y-2">
          <textarea
            rows={6}
            value={soulPrompt}
            onChange={(e) => setSoulPrompt(e.target.value)}
            placeholder="加载中…（留空则使用默认人设）"
            className="w-full resize-y rounded-lg border border-border/50 bg-background px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            此内容会作为系统提示注入每次会话的上下文开头，用于约束语气与行为边界（默认读取
            ~/.hachimi/SOUL.md）。
          </p>
        </div>
      </SettingSection>

      <div className="flex items-center justify-between px-3.5">
        <span className="text-[12px] text-muted-foreground">
          {loading ? "正在读取本地配置…" : "修改后自动保存；路径变化即时生效"}
        </span>
        <button
          type="button"
          onClick={() => {
            void fetchContext();
          }}
          className="flex h-7 items-center gap-1 rounded-md border border-border/50 bg-surface-elevated px-2.5 text-[12px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer transition-all"
        >
          <RefreshCw className="size-3" />
          重新读取
        </button>
      </div>
    </div>
  );
}

/* ───────────────────── 4. 模型与密钥 (Connections & Models) ───────────────────── */

interface RealConnection {
  id: string;
  name: string;
  providerType: string;
  enabled?: boolean;
  baseUrl?: string;
  defaultModelId?: string;
  models?: string[];
  enabledModels?: string[];
  hasKey?: boolean;
  apiKeyPreview?: string;
  lastTestStatus?: string;
  lastTestMessage?: string;
  visionModels?: string[];
  serverWebSearch?: boolean;
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  autoApprovePermissions?: boolean;
  separateSession?: boolean;
}

interface CatalogPreset {
  id: string;
  label: string;
  description: string;
  category: string;
  protocol: string;
  requiresKey: boolean;
  signupUrl?: string;
  defaultBaseUrl?: string;
  fallbackModels: Array<{ id: string; label?: string; recommended?: boolean }>;
  devOnly?: boolean;
}

function ConnectionsSection({
  pushProvider,
  setPushProvider,
  selectedModelId,
  onModelChange,
}: {
  pushProvider: string | null;
  setPushProvider: (p: string | null) => void;
  selectedModelId?: string;
  onModelChange: (id: string) => void;
}) {
  const [connections, setConnections] = useState<RealConnection[]>([]);
  const [catalog, setCatalog] = useState<CatalogPreset[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [defaultModelInput, setDefaultModelInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createApiKey, setCreateApiKey] = useState("");
  const [createBaseUrl, setCreateBaseUrl] = useState("");
  const [createDefaultModel, setCreateDefaultModel] = useState("");
  const [createCommand, setCreateCommand] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [commandArgsInput, setCommandArgsInput] = useState("");
  const [cwdInput, setCwdInput] = useState("");
  const [savingCommand, setSavingCommand] = useState(false);
  // 视觉协助（"模型的眼睛"）配置
  const [vision, setVision] = useState<{
    enabled?: boolean;
    connectionId?: string;
    modelId?: string;
  }>({});
  const [visionTesting, setVisionTesting] = useState(false);
  const [visionResult, setVisionResult] = useState<{
    ok: boolean;
    model?: string;
    latencyMs?: number;
    description?: string;
    error?: string;
  } | null>(null);

  const fetchAll = async () => {
    try {
      const res = await fetch("/api/llm/connections");
      if (res.ok) {
        const data = await res.json();
        if (data.connections) setConnections(data.connections);
        if (data.catalog) setCatalog(data.catalog);
        if (data.vision) setVision(data.vision);
        if (data.activeConnectionId) setActiveConnectionId(data.activeConnectionId);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const selectedConn = connections.find((c) => c.id === pushProvider);
  const selectedPreset = catalog.find((p) => p.id === pushProvider);

  const openDetail = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    const preset = catalog.find((p) => p.id === id);
    setPushProvider(id);
    setApiKeyInput("");
    setBaseUrlInput(conn?.baseUrl || preset?.defaultBaseUrl || "");
    setDefaultModelInput(conn?.defaultModelId || "");
    setTestResult(null);
    setCreateApiKey("");
    setCreateBaseUrl(preset?.defaultBaseUrl || "");
    setCreateCommand(conn?.command || "");
    setCommandInput(conn?.command || "");
    setCommandArgsInput((conn?.commandArgs || []).join(" "));
    setCwdInput(conn?.cwd || "");
    setCreateDefaultModel(
      preset?.fallbackModels.find((m) => m.recommended)?.id || preset?.fallbackModels[0]?.id || ""
    );
  };

  const handleSaveKey = async () => {
    if (!selectedConn) return;
    const apiKey = apiKeyInput.trim();
    if (!apiKey) return;
    setSavingKey(true);
    try {
      const res = await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedConn.id, apiKey }),
      });
      if (res.ok) {
        setApiKeyInput("");
        // 激活连接保存 Key → 立即重建 provider；当前是 Mock/无 Key 时自动激活
        const activeUnready = activeConnectionId === "mock" || (activeConn && !activeConn.hasKey);
        if (selectedConn.id === activeConnectionId || activeUnready) {
          await fetch("/api/llm/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: selectedConn.id }),
          });
        }
        await fetchAll();
      }
    } catch {
      /* ignore */
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveBase = async () => {
    if (!selectedConn) return;
    setSavingBase(true);
    try {
      await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedConn.id, baseUrl: baseUrlInput.trim() }),
      });
      await fetchAll();
    } catch {
      /* ignore */
    } finally {
      setSavingBase(false);
    }
  };

  const handleSaveDefaultModel = async () => {
    if (!selectedConn) return;
    setSavingBase(true);
    try {
      await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedConn.id, defaultModelId: defaultModelInput }),
      });
      await fetchAll();
    } catch {
      /* ignore */
    } finally {
      setSavingBase(false);
    }
  };

  const handleSaveServerWebSearch = async (value: boolean) => {
    if (!selectedConn) return;
    try {
      await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedConn.id, serverWebSearch: value }),
      });
      // 激活连接开启/关闭服务端搜索后立即重建 provider，无需重启
      if (selectedConn.id === activeConnectionId) {
        await fetch("/api/llm/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId: selectedConn.id }),
        });
      }
      await fetchAll();
    } catch {
      /* ignore */
    }
  };

  const handleSetActive = async (id: string) => {
    setActivating(true);
    try {
      const res = await fetch("/api/llm/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.activeConnectionId) setActiveConnectionId(data.activeConnectionId);
        await fetchAll();
      }
    } catch {
      /* ignore */
    } finally {
      setActivating(false);
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/llm/connections/${id}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestResult({ ok: true, latencyMs: data.latencyMs });
      } else {
        setTestResult({
          ok: false,
          latencyMs: data.latencyMs,
          error: data.message || data.error || `HTTP ${res.status}`,
        });
      }
      await fetchAll();
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message || String(err) });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleModel = async (id: string, model: string, enabled: boolean) => {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    const next = enabled
      ? [...new Set([...(conn.enabledModels || []), model])]
      : (conn.enabledModels || []).filter((m) => m !== model);
    let nextDefault = conn.defaultModelId;
    if (!enabled && model === conn.defaultModelId) {
      nextDefault = next[0] || "";
      if (!nextDefault) return; // 至少保留一个启用模型
    }
    setModelBusy(true);
    try {
      await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          enabledModels: next,
          ...(nextDefault !== conn.defaultModelId ? { defaultModelId: nextDefault } : {}),
        }),
      });
      await fetchAll();
    } catch {
      /* ignore */
    } finally {
      setModelBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`确定删除连接「${id}」？本机保存的 API Key 不会被删除。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/llm/connections/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPushProvider(null);
        await fetchAll();
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveCommand = async () => {
    if (!selectedConn) return;
    setSavingCommand(true);
    try {
      const command = commandInput.trim();
      const commandArgs = commandArgsInput
        .split(/\s+/)
        .map((a) => a.trim())
        .filter(Boolean);
      const res = await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedConn.id,
          command: command || undefined,
          commandArgs: commandArgs.length > 0 ? commandArgs : undefined,
          cwd: cwdInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        // ACP 无需 API Key：配置命令后即可激活
        if (command && (activeConnectionId === "mock" || (activeConn && !activeConn.hasKey))) {
          await fetch("/api/llm/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: selectedConn.id }),
          });
        }
        await fetchAll();
      }
    } catch {
      /* ignore */
    } finally {
      setSavingCommand(false);
    }
  };

  const handleToggleAcpFlag = async (
    field: "autoApprovePermissions" | "separateSession",
    value: boolean
  ) => {
    if (!selectedConn) return;
    try {
      await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedConn.id, [field]: value }),
      });
      await fetchAll();
    } catch {
      /* ignore */
    }
  };

  const handleCreate = async () => {
    if (!selectedPreset) return;
    setCreating(true);
    try {
      const res = await fetch("/api/llm/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPreset.id,
          name: selectedPreset.label,
          providerType: selectedPreset.protocol,
          baseUrl: createBaseUrl.trim() || undefined,
          apiKey: createApiKey.trim() || undefined,
          defaultModelId: createDefaultModel.trim() || undefined,
          command: createCommand.trim() || undefined,
        }),
      });
      if (res.ok) {
        setCreateApiKey("");
        setCreateCommand("");
        const activeUnready = activeConnectionId === "mock" || (activeConn && !activeConn.hasKey);
        const readyOnCreate =
          selectedPreset.protocol === "acp"
            ? Boolean(createCommand.trim())
            : Boolean(createApiKey.trim());
        if (readyOnCreate && activeUnready) {
          await fetch("/api/llm/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: selectedPreset.id }),
          });
        }
        await fetchAll();
      }
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const handleSaveVision = async () => {
    try {
      await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision }),
      });
      await fetchAll();
    } catch {
      /* ignore */
    }
  };

  const handleTestVision = async () => {
    setVisionTesting(true);
    setVisionResult(null);
    try {
      const res = await fetch("/api/llm/vision/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: vision.connectionId || undefined,
          modelId: vision.modelId || undefined,
        }),
      });
      const data = await res.json();
      setVisionResult({
        ok: Boolean(data.success),
        model: data.model,
        latencyMs: data.latencyMs,
        description: data.description,
        error: data.error,
      });
    } catch (err: any) {
      setVisionResult({ ok: false, error: err?.message || String(err) });
    } finally {
      setVisionTesting(false);
    }
  };

  const visionConnection =
    connections.find((c) => c.id === (vision.connectionId || "")) ||
    connections.find((c) => (c.visionModels || []).length > 0) ||
    connections[0];

  // 列表：catalog 预设（devOnly 仅在有连接时显示）+ 已存在的自定义连接
  const presetItems = catalog
    .filter((p) => !p.devOnly || connections.some((c) => c.id === p.id))
    .map((p) => ({
      id: p.id,
      label: p.label,
      conn: connections.find((c) => c.id === p.id),
    }));
  const customItems = connections
    .filter((c) => !catalog.some((p) => p.id === c.id))
    .map((c) => ({ id: c.id, label: c.name, conn: c }));
  const listItems = [...presetItems, ...customItems];

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {!pushProvider ? (
          /* Level 1: Provider List */
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <SettingSection title="模型提供商与 API 密钥">
              {listItems.length > 0 ? (
                listItems.map((item) => {
                  const isActive = item.conn?.id === activeConnectionId;
                  const isAcpReady =
                    item.conn?.providerType === "acp" &&
                    Boolean(item.conn?.command || item.conn?.baseUrl);
                  const isReady =
                    item.conn?.hasKey ||
                    item.conn?.id === "mock" ||
                    item.conn?.id === "ollama" ||
                    isAcpReady;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDetail(item.id)}
                      className="flex h-[44px] w-full items-center justify-between px-3.5 py-2 hover:bg-surface-hover/60 transition-colors cursor-pointer active:scale-[0.99]"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
                        <span className="truncate">{item.label}</span>
                        {isActive && (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            当前激活
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-mono text-[11px]",
                            item.conn
                              ? isReady
                                ? "text-emerald-500 font-medium"
                                : "text-amber-500/90"
                              : "text-muted-foreground/70"
                          )}
                        >
                          {item.conn
                            ? isReady
                              ? "已连接"
                              : item.conn.providerType === "acp"
                                ? "未配置命令"
                                : "未配置 Key"
                            : "未配置"}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground/60" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3.5 py-3 text-[13px] text-muted-foreground">
                  正在加载提供商数据...
                </div>
              )}
              {activeConn &&
                !activeConn.hasKey &&
                activeConn.providerType !== "mock" &&
                activeConn.providerType !== "ollama" &&
                activeConn.providerType !== "acp" && (
                  <div className="px-3.5 pt-2 text-[11.5px] text-amber-600">
                    ⚠ 当前激活连接「{activeConn.name}」未配置 API Key，实际回复会回退到 Mock 模式。
                  </div>
                )}
            </SettingSection>

            {/* 视觉协助（"模型的眼睛"） */}
            <SettingSection title="视觉协助（模型的眼睛）">
              <SettingRow
                label="启用视觉协助"
                subtext="主模型无多模态时，由指定视觉模型描述图片后再注入上下文"
              >
                <ToggleSwitch
                  checked={vision.enabled !== false}
                  onChange={(v) => setVision((prev) => ({ ...prev, enabled: v }))}
                />
              </SettingRow>

              <SettingRow label="视觉协助连接">
                <select
                  value={vision.connectionId || ""}
                  onChange={(e) =>
                    setVision((prev) => ({
                      ...prev,
                      connectionId: e.target.value || undefined,
                      modelId: undefined,
                    }))
                  }
                  className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 text-[13px] text-foreground focus:border-primary outline-none"
                >
                  <option value="">自动选择（第一个含视觉模型的连接）</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label="视觉模型">
                <select
                  value={vision.modelId || ""}
                  onChange={(e) =>
                    setVision((prev) => ({ ...prev, modelId: e.target.value || undefined }))
                  }
                  className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 text-[13px] text-foreground focus:border-primary outline-none"
                >
                  <option value="">自动选择该连接的视觉模型</option>
                  {(
                    (visionConnection?.visionModels?.length
                      ? visionConnection.visionModels
                      : visionConnection?.enabledModels || []) as string[]
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label="连通性">
                <div className="flex items-center gap-2">
                  {visionResult && (
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        visionResult.ok ? "text-emerald-500" : "text-red-500"
                      )}
                    >
                      {visionResult.ok
                        ? `✓ 可用${visionResult.model ? ` · ${visionResult.model}` : ""}${visionResult.latencyMs !== undefined ? ` · ${visionResult.latencyMs}ms` : ""}`
                        : `✗ ${visionResult.error || "测试失败"}`}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={visionTesting}
                    onClick={handleTestVision}
                    className="flex h-7 items-center gap-1.5 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("size-3.5", visionTesting && "animate-spin text-primary")}
                    />
                    {visionTesting ? "测试中..." : "测试视觉"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveVision}
                    className="flex h-7 items-center gap-1.5 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer"
                  >
                    <Check className="size-3.5" />
                    保存
                  </button>
                </div>
              </SettingRow>
            </SettingSection>
          </motion.div>
        ) : (
          /* Level 2: Secondary Detail Push Panel */
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => setPushProvider(null)}
              className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.97] cursor-pointer"
            >
              <ChevronLeft className="size-4" />
              <span>返回提供商列表</span>
            </button>

            {selectedConn ? (
              /* 已配置：管理面板 */
              <div className="space-y-4">
                <SettingSection
                  title={`${selectedConn.name} 配置`}
                  action={
                    selectedConn.id !== activeConnectionId ? (
                      <button
                        type="button"
                        disabled={activating}
                        onClick={() => handleSetActive(selectedConn.id)}
                        className="flex h-7 items-center gap-1.5 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
                      >
                        <Zap className="size-3.5" />
                        {activating ? "切换中..." : "设为当前激活"}
                      </button>
                    ) : (
                      <span className="rounded bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                        当前激活
                      </span>
                    )
                  }
                >
                  {selectedConn.providerType === "acp" ? (
                    <SettingRow
                      label="外部 Agent 命令"
                      subtext="可执行文件或含参数的启动命令（如 codex exec --full-auto）"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="codex"
                          value={commandInput}
                          onChange={(e) => setCommandInput(e.target.value)}
                          className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingCommand}
                          onClick={handleSaveCommand}
                          className="flex h-7 items-center gap-1 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                        >
                          {savingCommand ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </SettingRow>
                  ) : (
                    <SettingRow label="API 密钥" subtext="加密存储于本机凭证库，不写入 config">
                      <div className="flex items-center gap-2">
                        {selectedConn.hasKey && (
                          <span className="font-mono text-[11px] text-emerald-500">
                            已配置
                            {selectedConn.apiKeyPreview ? ` ${selectedConn.apiKeyPreview}` : ""}
                          </span>
                        )}
                        <input
                          type="password"
                          placeholder={selectedConn.hasKey ? "输入新 Key 覆盖" : "sk-..."}
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="h-7 w-48 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingKey || !apiKeyInput.trim()}
                          onClick={handleSaveKey}
                          className="flex h-7 items-center gap-1 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                        >
                          {savingKey ? "保存中..." : "保存 Key"}
                        </button>
                      </div>
                    </SettingRow>
                  )}

                  <SettingRow label="Base URL" subtext="自定义中转站或代理 Endpoint">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={selectedConn.baseUrl || "默认 Endpoint"}
                        value={baseUrlInput}
                        onChange={(e) => setBaseUrlInput(e.target.value)}
                        className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <button
                        type="button"
                        disabled={savingBase}
                        onClick={handleSaveBase}
                        className="flex h-7 items-center gap-1 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                      >
                        {savingBase ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </SettingRow>

                  {selectedConn.providerType === "acp" && (
                    <>
                      <SettingRow label="启动参数 (args)">
                        <input
                          type="text"
                          placeholder="exec --full-auto"
                          value={commandArgsInput}
                          onChange={(e) => setCommandArgsInput(e.target.value)}
                          className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </SettingRow>
                      <SettingRow label="工作目录 (cwd)" subtext="外部 Agent 会话的绝对路径">
                        <input
                          type="text"
                          placeholder={cwdInput || "当前目录"}
                          value={cwdInput}
                          onChange={(e) => setCwdInput(e.target.value)}
                          className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </SettingRow>
                      <SettingRow
                        label="自动批准权限"
                        subtext="外部 Agent 请求权限时自动允许（默认拒绝；也可用 --full-auto 让外部 Agent 不询问）"
                      >
                        <ToggleSwitch
                          checked={selectedConn.autoApprovePermissions === true}
                          onChange={(v) => handleToggleAcpFlag("autoApprovePermissions", v)}
                        />
                      </SettingRow>
                      <SettingRow
                        label="每轮新会话"
                        subtext="每次对话开启新的外部会话（默认复用同一会话保持上下文）"
                      >
                        <ToggleSwitch
                          checked={selectedConn.separateSession === true}
                          onChange={(v) => handleToggleAcpFlag("separateSession", v)}
                        />
                      </SettingRow>
                    </>
                  )}

                  <SettingRow label="默认模型">
                    <div className="flex items-center gap-2">
                      <select
                        value={defaultModelInput}
                        onChange={(e) => setDefaultModelInput(e.target.value)}
                        className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary outline-none"
                      >
                        {(selectedConn.models || []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={savingBase}
                        onClick={handleSaveDefaultModel}
                        className="flex h-7 items-center gap-1 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </SettingRow>

                  {selectedConn.providerType === "deepseek" && (
                    <SettingRow
                      label="服务端联网搜索（web_search）"
                      subtext="由 DeepSeek 在服务端执行搜索并注入回答（Responses API），无需本地搜索 Key；开启后自动抑制本地 web_search 内置工具"
                    >
                      <ToggleSwitch
                        checked={selectedConn.serverWebSearch === true}
                        onChange={handleSaveServerWebSearch}
                      />
                    </SettingRow>
                  )}

                  <SettingRow label="连通性测试">
                    <div className="flex items-center gap-2">
                      {testResult && (
                        <span
                          className={cn(
                            "font-mono text-[11px]",
                            testResult.ok ? "text-emerald-500" : "text-red-500"
                          )}
                        >
                          {testResult.ok
                            ? `✓ 连接正常${testResult.latencyMs !== undefined ? ` · ${testResult.latencyMs}ms` : ""}`
                            : `✗ ${testResult.error || "连接失败"}`}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={testingId === selectedConn.id}
                        onClick={() => handleTestConnection(selectedConn.id)}
                        className="flex h-7 items-center gap-1.5 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw
                          className={cn(
                            "size-3.5",
                            testingId === selectedConn.id && "animate-spin text-primary"
                          )}
                        />
                        {testingId === selectedConn.id ? "测试中..." : "测试连接"}
                      </button>
                    </div>
                  </SettingRow>

                  <SettingRow
                    label="模型与聊天页显示"
                    subtext="点击模型切换聊天模型；勾选控制是否在聊天页显示"
                  >
                    <div className="flex max-w-sm flex-wrap justify-end gap-x-2 gap-y-1.5">
                      {(selectedConn.models || []).map((m) => {
                        const enabled = (selectedConn.enabledModels || []).includes(m);
                        const fullId = `${selectedConn.id}:${m}`;
                        const isSelected = selectedModelId === fullId;
                        const isDefault = selectedConn.defaultModelId === m;
                        return (
                          <div key={m} className="flex items-center gap-1">
                            <button
                              type="button"
                              title={isSelected ? "当前聊天模型" : "点击切换聊天模型"}
                              onClick={() => onModelChange(fullId)}
                              className={cn(
                                "h-6 px-2 rounded font-mono text-[11px] transition-all active:scale-[0.97] cursor-pointer",
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "bg-surface-elevated border border-border/40 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {m}
                              {isDefault && <span className="ml-1 opacity-70">默认</span>}
                            </button>
                            <label
                              title="在聊天页显示"
                              className="flex cursor-pointer items-center"
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={modelBusy}
                                onChange={() => handleToggleModel(selectedConn.id, m, !enabled)}
                                className="size-3.5 accent-primary"
                              />
                            </label>
                          </div>
                        );
                      })}
                      {(selectedConn.models || []).length === 0 && (
                        <span className="text-[12px] text-muted-foreground">暂无模型列表</span>
                      )}
                    </div>
                  </SettingRow>
                </SettingSection>

                <SettingSection title="危险区域">
                  <SettingRow
                    label="删除连接"
                    subtext="从配置中移除该提供商（不影响本机 Key 文件）"
                  >
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => handleDelete(selectedConn.id)}
                      className="flex h-7 items-center gap-1.5 px-3 rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 active:scale-[0.97] cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      {deleting ? "删除中..." : "删除连接"}
                    </button>
                  </SettingRow>
                </SettingSection>
              </div>
            ) : selectedPreset ? (
              /* 未配置的 catalog 预设：一键创建 */
              <SettingSection
                title={`配置 ${selectedPreset.label}`}
                action={
                  <a
                    href={selectedPreset.signupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-primary underline-offset-2 hover:underline"
                  >
                    {selectedPreset.requiresKey ? "获取 API Key ↗" : ""}
                  </a>
                }
              >
                {selectedPreset.protocol === "acp" ? (
                  <SettingRow
                    label="外部 Agent 命令"
                    subtext="如 codex、claude，或含参数的启动命令（codex exec --full-auto）"
                  >
                    <input
                      type="text"
                      placeholder="codex"
                      value={createCommand}
                      onChange={(e) => setCreateCommand(e.target.value)}
                      className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </SettingRow>
                ) : (
                  <SettingRow label="Base URL">
                    <input
                      type="text"
                      placeholder={selectedPreset.defaultBaseUrl}
                      value={createBaseUrl}
                      onChange={(e) => setCreateBaseUrl(e.target.value)}
                      className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </SettingRow>
                )}

                {selectedPreset.requiresKey && (
                  <SettingRow label="API 密钥" subtext="可稍后在详情中补充">
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={createApiKey}
                      onChange={(e) => setCreateApiKey(e.target.value)}
                      className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </SettingRow>
                )}

                {selectedPreset.fallbackModels.length > 0 && (
                  <SettingRow label="默认模型">
                    <select
                      value={createDefaultModel}
                      onChange={(e) => setCreateDefaultModel(e.target.value)}
                      className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] text-foreground focus:border-primary outline-none"
                    >
                      {selectedPreset.fallbackModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                          {m.recommended ? "（推荐）" : ""}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={handleCreate}
                    className="flex h-8 items-center gap-1.5 px-4 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    {creating ? "创建中..." : "创建并配置"}
                  </button>
                </div>
              </SettingSection>
            ) : (
              <div className="text-[13px] text-muted-foreground">未找到该提供商。</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────── 5. 浏览器与自动化 (Browser & Automation) ───────────────────── */

function BrowserSection({ onNotice }: { onNotice: () => void }) {
  const [browserHeadless, setBrowserHeadless] = useState(true);
  const [computerUse, setComputerUse] = useState(true);
  const [visionContext, setVisionContext] = useState("ask");

  return (
    <div className="space-y-6">
      <SettingSection title="内置浏览器与 Vision 识别">
        <SettingRow
          label="内置 Headless 浏览器"
          subtext="允许 Agent 静默进行网页导航、点击交互与表单填写"
        >
          <ToggleSwitch
            checked={browserHeadless}
            onChange={(v) => {
              setBrowserHeadless(v);
              onNotice();
            }}
          />
        </SettingRow>

        <SettingRow
          label="页面截图纳入 Agent 上下文"
          subtext="控制图像截图输入多模态 LLM 的触发时机"
        >
          <SegmentedControl
            value={visionContext}
            onChange={(v) => {
              setVisionContext(v);
              onNotice();
            }}
            options={[
              { value: "always", label: "总是包含" },
              { value: "ask", label: "每次询问" },
              { value: "never", label: "从不" },
            ]}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Computer Use 桌面操控">
        <SettingRow
          label="操作系统控鼠与坐标定位"
          subtext="允许 Agent 在受限制的屏幕像素坐标捕捉视觉并模拟点击"
          warningDot={true}
        >
          <ToggleSwitch
            checked={computerUse}
            onChange={(v) => {
              setComputerUse(v);
              onNotice();
            }}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 6. 安全与权限 (Sandbox & Security) ───────────────────── */

function SandboxSection({ onNotice }: { onNotice: () => void }) {
  const [jailMode, setJailMode] = useState("workspace_only");
  const [astGuard, setAstGuard] = useState(true);
  const [confirmThreshold, setConfirmThreshold] = useState("ask_every_time");

  return (
    <div className="space-y-6">
      <SettingSection title="安全与 PathJail 沙箱隔离">
        <SettingRow label="PathJail 工作区限制" subtext="禁止文件读写越界访问系统高危路径">
          <ToggleSwitch
            checked={jailMode === "workspace_only"}
            onChange={(v) => {
              setJailMode(v ? "workspace_only" : "all");
              onNotice();
            }}
          />
        </SettingRow>

        <SettingRow label="Shell 命令 AST 加固" subtext="语法级识别并截断危险 Bash 拼接命令">
          <ToggleSwitch
            checked={astGuard}
            onChange={(v) => {
              setAstGuard(v);
              onNotice();
            }}
          />
        </SettingRow>

        <SettingRow label="权限确认门槛" subtext="触发 HITL 人工审批对话框的拦截条件">
          <SegmentedControl
            value={confirmThreshold}
            onChange={(v) => {
              setConfirmThreshold(v);
              onNotice();
            }}
            options={[
              { value: "ask_every_time", label: "每次询问" },
              { value: "session_allow", label: "会话内允许" },
              { value: "always_allow", label: "始终允许" },
            ]}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 记忆库 (Memory) ───────────────────── */

type MemoryLayer = "working" | "session" | "long_term" | "archival";

interface MemoryRow {
  id: string;
  layer: MemoryLayer;
  content: string;
  importance: number;
  source?: string;
  status?: string;
  createdAt: number;
  lastAccessedAt: number;
}

const MEMORY_LAYER_LABELS: Record<MemoryLayer, string> = {
  working: "工作",
  session: "会话",
  long_term: "长期",
  archival: "归档",
};

function MemorySection({ onNotice }: { onNotice: () => void }) {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});
  const [layer, setLayer] = useState<MemoryLayer | "">("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [addContent, setAddContent] = useState("");
  const [addLayer, setAddLayer] = useState<MemoryLayer>("long_term");
  const [busy, setBusy] = useState(false);

  const fetchMemories = async (searchQuery?: string) => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      else if (layer) params.set("layer", layer);
      const res = await fetch(`/api/memory?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data.results)) {
        setMemories(data.results);
        setSearching(true);
      } else if (Array.isArray(data.memories)) {
        setMemories(data.memories);
        setSearching(Boolean(searchQuery));
        if (data.layers) setLayerCounts(data.layers);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  const handleAdd = async () => {
    const content = addContent.trim();
    if (!content) return;
    setBusy(true);
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, layer: addLayer, importance: 0.6, source: "user" }),
      });
      setAddContent("");
      onNotice();
      await fetchMemories();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定删除这条记忆？")) return;
    try {
      await fetch(`/api/memory/${id}`, { method: "DELETE" });
      await fetchMemories();
    } catch {
      /* ignore */
    }
  };

  const handleConfirmDraft = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}/confirm`, { method: "POST" });
      onNotice();
      await fetchMemories();
    } catch {
      /* ignore */
    }
  };

  const handleClearLayer = async (target: MemoryLayer) => {
    if (!window.confirm(`确定清空「${MEMORY_LAYER_LABELS[target]}」层全部记忆？此操作不可恢复。`)) {
      return;
    }
    try {
      await fetch("/api/memory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layer: target }),
      });
      onNotice();
      await fetchMemories();
    } catch {
      /* ignore */
    }
  };

  const totalCount = Object.values(layerCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <SettingSection title={`四层记忆（共 ${totalCount} 条：工作 / 会话 / 长期 / 归档）`}>
        <SettingRow label="检索记忆" subtext="语义相似度 + 重要度混合检索">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="搜索记忆内容..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchMemories(query.trim() || undefined);
              }}
              className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 text-[13px] text-foreground focus:border-primary outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (query.trim()) fetchMemories(query.trim());
                else {
                  setSearching(false);
                  fetchMemories();
                }
              }}
              className="flex h-7 items-center gap-1 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer"
            >
              {searching ? "清除" : "搜索"}
            </button>
          </div>
        </SettingRow>

        <SettingRow label="按层筛选">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["", "working", "session", "long_term", "archival"] as const).map((l) => (
              <button
                key={l || "all"}
                type="button"
                onClick={() => {
                  setSearching(false);
                  setLayer(l);
                }}
                className={cn(
                  "h-6 px-2.5 rounded-md font-mono text-[11px] transition-all active:scale-[0.97] cursor-pointer",
                  layer === l
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-surface-elevated border border-border/40 text-muted-foreground hover:text-foreground"
                )}
              >
                {l === ""
                  ? `全部 ${totalCount}`
                  : `${MEMORY_LAYER_LABELS[l]} ${layerCounts[l] ?? 0}`}
              </button>
            ))}
          </div>
        </SettingRow>

        <div className="space-y-1.5 pt-1">
          {memories.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">
              暂无记忆{searching ? "（清除搜索查看全部）" : ""}
            </div>
          )}
          {memories.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-surface-elevated/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {MEMORY_LAYER_LABELS[m.layer]}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {m.status === "draft" ? "草稿" : "活跃"} · 重要度{" "}
                    {Math.round(m.importance * 100)}%
                  </span>
                  {m.source && (
                    <span className="font-mono text-[10px] text-muted-foreground/50">
                      {m.source === "user" ? "用户" : "agent"}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-foreground">
                  {m.content}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 pt-1">
                {m.status === "draft" && (
                  <button
                    type="button"
                    title="确认草稿为活跃记忆"
                    onClick={() => handleConfirmDraft(m.id)}
                    className="flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                  >
                    <Check className="size-3.5" />
                    确认
                  </button>
                )}
                <button
                  type="button"
                  title="删除记忆"
                  onClick={() => handleDelete(m.id)}
                  className="flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="添加记忆">
        <SettingRow label="内容">
          <input
            type="text"
            placeholder="要记住的内容..."
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            className="h-7 w-72 rounded-md border border-border/50 bg-background px-2.5 text-[13px] text-foreground focus:border-primary outline-none"
          />
        </SettingRow>
        <SettingRow label="层级">
          <div className="flex items-center gap-2">
            <select
              value={addLayer}
              onChange={(e) => setAddLayer(e.target.value as MemoryLayer)}
              className="h-7 w-32 rounded-md border border-border/50 bg-background px-2 text-[13px] text-foreground focus:border-primary outline-none"
            >
              {(Object.keys(MEMORY_LAYER_LABELS) as MemoryLayer[]).map((l) => (
                <option key={l} value={l}>
                  {MEMORY_LAYER_LABELS[l]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !addContent.trim()}
              onClick={handleAdd}
              className="flex h-7 items-center gap-1 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              添加
            </button>
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="危险区域">
        <SettingRow label="清空层级" subtext="彻底删除某一层的全部记忆（不可恢复）">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MEMORY_LAYER_LABELS) as MemoryLayer[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => handleClearLayer(l)}
                className="flex h-7 items-center gap-1 px-3 rounded-md text-[12.5px] font-medium text-destructive hover:bg-destructive/10 active:scale-[0.97] cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                清空{MEMORY_LAYER_LABELS[l]}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 权限规则 (Permission Rules) ───────────────────── */

interface RememberedGrantRow {
  id: string;
  workspaceRoot?: string;
  toolName: string;
  commandPrefix: string;
  grantedAt: number;
}

function PermissionRulesSection({ onNotice }: { onNotice: () => void }) {
  const [denyText, setDenyText] = useState("");
  const [askText, setAskText] = useState("");
  const [allowText, setAllowText] = useState("");
  const [dangerousText, setDangerousText] = useState("");
  const [grants, setGrants] = useState<RememberedGrantRow[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    try {
      const [cfgRes, grantsRes] = await Promise.all([fetch("/api/config"), fetch("/api/grants")]);
      const cfg = await cfgRes.json();
      const rules = cfg.permissionRules || {};
      setDenyText((rules.deny || []).join("\n"));
      setAskText((rules.ask || []).join("\n"));
      setAllowText((rules.allow || []).join("\n"));
      setDangerousText((rules.dangerousCommands || []).join("\n"));
      const grantsData = await grantsRes.json();
      if (Array.isArray(grantsData.grants)) setGrants(grantsData.grants);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const splitLines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionRules: {
            deny: splitLines(denyText),
            ask: splitLines(askText),
            allow: splitLines(allowText),
            dangerousCommands: splitLines(dangerousText),
          },
        }),
      });
      if (res.ok) onNotice();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    if (!window.confirm("撤销该记忆授权？")) return;
    try {
      await fetch("/api/grants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      setGrants((prev) => prev.filter((g) => g.id !== grantId));
    } catch {
      /* ignore */
    }
  };

  const textareaCls =
    "h-20 w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 font-mono text-[12px] text-foreground focus:border-primary outline-none resize-y";

  return (
    <div className="space-y-6">
      <SettingSection title="工具权限规则（按工具名或通配符；危险命令前缀即使批准过也再次询问）">
        <SettingRow label="永远拒绝 (deny)">
          <textarea
            value={denyText}
            onChange={(e) => setDenyText(e.target.value)}
            placeholder={"delete_file\nbrowser_*"}
            className={textareaCls}
          />
        </SettingRow>
        <SettingRow label="强制询问 (ask)">
          <textarea
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder={"write_file\nrun_command"}
            className={textareaCls}
          />
        </SettingRow>
        <SettingRow label="永远放行 (allow)">
          <textarea
            value={allowText}
            onChange={(e) => setAllowText(e.target.value)}
            placeholder={"read_file\nget_current_datetime"}
            className={textareaCls}
          />
        </SettingRow>
        <SettingRow label="危险命令前缀">
          <textarea
            value={dangerousText}
            onChange={(e) => setDangerousText(e.target.value)}
            placeholder={"rm -rf\nsudo\ngit push --force"}
            className={textareaCls}
          />
        </SettingRow>
        <SettingRow label="应用规则">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex h-7 items-center gap-1.5 px-3 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            <Check className="size-3.5" />
            {saving ? "保存中..." : "保存规则"}
          </button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="记忆授权（审批时勾选「记住」产生的项目级命令授权）">
        {grants.length === 0 && (
          <div className="px-3 py-3 text-[12.5px] text-muted-foreground">暂无记忆授权</div>
        )}
        {grants.map((g) => (
          <SettingRow
            key={g.id}
            label={g.toolName}
            subtext={`${g.commandPrefix}${g.workspaceRoot ? ` · ${g.workspaceRoot}` : ""}`}
          >
            <button
              type="button"
              onClick={() => handleRevokeGrant(g.id)}
              className="flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-destructive hover:bg-destructive/10 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              撤销
            </button>
          </SettingRow>
        ))}
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 审计日志 (Audit) ───────────────────── */

interface AuditEventRow {
  timestamp: string;
  workId: string;
  workTitle: string;
  toolName: string;
  decision: "GRANTED" | "DENIED";
  surface: string;
}

function AuditSection({ onNotice }: { onNotice: () => void }) {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [works, setWorks] = useState<Array<{ id: string; title: string }>>([]);
  const [workId, setWorkId] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchAudit = async (targetWorkId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetWorkId) params.set("workId", targetWorkId);
      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data.events)) {
        setEvents(data.events);
        setTotal(Number(data.total) || data.events.length);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
    fetch("/api/works")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.works)) setWorks(d.works);
      })
      .catch(() => {
        /* ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <SettingSection title={`批准 / 拒绝记录（共 ${total} 条，来自 RuntimeEvent 真相源）`}>
        <SettingRow label="筛选 Work">
          <div className="flex items-center gap-2">
            <select
              value={workId}
              onChange={(e) => {
                const v = e.target.value;
                setWorkId(v);
                fetchAudit(v || undefined);
              }}
              className="h-7 w-56 rounded-md border border-border/50 bg-background px-2.5 text-[13px] text-foreground focus:border-primary outline-none"
            >
              <option value="">全部 Work</option>
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={loading}
              onClick={() => fetchAudit(workId || undefined)}
              className="flex h-7 items-center gap-1.5 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin text-primary")} />
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </SettingRow>

        <div className="overflow-hidden rounded-lg border border-border/40">
          {events.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">
              暂无审批记录（工具按需询问时会在此留下审计轨迹）
            </div>
          ) : (
            <div className="max-h-[26rem] overflow-y-auto scroll-quiet">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-surface text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">Work</th>
                    <th className="px-3 py-2 font-medium">决策</th>
                    <th className="px-3 py-2 font-medium">来源</th>
                    <th className="px-3 py-2 font-medium">工具</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr
                      key={`${e.workId}-${e.timestamp}-${i}`}
                      className="border-t border-border/30"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-1.5 text-foreground">
                        {e.workTitle}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
                            e.decision === "GRANTED"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {e.decision}
                        </span>
                      </td>
                      <td className="font-mono text-[11px] text-muted-foreground/70">
                        {e.surface}
                      </td>
                      <td className="font-mono text-[11px] text-foreground">{e.toolName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 7. 数据与备份 (Data Bundle) ───────────────────── */

function DataBundleSection({
  onExportBundle,
  onImportBundle,
  bundleBusy = false,
  fileInputRef,
  onNotice,
}: {
  onExportBundle?: () => Promise<unknown> | unknown;
  onImportBundle?: (file: File) => Promise<unknown> | unknown;
  bundleBusy?: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onNotice: () => void;
}) {
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  return (
    <div className="space-y-6">
      <SettingSection title="数据备份与恢复">
        <SettingRow
          label="Memory Bundle 打包导出与恢复"
          subtext="将四层记忆与执行轨迹打包成 zip 格式备份"
        >
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".zip,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onImportBundle) {
                  onImportBundle(file);
                  onNotice();
                }
              }}
            />
            {onExportBundle && (
              <button
                type="button"
                disabled={bundleBusy}
                onClick={() => {
                  onExportBundle();
                  onNotice();
                }}
                className="h-7 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
              >
                导出
              </button>
            )}
            {onImportBundle && (
              <button
                type="button"
                disabled={bundleBusy}
                onClick={() => fileInputRef.current?.click()}
                className="h-7 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
              >
                导入
              </button>
            )}
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="危险区域">
        <SettingRow label="清空历史数据与记忆" subtext="彻底擦除 SQLite kv_store 与全部向量索引">
          {!showConfirmReset ? (
            <button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              className="h-7 px-3 rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 active:scale-[0.97] cursor-pointer transition-colors"
            >
              清空数据
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-destructive font-medium">确认清空？</span>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmReset(false);
                  onNotice();
                }}
                className="h-7 px-2.5 rounded-md bg-destructive text-destructive-foreground text-[12px] font-medium hover:bg-destructive/90 active:scale-[0.97] cursor-pointer"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="h-7 px-2.5 rounded-md border border-border/40 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                取消
              </button>
            </div>
          )}
        </SettingRow>
      </SettingSection>
    </div>
  );
}

/* ───────────────────── 8. 关于 (About) ───────────────────── */

function AboutSection() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <SettingSection title="应用信息">
        <SettingRow label="版本">
          <span className="font-mono text-[11px] text-muted-foreground">v0.1.0</span>
        </SettingRow>

        <SettingRow label="运行时引擎">
          <span className="font-mono text-[11px] text-muted-foreground">
            Node.js / Electron Native Bridge
          </span>
        </SettingRow>

        <SettingRow label="开源许可证">
          <span className="text-[13px] text-muted-foreground">MIT License</span>
        </SettingRow>

        <SettingRow label="检查更新">
          <div className="flex items-center gap-2">
            {status && (
              <span className="font-mono text-[11px] text-muted-foreground">{status}</span>
            )}
            <button
              type="button"
              disabled={checking}
              onClick={() => {
                setChecking(true);
                setStatus(null);
                setTimeout(() => {
                  setChecking(false);
                  setStatus("已是最新版本");
                }, 500);
              }}
              className="h-7 px-3 rounded-md border border-border/50 bg-surface-elevated text-[13px] font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
            >
              {checking ? "检查中..." : "检查更新"}
            </button>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  );
}
