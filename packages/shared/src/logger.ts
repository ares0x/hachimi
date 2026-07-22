export type LogLevel = "debug" | "info" | "warn" | "error";

let silent = false;
export function setLogSilent(v: boolean) {
  silent = v;
}

export function log(level: LogLevel, msg: string, extra?: unknown) {
  const time = new Date().toISOString();
  const line = `[${time}] [${level.toUpperCase()}] ${msg}`;
  if (extra !== undefined) {
    console[level === "debug" ? "log" : level](line, extra);
  } else {
    console[level === "debug" ? "log" : level](line);
  }
}
