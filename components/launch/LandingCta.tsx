"use client";

import Link from "next/link";
import { trackPublicProductEvent } from "@/lib/analytics/track-public-product-event";

export function LandingCta({
  href,
  ctaId,
  children,
  className,
  external,
}: {
  href: string;
  ctaId: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  function fire() {
    trackPublicProductEvent("CTA_CLICK", {
      path: "/",
      dedupeKey: `${ctaId}:${href}`,
      metadata: { ctaId, surface: "landing" },
    });
  }

  if (external || href.startsWith("mailto:")) {
    return (
      <a href={href} className={className} onClick={fire}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={fire}>
      {children}
    </Link>
  );
}
