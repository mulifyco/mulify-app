"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Pagination({ total, page, pageSize, totalPages }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function navigate(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-muted">
      <span className="text-[11px] text-muted-2 tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-xl border border-border bg-card/60 glass text-xs font-medium text-foreground disabled:opacity-30 hover:bg-surface-2/60 transition-colors"
        >
          ← Prev
        </button>
        <span className="text-[11px] text-muted-2 px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-xl border border-border bg-card/60 glass text-xs font-medium text-foreground disabled:opacity-30 hover:bg-surface-2/60 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
