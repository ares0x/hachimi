// scripts/chat.ts
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Agent } from "../packages/core/src/agent/agent.js";
import { ToolRegistry } from "../packages/core/src/tools/registry.js";
import { MockLLMProvider } from "../packages/core/src/agent/llm.js";
import { OpenAICompatibleProvider } from "../packages/core/src/agent/providers/openai-compatible.js";
import { MemoryManager } from "../packages/core/src/memory/manager.js";
import { SkillRegistry } from "../packages/core/src/skills/registry.js";
import { writingSkill } from "../packages/core/src/skills/builtin/writing.js";
import { SessionManager } from "../packages/core/src/session/manager.js";
import { generateId } from "../packages/shared/src/index.js";
import type { Message } from "../packages/core/src/types/index.js";
import { summarySkill } from "../packages/core/src/skills/builtin/summary.js";

async function main() {
  const tools = new ToolRegistry();
  const memory = new MemoryManager("data/memory.json");
  const skills = new SkillRegistry();
  const sessions = new SessionManager("data/sessions");

  skills.register(writingSkill);
  skills.register(summarySkill);

  const session = sessions.getOrCreate();
  console.log(`[Session] 当前会话: ${session.id}`);
  console.log(`[Session] 标题: ${session.title}`);
  console.log(`[Session] 历史消息数: ${session.messages.length}\n`);

  function createLLM() {
    const provider = process.env.LLM_PROVIDER || "mock";

    if (provider === "openai") {
      return new OpenAICompatibleProvider({
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });
    }

    if (provider === "deepseek") {
      return new OpenAICompatibleProvider({
        apiKey: process.env.DEEPSEEK_API_KEY!,
        baseURL: "https://api.deepseek.com",
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      });
    }

    console.log("[LLM] 使用 MockLLMProvider");
    return new MockLLMProvider();
  }

  const llm = createLLM();

  if (memory.list("long_term").length === 0) {
    memory.remember("用户的名字是小明，喜欢简洁的回答", 0.9);
    memory.remember("用户正在开发一个叫 hachimi 的个人助理项目", 0.85);
    memory.remember("用户是一名前端开发者，熟悉 TypeScript 和 Go", 0.8);
  }

  tools.register({
    name: "calculator",
    description: "执行简单的加减乘除计算",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
        operator: { type: "string", enum: ["+", "-", "*", "/"] },
      },
      required: ["a", "b", "operator"],
    },
    async execute(args) {
      const { a, b, operator } = args as {
        a: number;
        b: number;
        operator: string;
      };
      switch (operator) {
        case "+":
          return String(a + b);
        case "-":
          return String(a - b);
        case "*":
          return String(a * b);
        case "/":
          return String(a / b);
        default:
          return "不支持的运算符";
      }
    },
  });

  const agent = new Agent({
    llm,
    tools,
    memory,
    skills,
  });

  const rl = readline.createInterface({ input, output });

  console.log("========================================");
  console.log("  hachimi 交互式 CLI");
  console.log("  特殊命令：");
  console.log("    /memories          查看所有记忆");
  console.log("    /remember <内容>   手动添加长期记忆");
  console.log("    /sessions          列出所有会话");
  console.log("    /clear session     清空当前会话消息");
  console.log("    /exit              退出");
  console.log("========================================\n");

  console.log(`[LLM] Provider: ${process.env.LLM_PROVIDER || "mock"}`);
  console.log(
    `[Skills] 已注册: ${
      skills
        .list()
        .map((s) => s.name)
        .join(", ") || "无"
    }`
  );
  console.log(`[Memory] 长期记忆数量: ${memory.list("long_term").length}`);
  console.log();

  while (true) {
    const userInput = (await rl.question("你: ")).trim();
    if (!userInput) continue;

    try {
      const command = userInput.toLowerCase();

      if (["/exit", "exit", "quit"].includes(command)) {
        sessions.save();
        console.log("再见！");
        break;
      }

      if (command === "/memories") {
        const all = memory.list();
        console.log("\n当前记忆：");
        if (all.length === 0) {
          console.log("（空）");
        } else {
          all.forEach((m) => {
            console.log(`[${m.layer}] (${m.importance}) ${m.content}`);
          });
        }
        console.log();
        continue;
      }

      if (command === "/remember" || userInput.startsWith("/remember ")) {
        const content = command === "/remember" ? "" : userInput.slice("/remember ".length).trim();

        if (!content) {
          console.log("用法：/remember <要记住的内容>\n");
          continue;
        }

        memory.remember(content, 0.75);
        console.log(`已记住：${content}\n`);
        continue;
      }

      if (command === "/sessions") {
        const list = sessions.list();
        console.log("\n历史会话：");
        if (list.length === 0) {
          console.log("（空）");
        } else {
          const currentId = sessions.getCurrent()?.id;
          list.forEach((s) => {
            const mark = s.id === currentId ? " (当前)" : "";
            console.log(
              `- ${s.id} | ${s.title || "无标题"} | ${new Date(s.updatedAt).toLocaleString()}${mark}`
            );
          });
        }
        console.log();
        continue;
      }

      if (command === "/clear session") {
        const current = sessions.getCurrent();
        if (current) {
          current.messages = [];
          sessions.save(current);
          console.log("当前会话消息已清空\n");
        }
        continue;
      }

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

  rl.close();
}

main().catch(console.error);
