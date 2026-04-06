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
    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-30 hover:bg-gray-700 text-gray-300"
        >
          ← Prev
        </button>
        <span className="text-gray-600">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-30 hover:bg-gray-700 text-gray-300"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
