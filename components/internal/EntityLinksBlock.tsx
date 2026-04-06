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
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-xs text-gray-600">
        No normalized entity links.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </div>
      <ul className="divide-y divide-gray-800/60">
        {links.map((l) => {
          const path = hrefFor[l.entityType]?.(l.entityId);
          return (
            <li key={l.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-gray-500 shrink-0">{l.entityType}</span>
                <code className="text-xs text-gray-400 truncate font-mono">{l.entityId}</code>
              </div>
              {path ? (
                <Link href={path} className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-gray-600 shrink-0">—</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
