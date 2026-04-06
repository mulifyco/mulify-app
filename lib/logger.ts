// Structured logger for server-side use
// Writes JSON-formatted logs suitable for log aggregation in production

import type { LogLevel } from "@/types";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  jobId?: string;
  sourceId?: string;
}

function formatEntry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {}),
  };
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    write(formatEntry("info", message, data));
  },
  warn(message: string, data?: Record<string, unknown>): void {
    write(formatEntry("warn", message, data));
  },
  error(message: string, data?: Record<string, unknown>): void {
    write(formatEntry("error", message, data));
  },
  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      write(formatEntry("debug", message, data));
    }
  },
};

/**
 * Create a child logger bound to a specific job/source context.
 */
export function createJobLogger(context: { jobId?: string; sourceId?: string }) {
  return {
    info(message: string, data?: Record<string, unknown>): void {
      write({ ...formatEntry("info", message, data), ...context });
    },
    warn(message: string, data?: Record<string, unknown>): void {
      write({ ...formatEntry("warn", message, data), ...context });
    },
    error(message: string, data?: Record<string, unknown>): void {
      write({ ...formatEntry("error", message, data), ...context });
    },
    debug(message: string, data?: Record<string, unknown>): void {
      if (process.env.NODE_ENV !== "production") {
        write({ ...formatEntry("debug", message, data), ...context });
      }
    },
  };
}
