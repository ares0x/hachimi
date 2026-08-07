import {
  ArrowUp,
  ChevronDown,
  Cpu,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Paperclip,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browseDirectory } from "../api";
import type { Mode } from "../lib/agent-demo";
import { cn } from "../lib/utils";
import type { ModelOption } from "./settings-panel";

export interface ComposerAttachment {
  file: File;
  /** Object URL preview for image files (created on attach, revoked on remove). */
  previewUrl?: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onSteer,
  onStop,
  running,
  mode = "chat",
  disabled,
  workTitle,
  workspaceRoot,
  onSelectWorkspace,
  selectedModel = "deepseek-v4-pro",
  modelOptions = [],
  onSelectModel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (attachments?: File[]) => void;
  onSteer?: () => void;
  onStop?: () => void;
  running?: boolean;
  mode?: Mode;
  disabled?: boolean;
  workTitle?: string | null;
  workspaceRoot?: string | null;
  onSelectWorkspace?: (path: string | null) => void;
  selectedModel?: string;
  modelOptions?: ModelOption[];
  onSelectModel?: (modelId: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [attachedItems, setAttachedItems] = useState<ComposerAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Autocomplete menu state (/ and @)
  const [menuType, setMenuType] = useState<"/" | "@" | null>(null);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuSelectedIndex, setMenuSelectedIndex] = useState(0);

  const SLASH_ITEMS = [
    { label: "/model", desc: "切换当前 AI 模型连接", value: "/model " },
    { label: "/skills", desc: "查看与管理 Skill 提案", value: "/skills " },
    { label: "/clear", desc: "清空当前对话上下文", value: "/clear " },
    { label: "/compact", desc: "触发历史上下文压缩与语义归档", value: "/compact " },
    { label: "/goal", desc: "开启长运行 Task 通宵 Goal 模式", value: "/goal " },
    { label: "/schedule", desc: "设置定时器或周期性 Cron 任务", value: "/schedule " },
    { label: "/browser", desc: "开启 Web 网页浏览与 Fetch 模式", value: "/browser " },
    { label: "/learn", desc: "将当前解决方案学习并持久化为 Skill", value: "/learn " },
    { label: "/grill-me", desc: "启动交互式方案对齐 Interview", value: "/grill-me " },
  ];

  const MENTION_ITEMS = [
    { label: "@file", desc: "挂载工作区本地文件", value: "@file:" },
    { label: "@knowledge", desc: "挂载个人知识库条目", value: "@knowledge:" },
    { label: "@skill:code-review", desc: "挂载代码审查 Skill", value: "@skill:code-review " },
    { label: "@skill:refactoring", desc: "挂载代码重构 Skill", value: "@skill:refactoring " },
    { label: "@mcp:fetch", desc: "挂载 Web Fetch MCP 工具服务器", value: "@mcp:fetch " },
    { label: "@memory", desc: "挂载特定记忆偏好", value: "@memory:" },
  ];

  useEffect(() => {
    if (!running && !disabled) ref.current?.focus();
  }, [running, disabled]);

  const handleInputChange = (text: string) => {
    onChange(text);

    // Detect trigger
    if (text.startsWith("/")) {
      setMenuType("/");
      setMenuFilter(text.slice(1).trim());
      setMenuSelectedIndex(0);
    } else {
      const lastWord = text.split(/\s+/).pop() || "";
      if (lastWord.startsWith("@")) {
        setMenuType("@");
        setMenuFilter(lastWord.slice(1).trim());
        setMenuSelectedIndex(0);
      } else {
        setMenuType(null);
      }
    }
  };

  const getFilteredMenuItems = () => {
    const items = menuType === "/" ? SLASH_ITEMS : menuType === "@" ? MENTION_ITEMS : [];
    if (!menuFilter) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(menuFilter.toLowerCase()) ||
        item.desc.toLowerCase().includes(menuFilter.toLowerCase())
    );
  };

  const activeMenuItems = getFilteredMenuItems();

  const handleSelectItem = (valueToInsert: string) => {
    if (menuType === "/") {
      onChange(valueToInsert);
    } else if (menuType === "@") {
      const words = value.split(/\s+/);
      words.pop();
      onChange(`${[...words, valueToInsert].join(" ").trim()} `);
    }
    setMenuType(null);
    ref.current?.focus();
  };

  const folderName = workspaceRoot
    ? workspaceRoot.split(/[/\\]/).filter(Boolean).pop() || workspaceRoot
    : null;

  const handleTriggerDirectoryPicker = async () => {
    if (!onSelectWorkspace) return;

    // 1. Try Desktop IPC / Daemon API
    try {
      const selected = await browseDirectory();
      if (selected) {
        onSelectWorkspace(selected);
        return;
      }
    } catch {
      /* ignore */
    }

    // 2. Try File System Access API (Chrome/Safari)
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        if (handle && handle.name) {
          onSelectWorkspace(handle.name);
          return;
        }
      } catch {
        /* user cancelled */
      }
    }

    // 3. Fallback to HTML5 directory input
    folderInputRef.current?.click();
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const firstFile = e.target.files[0];
      const relPath = firstFile.webkitRelativePath || "";
      const folder = relPath.split("/")[0] || firstFile.name;
      if (folder && onSelectWorkspace) {
        onSelectWorkspace(folder);
      }
    }
  };

  const handlePaperclipClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const items: ComposerAttachment[] = files.map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedItems((prev) => [...prev, ...items]);
  };

  const removeFile = (index: number) => {
    setAttachedItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) addFiles(files);
  };

  const submitFiles = () => attachedItems.map((i) => i.file);

  const handleSubmit = () => {
    if (!running && value.trim()) {
      onSubmit(submitFiles());
    }
  };

  return (
    <div className="border-t border-border/30 bg-background/80 backdrop-blur-xl px-4 pt-2.5 pb-4 sm:px-6">
      {/* Hidden File Input for Native File Selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Hidden Directory Input Fallback */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard non-standard attr
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFolderInputChange}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="mx-auto w-full max-w-[50rem]"
      >
        <div className="group relative rounded-2xl border border-border/80 bg-surface-elevated/90 shadow-[0_4px_24px_oklch(0_0_0_/0.06)] backdrop-blur-md transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-[0_8px_32px_oklch(0_0_0_/0.09)]">
          {/* Attached Files Pills Container (images show thumbnails) */}
          {attachedItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-1 border-b border-border/30">
              {attachedItems.map((item, i) =>
                item.previewUrl ? (
                  <span
                    key={`${item.file.name}-${i}`}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface-active/80 p-1 pr-2 shadow-2xs"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="size-8 rounded-md object-cover"
                    />
                    <span className="max-w-[110px] truncate font-mono text-[11px] text-foreground">
                      {item.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-0.5 rounded text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      title="移除图片"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <span
                    key={`${item.file.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-active/80 px-2 py-0.5 font-mono text-[11.5px] text-foreground shadow-2xs"
                  >
                    <FileText className="size-3 text-muted-foreground" />
                    <span className="max-w-[140px] truncate">{item.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-0.5 rounded text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      title="移除附件"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )
              )}
            </div>
          )}

          {/* Drag-to-attach hint */}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 text-sm font-medium text-primary">
              <span className="flex items-center gap-2">
                <ImageIcon className="size-4" /> 松开以附加图片
              </span>
            </div>
          )}

          {/* Floating Autocomplete Popover Menu (/ and @) */}
          {menuType && activeMenuItems.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-2xl border border-border/80 bg-surface-elevated/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 z-50">
              <div className="px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {menuType === "/" ? "快捷指令 (Slash Commands)" : "附加上下文 (Mentions)"}
              </div>
              <div className="space-y-0.5">
                {activeMenuItems.map((item, idx) => {
                  const isSelected = idx === menuSelectedIndex;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleSelectItem(item.value)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-surface-hover"
                      )}
                    >
                      <div>
                        <div className="font-mono text-xs">{item.label}</div>
                        <div className="text-[10.5px] text-muted-foreground font-sans">
                          {item.desc}
                        </div>
                      </div>
                      <ChevronDown className="size-3 -rotate-90 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            ref={ref}
            rows={2}
            value={value}
            disabled={disabled}
            onChange={(e) => handleInputChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (menuType && activeMenuItems.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMenuSelectedIndex((prev) => (prev + 1) % activeMenuItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMenuSelectedIndex(
                    (prev) => (prev - 1 + activeMenuItems.length) % activeMenuItems.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  handleSelectItem(activeMenuItems[menuSelectedIndex].value);
                  return;
                }
                if (e.key === "Escape") {
                  setMenuType(null);
                  return;
                }
              }

              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey || (!e.shiftKey && !e.nativeEvent.isComposing))
              ) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              disabled
                ? "等待授权决定…"
                : workTitle
                  ? `描述对「${workTitle.length > 30 ? `${workTitle.slice(0, 30)}…` : workTitle}」的需求…`
                  : "描述意图，Hachimi 将自动处理…"
            }
            className="scroll-quiet block w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-6 text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ outline: "none", boxShadow: "none" }}
          />

          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Paperclip Attach File Button */}
              <button
                type="button"
                onClick={handlePaperclipClick}
                aria-label="附加文件（支持图片，Ctrl/Cmd+V 粘贴）"
                title="附加文件（支持图片，Ctrl/Cmd+V 粘贴）"
                className="grid size-7 place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Paperclip className="size-3.5" />
              </button>

              {/* Workspace Folder Pill */}
              <button
                type="button"
                onClick={handleTriggerDirectoryPicker}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/80 px-2.5 font-mono text-[12px] font-medium transition-all duration-150",
                  folderName
                    ? "bg-surface-active/80 text-foreground hover:bg-surface-hover hover:border-border"
                    : "bg-surface/50 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                )}
                title={
                  workspaceRoot
                    ? `工作区路径: ${workspaceRoot} (点击打开 Finder 重新选择)`
                    : "点击打开 Finder 选择本地项目工作区"
                }
              >
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="max-w-[150px] truncate">{folderName || "选择工作区"}</span>
                {workspaceRoot && onSelectWorkspace && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectWorkspace(null);
                    }}
                    className="ml-0.5 rounded text-muted-foreground hover:text-foreground"
                    title="取消绑定工作区"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>

              {/* Model Selector Pill at Bottom Toolbar */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen((v) => !v)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/80 bg-surface/50 px-2.5 font-mono text-[12px] font-medium text-foreground/90 transition-all hover:bg-surface-hover"
                  title="切换 AI 模型"
                >
                  <Cpu className="size-3.5 text-primary" />
                  <span className="max-w-[130px] truncate">{selectedModel}</span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>

                {/* Model Selection Dropdown Menu */}
                {modelDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setModelDropdownOpen(false)}
                    />
                    <div className="absolute bottom-9 left-0 z-50 min-w-[180px] rounded-xl border border-border/80 bg-surface-elevated/95 p-1 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
                      <div className="px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        选择模型
                      </div>
                      {modelOptions.length === 0 ? (
                        <div className="px-2.5 py-2 font-mono text-[11px] text-amber-500">
                          未检测到已就绪连接 (需在设置中配置 Key)
                        </div>
                      ) : (
                        (() => {
                          // Group by provider/connection
                          const groups = new Map<string, ModelOption[]>();
                          for (const m of modelOptions) {
                            const g = m.providerId || "other";
                            if (!groups.has(g)) groups.set(g, []);
                            groups.get(g)!.push(m);
                          }
                          return Array.from(groups.entries()).map(([provider, opts]) => (
                            <div key={provider}>
                              <div className="px-2.5 pb-0.5 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                                {provider}
                              </div>
                              {opts.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    if (onSelectModel) onSelectModel(m.id);
                                    setModelDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-mono text-[12px] transition-colors text-left",
                                    selectedModel === m.id
                                      ? "bg-primary/10 font-semibold text-primary"
                                      : "text-foreground hover:bg-surface-hover"
                                  )}
                                >
                                  <span>{m.name}</span>
                                  {selectedModel === m.id && (
                                    <span className="size-1.5 rounded-full bg-primary" />
                                  )}
                                </button>
                              ))}
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {running && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Square className="size-3" />
                  <span>Stop</span>
                </button>
              ) : (
                <>
                  {running && onSteer && (
                    <button
                      type="button"
                      onClick={onSteer}
                      disabled={disabled || !value.trim()}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                      title="纠偏当前 Work 的执行方向"
                    >
                      <Zap className="size-3" />
                      <span>插队纠偏</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={disabled || !value.trim()}
                    className={cn(
                      "grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity shadow-sm",
                      (disabled || !value.trim()) && "cursor-not-allowed opacity-30"
                    )}
                    aria-label="发送"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
