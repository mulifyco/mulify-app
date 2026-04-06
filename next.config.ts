// Load .env / .env.local before env-local defaults, so ADMIN_* from files are not
// shadowed by dev fallbacks (Next does not override env vars already set on process).
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import "./lib/env-local";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from Shopify CDN and Meta CDN
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.shopify.com" },
      { protocol: "https", hostname: "**.myshopify.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
  // Increase body size limit for large raw payloads
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
