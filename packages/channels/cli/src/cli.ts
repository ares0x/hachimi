#!/usr/bin/env node
// packages/channels/cli/src/cli.ts
import { getOrCreateHarnessRuntime } from "@hachimi/core";
import { runCliChannel } from "./index.js";

function printHelp() {
  console.log(`
🌾 Hachimi CLI - Embedded Non-Interactive Single-Turn Entrypoint & Data Portability Tool

Usage:
  hachimi [options] <prompt>
  echo "text" | hachimi [options]

Options:
  -p, --print        Plaintext formatted output (default, suited for Unix pipes and Bash scripts)
  -j, --json         Structured JSON format output (includes sessionId, content, toolCalls, durationMs)
  -s, --session <id> Specify target session ID
  --export <file>    Export all memory and sessions as standard data bundle (.json)
  --import <file>    Import external data bundle and execute additive merge
  -h, --help         Display help information

Examples:
  pnpm dev:cli "Summarize this article"
  pnpm dev:cli -j "Check system status"
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

  // 1. Process --export option
  const exportIdx = args.indexOf("--export");
  if (exportIdx !== -1) {
    const filePath = args[exportIdx + 1];
    if (!filePath) {
      console.error("❌ Error: --export option requires specifying output file path.");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const bundle = await runtime.exportBundle({ filePath });
    console.log(`✅ Successfully exported Hachimi data bundle to: ${filePath}`);
    console.log(
      `   Contains long-term memories: ${bundle.memory.longTerm.length} | Sessions: ${bundle.sessions.length}`
    );
    process.exit(0);
  }

  // 2. Process --import option
  const importIdx = args.indexOf("--import");
  if (importIdx !== -1) {
    const filePath = args[importIdx + 1];
    if (!filePath) {
      console.error("❌ Error: --import option requires specifying import file path.");
      process.exit(1);
    }
    const runtime = getOrCreateHarnessRuntime();
    const result = await runtime.importBundle(filePath);
    console.log(`✅ Successfully imported and merged data bundle: ${filePath}`);
    console.log(
      `   Imported new memories: ${result.importedMemoriesCount} | Skipped duplicate: ${result.skippedMemoriesCount} | Merged sessions: ${result.importedSessionsCount}`
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
