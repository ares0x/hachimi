// apps/tui/src/main.ts
/**
 * Phase A 稳定入口（readline Channel）
 * - Core 全部来自 createAppContext()
 * - 不使用 OpenTUI（已延期）
 * - 行为与原先 scripts/chat.ts 对齐，并展示状态信息
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { generateId } from "@hachimi/shared";
import type { Message } from "../../../packages/core/src/types/index.js";
import { createAppContext } from "./app-context.js";

async function main() {
  const ctx = createAppContext();
  const { config, memory, sessions, agent, skills } = ctx;

  const session = sessions.getCurrent();
  const memCount = memory.list("long_term").length;
  const skillNames =
    skills
      .list()
      .map((s) => s.name)
      .join(", ") || "无";
  console.log("------skillNames -------",skillNames)
  printBanner({
    title: config.tui.title,
    provider: config.llm.provider,
    sessionId: session?.id ?? "-",
    memCount,
    skillNames,
    dataDir: config.paths.dataDir,
  });

  const rl = readline.createInterface({ input, output });

  while (true) {
    let userInput = "";
    try {
      userInput = (await rl.question("你: ")).trim();
    } catch {
      // 输入流关闭
      break;
    }

    if (!userInput) continue;

    try {
      const handled = await handleCommand(userInput, ctx);
      if (handled === "exit") break;
      if (handled === "continue") continue;

      // 正常对话
      const history = sessions.getHistory();
      const reply = await agent.run(userInput, history);

      console.log("hachimi:", reply);
      console.log();

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
      console.error("出错了：", err);
      console.log();
    }
  }

  try {
    sessions.save();
  } catch {
    /* ignore */
  }
  rl.close();
}

/**
 * 处理斜杠命令。
 * @returns "exit" | "continue" | "fallthrough"
 */
async function handleCommand(
  userInput: string,
  ctx: ReturnType<typeof createAppContext>
): Promise<"exit" | "continue" | "fallthrough"> {
  const { memory, sessions } = ctx;
  const command = userInput.toLowerCase();

  // 退出
  if (["/exit", "exit", "quit"].includes(command)) {
    sessions.save();
    console.log("再见！");
    return "exit";
  }

  // 查看记忆
    if (command === "/memories") {
      memory.cleanup();   // 新增
    const all = memory.list();
    console.log("\n当前记忆：");
    if (all.length === 0) {
      console.log("（空）");
    } else {
      for (const m of all) {
        console.log(`[${m.layer}] (${m.importance}) ${m.content}`);
      }
    }
    console.log();
    return "continue";
  }

  // 手动添加记忆
  if (command === "/remember" || userInput.startsWith("/remember ")) {
    const content =
      command === "/remember"
        ? ""
        : userInput.slice("/remember ".length).trim();

    if (!content) {
      console.log("用法：/remember <要记住的内容>\n");
      return "continue";
    }

    memory.remember(content, 0.75);
    console.log(`已记住：${content}\n`);
    return "continue";
  }

  // 列出会话
  if (command === "/sessions") {
    const list = sessions.list();
    const currentId = sessions.getCurrent()?.id;
    console.log("\n历史会话：");
    if (list.length === 0) {
      console.log("（空）");
    } else {
      for (const s of list) {
        const mark = s.id === currentId ? " (当前)" : "";
        console.log(
          `- ${s.id} | ${s.title || "无标题"} | ${new Date(
            s.updatedAt
          ).toLocaleString()}${mark}`
        );
      }
    }
    console.log();
    return "continue";
  }

  // 清空当前会话消息
  if (command === "/clear session") {
    const current = sessions.getCurrent();
    if (current) {
      current.messages = [];
      sessions.save(current);
      console.log("当前会话消息已清空\n");
    } else {
      console.log("当前没有会话\n");
    }
    return "continue";
  }

  // 帮助
  if (command === "/help" || command === "help") {
    printHelp();
    return "continue";
  }

  if (command === "/cleanup") {
    memory.cleanup();
    console.log("记忆已清理（去重 + 剪枝）\n");
    return "continue";
  }

    // 状态
  if (command === "/status") {
    const { config, memory, sessions, skills } = ctx;
    const session = sessions.getCurrent();
    console.log("\n当前状态：");
    console.log(`  title:    ${config.tui.title}`);
    console.log(`  provider: ${config.llm.provider}`);
    console.log(`  session:  ${session?.id ?? "-"}`);
    console.log(`  messages: ${session?.messages.length ?? 0}`);
    console.log(`  memory:   ${memory.list("long_term").length} (long_term)`);
    console.log(
      `  skills:   ${skills.list().map((s) => s.name).join(", ") || "无"}`
    );
    console.log(`  dataDir:  ${config.paths.dataDir}`);
    console.log();
    return "continue";
  }

  return "fallthrough";
}

function printBanner(info: {
  title: string;
  provider: string;
  sessionId: string;
  memCount: number;
  skillNames: string;
  dataDir: string;
}) {
  console.log("========================================");
  console.log(`  ${info.title}  |  Phase A (readline)`);
  console.log("========================================");
  console.log(`  model:   ${info.provider}`);
  console.log(`  session: ${info.sessionId}`);
  console.log(`  memory:  ${info.memCount} (long_term)`);
  console.log(`  skills:  ${info.skillNames}`);
  console.log(`  data:    ${info.dataDir}`);
  console.log("----------------------------------------");
  console.log("  命令:");
  console.log("    /help              帮助");
  console.log("    /status            当前状态");
  console.log("    /memories          查看记忆");
  console.log("    /remember <内容>   添加记忆");
  console.log("    /sessions          列出会话");
  console.log("    /clear session     清空当前会话");
  console.log("    /exit              退出");
  console.log("========================================");
  console.log();
}

function printHelp() {
  console.log(`
可用命令：
  /help              显示本帮助
  /status            显示运行状态
  /memories          查看所有记忆
  /remember <内容>   手动写入长期记忆
  /sessions          列出历史会话
  /clear session     清空当前会话消息
  /exit              保存并退出

也可以直接说：
  请记住我喜欢喝手冲咖啡
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
