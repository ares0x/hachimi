import {
    Agent,
    ToolRegistry,
    MockLLMProvider,
} from "../packages/core/src/index.js";

async function main() {
    const tools = new ToolRegistry();

    // 注册一个简单计算器工具
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
        llm: new MockLLMProvider(),
        tools,
    });

    console.log("=== Test 1: 普通对话 ===");
    console.log(await agent.run("你好，你是谁？"));

    console.log("\n=== Test 2: 触发工具 ===");
    console.log(await agent.run("请帮我计算 123 + 456"));
}

main().catch(console.error);
