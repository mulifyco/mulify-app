"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface SearchBarProps {
  placeholder?: string;
  className?: string;
}

export default function SearchBar({ placeholder = "Search…", className = "" }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedRef = useRef<string>(value);

  useEffect(() => {
    const next = searchParams.get("search") ?? "";
    setValue(next);
    lastPushedRef.current = next;
  }, [searchParams]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setValue(raw);

      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        const trimmed = raw.trim();
        if (trimmed === lastPushedRef.current.trim()) return;

        if (trimmed) params.set("search", trimmed);
        else params.delete("search");
        params.delete("page");

        lastPushedRef.current = trimmed;
        router.push(`${pathname}?${params.toString()}`);
      }, 500);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2 text-sm pointer-events-none select-none">
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={handleSearch}
        placeholder={placeholder}
        className="w-64 bg-surface-2/50 border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 transition-colors glass"
      />
    </div>
  );
}
