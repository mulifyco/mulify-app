"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/internal/EmptyState";

type MemberRow = { id: string; userId: string; email: string; role: string };
type InviteRow = {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string | Date;
};

type Capabilities = {
  role: string | null;
  viewerEmail: string;
  canViewInvites: boolean;
  canCreateInvite: boolean;
  canRevokeInvite: boolean;
  canManageMembers: boolean;
  canManageBilling: boolean;
};

type SeatInfo = {
  limit: number;
  memberCount: number;
  pendingCount: number;
  occupied: number;
};

const MEMBER_ROLES = ["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const;
const INVITE_ROLES = ["ADMIN", "ANALYST", "VIEWER"] as const;

function badgeTone(s: string): string {
  const v = s.toUpperCase();
  if (v === "OWNER") return "bg-violet-500/12 border-violet-500/35 text-violet-200";
  if (v === "ADMIN") return "bg-sky-500/12 border-sky-500/35 text-sky-200";
  if (v === "ANALYST") return "bg-emerald-500/12 border-emerald-500/35 text-emerald-200";
  if (v === "VIEWER") return "bg-zinc-500/10 border-border text-muted";
  if (v === "PENDING") return "bg-amber-500/12 border-amber-500/35 text-amber-200";
  if (v === "ACCEPTED") return "bg-emerald-500/12 border-emerald-500/35 text-emerald-200";
  if (v === "REVOKED" || v === "EXPIRED") return "bg-red-500/10 border-red-500/30 text-red-300";
  return "bg-surface-2 border-border text-foreground";
}

function seatBarPct(occupied: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((occupied / limit) * 100));
}

export default function TeamSettingsClient({ initialToken }: { initialToken?: string | null }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [seat, setSeat] = useState<SeatInfo | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("ANALYST");
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const token = initialToken ?? "";

  const load = useCallback(async () => {
    setMsg(null);
    const res = await fetch("/api/settings/team/invites", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      setMsg({ type: "err", text: String(json.error ?? "Failed to load team") });
      return;
    }
    setMembers(Array.isArray(json.members) ? (json.members as MemberRow[]) : []);
    setInvites(Array.isArray(json.data) ? (json.data as InviteRow[]) : []);
    setSeat((json.seat as SeatInfo) ?? null);
    setCaps((json.capabilities as Capabilities) ?? null);
  }, []);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  async function createInvite() {
    setBusy("invite");
    setMsg(null);
    try {
      const res = await fetch("/api/settings/team/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(json.error ?? "Invite failed"));
      const url = json.data && typeof json.data === "object" && json.data !== null && "inviteUrl" in json.data
        ? String((json.data as { inviteUrl?: string }).inviteUrl ?? "")
        : "";
      setMsg({
        type: "ok",
        text: url ? `Invite ready. Link copied to clipboard if supported.` : "Invite created.",
      });
      if (url && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        const origin = window.location.origin;
        await navigator.clipboard.writeText(`${origin}${url}`).catch(() => {});
      }
      setInviteEmail("");
      setInviteOpen(false);
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/settings/team/invites/${id}/revoke`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Revoke failed");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(memberId: string, role: string) {
    setBusy(memberId);
    setMsg(null);
    try {
      const res = await fetch(`/api/settings/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(memberId: string) {
    setBusy(memberId);
    setMsg(null);
    try {
      const res = await fetch(`/api/settings/team/members/${memberId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  async function acceptInvite() {
    if (!token) return;
    setBusy("accept");
    setMsg(null);
    try {
      const res = await fetch("/api/settings/team/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Accept failed");
      setMsg({ type: "ok", text: "Invite accepted." });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  const seatPct = useMemo(() => {
    if (!seat) return 0;
    return seatBarPct(seat.occupied, seat.limit);
  }, [seat]);

  const actorIsAdminOnly = caps?.role === "ADMIN";

  function memberRoleOptions(target: MemberRow): readonly string[] {
    if (caps?.role === "OWNER") return MEMBER_ROLES;
    if (caps?.role === "ADMIN") {
      if (target.role === "OWNER") return [target.role];
      return ["ADMIN", "ANALYST", "VIEWER"];
    }
    return [];
  }

  return (
    <div className="space-y-8">
      {token ? (
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-surface-2/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Pending invite</div>
            <p className="text-sm text-foreground mt-1">Accept to join this workspace on your account.</p>
          </div>
          <button
            type="button"
            disabled={busy != null}
            onClick={acceptInvite}
            className="shrink-0 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy === "accept" ? "Accepting…" : "Accept invite"}
          </button>
        </div>
      ) : null}

      {msg ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Seat usage</div>
            <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
              {seat ? `${seat.occupied} / ${seat.limit}` : "—"}
            </p>
            <p className="text-xs text-muted mt-1">
              {seat
                ? `${seat.memberCount} members · ${seat.pendingCount} pending invites · counts toward plan limit`
                : "Select a workspace from the sidebar to see usage."}
            </p>
          </div>
          {caps?.canManageBilling ? (
            <a
              href="/settings/billing"
              className="text-sm text-muted hover:text-foreground underline-offset-4 hover:underline shrink-0"
            >
              Billing & plan →
            </a>
          ) : null}
        </div>
        {seat ? (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-border">
              <div
                className={`h-full rounded-full transition-all ${
                  seatPct >= 100 ? "bg-red-500/80" : seatPct >= 85 ? "bg-amber-500/80" : "bg-emerald-500/70"
                }`}
                style={{ width: `${seatPct}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          {caps?.canCreateInvite ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Invite member
            </button>
          ) : (
            <p className="text-xs text-muted">
              Only workspace <span className="text-foreground font-medium">owners</span> can send invites. Admins can
              manage member roles.
            </p>
          )}
        </div>
      </div>

      {inviteOpen && caps?.canCreateInvite ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Invite teammate</h3>
                <p className="text-xs text-muted mt-1">They’ll get a link to accept (email delivery coming soon).</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="text-muted hover:text-foreground text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted">Email</span>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted">Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy != null || !inviteEmail.trim()}
                onClick={createInvite}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {busy === "invite" ? "Creating…" : "Create invite"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Members</h3>
            {caps?.role ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-md border ${badgeTone(caps.role)}`}>You: {caps.role}</span>
            ) : null}
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted">No members loaded.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => {
                const isSelf = caps?.viewerEmail?.toLowerCase() === m.email.toLowerCase();
                const canEdit =
                  caps?.canManageMembers &&
                  (!actorIsAdminOnly || m.role !== "OWNER") &&
                  !(isSelf && m.role === "OWNER");
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-border bg-surface/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{m.email}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium ${badgeTone(m.role)}`}>
                          {m.role}
                        </span>
                        {isSelf ? (
                          <span className="text-[10px] text-muted">You</span>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={m.role}
                          disabled={busy != null}
                          onChange={(e) => changeRole(m.id, e.target.value)}
                          className="bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-foreground"
                        >
                          {memberRoleOptions(m).map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy != null || (m.role === "OWNER" && isSelf)}
                          onClick={() => removeMember(m.id)}
                          className="px-2.5 py-1.5 text-xs rounded-md border border-border text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-4">Invites</h3>
          {!caps?.canViewInvites ? (
            <p className="text-sm text-muted">Invites are visible to owners and admins.</p>
          ) : invites.length === 0 ? (
            <EmptyState
              className="py-8"
              title="No pending invites"
              description="Send a secure link so teammates land in this workspace with the right role. Email delivery is coming soon — copy the link after you create an invite."
              action={
                caps?.canCreateInvite ? (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
                  >
                    Invite teammate
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {invites.slice(0, 80).map((i) => {
                const expired = i.status === "PENDING" && new Date(i.expiresAt).getTime() < Date.now();
                return (
                  <li
                    key={i.id}
                    className="rounded-lg border border-border bg-surface/40 px-4 py-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{i.email}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium ${badgeTone(i.status)}`}>
                            {expired ? "EXPIRED" : i.status}
                          </span>
                          <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium ${badgeTone(i.role)}`}>
                            {i.role}
                          </span>
                          <span className="text-[10px] text-muted">
                            {expired ? "Past expiry" : `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                          </span>
                        </div>
                      </div>
                      {caps?.canRevokeInvite && i.status === "PENDING" && !expired ? (
                        <button
                          type="button"
                          disabled={busy != null}
                          onClick={() => revokeInvite(i.id)}
                          className="shrink-0 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-2 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </div>
                    {i.status === "PENDING" && !expired ? (
                      <div className="text-[10px] text-muted font-mono break-all pt-1 border-t border-border/60">
                        {origin}/accept-invite?token=
                        {i.token}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
