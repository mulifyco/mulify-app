"use client";

import { useState } from "react";
import Link from "next/link";

export default function BookDemoPage() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gtm/inbound-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, name, email, website, message }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Request failed");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">You’re on the list</h1>
          <p className="text-sm text-muted leading-relaxed">
            Thanks — we received your demo request. The Mulify team will follow up within one business day.
          </p>
          <Link href="/" className="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="text-xs text-muted hover:text-foreground">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold mt-4">Book a demo</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Tell us about your team. We’ll create a GTM record and reach out shortly.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted">Company *</span>
            <input
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="Acme Growth"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Website</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="https://"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">What should we prepare?</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </label>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Request demo"}
          </button>
        </form>
      </div>
    </div>
  );
}
