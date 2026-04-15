export type FacebookStatus = {
  provider: "FACEBOOK";
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  connected: boolean;
  hasCredentials: boolean;
  publicConfig: unknown | null;
  adAccountIdMasked: string | null;
  syncState: "IDLE" | "QUEUED" | "RUNNING" | "FAILED";
  syncInProgress: boolean;
  lastSyncRunId: string | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type FacebookStatusDbRow = {
  id: string;
  provider: "FACEBOOK";
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  encryptedConfig: string | null;
  publicConfig: unknown | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

export type FacebookStatusLatestRun = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";
  startedAt: Date | null;
  completedAt: Date | null;
};

export function maskAdAccountId(id: string): string {
  if (!id) return "";
  const raw = id.startsWith("act_") ? id.slice(4) : id;
  if (raw.length <= 4) return `act_${raw}`;
  return `act_${raw.slice(0, 2)}••••${raw.slice(-2)}`;
}

export function buildFacebookStatus(args: {
  row: FacebookStatusDbRow | null;
  syncInProgress: boolean;
  latestRun: FacebookStatusLatestRun | null;
}): FacebookStatus {
  if (!args.row) {
    return {
      provider: "FACEBOOK",
      status: "DISCONNECTED",
      connected: false,
      hasCredentials: false,
      publicConfig: null,
      adAccountIdMasked: null,
      syncState: "IDLE",
      syncInProgress: false,
      lastSyncRunId: null,
      lastSyncStartedAt: null,
      lastSyncCompletedAt: null,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  const publicConfig = args.row.publicConfig ?? null;
  const adAccountId =
    publicConfig && typeof publicConfig === "object" && "adAccountId" in (publicConfig as any)
      ? String((publicConfig as any).adAccountId ?? "")
      : "";

  const safeStatus = args.row.encryptedConfig ? args.row.status : "DISCONNECTED";
  const lastError = args.row.encryptedConfig ? args.row.lastError : null;

  const r = args.latestRun;
  const syncState =
    r?.status === "RUNNING"
      ? "RUNNING"
      : r?.status === "PENDING"
        ? "QUEUED"
        : r?.status === "FAILED"
          ? "FAILED"
          : "IDLE";

  return {
    provider: "FACEBOOK",
    status: safeStatus,
    connected: safeStatus === "CONNECTED",
    hasCredentials: Boolean(args.row.encryptedConfig),
    publicConfig,
    adAccountIdMasked: adAccountId ? maskAdAccountId(adAccountId) : null,
    syncState,
    syncInProgress: Boolean(args.syncInProgress),
    lastSyncRunId: r?.id ?? null,
    lastSyncStartedAt: r?.startedAt ? r.startedAt.toISOString() : null,
    lastSyncCompletedAt: r?.completedAt ? r.completedAt.toISOString() : null,
    lastSyncedAt: args.row.lastSyncedAt ? args.row.lastSyncedAt.toISOString() : null,
    lastError,
  };
}

