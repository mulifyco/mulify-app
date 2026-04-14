"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackPublicProductEvent } from "@/lib/analytics/track-public-product-event";

export default function LoginConversionTracker() {
  const sp = useSearchParams();
  useEffect(() => {
    // Internal analytics: track which surface sent the user to the login page.
    const ref = sp.get("ref") ?? "direct";
    trackPublicProductEvent("CTA_CLICK", {
      dedupeKey: `login_view:${ref}`,
      path: "/login",
      metadata: { ctaId: "login_page_view", ref },
    });
  }, [sp]);
  return null;
}
