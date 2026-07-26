import { cn } from "../lib/utils";

/**
 * Minimal stream-safe markdown renderer.
 * Per DESIGN_SYSTEM §8.7.1: in-stream headings are NOT marketing display type.
 * Supports: bold, inline code, citations, lists, blockquotes, code fences, hr, and markdown tables.
 */
function inline(text: string, key: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${key}-b${i}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${key}-c${i}`}
          className="rounded-sm bg-surface-hover px-1 py-px font-mono text-[13px] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(
        <sup key={`${key}-r${i}`} className="ml-0.5 font-mono text-[11px] text-muted-foreground">
          {token}
        </sup>
      );
    }
    last = match.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const rawCells = trimmed.split("|");
  if (rawCells.length < 2) return [];
  // Slice off leading and trailing empty cells if row started/ended with |
  const start = trimmed.startsWith("|") ? 1 : 0;
  const end = trimmed.endsWith("|") ? rawCells.length - 1 : rawCells.length;
  return rawCells.slice(start, end).map((c) => c.trim());
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const normalizedText = (text || "").replace(/\\n/g, "\n");
  const lines = normalizedText.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[] | null = null;
  let fence: { lang: string; code: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={cn(
          "my-3 space-y-1.5 pl-5 text-foreground",
          list.ordered ? "list-decimal" : "list-disc"
        )}
      >
        {list.items.map((item, i) => (
          <li key={i} className="pl-0.5">
            {inline(item, `li${blocks.length}-${i}`)}
          </li>
        ))}
      </Tag>
    );
    list = null;
  };

  const flushTable = () => {
    if (!table || table.length === 0) return;
    const rows = table.map(parseTableRow).filter((r) => r.length > 0);
    table = null;

    if (rows.length === 0) return;

    // Check if row 1 is delimiter (|---|---|)
    const hasDelimiter =
      rows.length > 1 &&
      rows[1].every((cell) => /^[:\s-]{3,}$/.test(cell));

    const header = rows[0];
    const bodyRows = hasDelimiter ? rows.slice(2) : rows.slice(1);

    blocks.push(
      <div
        key={`t${blocks.length}`}
        className="my-3 overflow-x-auto rounded-lg border border-border bg-surface-elevated shadow-sm scroll-quiet"
      >
        <table className="w-full text-left font-sans text-[13px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-hover/80 text-foreground">
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="border-r border-border/60 px-3.5 py-2 font-semibold last:border-r-0"
                >
                  {inline(cell, `th-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
          {bodyRows.length > 0 && (
            <tbody className="divide-y divide-border/60 text-foreground">
              {bodyRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="transition-colors hover:bg-surface-hover/40"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="border-r border-border/60 px-3.5 py-2 last:border-r-0"
                    >
                      {inline(cell, `td-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    );
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();

    // Code fence tracking
    if (fence) {
      if (line.startsWith("```")) {
        blocks.push(
          <pre
            key={`f${idx}`}
            className="my-3 overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[13px] leading-6 text-foreground"
          >
            <code>{fence.code.join("\n")}</code>
          </pre>
        );
        fence = null;
      } else {
        fence.code.push(raw);
      }
      return;
    }

    if (line.startsWith("```")) {
      flushList();
      flushTable();
      fence = { lang: line.slice(3), code: [] };
      return;
    }

    // Markdown Table tracking
    const isTableLine = line.trim().startsWith("|") && line.includes("|");
    if (isTableLine) {
      flushList();
      if (!table) table = [];
      table.push(line);
      return;
    } else if (table) {
      flushTable();
    }

    if (!line.trim()) {
      flushList();
      return;
    }

    // Horizontal Rule --- or ***
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushList();
      blocks.push(<hr key={idx} className="my-4 border-t border-border" />);
      return;
    }

    // Lists
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul?.[1] ?? ol?.[1])!);
      return;
    }

    flushList();

    if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={idx} className="mt-4 mb-2 text-[15px] font-semibold text-foreground">
          {inline(line.slice(4), `h${idx}`)}
        </h4>
      );
      return;
    }

    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={idx} className="mt-4 mb-2 text-base font-semibold text-foreground">
          {inline(line.slice(3), `h${idx}`)}
        </h3>
      );
      return;
    }

    if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={idx}
          className="my-3 border-l-2 border-border-strong pl-3 text-muted-foreground"
        >
          {inline(line.slice(2), `q${idx}`)}
        </blockquote>
      );
      return;
    }

    blocks.push(
      <p key={idx} className="my-3 text-foreground">
        {inline(line, `p${idx}`)}
      </p>
    );
  });

  flushList();
  flushTable();

  return (
    <div className={cn("text-[14px] leading-[1.75] whitespace-pre-wrap break-words [&>*:first-child]:mt-0", className)}>
      {blocks}
    </div>
  );
}
