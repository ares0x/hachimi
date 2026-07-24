#!/usr/bin/env node
// packages/channels/cli/src/cli.ts
import { runCliChannel } from "./index.js";

function printHelp() {
  console.log(`
🌾 Hachimi CLI - 嵌入模式非交互式单轮入口

使用方式:
  hachimi [选项] <prompt>
  echo "文本" | hachimi [选项]

选项:
  -p, --print        纯文本格式化输出 (默认格式，适合 Unix 管道与 Bash 脚本)
  -j, --json         结构化 JSON 格式输出 (包含 sessionId, content, toolCalls, durationMs)
  -s, --session <id> 指定要使用的会话 ID
  -h, --help         显示帮助信息

示例:
  pnpm dev:cli -p "帮我总结这段话"
  pnpm dev:cli -j "检查系统状态"
  cat file.txt | pnpm dev:cli -p "提取关键要点"
`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  let outputFormat: "text" | "json" = "text";
  let sessionId: string | undefined;
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--print") {
      outputFormat = "text";
    } else if (arg === "-j" || arg === "--json") {
      outputFormat = "json";
    } else if (arg === "-s" || arg === "--session") {
      sessionId = args[++i];
    } else if (!arg.startsWith("-")) {
      promptParts.push(arg);
    }
  }

  const stdinContent = await readStdin();
  const inlinePrompt = promptParts.join(" ").trim();

  let finalPrompt = "";
  if (stdinContent && inlinePrompt) {
    finalPrompt = `${inlinePrompt}\n\n${stdinContent}`;
  } else {
    finalPrompt = inlinePrompt || stdinContent;
  }

  if (!finalPrompt) {
    console.error("❌ 错误: 未提供输入 Prompt。输入 hachimi --help 查看帮助。");
    process.exit(1);
  }

  const isStreamText = outputFormat === "text";

  const result = await runCliChannel({
    prompt: finalPrompt,
    outputFormat,
    sessionId,
    stream: isStreamText,
    onChunk: isStreamText
      ? (chunk) => {
          process.stdout.write(chunk);
        }
      : undefined,
  });

  if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (!isStreamText) {
    console.log(result.content);
  } else {
    // 换行确保标准文本输出结束
    process.stdout.write("\n");
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
