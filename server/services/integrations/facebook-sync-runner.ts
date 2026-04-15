import prisma from "@/lib/prisma";
import pRetry, { AbortError } from "p-retry";
import { decryptJson } from "@/lib/integrations/crypto";
import { FacebookApiError, FacebookClient, type FacebookCredentials } from "@/lib/integrations/facebook-client";
import { mapFacebookPayloadsToIntegrationRecords } from "@/lib/integrations/facebook-mapper";
import { logIntegrationEvent } from "@/server/logging/integrations";

function isRetryable(e: unknown): boolean {
  if (e instanceof FacebookApiError) {
    return e.kind === "RATE_LIMIT" || e.kind === "FB_5XX" || e.kind === "TIMEOUT" || e.kind === "NETWORK";
  }
  return false;
}

function userFacingError(e: unknown): { code: string; message: string; meta?: Record<string, unknown> } {
  if (e instanceof FacebookApiError) {
    const meta = {
      kind: e.kind,
      httpStatus: e.httpStatus,
      fbCode: e.fbCode,
      fbSubcode: e.fbSubcode,
      fbType: e.fbType,
      fbTraceId: e.fbTraceId,
    };
    if (e.kind === "INVALID_TOKEN" || e.kind === "EXPIRED_TOKEN") {
      return { code: e.kind, message: "Access token is invalid or expired.", meta };
    }
    if (e.kind === "MISSING_PERMISSION") {
      return { code: e.kind, message: "Token is valid but missing required ad account permissions.", meta };
    }
    if (e.kind === "RATE_LIMIT") {
      return { code: e.kind, message: "Facebook rate limit reached. Retry later.", meta };
    }
    if (e.kind === "TIMEOUT") {
      return { code: e.kind, message: "Facebook API request timed out.", meta };
    }
    if (e.kind === "NETWORK") {
      return { code: e.kind, message: "Network error while contacting Facebook.", meta };
    }
    return { code: e.kind, message: "Facebook API error.", meta };
  }
  const msg = e instanceof Error ? e.message : "Unknown error";
  return { code: "ERROR", message: msg };
}

/**
 * Worker entrypoint: claims a PENDING run and executes it.
 * Returns {ok:false} when the run could not be claimed (already running/finished).
 */
export async function runFacebookIntegrationSyncRun(runId: string): Promise<
  | { ok: true; status: "COMPLETED" | "FAILED"; recordsFetched: number; recordsUpserted: number }
  | { ok: false; skipped: true; reason: string }
> {
  const startedAt = new Date();

  // Claim atomically (concurrency guard)
  const claim = await prisma.integrationSyncRun.updateMany({
    where: { id: runId, status: "PENDING" },
    data: { status: "RUNNING", startedAt },
  });
  if (claim.count === 0) {
    return { ok: false, skipped: true, reason: "not_pending" };
  }

  const run = await prisma.integrationSyncRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      workspaceId: true,
      connectionId: true,
      startedAt: true,
    },
  });
  if (!run) return { ok: false, skipped: true, reason: "missing_run" };

  const conn = await prisma.integrationConnection.findUnique({
    where: { id: run.connectionId },
    select: { id: true, workspaceId: true, encryptedConfig: true },
  });

  if (!conn?.encryptedConfig) {
    const msg = "No credentials found. Please connect first.";
    await prisma.integrationSyncRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: msg,
        metadata: { errorCode: "NO_CREDENTIALS" },
      } as any,
    });
    await prisma.integrationConnection
      .update({
        where: { id: run.connectionId },
        data: { status: "DISCONNECTED", lastError: null } as any,
      })
      .catch(() => null);
    logIntegrationEvent({ workspaceId: run.workspaceId, provider: "FACEBOOK", action: "SYNC", result: "error", errorCode: "NO_CREDENTIALS", message: msg });
    return { ok: true, status: "FAILED", recordsFetched: 0, recordsUpserted: 0 };
  }

  const creds = decryptJson<FacebookCredentials>(conn.encryptedConfig);
  const client = new FacebookClient(creds);

  try {
    // Non-retryable validation step
    const tokenInfo = await client.debugToken();
    if (!tokenInfo.tokenValid) {
      throw new FacebookApiError({ kind: "INVALID_TOKEN", message: "Invalid token", httpStatus: 400 });
    }

    const data = await pRetry(
      async () => {
        return await client.fetchSampleData();
      },
      {
        retries: 4,
        minTimeout: 800,
        maxTimeout: 12_000,
        factor: 2,
        onFailedAttempt: (err) => {
          const e = err as any;
          const orig = e?.cause ?? e;
          const uf = userFacingError(orig);
          logIntegrationEvent({
            workspaceId: run.workspaceId,
            provider: "FACEBOOK",
            action: "SYNC",
            result: "error",
            errorCode: `RETRY_${uf.code}`,
            message: `retry ${e.attemptNumber}/${e.retriesLeft + e.attemptNumber} (${uf.message})`,
            meta: { attemptNumber: e.attemptNumber, retriesLeft: e.retriesLeft, ...uf.meta },
          });
        },
      }
    ).catch((e) => {
      // Stop retries for non-retryable errors (defensive)
      if (!isRetryable(e)) throw new AbortError(e);
      throw e;
    });

    const mapped = mapFacebookPayloadsToIntegrationRecords(data);
    let upserted = 0;
    for (const rec of mapped) {
      await prisma.integrationRecord.upsert({
        where: {
          connectionId_entityType_externalId: {
            connectionId: run.connectionId,
            entityType: rec.entityType as any,
            externalId: rec.externalId,
          },
        },
        create: {
          workspaceId: run.workspaceId,
          connectionId: run.connectionId,
          provider: "FACEBOOK",
          entityType: rec.entityType as any,
          externalId: rec.externalId,
          payload: rec.payload as any,
          payloadHash: rec.payloadHash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        } as any,
        update: {
          payload: rec.payload as any,
          payloadHash: rec.payloadHash,
          lastSeenAt: new Date(),
        } as any,
      });
      upserted += 1;
    }

    const now = new Date();
    await prisma.integrationConnection.update({
      where: { id: run.connectionId },
      data: { status: "CONNECTED", lastSyncedAt: now, lastSuccessAt: now, lastError: null } as any,
    });

    await prisma.integrationSyncRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        durationMs: Date.now() - startedAt.getTime(),
        totalFetched: mapped.length,
        totalUpserted: upserted,
        metadata: { recordsFetched: mapped.length, recordsUpserted: upserted },
      } as any,
    });

    logIntegrationEvent({
      workspaceId: run.workspaceId,
      provider: "FACEBOOK",
      action: "SYNC",
      result: "ok",
      message: "completed",
      meta: { runId, recordsFetched: mapped.length, recordsUpserted: upserted },
    });

    return { ok: true, status: "COMPLETED", recordsFetched: mapped.length, recordsUpserted: upserted };
  } catch (e) {
    const uf = userFacingError(e instanceof AbortError ? (e as any).cause : e);
    const finishedAt = new Date();
    await prisma.integrationConnection
      .update({
        where: { id: run.connectionId },
        data: { status: "ERROR", lastError: uf.message, lastErrorAt: finishedAt, errorCount: { increment: 1 } } as any,
      })
      .catch(() => null);
    await prisma.integrationSyncRun
      .update({
        where: { id: runId },
        data: {
          status: "FAILED",
          completedAt: finishedAt,
          durationMs: Date.now() - startedAt.getTime(),
          error: uf.message,
          metadata: { errorCode: uf.code, ...uf.meta },
        } as any,
      })
      .catch(() => null);

    logIntegrationEvent({
      workspaceId: run.workspaceId,
      provider: "FACEBOOK",
      action: "SYNC",
      result: "error",
      errorCode: uf.code,
      message: uf.message,
      meta: uf.meta,
    });

    return { ok: true, status: "FAILED", recordsFetched: 0, recordsUpserted: 0 };
  }
}

