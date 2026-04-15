export type IntegrationLogEvent = {
  workspaceId: string;
  provider: "FACEBOOK" | "TIKTOK" | "SHOPIFY";
  action: "CONNECT" | "TEST" | "SYNC" | "DISCONNECT" | "STATUS";
  result: "ok" | "error";
  errorCode?: string;
  message?: string;
  meta?: Record<string, unknown>;
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Structured logs for integrations. Never include secrets/tokens in meta.
 */
export function logIntegrationEvent(evt: IntegrationLogEvent) {
  const payload = { ts: nowIso(), kind: "integration", ...evt };
  const line = JSON.stringify(payload);
  if (evt.result === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}

