import {
  Check,
  Cpu,
  Download,
  KeyRound,
  Moon,
  Palette,
  Save,
  Server,
  Settings,
  Sparkles,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { McpManager } from "./mcp-manager";
import { Meta, SectionLabel } from "./primitives";
import { SkillsManager } from "./skills-manager";

export type ThemeTone = "light" | "dark";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  speed?: "fast" | "balanced" | "thorough";
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

type SettingsTab = "general" | "models" | "mcp" | "skills" | "context";

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
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secretPasteRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
    >
      {/* Background Scrim Backdrop */}
      <button
        type="button"
        aria-label="关闭设置"
        onClick={onClose}
        className="absolute inset-0 bg-backdrop/50 backdrop-blur-sm"
      />

      {/* Craft-Agent / macOS Sequoia Centered Full-Window Modal (`max-w-[56rem] h-[82vh]`) */}
      <div
        className={cn(
          "relative flex h-[82vh] w-full max-w-[56rem] overflow-hidden rounded-3xl border border-border/50 bg-surface/90 shadow-[0_20px_70px_oklch(0.2_0.01_260_/0.25)] backdrop-blur-xl transition-all duration-300",
          className
        )}
      >
        {/* Left Sidebar Category Navigation (220px) */}
        <div className="flex w-[220px] flex-col border-r border-border/40 bg-surface-hover/30 p-3">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 pb-3 mb-2">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">设置</h3>
              <p className="text-[11px] text-muted-foreground">Hachimi Runtime Harness</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.97]",
                activeTab === "general"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Settings className="size-4" />
              通用设置
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("models")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.97]",
                activeTab === "models"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Cpu className="size-4" />
              AI 模型与 Key
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("mcp")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.97]",
                activeTab === "mcp"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Server className="size-4" />
              MCP 服务器
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("skills")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.97]",
                activeTab === "skills"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Sparkles className="size-4" />
              技能 (Skills)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("context")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.97]",
                activeTab === "context"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Zap className="size-4 text-amber-500" />
              个人上下文 (Context)
            </button>
          </nav>

          <div className="pt-2 border-t border-border/30 px-3">
            <span className="text-[10px] font-mono text-muted-foreground">
              Hachimi v0.1.0 · Local-First
            </span>
          </div>
        </div>

        {/* Right Content Canvas Area */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-background/50 p-6">
          {/* Close Window Top Right Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-4 top-4 z-20 grid size-8 place-items-center rounded-xl border border-border/40 bg-surface-elevated/90 text-muted-foreground shadow-xs backdrop-blur-xs transition-all hover:bg-surface-hover hover:text-foreground active:scale-[0.97]"
          >
            <X className="size-4" />
          </button>

          {/* Tab 1: 通用设置 (General) */}
          {activeTab === "general" && (
            <div className="flex-1 space-y-6 overflow-y-auto pr-2 scroll-quiet">
              <div>
                <h3 className="text-base font-semibold text-foreground">通用设置</h3>
                <p className="text-xs text-muted-foreground">
                  配置主题外观、配色方案与数据导入导出
                </p>
              </div>

              {/* Theme Selector */}
              <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
                <SectionLabel icon={<Palette className="size-4" />}>外观主题</SectionLabel>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onThemeChange("light")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.97]",
                      theme === "light"
                        ? "border-primary bg-primary/5 text-foreground shadow-xs"
                        : "border-border/60 bg-surface hover:border-border"
                    )}
                  >
                    <Sun className="size-5 text-amber-500" />
                    <div>
                      <div className="text-xs font-medium">Light 明亮模式</div>
                      <div className="text-[11px] text-muted-foreground">遵循系统设计</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange("dark")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.97]",
                      theme === "dark"
                        ? "border-primary bg-primary/5 text-foreground shadow-xs"
                        : "border-border/60 bg-surface hover:border-border"
                    )}
                  >
                    <Moon className="size-5 text-indigo-400" />
                    <div>
                      <div className="text-xs font-medium">Dark 夜间模式</div>
                      <div className="text-[11px] text-muted-foreground">高对比度深色</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Accent Preset Colors */}
              {onAccentChange && (
                <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
                  <SectionLabel icon={<Palette className="size-4" />}>主配色方案</SectionLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ACCENT_PRESETS.map((preset) => {
                      const active = accentColor?.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => onAccentChange(preset.hex)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all active:scale-[0.97]",
                            active
                              ? "border-primary bg-primary/10 text-foreground shadow-xs"
                              : "border-border/50 bg-surface text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span
                            className="size-3.5 rounded-full shadow-xs"
                            style={{ backgroundColor: preset.hex }}
                          />
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Data Import / Export */}
              {(onExportBundle || onImportBundle) && (
                <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
                  <SectionLabel icon={<Download className="size-4" />}>
                    数据与记忆 Bundle 迁移
                  </SectionLabel>
                  <p className="mt-1 text-xs text-muted-foreground">
                    导出或导入完整的四层记忆库与 Event 轨迹
                  </p>

                  <div className="mt-3 flex gap-3">
                    {onExportBundle && (
                      <button
                        type="button"
                        disabled={bundleBusy}
                        onClick={() => void onExportBundle()}
                        className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-4 py-2 text-xs font-medium text-foreground shadow-xs transition-all active:scale-[0.97] hover:bg-surface-hover"
                      >
                        <Download className="size-3.5" /> 导出 Bundle (.zip)
                      </button>
                    )}

                    {onImportBundle && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".zip,application/zip"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void onImportBundle(f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={bundleBusy}
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-4 py-2 text-xs font-medium text-foreground shadow-xs transition-all active:scale-[0.97] hover:bg-surface-hover"
                        >
                          <Upload className="size-3.5" /> 导入 Bundle
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: AI 模型与 Key (Models) */}
          {activeTab === "models" && (
            <div className="flex-1 space-y-6 overflow-y-auto pr-2 scroll-quiet">
              <div>
                <h3 className="text-base font-semibold text-foreground">AI 模型与 Provider</h3>
                <p className="text-xs text-muted-foreground">选择活跃的 LLM 模型或配置 API 密钥</p>
              </div>

              {/* Models List */}
              <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
                <SectionLabel icon={<Cpu className="size-4" />}>已配置模型</SectionLabel>
                <div className="mt-3 space-y-2">
                  {models.map((m) => {
                    const active = m.id === selectedModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onModelChange(m.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all active:scale-[0.97]",
                          active
                            ? "border-primary bg-primary/5 text-foreground shadow-xs"
                            : "border-border/40 bg-surface hover:border-border"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium font-mono">{m.name}</span>
                            {m.speed && (
                              <span
                                className={cn(
                                  "rounded-md border px-1.5 py-0.5 text-[10px] font-mono",
                                  SPEED_BADGE[m.speed]
                                )}
                              >
                                {m.speed.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {m.description}
                            </p>
                          )}
                        </div>
                        {active && <Check className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* API Secret Input */}
              <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
                <SectionLabel icon={<KeyRound className="size-4" />}>
                  Daemon / API Secret
                </SectionLabel>
                <div className="mt-2.5 flex items-center gap-3">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      secretConfigured
                        ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                        : "bg-amber-500"
                    )}
                  />
                  <span className="text-xs font-mono text-foreground">
                    {secretConfigured ? secretPreview || "已配置 Secret" : "尚未配置 Secret"}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    ref={secretPasteRef}
                    type="password"
                    placeholder="粘贴新的 API Secret..."
                    className="h-8.5 flex-1 rounded-xl border border-border/50 bg-surface px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && onSecretPaste && secretPasteRef.current) {
                        onSecretPaste(secretPasteRef.current.value);
                        secretPasteRef.current.value = "";
                      }
                    }}
                  />
                  {onSecretClear && secretConfigured && (
                    <button
                      type="button"
                      onClick={onSecretClear}
                      className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-all active:scale-[0.97]"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: MCP 服务器 (McpManager) */}
          {activeTab === "mcp" && <McpManager />}

          {/* Tab 4: 技能 (SkillsManager) */}
          {activeTab === "skills" && <SkillsManager />}

          {/* Tab 5: 个人上下文 (Personal Context Config) */}
          {activeTab === "context" && <PersonalContextConfigView />}
        </div>
      </div>
    </div>
  );
}

function PersonalContextConfigView() {
  const [soulPath, setSoulPath] = useState("~/.hachimi/SOUL.md");
  const [telosRoot, setTelosRoot] = useState("~/.hachimi/telos/");
  const [knowledgeRoot, setKnowledgeRoot] = useState("~/Documents/ObsidianVault/");
  const [knowledgeWriteRoot, setKnowledgeWriteRoot] = useState("~/Documents/ObsidianVault/_inbox");
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSetterRef = useRef<((p: string) => void) | null>(null);

  // Load existing config on mount
  useEffect(() => {
    fetch("/api/personal-context/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.soulPath) setSoulPath(data.soulPath);
          if (data.telosRoot) setTelosRoot(data.telosRoot);
          if (data.knowledgeRoot) setKnowledgeRoot(data.knowledgeRoot);
          if (data.knowledgeWriteRoot) setKnowledgeWriteRoot(data.knowledgeWriteRoot);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const handlePickFolder = async (
    setter: (p: string) => void,
    pickerType: "file" | "folder" = "folder"
  ) => {
    try {
      const res = await fetch(`/api/workspace/pick?type=${pickerType}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          setter(data.path);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    // Fallback to HTML5 file picker if native picker returns null or fails
    activeSetterRef.current = setter;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && activeSetterRef.current) {
      const pickedFile = files[0];
      // Extract file path or webkitRelativePath
      const path = (pickedFile as any).path || pickedFile.name;
      activeSetterRef.current(path);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await fetch("/api/personal-context/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soulPath, telosRoot, knowledgeRoot, knowledgeWriteRoot }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex-1 space-y-5 overflow-y-auto pr-8 scroll-quiet">
      {/* Hidden Fallback Input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      <div>
        <h3 className="text-base font-semibold text-foreground">
          个人上下文路径设置 (Personal Context)
        </h3>
        <p className="text-xs text-muted-foreground">
          配置 SOUL 语气边界、TELOS 对齐与 Second Brain (Obsidian Vault) 目录路径
        </p>
      </div>

      {/* 1. SOUL.md */}
      <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
        <SectionLabel icon={<Sparkles className="size-4 text-amber-500" />}>
          SOUL 身份偏好文件路径
        </SectionLabel>
        <p className="mt-1 text-[11px] text-muted-foreground">
          定义 Agent 语气偏好与全局行为边界，稳定插入 Context 前缀
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={soulPath}
            onChange={(e) => setSoulPath(e.target.value)}
            className="h-8.5 flex-1 rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handlePickFolder(setSoulPath, "file")}
            className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs whitespace-nowrap"
          >
            📁 选择文件
          </button>
        </div>
      </div>

      {/* 2. TELOS */}
      <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
        <SectionLabel icon={<Zap className="size-4 text-amber-500" />}>
          TELOS 个人使命/目标对齐目录
        </SectionLabel>
        <p className="mt-1 text-[11px] text-muted-foreground">
          包含 MISSION.md, GOALS.md, PROJECTS.md 稳定上下文
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={telosRoot}
            onChange={(e) => setTelosRoot(e.target.value)}
            className="h-8.5 flex-1 rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handlePickFolder(setTelosRoot, "folder")}
            className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs whitespace-nowrap"
          >
            📁 选择目录
          </button>
        </div>
      </div>

      {/* 3. Second Brain Knowledge Root */}
      <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
        <SectionLabel icon={<Server className="size-4 text-emerald-500" />}>
          Second Brain 知识库根目录 (Obsidian Vault)
        </SectionLabel>
        <p className="mt-1 text-[11px] text-muted-foreground">
          第二大脑只读知识库挂载点，按需通过工具调取，受 PathJail 只读保护
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={knowledgeRoot}
            onChange={(e) => setKnowledgeRoot(e.target.value)}
            className="h-8.5 flex-1 rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handlePickFolder(setKnowledgeRoot, "folder")}
            className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs whitespace-nowrap"
          >
            📁 选择目录
          </button>
        </div>
      </div>

      {/* 4. Knowledge Write Inbox */}
      <div className="rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs">
        <SectionLabel icon={<Settings className="size-4 text-primary" />}>
          Second Brain 草稿 Inbox 写目录
        </SectionLabel>
        <p className="mt-1 text-[11px] text-muted-foreground">
          知识库唯一允许写入的收件箱子目录（默认 knowledgeRoot/_inbox）
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={knowledgeWriteRoot}
            onChange={(e) => setKnowledgeWriteRoot(e.target.value)}
            className="h-8.5 flex-1 rounded-xl border border-border/50 bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handlePickFolder(setKnowledgeWriteRoot, "folder")}
            className="rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover shadow-xs whitespace-nowrap"
          >
            📁 选择目录
          </button>
        </div>
      </div>

      {/* Save Action */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSaveConfig}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-medium text-primary-foreground shadow-xs transition-transform active:scale-[0.97] hover:opacity-90"
        >
          {saved ? <Check className="size-4 text-emerald-300" /> : <Save className="size-4" />}
          {saved ? "路径配置已保存并重新装载" : "保存上下文路径配置"}
        </button>
      </div>
    </div>
  );
}
