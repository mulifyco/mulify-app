import prisma from "@/lib/prisma";
import { getBranding } from "@/lib/branding/config";

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v ?? "");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildHtml(row: any): string {
  const brand = getBranding();
  const summary = row.summary ?? {};
  const cards: Array<{ label: string; value: any }> = Array.isArray(summary.cards) ? summary.cards : [];
  const generatedAt = summary.generatedAt ?? row.createdAt?.toISOString?.() ?? "";

  // Normalize top items into a simple table, best-effort.
  const type = String(row.type ?? "REPORT");
  let tableHeaders: string[] = [];
  let tableRows: Array<Record<string, any>> = [];

  if (type === "BOARD_SNAPSHOT" && Array.isArray(summary.topItems)) {
    tableHeaders = ["label", "score", "storeCount", "lastSeenAt"];
    tableRows = summary.topItems.slice(0, 40).map((it: any) => ({
      label: it.label ?? it.title ?? "—",
      score: it.score ?? "—",
      storeCount: it.storeCount ?? "—",
      lastSeenAt: it.lastSeenAt ?? "—",
    }));
  } else if (type === "COMPARE_SNAPSHOT" && Array.isArray(summary.topItems)) {
    tableHeaders = ["domain", "trendScore", "linkedProductClusters", "linkedCreativeClusters", "avgReadyToScaleScore"];
    tableRows = summary.topItems.slice(0, 40).map((s: any) => ({
      domain: s.domain ?? "—",
      trendScore: s.trendScore ?? "—",
      linkedProductClusters: s.linkedProductClusters ?? "—",
      linkedCreativeClusters: s.linkedCreativeClusters ?? "—",
      avgReadyToScaleScore: s.avgReadyToScaleScore ?? "—",
    }));
  } else if (type === "WATCHLIST_SNAPSHOT" && Array.isArray(summary?.topItems?.alerts)) {
    tableHeaders = ["severity", "type", "title", "createdAt"];
    tableRows = summary.topItems.alerts.slice(0, 40).map((a: any) => ({
      severity: a.severity ?? "—",
      type: a.type ?? "—",
      title: a.title ?? "—",
      createdAt: a.createdAt ?? "—",
    }));
  } else {
    tableHeaders = ["label", "value"];
    tableRows = cards.slice(0, 12).map((c) => ({ label: c.label, value: c.value ?? "—" }));
  }

  const title = escapeHtml(String(row.title ?? "Report"));
  const status = escapeHtml(String(row.status ?? "READY"));
  const typeLabel = escapeHtml(type);

  const css = `
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #0f172a; background: #fff; }
    .muted { color: rgba(15,23,42,.72); }
    .small { font-size: 12px; }
    .tiny { font-size: 10px; }
    .h1 { font-size: 22px; font-weight: 700; margin: 0; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .badge { display: inline-block; border: 1px solid rgba(15,23,42,.18); padding: 4px 8px; border-radius: 999px; font-size: 11px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid rgba(15,23,42,.18); border-radius: 14px; padding: 12px; }
    .cardLabel { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(15,23,42,.62); font-weight: 700; }
    .cardValue { font-size: 20px; font-weight: 700; margin-top: 6px; }
    h2 { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: rgba(15,23,42,.62); margin: 0 0 10px 0; }
    .section { margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: rgba(15,23,42,.62); padding: 10px 8px; border-bottom: 1px solid rgba(15,23,42,.18); }
    td { padding: 10px 8px; border-bottom: 1px solid rgba(15,23,42,.12); vertical-align: top; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 10px; background: #f8fafc; border: 1px solid rgba(15,23,42,.12); padding: 10px; border-radius: 12px; }
    .twoCol { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .footer { margin-top: 16px; font-size: 10px; color: rgba(15,23,42,.6); display: flex; justify-content: space-between; }
  `;

  const cardsHtml =
    cards.length === 0
      ? ""
      : `<div class="grid">${cards
          .slice(0, 8)
          .map(
            (c: any) =>
              `<div class="card"><div class="cardLabel">${escapeHtml(String(c.label))}</div><div class="cardValue">${escapeHtml(
                String(c.value ?? "—")
              )}</div></div>`
          )
          .join("")}</div>`;

  const narrativeHtml = `
    <div class="twoCol">
      <div class="card">
        <h2>Why this matters</h2>
        <div class="small">This snapshot captures the current intelligence output in a shareable format.</div>
      </div>
      <div class="card">
        <h2>Next actions</h2>
        <div class="small muted">Open the related board/watchlist/compare view and validate the top signals.</div>
      </div>
    </div>
  `;

  const tableHtml = `
    <div class="card">
      <h2>Top items</h2>
      <table>
        <thead>
          <tr>${tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${tableRows
            .map(
              (r) =>
                `<tr>${tableHeaders
                  .map((h) => `<td>${escapeHtml(String((r as any)[h] ?? "—"))}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  const ctxHtml = `
    <div class="card">
      <h2>Context / filters used</h2>
      <pre>${escapeHtml(safeJson(row.sourceContext ?? {}))}</pre>
    </div>
  `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>${css}</style>
    </head>
    <body>
      <div>
        <div class="tiny muted">Report</div>
        <h1 class="h1">${title}</h1>
        <div class="badges">
          <span class="badge">${typeLabel}</span>
          <span class="badge">${status}</span>
          <span class="badge">${escapeHtml(String(generatedAt))}</span>
        </div>
        ${cardsHtml}
      </div>

      <div class="section">${narrativeHtml}</div>
      <div class="section">${tableHtml}</div>
      <div class="section">${ctxHtml}</div>

      <div class="footer">
        <span>${escapeHtml(brand.appName)} · ${escapeHtml(brand.supportEmail)}</span>
        <span class="muted">Generated ${escapeHtml(String(generatedAt))}</span>
      </div>
    </body>
  </html>`;
}

export async function renderReportPdf(reportId: string, workspaceId?: string | null): Promise<{
  filename: string;
  pdf: Uint8Array;
}> {
  const row = workspaceId
    ? await prisma.report.findFirst({ where: { id: reportId, workspaceId } })
    : await prisma.report.findUnique({ where: { id: reportId } });
  if (!row) throw new Error("Not found");

  const type = String(row.type ?? "report").toLowerCase();
  const date = ymd(new Date(row.createdAt ?? new Date()));
  const filename = `report-${type}-${date}.pdf`;

  const html = buildHtml(row);

  // Playwright-based HTML → PDF. Best-effort; throws on missing browser.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return { filename, pdf: buf };
  } finally {
    await browser.close().catch(() => null);
  }
}

