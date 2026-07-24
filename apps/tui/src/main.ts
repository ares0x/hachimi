// apps/tui/src/main.ts
/**
 * Hachimi TUI 增强与沉浸式交互入口
 */

import { generateId } from "@hachimi/shared";
import type { Message } from "../../../packages/core/src/types/index.js";
import { createAppContext } from "./app-context.js";
import { handleSlashCommand } from "./ui/commands.js";
import { renderModalBox } from "./ui/modal.js";
import { HachimiTUIApp } from "./ui/app.js";
import { getActiveTheme, setActiveTheme, colorize, renderBadge, bold, dim } from "./ui/theme.js";
import {
  clearTerminalCanvas,
  enterFullscreenCanvas,
  exitFullscreenCanvas,
  renderWelcomeCard,
  renderToolTimeline,
  askInteractiveSelector,
  askInteractivePrompt,
} from "./ui/view.js";

const PROVIDER_PRESET_MODELS: Record<
  string,
  Array<{ id: string; label: string; sublabel?: string }>
> = {
  deepseek: [
    {
      id: "deepseek-v4-pro",
      label: "deepseek-v4-pro",
      sublabel: "DeepSeek-V4 旗舰推理模型（2026最新）",
    },
    {
      id: "deepseek-v4-flash",
      label: "deepseek-v4-flash",
      sublabel: "DeepSeek-V4 高速高性价比模型",
    },
    {
      id: "__custom__",
      label: "✏️ 输入自定义模型名称...",
      sublabel: "手动填写模型标识",
    },
  ],

  openai: [
    {
      id: "gpt-5.6-sol",
      label: "gpt-5.6-sol",
      sublabel: "OpenAI 最新旗舰模型（复杂推理、Agent）",
    },
    {
      id: "gpt-5.6-terra",
      label: "gpt-5.6-terra",
      sublabel: "GPT-5.6 高能力均衡模型",
    },
    {
      id: "gpt-5.6-luna",
      label: "gpt-5.6-luna",
      sublabel: "GPT-5.6 快速高性价比模型",
    },
    {
      id: "__custom__",
      label: "✏️ 输入自定义模型名称...",
      sublabel: "手动填写模型标识",
    },
  ],

  anthropic: [
    {
      id: "claude-fable-5",
      label: "claude-fable-5",
      sublabel: "Claude 最新旗舰模型（Mythos级，复杂任务与Agent）",
    },
    {
      id: "claude-opus-4-8",
      label: "claude-opus-4-8",
      sublabel: "Claude Opus 顶级可靠旗舰模型",
    },
    {
      id: "claude-sonnet-5",
      label: "claude-sonnet-5",
      sublabel: "新一代高性价比 Agent 与编程模型",
    },
    {
      id: "__custom__",
      label: "✏️ 输入自定义模型名称...",
      sublabel: "手动填写模型标识",
    },
  ],

  qwen: [
    {
      id: "qwen3.8-max", // 或 qwen3.7-max / qwen3.7-max-preview，根据实际API
      label: "qwen3.8-max",
      sublabel: "通义千问最新旗舰模型，复杂推理与长程 Agent",
    },
    {
      id: "qwen3.7-plus",
      label: "qwen3.7-plus",
      sublabel: "通义千问新一代均衡模型，支持 Agent 与工具调用",
    },
    {
      id: "qwen3.7-flash", // 或 qwen-flash / qwen3.6-flash
      label: "qwen3.7-flash",
      sublabel: "高速高性价比模型",
    },
    {
      id: "__custom__",
      label: "✏️ 输入自定义模型名称...",
      sublabel: "手动填写模型标识",
    },
  ],

  moonshot: [
    {
      id: "kimi-k3",
      label: "kimi-k3",
      sublabel: "Kimi 最新前沿旗舰模型（2.8T，超长上下文、多模态）",
    },
    {
      id: "kimi-k2.6",
      label: "kimi-k2.6",
      sublabel: "Kimi 新一代通用推理与 Agent 模型",
    },
    {
      id: "__custom__",
      label: "✏️ 输入自定义模型名称...",
      sublabel: "手动填写模型标识",
    },
  ],
};

async function main() {
  const ctx = createAppContext({
    async onToolApproval(toolName, args, permission) {
      const theme = getActiveTheme();
      const badge = renderBadge("⚠️ APPROVAL REQUIRED", theme.colors.warning, "#FFFFFF");
      console.log(`\n${badge} ${bold(`工具 [${toolName}] (${permission}) 试图执行`)}`);
      console.log(dim(`   参数: ${JSON.stringify(args)}`));

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

  const { sessions, agent } = ctx;
  const forceCli = process.argv.includes("--cli");

  if (!forceCli) {
    const tuiApp = new HachimiTUIApp({ ctx });
    await tuiApp.start();
  }

  enterFullscreenCanvas();
  clearTerminalCanvas();
  const status = ctx.getStatus();
  console.log(renderWelcomeCard(status));

  process.on("exit", () => {
    exitFullscreenCanvas();
  });
  process.on("SIGINT", () => {
    exitFullscreenCanvas();
    process.exit(0);
  });

  while (true) {
    let userInput = "";
    const theme = getActiveTheme();

    try {
      const promptLabel = colorize("❯ ", theme.colors.primary);
      userInput = (await askInteractivePrompt(promptLabel)).trim();
    } catch {
      break;
    }

    if (!userInput) continue;

    try {
      const res = await handleSlashCommand(userInput, ctx);

      if (res.action === "exit") {
        console.log(dim(res.content || "再见！"));
        break;
      }

      if (res.action === "clear") {
        clearTerminalCanvas();
        console.log(renderWelcomeCard(ctx.getStatus()));
        console.log(colorize(res.content || "当前会话已重置", theme.colors.success));
        continue;
      }

      if (res.action === "message") {
        console.log(colorize(res.content || "", theme.colors.text));
        continue;
      }

      if (res.action === "modal") {
        console.log(
          renderModalBox({
            title: res.title || " 信息 ",
            content: res.content || "",
            theme,
          })
        );
        continue;
      }

      if (res.action === "selector_theme") {
        const themeItems = [
          { id: "default", label: "default", sublabel: "Grok 经典深色 (TokyoNight)" },
          { id: "amber", label: "amber", sublabel: "暖金琥珀" },
          { id: "neon", label: "neon", sublabel: "午夜霓虹" },
        ];
        const selected = await askInteractiveSelector("🎨 选择界面主题", themeItems);
        if (selected) {
          setActiveTheme(selected.id);
          console.log(colorize(`✨ 主题已成功切换为: [${selected.id}]`, getActiveTheme().colors.success));
        }
        continue;
      }

      if (res.action === "selector_provider") {
        const providerItems = [
          { id: "deepseek", label: "deepseek", sublabel: "DeepSeek (deepseek-v4-pro / flash)" },
          { id: "openai", label: "openai", sublabel: "OpenAI (gpt-5.6-sol / terra / luna)" },
          { id: "anthropic", label: "anthropic", sublabel: "Anthropic Claude (claude-fable-5 / opus-4-8 / sonnet-5)" },
          { id: "qwen", label: "qwen", sublabel: "通义千问 (qwen3.8-max / qwen3.7-plus)" },
          { id: "moonshot", label: "moonshot", sublabel: "Moonshot / Kimi (kimi-k3)" },
          { id: "mock", label: "mock", sublabel: "Mock 模拟测试模式" },
        ];
        const selected = await askInteractiveSelector("🤖 【Step 1/2】选择 LLM API 提供商 (Provider)", providerItems);
        if (selected) {
          const providerId = selected.id;
          let selectedModel: string | undefined;

          // Step 2: 连贯弹出 Model 选择面板
          const presetModels = PROVIDER_PRESET_MODELS[providerId] || [
            { id: "__custom__", label: "✏️ 输入自定义模型名称...", sublabel: "手动填写模型标识" }
          ];

          const modelSelected = await askInteractiveSelector(`🧠 【Step 2/2】选择 [${providerId}] 模型 (Model)`, presetModels);
          if (modelSelected) {
            if (modelSelected.id === "__custom__") {
              const modelPrompt = colorize(`✏️ 请输入 [${providerId}] 的自定义 Model 名称: `, theme.colors.primary);
              selectedModel = (await askInteractivePrompt(modelPrompt)).trim();
            } else {
              selectedModel = modelSelected.id;
            }
          }

          // Step 3: 若缺失 Key，导流输入
          const currentP = ctx.config.llm.providers[providerId];
          let inputKey: string | undefined;

          if (!currentP?.apiKey && providerId !== "mock") {
            const keyPrompt = colorize(`🔑 未检测到 [${providerId}] 的 API Key，请输入 API Key (按 Enter 确定): `, theme.colors.warning);
            inputKey = (await askInteractivePrompt(keyPrompt)).trim();
            if (!inputKey) {
              console.log(colorize(`⚠️ 未输入 API Key，[${providerId}] 可能会回退到 Mock 模式`, theme.colors.warning));
            }
          }

          ctx.setActiveProvider(providerId, {
            ...(selectedModel ? { model: selectedModel } : {}),
            ...(inputKey ? { apiKey: inputKey } : {}),
          });
          const activeModelStr = selectedModel || currentP?.model || "default";
          console.log(colorize(`✨ LLM 提供商与模型已成功更新为: [${providerId}] (${activeModelStr})`, getActiveTheme().colors.success));
        }
        continue;
      }

      if (res.action === "selector_model") {
        const activeProvider = ctx.config.llm.activeProvider;
        const presetModels = PROVIDER_PRESET_MODELS[activeProvider] || [
          { id: "__custom__", label: "✏️ 输入自定义模型名称...", sublabel: "手动填写模型标识" }
        ];

        const modelSelected = await askInteractiveSelector(`🧠 选择当前 [${activeProvider}] 的模型 (Model)`, presetModels);
        if (modelSelected) {
          let chosenModel = modelSelected.id;
          if (chosenModel === "__custom__") {
            const modelPrompt = colorize(`✏️ 请输入 [${activeProvider}] 的自定义 Model 名称: `, theme.colors.primary);
            chosenModel = (await askInteractivePrompt(modelPrompt)).trim();
          }
          if (chosenModel) {
            ctx.setActiveProvider(activeProvider, { model: chosenModel });
            console.log(colorize(`✨ [${activeProvider}] 的 Model 已成功更新为: [${chosenModel}]`, getActiveTheme().colors.success));
          }
        }
        continue;
      }

      if (res.action === "selector_sessions") {
        const currentId = sessions.getCurrent()?.id;
        const sessionList = sessions.list();
        const sessionItems = sessionList.map((s) => ({
          id: s.id,
          label: `${s.title || "默认会话"} [${s.id}]`,
          sublabel: s.id === currentId ? "👈 当前激活" : new Date(s.updatedAt).toLocaleTimeString(),
        }));

        if (sessionItems.length === 0) {
          console.log(colorize("（暂无历史会话，按 Ctrl+W 新建）", theme.colors.subtext));
          continue;
        }

        const selected = await askInteractiveSelector("💬 选择切换历史会话", sessionItems);
        if (selected) {
          const loaded = sessions.load(selected.id);
          if (loaded) {
            console.log(colorize(`✅ 已成功切换到会话: [${loaded.id}] (${loaded.title || "默认会话"})`, theme.colors.success));
          }
        }
        continue;
      }

      const spinner = colorize("⠋ [Hachimi 思考中...]", theme.colors.warning);
      process.stdout.write(`${spinner}\r`);

      let hasStreamStarted = false;
      const history = sessions.getHistory();
      const reply = await ctx.agent.run(userInput, history, {
        onChunk: (chunk: string) => {
          if (!hasStreamStarted) {
            hasStreamStarted = true;
            process.stdout.write(" ".repeat(40) + "\r");
            const botBadge = renderBadge("🤖 HACHIMI", theme.colors.assistantRole, "#FFFFFF");
            process.stdout.write(`${botBadge} `);
          }
          process.stdout.write(chunk);
        },
        onToolStart: (name, args) => {
          if (!hasStreamStarted) {
            process.stdout.write(" ".repeat(40) + "\r");
          }
          console.log(renderToolTimeline(name, args, "start"));
        },
        onToolEnd: (name, result, durationMs, success) => {
          console.log(renderToolTimeline(name, {}, "end", result, durationMs, success));
        },
      });

      if (!hasStreamStarted) {
        process.stdout.write(" ".repeat(40) + "\r");
        const botBadge = renderBadge("🤖 HACHIMI", theme.colors.assistantRole, "#FFFFFF");
        console.log(`${botBadge} ${reply}`);
      } else {
        process.stdout.write("\n");
      }

      const userMsg: Message = {
        id: generateId("msg_"),
        role: "user",
        content: userInput,
        timestamp: Date.now(),
      };
      const assistantMsg: Message = {
        id: generateId("msg_"),
        role: "assistant",
        content: reply,
        timestamp: Date.now(),
      };
      sessions.appendMessage(userMsg);
      sessions.appendMessage(assistantMsg);
    } catch (err) {
      console.error(colorize("出错了：", theme.colors.error), err);
    }
  }

  try {
    sessions.save();
  } catch {
    /* ignore */
  }

  exitFullscreenCanvas();
  process.exit(0);
}

main().catch((err) => {
  exitFullscreenCanvas();
  console.error(err);
  process.exit(1);
});
