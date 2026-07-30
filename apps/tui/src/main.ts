// apps/tui/src/main.ts
/**
 * Hachimi TUI Immersive Terminal Application Entrypoint
 */
import { summarizeToolArgs } from "@hachimi/shared";
import { createAppContext } from "./app-context.js";
import { HachimiTUIApp } from "./ui/app.js";
import { bold, colorize, dim, getActiveTheme, renderBadge } from "./ui/theme.js";
import { askInteractivePrompt, exitFullscreenCanvas } from "./ui/view.js";

async function main() {
  const ctx = createAppContext({
    async onToolApproval(toolName, args, permission) {
      const theme = getActiveTheme();
      const badge = renderBadge("⚠️ APPROVAL REQUIRED", theme.colors.warning, "#FFFFFF");
      const summary = summarizeToolArgs(toolName, args as Record<string, unknown>);
      console.log(`\n${badge} ${bold(`工具 [${toolName}] (${permission}) 试图执行`)}`);
      console.log(dim(`   ${summary.oneLine}`));
      for (const f of summary.fields.slice(0, 3)) {
        const valLines = String(f.value).split("\n");
        const preview =
          valLines.length > 4
            ? valLines.slice(0, 4).join("\n      ") +
              `\n      …[+${valLines.length - 4} lines 省略]`
            : f.value;
        console.log(dim(`   · ${f.label}: ${preview}`));
      }

      const promptStr = colorize("👉 是否允许执行该工具？(y/N): ", theme.colors.primary);
      const ans = (await askInteractivePrompt(`   ${promptStr}`)).trim().toLowerCase();

      const approved = ans === "y" || ans === "yes";
      if (approved) {
        console.log(colorize("   ✅ 已授权执行", theme.colors.success));
      } else {
        console.log(colorize("   ❌ 已拒绝执行", theme.colors.error));
      }
      return approved;
    },
  });

  const tuiApp = new HachimiTUIApp({ ctx });
  await tuiApp.start();
}

main().catch((err) => {
  exitFullscreenCanvas();
  console.error(err);
  process.exit(1);
});
