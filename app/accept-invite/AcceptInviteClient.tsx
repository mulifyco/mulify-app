"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SessionShape = { user?: { email?: string | null } | null } | null;

export default function AcceptInviteClient() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();

  const [session, setSession] = useState<SessionShape | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState("/login?callbackUrl=%2Faccept-invite");

  useEffect(() => {
    setLoginHref(`/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as SessionShape;
      setSession(data ?? null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/team/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(json.error ?? "Accept failed");
      setMessage("You’ve joined the workspace. Redirecting…");
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 600);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted">This link is missing a token. Ask your admin for a new invite.</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const signedIn = Boolean(session?.user?.email);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Join workspace</h2>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Sign in with the email address that received the invite, then accept to add this workspace to your account.
        </p>
      </div>

      {!signedIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Sign in to continue
          </Link>
          <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
            Home
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Signed in as <span className="font-medium text-foreground">{session?.user?.email}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={accept}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? "Joining…" : "Accept invite"}
          </button>
        </div>
      )}

      {message ? (
        <p
          className={`text-sm ${
            message.includes("fail") || message.includes("expired") || message.includes("capacity")
              ? "text-red-600"
              : "text-emerald-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      <p className="text-[11px] text-muted leading-relaxed border-t border-border pt-4">
        If the invite was revoked or expired, ask an owner to send a new link from Team settings.
      </p>
    </div>
  );
}
