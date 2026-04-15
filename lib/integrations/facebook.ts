import prisma from "@/lib/prisma";
import { decryptJson, encryptJson } from "./crypto";
import { FacebookApiError, FacebookClient, type FacebookCredentials } from "./facebook-client";
import { mapFacebookPayloadsToIntegrationRecords } from "./facebook-mapper";
import { logIntegrationEvent } from "@/server/logging/integrations";
import { shouldBlockNewEnqueue } from "@/lib/integrations/enqueue-guard";

type Provider = "FACEBOOK";

type ConnectionRow = {
  id: string;
  workspaceId: string;
  provider: Provider;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  encryptedConfig: string | null;
  publicConfig: any;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

function normalizeCredentials(input: Record<string, unknown>): FacebookCredentials {
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const appSecret = typeof input.appSecret === "string" ? input.appSecret.trim() : "";
  const accessToken = typeof input.accessToken === "string" ? input.accessToken.trim() : "";
  const adAccountIdRaw = typeof input.adAccountId === "string" ? input.adAccountId.trim() : "";
  const adAccountId = adAccountIdRaw.startsWith("act_") ? adAccountIdRaw : adAccountIdRaw ? `act_${adAccountIdRaw}` : "";

  if (!appId) throw new Error("appId is required");
  if (!appSecret) throw new Error("appSecret is required");
  if (!accessToken) throw new Error("accessToken is required");
  if (!adAccountId) throw new Error("adAccountId is required");
  return { appId, appSecret, accessToken, adAccountId };
}

function userFacingMessage(e: unknown): { code: string; message: string; technical?: Record<string, unknown> } {
  if (e instanceof FacebookApiError) {
    const base = {
      kind: e.kind,
      httpStatus: e.httpStatus,
      fbCode: e.fbCode,
      fbSubcode: e.fbSubcode,
      fbType: e.fbType,
      fbTraceId: e.fbTraceId,
    };
    if (e.kind === "INVALID_TOKEN" || e.kind === "EXPIRED_TOKEN") {
      return { code: e.kind, message: "Access token is invalid or expired. Please generate a fresh token.", technical: base };
    }
    if (e.kind === "MISSING_PERMISSION") {
      return { code: e.kind, message: "Token is valid but missing required ad account permissions.", technical: base };
    }
    if (e.kind === "RATE_LIMIT") {
      return { code: e.kind, message: "Facebook rate limit reached. Please retry in a few minutes.", technical: base };
    }
    if (e.kind === "TIMEOUT") {
      return { code: e.kind, message: "Facebook API request timed out. Please try again.", technical: base };
    }
    if (e.kind === "NETWORK") {
      return { code: e.kind, message: "Network error while contacting Facebook. Please try again.", technical: base };
    }
    return { code: e.kind, message: "Facebook API error. Please try again.", technical: base };
  }

  if (e instanceof Error) {
    if (e.message.includes("appId is required") || e.message.includes("appSecret is required") || e.message.includes("accessToken is required") || e.message.includes("adAccountId is required")) {
      return { code: "INVALID_PAYLOAD", message: e.message };
    }
    if (e.message.includes("not connected")) {
      return { code: "NO_CREDENTIALS", message: "Not connected. Please connect your Facebook credentials first." };
    }
    return { code: "ERROR", message: e.message };
  }
  return { code: "ERROR", message: "Unknown error" };
}

async function upsertConnection(workspaceId: string, patch: Partial<ConnectionRow>) {
  return prisma.integrationConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "FACEBOOK" } },
    create: {
      workspaceId,
      provider: "FACEBOOK",
      status: (patch.status as any) ?? "DISCONNECTED",
      encryptedConfig: patch.encryptedConfig ?? null,
      publicConfig: patch.publicConfig ?? undefined,
      lastSyncedAt: patch.lastSyncedAt ?? null,
      lastError: patch.lastError ?? null,
      errorCount: patch.status === "ERROR" ? 1 : 0,
      lastErrorAt: patch.status === "ERROR" ? new Date() : null,
      lastSuccessAt: patch.status === "CONNECTED" ? new Date() : null,
    } as any,
    update: {
      status: patch.status as any,
      encryptedConfig: patch.encryptedConfig ?? undefined,
      publicConfig: patch.publicConfig ?? undefined,
      lastSyncedAt: patch.lastSyncedAt ?? undefined,
      lastError: patch.lastError ?? undefined,
      lastErrorAt: patch.status === "ERROR" ? new Date() : undefined,
      lastSuccessAt: patch.status === "CONNECTED" ? new Date() : undefined,
      errorCount: patch.status === "ERROR" ? { increment: 1 } : undefined,
    } as any,
    select: {
      id: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      publicConfig: true,
    },
  });
}

export async function facebookConnect(workspaceId: string, body: Record<string, unknown>) {
  try {
    const creds = normalizeCredentials(body);
    const encryptedConfig = encryptJson(creds);
    const publicConfig = { adAccountId: creds.adAccountId, appId: creds.appId };
    await upsertConnection(workspaceId, {
      status: "DISCONNECTED",
      encryptedConfig,
      publicConfig,
      lastError: null,
    });

    // Immediately validate so UI can show Connected/Error right away.
    const test = await facebookTest(workspaceId, creds as any);
    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "CONNECT",
      result: test.ok ? "ok" : "error",
      errorCode: test.ok ? undefined : "CONNECT_TEST_FAILED",
      message: test.ok ? "connected" : test.lastError ?? "connect failed",
      meta: { adAccountId: creds.adAccountId },
    });
    return test.ok ? test : { ok: false, status: "ERROR" as const, lastError: test.lastError ?? "Connection test failed" };
  } catch (e) {
    const u = userFacingMessage(e);
    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "CONNECT",
      result: "error",
      errorCode: u.code,
      message: u.message,
      meta: u.technical,
    });
    return { ok: false, status: "ERROR" as const, lastError: u.message };
  }
}

export async function facebookDisconnect(workspaceId: string) {
  const row = await upsertConnection(workspaceId, {
    status: "DISCONNECTED",
    encryptedConfig: null,
    lastError: null,
    lastSyncedAt: null,
    publicConfig: {},
  });
  return {
    ok: true,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastError: row.lastError,
  };
}

export async function facebookEnqueueSync(workspaceId: string): Promise<
  | { ok: true; queued: true; runId: string; message?: string }
  | { ok: false; queued: false; message: string }
> {
  try {
    const { connectionId } = await loadCredentialsForWorkspace(workspaceId);

    const active = await prisma.integrationSyncRun.findFirst({
      where: { connectionId, status: { in: ["PENDING", "RUNNING"] } as any },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (active && shouldBlockNewEnqueue(active.status as any)) {
      logIntegrationEvent({
        workspaceId,
        provider: "FACEBOOK",
        action: "SYNC",
        result: "ok",
        message: "skipped_already_active",
        meta: { activeRunId: active.id, status: active.status },
      });
      return { ok: false, queued: false, message: "A sync is already queued or running for this workspace. Please wait." };
    }

    const run = await prisma.integrationSyncRun.create({
      data: {
        workspaceId,
        connectionId,
        status: "PENDING",
        triggeredBy: "manual",
        metadata: { queuedAt: new Date().toISOString() },
      } as any,
      select: { id: true },
    });

    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "SYNC",
      result: "ok",
      message: "queued",
      meta: { runId: run.id },
    });

    return { ok: true, queued: true, runId: run.id };
  } catch (e) {
    const u = userFacingMessage(e);
    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "SYNC",
      result: "error",
      errorCode: u.code,
      message: u.message,
      meta: u.technical,
    });
    return { ok: false, queued: false, message: u.message };
  }
}

async function loadCredentialsForWorkspace(workspaceId: string): Promise<{ connectionId: string; creds: FacebookCredentials }> {
  const row = await prisma.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "FACEBOOK" } },
    select: { id: true, encryptedConfig: true },
  });
  if (!row?.encryptedConfig) throw new Error("Facebook integration is not connected yet. Please connect first.");
  const creds = decryptJson<FacebookCredentials>(row.encryptedConfig);
  return { connectionId: row.id, creds };
}

export async function facebookTest(workspaceId: string, body: Record<string, unknown>) {
  // If body contains credentials, test those; else test stored credentials.
  try {
    const creds =
      body.appId || body.accessToken || body.adAccountId
        ? normalizeCredentials(body)
        : (await loadCredentialsForWorkspace(workspaceId)).creds;

    const client = new FacebookClient(creds);
    const tokenInfo = await client.debugToken();
    if (!tokenInfo.tokenValid) {
      await upsertConnection(workspaceId, { status: "ERROR", lastError: "Invalid or expired access token." });
      return { ok: false, status: "ERROR" as const, lastError: "Invalid or expired access token." };
    }

    const adOk = await client.checkAdAccountAccess();
    if (!adOk) {
      await upsertConnection(workspaceId, { status: "ERROR", lastError: "Access token does not have access to the ad account." });
      return { ok: false, status: "ERROR" as const, lastError: "Access token does not have access to the ad account." };
    }

    const row = await upsertConnection(workspaceId, { status: "CONNECTED", lastError: null });
    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "TEST",
      result: "ok",
      message: "verified",
      meta: { scopes: tokenInfo.scopes ?? null, expiresAt: tokenInfo.expiresAt ?? null },
    });
    return {
      ok: true,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      lastError: row.lastError,
      token: tokenInfo,
    };
  } catch (e) {
    const u = userFacingMessage(e);
    const row = await upsertConnection(workspaceId, { status: "ERROR", lastError: u.message });
    logIntegrationEvent({
      workspaceId,
      provider: "FACEBOOK",
      action: "TEST",
      result: "error",
      errorCode: u.code,
      message: u.message,
      meta: u.technical,
    });
    return {
      ok: false,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      lastError: row.lastError,
    };
  }
}

export async function facebookSync(workspaceId: string) {
  // Deprecated execution path: sync is now worker/queue based.
  const u = userFacingMessage(new Error("Sync is now queued. Use /api/integrations/facebook/sync to enqueue."));
  return { ok: false, status: "ERROR" as const, lastError: u.message };
}

