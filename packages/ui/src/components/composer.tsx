import {
  ArrowUp,
  ChevronDown,
  Cpu,
  FileText,
  FolderOpen,
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

const DEFAULT_MODELS: ModelOption[] = [
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro" },
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash" },
  { id: "claude-3-7-sonnet", name: "claude-3-7-sonnet" },
  { id: "gpt-4o", name: "gpt-4o" },
];

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
  modelOptions = DEFAULT_MODELS,
  onSelectModel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
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

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  useEffect(() => {
    if (!running && !disabled) ref.current?.focus();
  }, [running, disabled]);

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
      const newFiles = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
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
          if (!running && value.trim()) {
            onSubmit();
          }
        }}
        className="mx-auto w-full max-w-[48rem]"
      >
        <div className="group relative rounded-2xl border border-border/80 bg-surface-elevated/90 shadow-[0_4px_24px_oklch(0_0_0_/0.06)] backdrop-blur-md transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-[0_8px_32px_oklch(0_0_0_/0.09)]">
          {/* Attached Files Pills Container */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-1 border-b border-border/30">
              {attachedFiles.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-active/80 px-2 py-0.5 font-mono text-[11.5px] text-foreground shadow-2xs"
                >
                  <FileText className="size-3 text-muted-foreground" />
                  <span className="max-w-[140px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-0.5 rounded text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    title="移除附件"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={ref}
            rows={2}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey || (!e.shiftKey && !e.nativeEvent.isComposing))
              ) {
                e.preventDefault();
                if (!running && value.trim()) {
                  onSubmit();
                }
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
                aria-label="附加文件"
                className="grid size-7 place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                title="选择并附加本地文件"
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
                      {modelOptions.map((m) => (
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
