"use client";

import type { ProductEventTypeValue } from "@/lib/analytics/product-event-types";

const lastSent = new Map<string, number>();
const WINDOW_MS = 22_000;

export type ClientTrackPayload = {
  eventType: ProductEventTypeValue;
  path?: string;
  entityType?: string;
  entityId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  /** Dedupe key in addition to eventType (e.g. paywall feature id). */
  dedupeKey?: string;
};

/**
 * Best-effort client beacon; throttles identical eventType+dedupe bursts.
 */
export function trackClientProductEvent(payload: ClientTrackPayload): void {
  const dk = payload.dedupeKey ?? "";
  const key = `${payload.eventType}:${dk}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < WINDOW_MS) return;
  lastSent.set(key, now);

  void fetch("/api/analytics/event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType: payload.eventType,
      path: payload.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      entityType: payload.entityType,
      entityId: payload.entityId,
      sessionId: payload.sessionId,
      metadata: payload.metadata,
      dedupeKey: dk || undefined,
    }),
  }).catch(() => null);
}
