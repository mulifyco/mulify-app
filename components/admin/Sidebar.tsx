"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { getBranding } from "@/lib/branding/config";
import WorkspaceSwitcher from "@/components/admin/WorkspaceSwitcher";

type NavItem = { label: string; href: string };

function sectionMatch(pathname: string, items: NavItem[]): boolean {
  return items.some(
    (i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(`${i.href}/`))
  );
}

function glyph(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("dashboard")) return "⌁";
  if (l.includes("boards")) return "▦";
  if (l.includes("alerts")) return "⦿";
  if (l.includes("sources")) return "⟐";
  if (l.includes("ads")) return "◈";
  if (l.includes("trending")) return "↗";
  if (l.includes("stores")) return "◎";
  if (l.includes("products")) return "▣";
  if (l.includes("collections")) return "▢";
  if (l.includes("landing")) return "⤴";
  if (l.includes("raw")) return "≋";
  if (l.includes("reports")) return "▤";
  if (l.includes("compare")) return "⇄";
  if (l.includes("watch")) return "⌖";
  if (l.includes("jobs") || l.includes("worker")) return "⧖";
  if (l.includes("settings")) return "⚙";
  if (l.includes("billing")) return "$";
  if (l.includes("ops")) return "⛭";
  if (l.includes("analytics")) return "▩";
  if (l.includes("leads")) return "◐";
  if (l.includes("gtm")) return "⌗";
  if (l.includes("launch")) return "⊛";
  if (l.includes("review")) return "⊞";
  if (l.includes("filter")) return "⧉";
  if (l.includes("team")) return "⊙";
  if (l.includes("pricing")) return "◆";
  if (l.includes("disco")) return "◉";
  return "•";
}

function NavSection({
  title,
  pathname,
  items,
  onNavigate,
}: {
  title: string;
  pathname: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const autoOpen = sectionMatch(pathname, items);
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  return (
    <div className="pt-3 mt-1.5 first:mt-0 first:pt-0 border-t first:border-t-0"
      style={{ borderColor: "var(--sidebar-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left rounded-lg transition-colors"
        style={{ ["--tw-bg-opacity" as string]: "1" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        <span
          className="text-[9px] font-bold uppercase tracking-[0.28em]"
          style={{ color: "var(--sidebar-label-text)" }}
        >
          {title}
        </span>
        <span
          className="text-[9px] w-3 text-center"
          style={{ color: "var(--sidebar-label-text)" }}
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="mt-0.5 space-y-0.5 pb-1">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition-all duration-150"
                style={{
                  background: active ? "var(--sidebar-active-bg)" : undefined,
                  color: active ? "var(--foreground)" : "var(--muted)",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)";
                  if (!active) (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "";
                  if (!active) (e.currentTarget as HTMLElement).style.color = "var(--muted)";
                }}
              >
                {/* Active rail */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-full"
                    style={{
                      background: "var(--sidebar-active-rail)",
                      boxShadow: `0 0 12px var(--sidebar-active-rail-glow)`,
                    }}
                  />
                ) : null}

                {/* Icon container */}
                <span
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-semibold shrink-0 transition-all duration-150"
                  style={{
                    border: `1px solid ${active ? "var(--sidebar-active-icon-border)" : "var(--sidebar-icon-border)"}`,
                    background: active ? "var(--sidebar-active-icon-bg)" : "var(--sidebar-icon-bg)",
                    color: active ? "var(--sidebar-active-icon-text)" : "var(--muted-2)",
                  }}
                >
                  {glyph(item.label)}
                </span>

                <span className="min-w-0 truncate text-[13px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const INTELLIGENCE: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Boards overview", href: "/boards" },
  { label: "Saved filters", href: "/boards/saved-filters" },
  { label: "Alerts", href: "/boards/alerts" },
  { label: "Ready to Scale", href: "/boards/ready-to-scale" },
  { label: "Market Leaders", href: "/boards/market-leaders" },
  { label: "Early Movers", href: "/boards/early-movers" },
  { label: "Saturated Products", href: "/boards/saturated-products" },
  { label: "Creative Winners", href: "/boards/creative-winners" },
  { label: "Sources", href: "/sources" },
  { label: "Discovery candidates", href: "/sources/discovery-candidates" },
  { label: "Ads", href: "/ads" },
  { label: "Trending shops", href: "/trending-shops" },
  { label: "Stores", href: "/stores" },
  { label: "Products", href: "/products" },
  { label: "Collections", href: "/collections" },
  { label: "Landing pages", href: "/landing-pages" },
  { label: "Raw records", href: "/raw-records" },
];

const WORKFLOW: NavItem[] = [
  { label: "Review queue", href: "/review-queue" },
  { label: "Reports", href: "/reports" },
  { label: "Compare", href: "/compare" },
  { label: "Watchlists", href: "/watchlists" },
  { label: "Watchlist alerts", href: "/watchlists/alerts" },
  { label: "Sync jobs", href: "/jobs" },
];

const SALES: NavItem[] = [
  { label: "Leads", href: "/leads" },
  { label: "GTM (founder)", href: "/gtm" },
];

const SETTINGS_NAV: NavItem[] = [
  { label: "Settings", href: "/settings" },
  { label: "Team", href: "/settings/team" },
  { label: "Billing", href: "/settings/billing" },
  { label: "Pricing", href: "/pricing" },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Analytics", href: "/analytics" },
  { label: "Ops", href: "/ops" },
  { label: "Worker jobs", href: "/worker-jobs" },
  { label: "Launch readiness", href: "/launch-readiness" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const brand = getBranding();

  return (
    <aside
      className="h-full min-h-screen flex flex-col"
      style={{
        background: "var(--sidebar-bg)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
      }}
    >
      {/* Brand header */}
      <div
        className="px-3 py-4 flex items-start justify-between gap-2"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {/* Logo mark — always uses gradient so it's visible in both themes */}
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{
                background: "var(--hero-gradient)",
                boxShadow: "0 0 0 1px rgba(112,96,248,0.30), 0 8px 24px rgba(112,96,248,0.22)",
              }}
            >
              {brand.logoLabelFallback}
            </div>
            <div className="min-w-0">
              <div
                className="text-[13px] font-semibold tracking-tight truncate"
                style={{ color: "var(--foreground)" }}
              >
                {brand.appName}
              </div>
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--muted-2)" }}
              >
                {brand.shortDescription}
              </div>
            </div>
          </div>

          {/* Premium console badge */}
          <div
            className="mt-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{
              border: "1px solid var(--sidebar-badge-border)",
              background: "var(--sidebar-badge-bg)",
              color: "var(--sidebar-badge-text)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--sidebar-active-rail)",
                boxShadow: `0 0 0 3px var(--sidebar-active-bg)`,
              }}
            />
            Premium console · v2
          </div>

          {/* Workspace switcher */}
          <div
            className="mt-2.5 rounded-xl p-1.5"
            style={{
              border: "1px solid var(--sidebar-icon-border)",
              background: "var(--sidebar-icon-bg)",
            }}
          >
            <WorkspaceSwitcher compact />
          </div>
        </div>

        <div className="mt-0.5 shrink-0">
          <ThemeToggle />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overscroll-contain space-y-0">
        <NavSection title="Intelligence" pathname={pathname} items={INTELLIGENCE} onNavigate={onNavigate} />
        <NavSection title="Workflow" pathname={pathname} items={WORKFLOW} onNavigate={onNavigate} />
        <NavSection title="Sales / CRM" pathname={pathname} items={SALES} onNavigate={onNavigate} />
        <NavSection title="Settings" pathname={pathname} items={SETTINGS_NAV} onNavigate={onNavigate} />
        <NavSection title="Admin" pathname={pathname} items={ADMIN_NAV} onNavigate={onNavigate} />
      </nav>

      {/* Footer */}
      <div
        className="px-3 py-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-[10px] truncate"
            style={{ color: "var(--sidebar-label-text)" }}
          >
            library.mulify.co
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 0 3px rgba(34,197,94,0.15)" }}
            />
            <span
              className="text-[9px]"
              style={{ color: "var(--sidebar-label-text)" }}
            >
              online
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
