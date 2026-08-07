// packages/ui/src/components/diff-viewer.tsx
/**
 * L1 (D7): 统一 diff 渲染 — 从 permission-dock 的私有实现提取为共享组件，
 * 审批面板 / 审批 Dock 复用同一套行级配色。
 */

export function DiffViewer({ diff, maxHeight = "max-h-60" }: { diff: string; maxHeight?: string }) {
  const lines = diff.split("\n");
  return (
    <div
      className={`mt-2 ${maxHeight} overflow-x-auto overflow-y-auto rounded-md border border-border/80 bg-zinc-950 p-2.5 font-mono text-[12px] leading-tight text-zinc-100`}
    >
      {lines.map((line, i) => {
        let cls = "text-zinc-400";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          cls = "bg-emerald-950/80 text-emerald-300 font-medium px-1 py-0.5 rounded-sm block";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          cls = "bg-rose-950/80 text-rose-300 font-medium px-1 py-0.5 rounded-sm block";
        } else if (line.startsWith("@@")) {
          cls = "text-cyan-400 font-semibold py-0.5 block opacity-90";
        } else if (line.startsWith("---") || line.startsWith("+++")) {
          cls = "text-zinc-400 font-bold block";
        }
        return (
          <span key={i} className={cls}>
            {line}
          </span>
        );
      })}
    </div>
  );
}
