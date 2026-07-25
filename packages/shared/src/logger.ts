// packages/shared/src/logger.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

let currentLevel: LogLevel = (process.env.HACHIMI_LOG_LEVEL as LogLevel) || "info";
let isSilent = process.env.HACHIMI_LOG_SILENT === "true";
let logFormat: "text" | "json" = (process.env.HACHIMI_LOG_FORMAT as "json") || "text";
let logFilePath: string | null = process.env.HACHIMI_LOG_FILE || null;

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
    try {
      mkdirSync(dirname(resolve(filePath)), { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

export interface LoggerOptions {
  scope?: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private scope?: string;
  private metadata?: Record<string, unknown>;

  constructor(options: LoggerOptions = {}) {
    this.scope = options.scope;
    this.metadata = options.metadata;
  }

  child(scopeOrOptions: string | LoggerOptions): Logger {
    const opts: LoggerOptions =
      typeof scopeOrOptions === "string" ? { scope: scopeOrOptions } : scopeOrOptions;
    return new Logger({
      scope: opts.scope || this.scope,
      metadata: { ...this.metadata, ...opts.metadata },
    });
  }

  private shouldLog(level: LogLevel): boolean {
    if (isSilent) return false;
    const targetVal = LOG_LEVEL_MAP[level] || 20;
    const currentVal = LOG_LEVEL_MAP[currentLevel] || 20;
    return targetVal >= currentVal;
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
        try {
          appendFileSync(logFilePath, `${jsonLine}\n`, "utf-8");
        } catch {
          /* ignore */
        }
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
      try {
        const fileContent =
          extra !== undefined
            ? `${formattedLine} ${JSON.stringify(extra)}\n`
            : `${formattedLine}\n`;
        appendFileSync(logFilePath, fileContent, "utf-8");
      } catch {
        /* ignore */
      }
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

/**
 * 快捷主日志函数（完全向后兼容旧版 log(level, msg, extra)）
 */
export function log(level: LogLevel, msg: string, extra?: unknown) {
  if (level === "silent") return;
  logger[level](msg, extra);
}

/**
 * 工厂函数：创建带特定 Scope 模块前缀的子 Logger 实例
 */
export function createScopedLogger(scope: string): Logger {
  return logger.child(scope);
}
