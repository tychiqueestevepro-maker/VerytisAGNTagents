/**
 * src/logs/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight structured logger.
 * Each log entry is a JSON object with timestamp, level, module tag,
 * and optional metadata — ideal for ingestion by Supabase Logs / Datadog.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from "../config/env.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[env.LOG_LEVEL];
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;

  const entry = {
    ts:      new Date().toISOString(),
    level,
    module,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — create a named logger for each module
// ─────────────────────────────────────────────────────────────────────────────

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: unknown) => emit("debug", module, msg, meta),
    info:  (msg: string, meta?: unknown) => emit("info",  module, msg, meta),
    warn:  (msg: string, meta?: unknown) => emit("warn",  module, msg, meta),
    error: (msg: string, meta?: unknown) => emit("error", module, msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;

// Default logger for quick use
export const logger = createLogger("agents-engine");
