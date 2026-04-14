import Link from "next/link";
import type { EntityType } from "@/types";

const hrefFor: Partial<Record<EntityType, (id: string) => string>> = {
  AD: (id) => `/ads/${id}`,
  STORE: (id) => `/stores/${id}`,
  PRODUCT: (id) => `/products/${id}`,
  COLLECTION: (id) => `/collections/${id}`,
  LANDING_PAGE: (id) => `/landing-pages/${id}`,
};

export interface EntityLinkRow {
  id: string;
  entityType: EntityType;
  entityId: string;
}

export default function EntityLinksBlock({
  links,
  title = "Linked entities",
}: {
  links: EntityLinkRow[];
  title?: string;
}) {
  if (!links.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-2 shadow-sm">
        No normalized entity links.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted uppercase tracking-wide bg-surface-2">
        {title}
      </div>
      <ul className="divide-y divide-border">
        {links.map((l) => {
          const path = hrefFor[l.entityType]?.(l.entityId);
          return (
            <li key={l.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-muted shrink-0">{l.entityType}</span>
                <code className="text-xs text-muted-2 truncate font-mono">{l.entityId}</code>
              </div>
              {path ? (
                <Link href={path} className="text-xs text-indigo-600 hover:opacity-80 shrink-0">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-2 shrink-0">—</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
