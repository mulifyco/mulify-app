// HTTP client with retry and rate limit handling
import pRetry, { AbortError } from "p-retry";
import type { RetryConfig } from "@/types";

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: Partial<RetryConfig>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly body?: string
  ) {
    super(`HTTP ${status} ${statusText} — ${url}`);
    this.name = "HttpError";
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Fetch JSON with retry logic and rate limit awareness.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY, ...options.retry };

  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 30000
      );

      try {
        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mulify-Library/1.0",
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const err = new HttpError(response.status, response.statusText, url, body);

          // Don't retry on 404 or auth errors
          if (response.status === 404 || response.status === 401 || response.status === 403) {
            throw new AbortError(err);
          }

          throw err;
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      retries: retryConfig.maxAttempts - 1,
      minTimeout: retryConfig.initialDelayMs,
      maxTimeout: retryConfig.maxDelayMs,
      factor: retryConfig.backoffMultiplier,
      onFailedAttempt: (error: { attemptNumber: number; message?: string }) => {
        console.warn(
          `[http] Retry attempt ${error.attemptNumber} failed: ${error.message ?? "unknown error"}`
        );
      },
    }
  );
}

/**
 * Simple sleep utility for rate limiting.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter — tracks requests per window and enforces delay.
 */
export class RateLimiter {
  private queue: number[] = [];

  constructor(
    private readonly requestsPerWindow: number,
    private readonly windowMs: number
  ) {}

  async throttle(): Promise<void> {
    const now = Date.now();

    // Remove requests outside the current window
    this.queue = this.queue.filter((t) => now - t < this.windowMs);

    if (this.queue.length >= this.requestsPerWindow) {
      const oldest = this.queue[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    this.queue.push(Date.now());
  }
}
