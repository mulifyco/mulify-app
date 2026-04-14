import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/internal/SectionHeader";
import Badge from "@/components/ui/Badge";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { auth } from "@/lib/auth";
import { getEnvChecks } from "@/lib/env";
import { getBranding } from "@/lib/branding/config";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import { getWorkspaceRole } from "@/server/authz/workspace";

export const dynamic = "force-dynamic";

type Item = { title: string; level: "green" | "yellow" | "red"; detail: string; cta?: { label: string; href: string } };

function levelBadge(level: Item["level"]) {
  if (level === "green") return <Badge label="Green" variant="green" />;
  if (level === "yellow") return <Badge label="Yellow" variant="yellow" />;
  return <Badge label="Red" variant="red" />;
}

function panel(title: string, items: Item[]) {
  const worst = items.some((i) => i.level === "red") ? "red" : items.some((i) => i.level === "yellow") ? "yellow" : "green";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {levelBadge(worst)}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((i, idx) => (
          <div key={`${i.title}-${idx}`} className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">{i.title}</div>
                <div className="text-xs text-muted mt-0.5 leading-relaxed">{i.detail}</div>
              </div>
              {levelBadge(i.level)}
            </div>
            {i.cta ? (
              <div className="mt-2">
                <a className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline" href={i.cta.href}>
                  {i.cta.label} →
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function LaunchReadinessPage() {
  const session = await auth();
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader title="Launch readiness" description="Pre-production checklist." />
        <QueryErrorState title="Sign in required" message="Please sign in to view launch readiness." />
      </div>
    );
  }

  const ws = await getRequiredWorkspace(session).catch(() => null);
  if (!ws) {
    return (
      <div className="space-y-6">
        <PageHeader title="Launch readiness" description="Pre-production checklist." />
        <QueryErrorState title="No active workspace" message="Switch to a workspace to view readiness checks." />
      </div>
    );
  }

  const role = await getWorkspaceRole({ workspaceId: ws.workspaceId, userId: ws.userId });
  if (role !== "OWNER") {
    return (
      <div className="space-y-6">
        <PageHeader title="Launch readiness" description="Pre-production checklist." />
        <QueryErrorState title="Restricted" message="Only workspace owners can view this page." />
      </div>
    );
  }

  const brand = getBranding();
  const env = getEnvChecks();
  const envPanel: Item[] = env.map((c) => ({
    title: c.key,
    level: c.level,
    detail: c.message,
    cta: c.level === "red" ? { label: "Open settings", href: "/settings" } : undefined,
  }));

  const authPanel: Item[] = [
    { title: "Session secret", level: env.find((c) => c.key === "AUTH_SECRET/NEXTAUTH_SECRET")?.level ?? "yellow", detail: "JWT/session encryption should be stable across deploys." },
    { title: "Workspace isolation", level: "green", detail: "Workspace-scoped workflow APIs enforced (reports/leads/gtm/watchlists/review queue/analytics)." },
  ];

  const billingPanel: Item[] = [
    { title: "Stripe keys", level: env.find((c) => c.key === "STRIPE_SECRET_KEY")?.level ?? "yellow", detail: "Checkout/portal require Stripe secret key." },
    { title: "Webhook secret", level: env.find((c) => c.key === "STRIPE_WEBHOOK_SECRET")?.level ?? "yellow", detail: "Billing webhook should be configured & idempotent." },
  ];

  const workerPanel: Item[] = [
    { title: "Worker cadence", level: env.find((c) => c.key === "WORKER_INTERVAL_MS")?.level ?? "yellow", detail: "Background jobs should run on a predictable interval." },
    { title: "Fail-fast on prod env", level: "green", detail: "Worker validates critical env on startup (production)." },
  ];

  const analyticsPanel: Item[] = [
    { title: "Workspace-scoped analytics", level: "green", detail: "Admin analytics aggregates are scoped to the active workspace." },
    { title: "Public beacons", level: "yellow", detail: "Anonymous marketing events can remain workspace-null and are excluded when scoping by workspace." },
  ];

  const demoPanel: Item[] = [
    { title: "Demo seed safety", level: "yellow", detail: "Demo seed is best-effort and should remain clearly separated per workspace context." },
  ];

  const smoke: Array<{ title: string; steps: string[] }> = [
    {
      title: "Smoke checklist (10 min)",
      steps: [
        "Login → dashboard loads without errors",
        "Switch workspace → dashboard/reports/watchlists/leads/gtm show tenant-correct data",
        "Create watchlist + run evaluation → alerts appear in the same workspace",
        "Create report (board/watchlist) → export JSON/CSV/PDF works",
        "Open review queue → resolve item → activity logged",
        "Billing: open pricing + portal/checkout error states are readable",
      ],
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Launch readiness"
        description={`Pre-production checklist for ${brand.appName}. Scope: active workspace only.`}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {panel("Env readiness", envPanel)}
        {panel("Auth & isolation", authPanel)}
        {panel("Billing readiness", billingPanel)}
        {panel("Worker readiness", workerPanel)}
        {panel("Analytics readiness", analyticsPanel)}
        {panel("Demo readiness", demoPanel)}
      </div>

      <div>
        <SectionHeader title="Final QA helpers" description="Short checklist to run before opening traffic." />
        <div className="mt-3 grid lg:grid-cols-2 gap-6">
          {smoke.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-sm font-semibold text-foreground">{s.title}</div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-muted">
                {s.steps.map((x, idx) => (
                  <li key={idx}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Need help? Contact <span className="text-foreground font-medium">{brand.supportEmail}</span>.
        </p>
      </div>
    </div>
  );
}

