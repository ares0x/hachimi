// packages/shared/src/logger.ts

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

let currentLevel: LogLevel =
  typeof process !== "undefined" && process.env?.HACHIMI_LOG_LEVEL
    ? (process.env.HACHIMI_LOG_LEVEL as LogLevel)
    : "info";

let isSilent = typeof process !== "undefined" && process.env?.HACHIMI_LOG_SILENT === "true";

let logFormat: "text" | "json" =
  typeof process !== "undefined" && process.env?.HACHIMI_LOG_FORMAT === "json" ? "json" : "text";

let logFilePath: string | null =
  typeof process !== "undefined" && process.env?.HACHIMI_LOG_FILE
    ? process.env.HACHIMI_LOG_FILE
    : null;

function appendToLogFile(filePath: string, text: string) {
  try {
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      // Lazy load node modules only when running in Node.js
      const fs = require("node:fs");
      const path = require("node:path");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, text, "utf-8");
    }
  } catch {
    /* ignore file write errors in browser / restricted environments */
  }
}

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function setLogSilent(v: boolean) {
  isSilent = v;
}

export function setLogFormat(format: "text" | "json") {
  logFormat = format;
}

export function setLogFile(filePath: string | null) {
  logFilePath = filePath;
  if (filePath) {
    appendToLogFile(filePath, "");
  }
}

export class Logger {
  private scope?: string;
  private metadata?: Record<string, unknown>;

  constructor(scope?: string, metadata?: Record<string, unknown>) {
    this.scope = scope;
    this.metadata = metadata;
  }

  child(subScope: string, extraMeta?: Record<string, unknown>): Logger {
    const newScope = this.scope ? `${this.scope}:${subScope}` : subScope;
    const newMeta = { ...this.metadata, ...extraMeta };
    return new Logger(newScope, newMeta);
  }

  private shouldLog(level: LogLevel): boolean {
    if (isSilent) return false;
    return LOG_LEVEL_MAP[level] >= LOG_LEVEL_MAP[currentLevel];
  }

  private writeLog(level: LogLevel, msg: string, extra?: unknown) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const scopePrefix = this.scope ? `[${this.scope}] ` : "";

    if (logFormat === "json") {
      const jsonPayload = {
        timestamp,
        level,
        scope: this.scope || "core",
        message: msg,
        metadata: this.metadata,
        extra,
      };
      const jsonLine = JSON.stringify(jsonPayload);
      console[level === "debug" ? "log" : level === "silent" ? "log" : level](jsonLine);
      if (logFilePath) {
        appendToLogFile(logFilePath, `${jsonLine}\n`);
      }
      return;
    }

    const formattedLine = `[${timestamp}] [${level.toUpperCase()}] ${scopePrefix}${msg}`;

    if (extra !== undefined) {
      console[level === "debug" ? "log" : level === "silent" ? "log" : level](formattedLine, extra);
    } else {
      console[level === "debug" ? "log" : level === "silent" ? "log" : level](formattedLine);
    }

    if (logFilePath) {
      const fileContent =
        extra !== undefined ? `${formattedLine} ${JSON.stringify(extra)}\n` : `${formattedLine}\n`;
      appendToLogFile(logFilePath, fileContent);
    }
  }

  debug(msg: string, extra?: unknown) {
    this.writeLog("debug", msg, extra);
  }

  info(msg: string, extra?: unknown) {
    this.writeLog("info", msg, extra);
  }

  warn(msg: string, extra?: unknown) {
    this.writeLog("warn", msg, extra);
  }

  error(msg: string, extra?: unknown) {
    this.writeLog("error", msg, extra);
  }
}

export const logger = new Logger();

export function log(level: LogLevel, msg: string, extra?: unknown) {
  if (level === "silent") return;
  logger[level](msg, extra);
}

export function createScopedLogger(scope: string): Logger {
  return logger.child(scope);
}
