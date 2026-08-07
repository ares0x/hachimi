import type { ToolRegistry } from "../registry.js";
import { codeSnipTool } from "./fs/code-snip.js";
import { deleteFileTool } from "./fs/delete-file.js";
import { globFilesTool } from "./fs/glob-files.js";
import { grepSearchTool } from "./fs/grep-search.js";
import { listDirTool } from "./fs/list-dir.js";
import { lspQueryTool } from "./fs/lsp-query.js";
import { readFileTool } from "./fs/read-file.js";
import { replaceFileContentTool } from "./fs/replace-file.js";
import { writeFileTool } from "./fs/write-file.js";
import { gitDiffTool, gitLogTool, gitStatusTool } from "./git/git-tools.js";
import {
  createInboxNoteTool,
  readKnowledgeNoteTool,
  searchKnowledgeNotesTool,
} from "./knowledge.js";
import { askUserQuestionTool } from "./meta/ask-user-question.js";
import {
  fileHistoryListTool,
  fileHistorySnapshotTool,
  restoreFileSnapshotTool,
} from "./meta/file-history-tools.js";
import { createLoadToolsTool } from "./meta/load-tools.js";
import { manageConfigTool } from "./meta/manage-config.js";
import { enterPlanModeTool, exitPlanModeTool } from "./meta/plan-mode.js";
import { createReadArtifactTool } from "./meta/read-artifact.js";
import { sleepTimerTool } from "./meta/sleep-timer.js";
import { todoWriteTool } from "./meta/todo-write.js";
import { toolSearchTool } from "./meta/tool-search.js";
import { calculatorTool, getCurrentDatetimeTool } from "./meta.js";
import {
  getCommandOrSubagentOutputTool,
  killCommandOrSubagentTool,
  waitCommandsOrSubagentsTool,
} from "./shell/background-tasks.js";
import { captureTerminalTool } from "./shell/capture-terminal.js";
import { runCommandTool } from "./shell/run-command.js";
import { getSystemInfoTool } from "./system/system-tools.js";
import { browserNavigateTool } from "./web/browser-navigate.js";
import { browserSnapshotTool } from "./web/browser-snapshot.js";
import { stockQuoteTool } from "./web/stock-quote.js";
import { webSearchTool } from "./web/web-search.js";
import { updateWorkPlanTool } from "./work/update-work-plan.js";

/** 注册核心内置工具（实现按域拆分） */
export function registerBuiltinTools(registry: ToolRegistry, dataDir = "./data"): void {
  const all = [
    calculatorTool,
    getCurrentDatetimeTool,
    readFileTool,
    writeFileTool,
    deleteFileTool,
    listDirTool,
    grepSearchTool,
    replaceFileContentTool,
    runCommandTool,
    getCommandOrSubagentOutputTool,
    waitCommandsOrSubagentsTool,
    killCommandOrSubagentTool,
    updateWorkPlanTool,
    searchKnowledgeNotesTool,
    readKnowledgeNoteTool,
    createInboxNoteTool,
    webSearchTool,
    stockQuoteTool,
    gitStatusTool,
    gitDiffTool,
    gitLogTool,
    getSystemInfoTool,
    globFilesTool,
    codeSnipTool,
    todoWriteTool,
    askUserQuestionTool,
    enterPlanModeTool,
    exitPlanModeTool,
    captureTerminalTool,
    toolSearchTool,
    sleepTimerTool,
    manageConfigTool,
    lspQueryTool,
    browserNavigateTool,
    browserSnapshotTool,
    // P2.6: rewind 工具面 — 手动快照 / 快照链 / 恢复
    fileHistorySnapshotTool,
    fileHistoryListTool,
    restoreFileSnapshotTool,
  ];
  for (const tool of all) {
    registry.register(tool, "builtin");
  }
  // P2-B3: 工具门控激活工具（闭包持有 registry，始终公布）
  registry.register(createLoadToolsTool(registry), "builtin");
  // P1.6: 归档结果水合工具（需 dataDir 解析 artifacts 根）
  registry.register(createReadArtifactTool(dataDir), "builtin");
}
