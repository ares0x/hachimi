#!/usr/bin/env node
// packages/channels/cli/src/cli.ts
import { getOrCreateHarnessRuntime } from "@hachimi/core";
import { runCliChannel } from "./index.js";

function printHelp() {
  console.log(`
🌾 Hachimi CLI - 嵌入模式非交互式单轮入口 & 数据可移植工具

使用方式:
  hachimi [选项] <prompt>
  echo "文本" | hachimi [选项]

选项:
  -p, --print        纯文本格式化输出 (默认格式，适合 Unix 管道与 Bash 脚本)
  -j, --json         结构化 JSON 格式输出 (包含 sessionId, content, toolCalls, durationMs)
  -s, --session <id> 指定要使用的会话 ID
  --export <file>    导出全量记忆与会话为标准化数据包 (.json)
  --import <file>    导入外部记忆数据包并执行增量合并
  -h, --help         显示帮助信息

示例:
  pnpm dev:cli "帮我总结这段话"
  pnpm dev:cli -j "检查系统状态"
  pnpm dev:cli --export ./my-backup.json
  pnpm dev:cli --import ./my-backup.json
`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return new Promise((res) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      res(Buffer.concat(chunks).toString("utf-8").trim());
    }, 50);

    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    process.stdin.on("end", () => {
      clearTimeout(timer);
      res(Buffer.concat(chunks).toString("utf-8").trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  // 1. 处理 --export 指令
  const exportIdx = args.indexOf("--export");
  if (exportIdx !== -1) {
    const filePath = args[exportIdx + 1];
    if (!filePath) {
      console.error("❌ 错误: --export 选项需要指定保存的目标文件路径。");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const bundle = await runtime.exportBundle({ filePath });
    console.log(`✅ 成功导出 Hachimi 数据包至: ${filePath}`);
    console.log(
      `   包含长期记忆: ${bundle.memory.longTerm.length} 条 | 会话: ${bundle.sessions.length} 个`
    );
    process.exit(0);
  }

  // 2. 处理 --import 指令
  const importIdx = args.indexOf("--import");
  if (importIdx !== -1) {
    const filePath = args[importIdx + 1];
    if (!filePath) {
      console.error("❌ 错误: --import 选项需要指定要导入的数据包文件路径。");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const result = await runtime.importBundle(filePath);
    console.log(`✅ 成功导入并融合数据包: ${filePath}`);
    console.log(
      `   导入新增记忆: ${result.importedMemoriesCount} 条 | 跳过重复: ${result.skippedMemoriesCount} 条 | 融合会话: ${result.importedSessionsCount} 个`
    );
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
    printHelp();
    process.exit(0);
  }

  const runtime = getOrCreateHarnessRuntime();
  const isStreamText = outputFormat === "text";

  const result = await runCliChannel({
    prompt: finalPrompt,
    outputFormat,
    sessionId,
    stream: isStreamText,
    runtime,
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
    process.stdout.write("\n");
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
