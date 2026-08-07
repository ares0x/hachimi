// packages/core/src/tools/builtin/system/system-tools.ts
import { arch, freemem, platform, totalmem, uptime } from "node:os";
import type { ToolDefinition } from "../../types.js";

export const getSystemInfoTool: ToolDefinition = {
  name: "get_system_info",
  kind: "read",
  description:
    "Returns OS, platform, CPU architecture, memory usage, and Node environment information.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute() {
    const totalMb = Math.round(totalmem() / (1024 * 1024));
    const freeMb = Math.round(freemem() / (1024 * 1024));
    const usedMb = totalMb - freeMb;

    return `[System Information]:
- Platform: ${platform()} (${arch()})
- Node Version: ${process.version}
- Memory: ${usedMb}MB / ${totalMb}MB used (${freeMb}MB free)
- System Uptime: ${Math.round(uptime() / 60)} minutes
- Process PID: ${process.pid}
- CWD: ${process.cwd()}`;
  },
};
