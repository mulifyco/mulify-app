"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  param: string;
  label: string;
  options: FilterSelectOption[];
  currentValue: string;
}

export default function FilterSelect({
  param,
  label,
  options,
  currentValue,
}: FilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={currentValue}
        onChange={(e) => {
          const p = new URLSearchParams(searchParams.toString());
          const v = e.target.value;
          if (v) p.set(param, v);
          else p.delete(param);
          p.delete("page");
          router.push(`${pathname}?${p.toString()}`);
        }}
        className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-indigo-500 min-w-[8rem]"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
