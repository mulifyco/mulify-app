"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sources", href: "/sources" },
  { label: "Sync Jobs", href: "/jobs" },
  { label: "Ads", href: "/ads" },
  { label: "Stores", href: "/stores" },
  { label: "Products", href: "/products" },
  { label: "Collections", href: "/collections" },
  { label: "Landing Pages", href: "/landing-pages" },
  { label: "Raw Records", href: "/raw-records" },
  { label: "Settings", href: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 bg-[#0a0b0d] flex flex-col">
      <div className="px-4 py-5 border-b border-gray-800/80">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">
          Mulify
        </div>
        <div className="text-sm font-semibold text-white mt-1 tracking-tight">Library</div>
        <div className="text-[11px] text-gray-600 mt-1">Internal intelligence</div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ||
            pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-gray-800 text-white font-medium"
                  : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/60"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800/80 text-[11px] text-gray-600 leading-relaxed">
        <div className="text-gray-500">library.mulify.co</div>
        <div className="mt-1">Phase 1 · Ops console</div>
      </div>
    </aside>
  );
}
