// apps/tui/src/ui/commands.ts
import type { AppContext } from "../app-context.js";
import { THEMES, setActiveTheme, getActiveTheme } from "./theme.js";

export interface CommandResult {
  action:
    | "exit"
    | "clear"
    | "modal"
    | "message"
    | "selector_theme"
    | "selector_sessions"
    | "selector_provider"
    | "selector_model"
    | "none";
  title?: string;
  content?: string;
}

export interface SlashCommandDef {
  name: string;
  description: string;
  example?: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "/status", description: "查看 LLM、Context Token 测量长条、Memory、Session 概况" },
  { name: "/config", description: "查看当前系统运行配置（脱敏显示）" },
  { name: "/provider", description: "交互式选择 LLM 提供商并开启模型设置向导" },
  { name: "/model", description: "切换或快速设置当前 Provider 的模型 (Model)", example: "/model 或 /model deepseek-reasoner" },
  { name: "/theme", description: "切换 TUI 色彩主题 (default / amber / neon)", example: "/theme default" },
  { name: "/memories", description: "查看当前存储的所有长期与会话记忆" },
  { name: "/remember", description: "手动记录一条长期记忆", example: "/remember 用户喜欢手冲咖啡" },
  { name: "/sessions", description: "列出或切换历史会话", example: "/sessions 或 /session load <sess_id>" },
  { name: "/clear", description: "清空当前会话消息" },
  { name: "/cleanup", description: "对记忆执行去重与剪枝清理" },
  { name: "/help", description: "显示使用帮助、快捷键与主题指南" },
  { name: "/exit", description: "保存当前会话并退出程序" },
];

export async function handleSlashCommand(
  userInput: string,
  ctx: AppContext
): Promise<CommandResult> {
  const trimmed = userInput.trim();
  if (!trimmed.startsWith("/")) {
    return { action: "none" };
  }

  const [cmd, ...args] = trimmed.split(" ");
  const commandName = cmd.toLowerCase();

  switch (commandName) {
    case "/exit":
    case "/quit": {
      ctx.sessions.save();
      return { action: "exit", content: "再见！" };
    }

    case "/provider": {
      const providerName = args[0]?.toLowerCase();
      if (!providerName) {
        return { action: "selector_provider" };
      }
      ctx.setActiveProvider(providerName);
      return {
        action: "message",
        content: `✨ 提供商已成功切换为: [${providerName}]`,
      };
    }

    case "/model": {
      const modelName = args.join(" ").trim();
      if (!modelName) {
        return { action: "selector_model" };
      }
      const activeProvider = ctx.config.llm.activeProvider;
      ctx.setActiveProvider(activeProvider, { model: modelName });
      return {
        action: "message",
        content: `✨ 当前提供商 [${activeProvider}] 的模型已更新为: [${modelName}]`,
      };
    }

    case "/theme": {
      const themeName = args[0]?.toLowerCase();
      if (!themeName) {
        return { action: "selector_theme" };
      }
      const ok = setActiveTheme(themeName);
      if (ok) {
        return {
          action: "message",
          content: `✨ 主题已成功切换为: [${themeName}]`,
        };
      }
      return {
        action: "message",
        content: `❌ 未知主题: [${themeName}]。可用主题: ${Object.keys(THEMES).join(", ")}`,
      };
    }

    case "/status": {
      const status = ctx.getStatus();
      const maxT = status.context.maxTokens || 8000;
      const estT = status.context.estimatedTokens || 0;
      const ratioNum = Math.min(100, Math.round((estT / maxT) * 100));

      const totalBlocks = 20;
      const filledBlocks = Math.round((ratioNum / 100) * totalBlocks);
      const meterGauge = `[${"█".repeat(filledBlocks)}${"░".repeat(totalBlocks - filledBlocks)}] ${ratioNum}%`;

      const text = [
        "📊 【Hachimi 系统状态实时仪表盘】",
        "------------------------------------",
        `🤖 LLM 提供者 : ${status.llm.provider} (${status.llm.model})`,
        `📐 Context 模式: ${status.context.mode}`,
        `⚡ Token 仪表  : ${meterGauge} (${estT}/${maxT})`,
        `🧠 记忆统计    : 长期 ${status.memory.longTermCount} 条 | 会话 ${status.memory.sessionCount} 条 (共 ${status.memory.totalCount} 条)`,
        `💬 当前 Session : ID [${status.session.id}] | 消息数: ${status.session.messageCount}`,
        `🛠️ 可用 Skills  : ${status.skills.length > 0 ? status.skills.join(", ") : "无"}`,
        `🔧 注册 Tools   : ${status.tools.map((t: any) => `${t.name}(${t.permission})`).join(", ")}`,
        `🎨 界面主题    : ${getActiveTheme().name}`,
        `📁 数据目录    : ${status.paths.dataDir}`,
        "------------------------------------",
      ].join("\n");

      return {
        action: "modal",
        title: " 系统状态与 Token 仪表 (/status) ",
        content: text,
      };
    }

    case "/config": {
      const cfg = ctx.getConfig();
      const safeConfig = JSON.parse(JSON.stringify(cfg));
      if (safeConfig.llm?.providers) {
        for (const p of Object.values(safeConfig.llm.providers)) {
          if ((p as any).apiKey) (p as any).apiKey = "******";
        }
      }

      const text = [
        "⚙️ 【当前运行配置 (HachimiConfig)】",
        "------------------------------------",
        JSON.stringify(safeConfig, null, 2),
        "------------------------------------",
      ].join("\n");

      return {
        action: "modal",
        title: " 运行配置视图 (/config) ",
        content: text,
      };
    }

    case "/memories": {
      ctx.memory.cleanup();
      const all = ctx.memory.list();
      let content = "";
      if (all.length === 0) {
        content = "（暂无记忆）";
      } else {
        content = all
          .map((m) => `• [${m.layer}] (${(m.importance * 100).toFixed(0)}%) ${m.content}`)
          .join("\n");
      }
      return {
        action: "modal",
        title: " 记忆检查面板 (/memories) ",
        content: `当前共有 ${all.length} 条记忆：\n\n${content}`,
      };
    }

    case "/remember": {
      const content = args.join(" ").trim();
      if (!content) {
        return {
          action: "message",
          content: "❌ 请输入要记住的内容，例如：/remember 用户喜欢喝手冲咖啡",
        };
      }
      ctx.memory.remember(content, 0.8);
      return {
        action: "message",
        content: `✅ 已记住：${content}`,
      };
    }

    case "/session":
    case "/sessions": {
      const sub = args[0]?.toLowerCase();
      if (sub === "load" && args[1]) {
        const targetId = args[1];
        const loaded = ctx.sessions.load(targetId);
        if (loaded) {
          return {
            action: "message",
            content: `✅ 已成功切换到会话: [${loaded.id}] (${loaded.title || "无标题"})`,
          };
        }
        return { action: "message", content: `❌ 未找到 ID 为 [${targetId}] 的历史会话` };
      }

      if (sub === "new" || sub === "create") {
        const title = args.slice(1).join(" ") || undefined;
        const created = ctx.sessions.create(title);
        return {
          action: "message",
          content: `✅ 已创建新会话: [${created.id}] (${created.title})`,
        };
      }

      return { action: "selector_sessions" };
    }

    case "/clear": {
      const current = ctx.sessions.getCurrent();
      if (current) {
        current.messages = [];
        ctx.sessions.save(current);
        return { action: "clear", content: "✅ 当前会话消息已清空" };
      }
      return { action: "message", content: "当前没有活跃会话" };
    }

    case "/cleanup": {
      ctx.memory.cleanup();
      return { action: "message", content: "🧹 记忆已自动去重与剪枝完成" };
    }

    case "/help": {
      const helpText = [
        "💡 【Hachimi 交互命令指南】",
        "------------------------------------",
        ...SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(12)} - ${c.description}`),
        "------------------------------------",
        "⌨️ 【快捷交互】",
        "  Ctrl + W     : 新建会话",
        "  Ctrl + S     : 恢复历史会话",
        "  Ctrl + P     : 查看系统状态",
        "  Ctrl + Q / C : 退出程序",
        "  Up / Down    : 面板方向键选择 / 历史输入切换",
        "------------------------------------",
        "💬 自然语言唤醒：直接说「请记住我喜欢喝手冲咖啡」亦可写入记忆",
      ].join("\n");

      return {
        action: "modal",
        title: " 帮助与快捷键指南 (/help) ",
        content: helpText,
      };
    }

    case "/": {
      const content = SLASH_COMMANDS.map((c) => `• ${c.name.padEnd(12)} - ${c.description}`).join("\n");
      return {
        action: "modal",
        title: " 💡 Slash 命令指南 ",
        content: `${content}\n\n💡 提示: 可直接输入具体命令（如 /status, /config, /provider, /model 等）执行`,
      };
    }

    default:
      return {
        action: "message",
        content: `未知命令: ${commandName}。输入 /help 查看可用命令列表。`,
      };
  }
}
