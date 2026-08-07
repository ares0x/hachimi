// packages/core/src/tools/builtin/fs/diff.ts

/**
 * 结构化 Unified Diff 生成器（零外部依赖）
 * 为文件创建、更新和替换在 Preflight Check 阶段生成 Git 风格统一 Diff。
 */

export interface DiffOptions {
  contextLines?: number; // 上下文保留行数，默认 3
}

export function generateFileDiff(
  filePath: string,
  oldContent: string | null,
  newContent: string,
  options: DiffOptions = {}
): string {
  const contextLines = options.contextLines ?? 3;
  const fileName = filePath.replace(/\\/g, "/");

  // 1. 新建文件场景 (New File)
  if (oldContent === null) {
    const newLines = newContent.split(/\r?\n/);
    const header = `--- /dev/null\n+++ b/${fileName}\n@@ -0,0 +1,${newLines.length} @@\n`;
    const body = newLines.map((line) => `+${line}`).join("\n");
    return header + body;
  }

  // 无任何变化场景
  if (oldContent === newContent) {
    return "(未发生任何更改)";
  }

  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);

  // 2. LCS / Line diff 比对算法
  const edits = computeLineEdits(oldLines, newLines);
  if (edits.length === 0) {
    return "(未发生任何更改)";
  }

  // 3. 将连续编辑拆分/组装为 Hunk Chunk (@@ -a,b +c,d @@)
  const hunks = groupEditsIntoHunks(edits, contextLines);
  if (hunks.length === 0) {
    return "(未发生任何更改)";
  }

  const header = `--- a/${fileName}\n+++ b/${fileName}\n`;
  const hunkStrings = hunks.map((hunk) => {
    const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    const lines = hunk.lines.map((item) => `${item.type}${item.content}`).join("\n");
    return `${hunkHeader}\n${lines}`;
  });

  return header + hunkStrings.join("\n");
}

interface Edit {
  type: " " | "-" | "+";
  oldLineNo?: number;
  newLineNo?: number;
  content: string;
}

function computeLineEdits(oldLines: string[], newLines: string[]): Edit[] {
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const edits: Edit[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: " ", oldLineNo: i, newLineNo: j, content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: "+", newLineNo: j, content: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      edits.push({ type: "-", oldLineNo: i, content: oldLines[i - 1] });
      i--;
    }
  }

  return edits.reverse();
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Edit[];
}

function groupEditsIntoHunks(edits: Edit[], contextSize: number): Hunk[] {
  const hunks: Hunk[] = [];
  const currentHunkEdits: Edit[] = [];

  for (let idx = 0; idx < edits.length; idx++) {
    const edit = edits[idx];
    const isChange = edit.type !== " ";

    if (isChange) {
      let startContextIdx = Math.max(0, idx - contextSize);
      if (currentHunkEdits.length > 0) {
        const lastInHunk = currentHunkEdits[currentHunkEdits.length - 1];
        const lastHunkIndex = edits.indexOf(lastInHunk);
        if (startContextIdx <= lastHunkIndex) {
          startContextIdx = lastHunkIndex + 1;
        }
      } else {
        for (let c = startContextIdx; c < idx; c++) {
          currentHunkEdits.push(edits[c]);
        }
      }

      currentHunkEdits.push(edit);

      let postCount = 0;
      let nextIdx = idx + 1;
      while (nextIdx < edits.length && edits[nextIdx].type === " " && postCount < contextSize) {
        let nextChange = false;
        for (let look = 1; look <= contextSize * 2 && nextIdx + look < edits.length; look++) {
          if (edits[nextIdx + look].type !== " ") {
            nextChange = true;
            break;
          }
        }
        if (!nextChange && postCount >= contextSize) break;

        currentHunkEdits.push(edits[nextIdx]);
        postCount++;
        nextIdx++;
      }
      idx = nextIdx - 1;
    }
  }

  if (currentHunkEdits.length === 0) return [];

  const oldChanged = currentHunkEdits.filter((e) => e.type === " " || e.type === "-");
  const newChanged = currentHunkEdits.filter((e) => e.type === " " || e.type === "+");

  const firstOld = oldChanged.find((e) => e.oldLineNo !== undefined);
  const firstNew = newChanged.find((e) => e.newLineNo !== undefined);

  hunks.push({
    oldStart: firstOld?.oldLineNo ?? 1,
    oldLines: oldChanged.length,
    newStart: firstNew?.newLineNo ?? 1,
    newLines: newChanged.length,
    lines: currentHunkEdits,
  });

  return hunks;
}
