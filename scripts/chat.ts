// scripts/chat.ts
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Agent } from "../packages/core/src/agent/agent.js";
import { ToolRegistry } from "../packages/core/src/tools/registry.js";
import { MockLLMProvider } from "../packages/core/src/agent/llm.js";
import { MemoryManager } from "../packages/core/src/memory/manager.js";

async function main() {
    const tools = new ToolRegistry();
    const memory = new MemoryManager();
    const llm = new MockLLMProvider();

    // 预先写入一些测试记忆
    memory.remember("用户的名字是小明，喜欢简洁的回答", 0.9);
    memory.remember("用户正在开发一个叫 hachimi 的个人助理项目", 0.85);
    memory.remember("用户是一名前端开发者，熟悉 TypeScript 和 Go", 0.8);

    // 注册一个简单计算器工具（保留 Phase 1 的能力）
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
    });

    const rl = readline.createInterface({ input, output });

    console.log("========================================");
    console.log("  hachimi 交互式 CLI（Phase 2）");
    console.log("  输入消息开始对话");
    console.log("  特殊命令：");
    console.log("    /memories          查看所有记忆");
    console.log("    /remember <内容>   手动添加长期记忆");
    console.log("    /clear session     清空会话记忆");
    console.log("    /exit              退出");
    console.log("========================================\n");

    while (true) {
        const userInput = (await rl.question("你: ")).trim();

        if (!userInput) continue;

        // 在 while 循环里替换原来的命令处理部分

        const command = userInput.toLowerCase();

        // 退出
        if (["/exit", "exit", "quit"].includes(command)) {
            console.log("再见！");
            break;
        }

        // 查看记忆
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

        // 添加记忆
        if (command === "/remember" || userInput.startsWith("/remember ")) {
            const content =
                command === "/remember"
                    ? ""
                    : userInput.slice("/remember ".length).trim();

            if (!content) {
                console.log("用法：/remember <要记住的内容>\n");
                continue;
            }

            memory.remember(content, 0.75);
            console.log(`已记住：${content}\n`);
            continue;
        }

        // 清空会话记忆
        if (command === "/clear session") {
            memory.clear("session");
            console.log("会话记忆已清空\n");
            continue;
        }
    }

    rl.close();
}

main().catch(console.error);
