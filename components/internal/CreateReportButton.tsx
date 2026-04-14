"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CreateReportButton({
  label,
  payload,
  variant = "default",
}: {
  label: string;
  payload: { type: string; context: Record<string, unknown> };
  variant?: "default" | "primary";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        upgradeUrl?: string;
        data?: { id?: string };
      };
      if (!res.ok) {
        if (json.code === "PAYWALL") {
          throw new Error(`${json.error ?? "Upgrade required"} — see Pricing.`);
        }
        throw new Error(json.error ?? "Report generation failed");
      }
      const id = json.data?.id as string | undefined;
      setMsg("Report created.");
      if (id) router.push(`/reports/${id}`);
      else router.push("/reports");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={
          variant === "primary"
            ? "px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 border border-border"
            : "px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2 disabled:opacity-50"
        }
      >
        {busy ? "Creating…" : label}
      </button>
      {msg ? (
        <span className="text-xs text-muted inline-flex items-center gap-2 flex-wrap">
          {msg}
          {msg.includes("Pricing") ? (
            <Link href="/pricing" className="text-foreground underline hover:opacity-80">
              View pricing
            </Link>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

