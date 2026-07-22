import { Agent } from "../packages/core/src/agent/agent.js";
import { ToolRegistry } from "../packages/core/src/tools/registry.js";
import { MockLLMProvider } from "../packages/core/src/agent/llm.js";
import { MemoryManager } from "../packages/core/src/memory/manager.js";

async function main() {
    const tools = new ToolRegistry();
    const memory = new MemoryManager();
    const llm = new MockLLMProvider();

    // 预先写入长期记忆
    memory.add({
        layer: "long_term",
        content: "用户的名字是小明，喜欢简洁的回答",
        importance: 0.9,
    });

    memory.add({
        layer: "long_term",
        content: "用户正在开发一个叫 hachimi 的个人助理项目",
        importance: 0.85,
    });

    memory.add({
        layer: "long_term",
        content: "用户是一名前端开发者，熟悉 TypeScript 和 Go",
        importance: 0.8,
    });

    const agent = new Agent({
        llm,
        tools,
        memory,
    });

    console.log("=== 测试1：询问身份 ===");
    console.log(await agent.run("你知道我是谁吗？"));
    console.log("\n=== 测试2：询问项目 ===");
    console.log(await agent.run("我在做什么项目？"));
    console.log("\n=== 测试3：询问技术栈 ===");
    console.log(await agent.run("我平时用什么技术？"));
}

main().catch(console.error);
