"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import { pollingExceeded, shouldPollForSyncState } from "@/lib/integrations/polling";

type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

type FacebookStatusResponse = {
  provider: "FACEBOOK";
  status: ConnectionStatus;
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

function statusBadge(status: ConnectionStatus) {
  if (status === "CONNECTED") return <Badge label="Connected" variant="green" pill />;
  if (status === "ERROR") return <Badge label="Error" variant="red" pill />;
  return <Badge label="Disconnected" variant="yellow" pill />;
}

function CardShell({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {badge}
          </div>
          <p className="text-xs text-muted-2 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.16em]">{label}</div>
        {hint ? <div className="text-[11px] text-muted-2">{hint}</div> : null}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60"
      />
    </label>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (json && typeof json === "object" && "error" in json && typeof (json as any).error === "string"
          ? (json as any).error
          : `Request failed (${res.status})`) || "Request failed";
      return { ok: false, error: msg };
    }
    return { ok: true, data: (json as any) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (json && typeof json === "object" && "error" in json && typeof (json as any).error === "string"
          ? (json as any).error
          : `Request failed (${res.status})`) || "Request failed";
      return { ok: false, error: msg };
    }
    return { ok: true, data: (json as any) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export default function ApisSettingsClient() {
  const [status, setStatus] = useState<ConnectionStatus>("DISCONNECTED");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "test" | "sync" | "disconnect">(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<null | { kind: "success" | "error"; message: string }>(null);
  const toastTimer = useRef<number | null>(null);
  const [connectedHint, setConnectedHint] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncState, setSyncState] = useState<FacebookStatusResponse["syncState"]>("IDLE");
  const [lastRun, setLastRun] = useState<{ id: string | null; startedAt: string | null; completedAt: string | null }>({
    id: null,
    startedAt: null,
    completedAt: null,
  });
  const [pollingWarning, setPollingWarning] = useState<string | null>(null);
  const pollStartMs = useRef<number | null>(null);
  const pollAttempts = useRef<number>(0);

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");

  const fbPayload = useMemo(
    () => ({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      accessToken: accessToken.trim(),
      adAccountId: adAccountId.trim(),
    }),
    [appId, appSecret, accessToken, adAccountId],
  );

  const canSubmit = Boolean(
    fbPayload.appId && fbPayload.appSecret && fbPayload.accessToken && fbPayload.adAccountId,
  );

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    const res = await getJson<FacebookStatusResponse>("/api/integrations/facebook/status");
    if (!res.ok) {
      setStatus("ERROR");
      setError(res.error);
      setConnectedHint(null);
      setLastSync(null);
      setLoadingStatus(false);
      return;
    }

    const data = res.data;
    setStatus(data.status);
    setError(data.lastError ?? null);
    setLastSync(data.lastSyncedAt ?? null);
    setConnectedHint(data.adAccountIdMasked ?? null);
    setSyncInProgress(Boolean(data.syncInProgress));
    setSyncState(data.syncState);
    setLastRun({ id: data.lastSyncRunId, startedAt: data.lastSyncStartedAt, completedAt: data.lastSyncCompletedAt });
    setLoadingStatus(false);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Lightweight polling while queued/running.
  useEffect(() => {
    if (loadingStatus) return;
    if (!shouldPollForSyncState(syncState)) {
      pollStartMs.current = null;
      pollAttempts.current = 0;
      setPollingWarning(null);
      return;
    }

    if (pollStartMs.current === null) pollStartMs.current = Date.now();
    const t = window.setInterval(() => {
      const started = pollStartMs.current ?? Date.now();
      pollAttempts.current += 1;
      const elapsedMs = Date.now() - started;
      const exceeded = pollingExceeded({
        attempts: pollAttempts.current,
        maxAttempts: 60, // ~150s @ 2.5s
        elapsedMs,
        maxElapsedMs: 3 * 60 * 1000,
      });
      if (exceeded) {
        setPollingWarning("Sync is taking longer than expected. You can keep this page open, or refresh status manually.");
        window.clearInterval(t);
        return;
      }
      void refreshStatus();
    }, 2500);
    return () => window.clearInterval(t);
  }, [loadingStatus, syncState, refreshStatus]);

  const run = useCallback(
    async (kind: "connect" | "test" | "sync" | "disconnect") => {
      setBusy(kind);
      setError(null);
      setToast(null);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      const url =
        kind === "connect"
          ? "/api/integrations/facebook/connect"
          : kind === "test"
            ? "/api/integrations/facebook/test"
            : kind === "sync"
              ? "/api/integrations/facebook/sync"
              : "/api/integrations/facebook/disconnect";

      const result = await postJson<any>(url, kind === "disconnect" ? {} : fbPayload);
      if (!result.ok) {
        setError(result.error);
        setToast({ kind: "error", message: result.error });
        toastTimer.current = window.setTimeout(() => setToast(null), 3500);
        setBusy(null);
        await refreshStatus();
        return;
      }

      const okMessage =
        kind === "connect"
          ? "Connected."
          : kind === "test"
            ? "Connection verified."
            : kind === "sync"
              ? "Sync completed."
              : "Disconnected.";
      setToast({ kind: "success", message: okMessage });
      toastTimer.current = window.setTimeout(() => setToast(null), 2500);
      setBusy(null);
      await refreshStatus();
    },
    [fbPayload, refreshStatus],
  );

  return (
    <div className="space-y-6">
      <CardShell
        title="Facebook API"
        subtitle="Connect Meta Marketing API to sync campaigns, ad sets, ads, and basic insights (spend, impressions, clicks). Credentials are stored securely per-workspace."
        badge={statusBadge(status)}
      >
        {loadingStatus ? (
          <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-2">
            Loading connection status…
          </div>
        ) : null}
        {toast ? (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              toast.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-600"
            }`}
          >
            {toast.message}
          </div>
        ) : null}
        {pollingWarning ? (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
            <span className="min-w-0">{pollingWarning}</span>
            <button
              type="button"
              onClick={() => refreshStatus()}
              className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-2 transition-colors"
            >
              Refresh status
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="App ID" value={appId} onChange={setAppId} placeholder="123456789012345" />
          <Field
            label="Ad Account ID"
            hint="Format: act_XXXXXXXXXX"
            value={adAccountId}
            onChange={setAdAccountId}
            placeholder="act_1234567890"
          />
          <Field label="App Secret" value={appSecret} onChange={setAppSecret} placeholder="••••••••••••••" type="password" />
          <Field
            label="Access Token"
            value={accessToken}
            onChange={setAccessToken}
            placeholder="EAABsbCS1iHgBA..."
            type="password"
          />
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-muted-2">
            <div>
              <span className="text-muted">Account:</span>{" "}
              <span className="text-foreground font-medium">{connectedHint ? connectedHint : "—"}</span>
            </div>
            <div className="mt-0.5">
              <span className="text-muted">Sync:</span>{" "}
              <span className="text-foreground font-medium">
                {syncState === "RUNNING"
                  ? "Running…"
                  : syncState === "QUEUED"
                    ? "Queued"
                    : syncState === "FAILED"
                      ? "Failed"
                      : "Idle"}
              </span>
            </div>
            {lastRun.startedAt ? (
              <div className="mt-0.5">
                <span className="text-muted">Last run started:</span>{" "}
                <span className="text-foreground font-medium">{lastRun.startedAt}</span>
              </div>
            ) : null}
            {lastRun.completedAt ? (
              <div className="mt-0.5">
                <span className="text-muted">Last run finished:</span>{" "}
                <span className="text-foreground font-medium">{lastRun.completedAt}</span>
              </div>
            ) : null}
            <div className="mt-0.5">
              <span className="text-muted">Last sync:</span>{" "}
              <span className="text-foreground font-medium">{lastSync ? lastSync : "—"}</span>
            </div>
            {error ? <div className="mt-1 text-red-500">{error}</div> : null}
          </div>

          <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
            <button
              type="button"
              onClick={() => run("connect")}
              disabled={!canSubmit || busy !== null || loadingStatus}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
            <button
              type="button"
              onClick={() => run("test")}
              disabled={!canSubmit || busy !== null || loadingStatus}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={() => run("sync")}
              disabled={status !== "CONNECTED" || busy !== null || loadingStatus || syncInProgress || syncState === "QUEUED"}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              onClick={() => run("disconnect")}
              disabled={busy !== null || loadingStatus || syncInProgress}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-60"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      </CardShell>

      <CardShell
        title="TikTok API"
        subtitle="Coming soon. This card will support TikTok Ads / Business integrations with per-workspace credentials, connection status, and on-demand sync."
        badge={<Badge label="Coming soon" variant="purple" pill />}
      >
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-2">
          This integration is planned next. The architecture and UI placeholders are ready for a drop-in service + routes.
        </div>
      </CardShell>

      <CardShell
        title="Shopify API"
        subtitle="Coming soon. This card will support Shopify Admin API for pulling products, collections, and orders into your workspace."
        badge={<Badge label="Coming soon" variant="purple" pill />}
      >
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-2">
          Planned next. You’ll be able to connect a shop, test credentials, and trigger sync runs.
        </div>
      </CardShell>
    </div>
  );
}

