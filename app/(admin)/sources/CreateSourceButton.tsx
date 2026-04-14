"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateSourceButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    type: "META_ADS",
    configJson: `{
  "searchTerms": ["dropshipping", "buy now"],
  "countries": ["US"],
  "adActiveStatus": "ALL"
}`,
  });

  async function handleCreate() {
    setLoading(true);
    setError(null);

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.configJson);
    } catch {
      setError("Invalid JSON in config");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, type: form.type, config }),
      });

      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const parsed: unknown = ct.includes("application/json") && raw ? JSON.parse(raw) : null;
      const data = (parsed && typeof parsed === "object" ? parsed : { error: "Veri alınamadı" }) as {
        error?: unknown;
      };
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to create source");
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-primary hover:opacity-90 rounded text-sm text-primary-foreground border border-border shadow-sm"
      >
        + New Source
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Create Source</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1 block">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                  placeholder="e.g. Meta Ads – US Dropshipping"
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => {
                    const t = e.target.value;
                    const defaultConfigs: Record<string, string> = {
                      META_ADS: `{
  "searchTerms": ["dropshipping", "buy now"],
  "countries": ["US"],
  "adActiveStatus": "ALL"
}`,
                      SHOPIFY_DOMAIN: `{
  "sourceDomain": "example.com",
  "fetchStoreMeta": true,
  "fetchProducts": true,
  "fetchCollections": true,
  "maxProductsPerStore": 250,
  "maxCollectionsPerStore": 100
}`,
                      SHOPIFY_STOREFRONT: `{
  "storeUrl": "https://your-store.com",
  "targetDomains": [],
  "fetchStoreMeta": true,
  "fetchProducts": true,
  "fetchCollections": true,
  "maxProductsPerStore": 250
}`,
                    };
                    setForm({ ...form, type: t, configJson: defaultConfigs[t] ?? "{}" });
                  }}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                >
                  <option value="META_ADS">Meta Ads</option>
                  <option value="SHOPIFY_DOMAIN">Shopify Domain</option>
                  <option value="SHOPIFY_STOREFRONT">Shopify Storefront</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">
                  Config (JSON)
                </label>
                <textarea
                  value={form.configJson}
                  onChange={(e) => setForm({ ...form, configJson: e.target.value })}
                  rows={8}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-muted hover:opacity-80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !form.name}
                  className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 rounded text-sm text-primary-foreground border border-border shadow-sm"
                >
                  {loading ? "Creating…" : "Create Source"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
