// Prisma 7 configuration
// Connection URL is configured here for migrations
// Client connection is configured in lib/prisma.ts

import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // For hosted Postgres (Supabase/Neon), use a direct (non-pooler) URL for migrations when available.
    // App runtime (lib/prisma.ts) can use the pooler / DATABASE_URL.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "",
  },
});
