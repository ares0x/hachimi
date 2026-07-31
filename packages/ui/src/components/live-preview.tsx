import {
  Check,
  Copy,
  ExternalLink,
  Laptop,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  Tablet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

export interface LivePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  title?: string;
}

export function LivePreviewModal({
  isOpen,
  onClose,
  code,
  title = "HTML Live Preview",
}: LivePreviewModalProps) {
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        // Wrap in clean HTML template if not full document
        const fullContent = code.toLowerCase().includes("<html")
          ? code
          : `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      background-color: ${themeMode === "dark" ? "#0f1117" : "#ffffff"};
      color: ${themeMode === "dark" ? "#f3f4f6" : "#111827"};
    }
  </style>
</head>
<body>
  ${code}
</body>
</html>`;
        doc.write(fullContent);
        doc.close();
      }
    }
  }, [isOpen, code, themeMode]);

  if (!isOpen) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const viewportWidthClass =
    viewport === "mobile" ? "w-[375px]" : viewport === "tablet" ? "w-[768px]" : "w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-surface-elevated/95 shadow-2xl backdrop-blur-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-foreground font-mono">{title}</h3>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Viewport Switcher */}
            <div className="flex items-center gap-0.5 rounded-xl bg-surface-hover/80 p-1">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                  viewport === "desktop"
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="桌面视图 (100%)"
              >
                <Laptop className="size-3.5" /> 桌面
              </button>
              <button
                type="button"
                onClick={() => setViewport("tablet")}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                  viewport === "tablet"
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="平板视图 (768px)"
              >
                <Tablet className="size-3.5" /> 平板
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                  viewport === "mobile"
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="手机视图 (375px)"
              >
                <Smartphone className="size-3.5" /> 手机
              </button>
            </div>

            {/* Theme Switcher */}
            <button
              type="button"
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
              className="grid size-8 place-items-center rounded-xl border border-border/50 bg-surface/80 text-muted-foreground transition-all hover:bg-surface-hover hover:text-foreground active:scale-[0.97]"
              title="切换预览主题"
            >
              {themeMode === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>

            {/* Actions */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "已复制" : "复制源码"}
            </button>

            <button
              type="button"
              onClick={handleOpenExternal}
              className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all active:scale-[0.97] hover:bg-surface-hover"
            >
              <ExternalLink className="size-3.5" /> 新窗口打开
            </button>

            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-xl border border-border/50 bg-surface/80 text-muted-foreground transition-all hover:bg-surface-hover hover:text-foreground active:scale-[0.97]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Preview Frame Canvas */}
        <div
          className={cn(
            "flex flex-1 items-center justify-center overflow-auto p-4 transition-all duration-300",
            themeMode === "dark" ? "bg-[#0b0c10]" : "bg-neutral-100"
          )}
        >
          <div
            className={cn(
              "h-full overflow-hidden rounded-2xl border border-border/40 shadow-lg transition-all duration-300",
              viewportWidthClass
            )}
          >
            <iframe
              ref={iframeRef}
              title="Live HTML Sandbox Preview"
              sandbox="allow-scripts"
              className="size-full border-none bg-white dark:bg-[#0f1117]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
