import { notFound } from "next/navigation";
import { RawRecordRepository } from "@/server/repositories/raw-record.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/date";
import Link from "next/link";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import QueryErrorState from "@/components/internal/QueryErrorState";
import SectionHeader from "@/components/internal/SectionHeader";
import { extractPayloadDebugHints } from "@/lib/admin/raw-payload-hints";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RawRecordDetailPage({ params }: Props) {
  const { id } = await params;

  let record: Awaited<ReturnType<typeof RawRecordRepository.findById>>;

  try {
    const r = await RawRecordRepository.findById(id);
    if (!r) notFound();
    record = r;
  } catch (e) {
    return (
      <div>
        <PageHeader title="Raw record" description={id} />
        <QueryErrorState message={e instanceof Error ? e.message : "Failed to load record."} />
        <Link href="/raw-records" className="text-sm text-indigo-600 hover:opacity-80 mt-4 inline-block">
          ← Back
        </Link>
      </div>
    );
  }

  type RawDetail = typeof record;
  const payloadHints = extractPayloadDebugHints(record.rawPayload);

  return (
    <div>
      <PageHeader
        title="Raw record"
        description={`${record.entityType} · ${record.externalId}`}
        action={
          <Link href="/raw-records" className="text-sm text-muted hover:opacity-80">
            ← Back
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
              Ingestion metadata
            </h3>
            <dl className="space-y-2 text-sm">
              {[
                ["Record ID", record.id],
                ["External ID", record.externalId],
                ["Entity type", record.entityType],
                ["Adapter", record.sourceType],
                ["Parse status", statusBadge(record.status)],
                ["Payload hash", record.payloadHash],
                ["First seen", formatDate(record.firstSeenAt)],
                ["Last seen", formatDate(record.lastSeenAt)],
                ["Normalized at", record.normalizedAt ? formatDate(record.normalizedAt) : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex gap-3">
                  <dt className="w-32 text-muted-2 flex-none text-xs shrink-0">{label}</dt>
                  <dd className="text-foreground font-mono text-xs break-all min-w-0">{value}</dd>
                </div>
              ))}
              <div className="flex gap-3">
                <dt className="w-32 text-muted-2 flex-none text-xs shrink-0">Source</dt>
                <dd className="text-foreground text-xs min-w-0">
                  <Link href={`/sources/${record.sourceId}`} className="text-indigo-600 hover:opacity-80">
                    {record.source?.name ?? "Unknown"}
                  </Link>
                  <span className="text-muted-2 ml-2">{record.source?.type ?? "—"}</span>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 text-muted-2 flex-none text-xs shrink-0">Ingestion job</dt>
                <dd className="text-foreground text-xs min-w-0">
                  {record.job ? (
                    <Link href={`/jobs/${record.job.id}`} className="text-indigo-600 hover:opacity-80 font-mono break-all">
                      {record.job.id}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {record.job && (
                    <span className="text-muted-2 ml-2">{statusBadge(record.job.status)}</span>
                  )}
                  {record.job?.startedAt && (
                    <div className="text-muted-2 mt-1">Started {formatDate(record.job.startedAt)}</div>
                  )}
                </dd>
              </div>
            </dl>

            {record.processingError && (
              <div className="mt-4 p-3 rounded text-xs border border-[color:var(--badge-red-border)] bg-[color:var(--badge-red-bg)] text-[color:var(--badge-red-fg)]">
                <div className="uppercase mb-1 font-semibold">Parse / processing error</div>
                {record.processingError}
              </div>
            )}
          </div>

          {payloadHints.length > 0 && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-4">
              <SectionHeader title="Payload hints" description="Strings extracted from JSON keys like warnings/errors" />
              <ul className="text-xs text-amber-100/80 space-y-1 list-disc list-inside">
                {payloadHints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] text-muted-2 mb-2">
              Confidence scores live on normalized entities. Open a linked row below to inspect scoring.
            </p>
            <EntityLinksBlock
              links={(record.entityLinks ?? []).map((l: RawDetail["entityLinks"][number]) => ({
                id: l.id,
                entityType: l.entityType,
                entityId: l.entityId,
              }))}
            />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted uppercase mb-2 tracking-wide">
            Raw JSON
          </h3>
          <JsonPayloadViewer data={record.rawPayload ?? {}} maxCollapsedHeight={480} />
        </div>
      </div>
    </div>
  );
}
