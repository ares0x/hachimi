import type { ToolRegistry } from "../registry.js";
import { deleteFileTool } from "./fs/delete-file.js";
import { grepSearchTool } from "./fs/grep-search.js";
import { listDirTool } from "./fs/list-dir.js";
import { readFileTool } from "./fs/read-file.js";
import { replaceFileContentTool } from "./fs/replace-file.js";
import { writeFileTool } from "./fs/write-file.js";
import { calculatorTool, getCurrentDatetimeTool } from "./meta.js";
import { runCommandTool } from "./shell/run-command.js";
import { updateWorkPlanTool } from "./work/update-work-plan.js";

/** 注册核心内置工具（实现按域拆分） */
export function registerBuiltinTools(registry: ToolRegistry): void {
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
    updateWorkPlanTool,
  ];
  for (const tool of all) {
    registry.register(tool);
  }
}
