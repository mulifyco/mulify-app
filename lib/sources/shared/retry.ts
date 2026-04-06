/**
 * Retry wrapper for recoverable transport failures (5xx, network blips).
 * Does not retry 401/403/404 — those are passed through.
 */

import pRetry, { AbortError } from "p-retry";
import { HttpError } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { RetryConfig } from "@/types";

const DEFAULT: RetryConfig = {
  maxAttempts: 4,
  initialDelayMs: 1000,
  maxDelayMs: 45_000,
  backoffMultiplier: 2,
};

export interface RetryExecutorOptions {
  readonly label: string;
  readonly retry?: Partial<RetryConfig>;
  /** When true, 429 triggers retry with backoff (Meta may return this). */
  readonly retryRateLimit?: boolean;
}

function toPRetryOptions(partial: Partial<RetryConfig>) {
  const c = { ...DEFAULT, ...partial };
  return {
    retries: Math.max(0, c.maxAttempts - 1),
    factor: c.backoffMultiplier,
    minTimeout: c.initialDelayMs,
    maxTimeout: c.maxDelayMs,
  };
}

export async function withIngestionRetry<T>(
  fn: () => Promise<T>,
  options: RetryExecutorOptions
): Promise<T> {
  const ro = toPRetryOptions(options.retry ?? {});

  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof HttpError) {
          if (err.status === 401 || err.status === 403 || err.status === 404) {
            throw new AbortError(err);
          }
          if (err.isRateLimit && !options.retryRateLimit) {
            throw new AbortError(err);
          }
        }
        throw err;
      }
    },
    {
      ...ro,
      onFailedAttempt: (error) => {
        const cause = error instanceof Error ? error.message : String(error);
        logger.warn(`[ingestion-retry] ${options.label} attempt failed`, { cause });
      },
    }
  );
}
