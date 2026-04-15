# Mulify Library — Deployment Guide

## Target: library.mulify.co

---

## Recommended Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Hosting | Vercel | Zero-config Next.js, free tier works |
| Database | Supabase or Neon | Free PostgreSQL, good DX |
| Domain | library.mulify.co | Subdomain of mulify.co |

---

## Option A — Vercel + Supabase (Recommended)

### 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note the connection strings from: Project Settings → Database
3. Use the **Transaction pooler** URL for the app (port 6543)
4. Use the **Direct connection** URL for migrations (port 5432)

### 2. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com).

### 3. Set environment variables in Vercel

In your Vercel project dashboard → Settings → Environment Variables:

```
DATABASE_URL          = postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true
NEXTAUTH_URL          = https://library.mulify.co
NEXTAUTH_SECRET       = [generate: openssl rand -base64 32]
ADMIN_EMAIL           = admin@mulify.co
ADMIN_PASSWORD        = [your-secure-password]
META_ACCESS_TOKEN     = [your-meta-token or leave empty]
SHOPIFY_TARGET_DOMAINS = [comma-separated domains]
```

### 4. Run database migration (one-time)

Use the **direct connection** (not pooler) for migrations:

```bash
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres" \
  npx prisma migrate deploy
```

Or add a `DIRECT_DATABASE_URL` variable and update `prisma.config.ts` to use it for migrations.

### 5. Configure subdomain

In your DNS provider (where mulify.co is managed):
- Add a CNAME record: `library` → `cname.vercel-dns.com`
- Or add your Vercel IP as an A record

In Vercel:
- Project Settings → Domains → Add `library.mulify.co`

---

## Option B — Railway

1. Create a new project at [railway.app](https://railway.app)
2. Add a PostgreSQL service
3. Add a Next.js service pointing to this repo
4. Set the same environment variables as above
5. Railway will auto-detect Next.js and build it

---

## Production Checklist

- [ ] `DATABASE_URL` set to production database
- [ ] `NEXTAUTH_SECRET` is a strong random string (32+ chars)
- [ ] `ADMIN_PASSWORD` is strong (not the same as dev)
- [ ] `NEXTAUTH_URL` matches your actual domain
- [ ] Database migrations applied (`prisma migrate deploy`)
- [ ] Test login works at `https://library.mulify.co/login`
- [ ] Create at least one Shopify source and run a sync
- [ ] Verify data appears in Stores, Products, Raw Records

---

## Background Worker (Required for queued sync)

This app uses a **separate worker process** for queue-based integration sync runs.

- **Web process**: serves the Next.js app
- **Worker process**: executes queued sync runs and periodic maintenance

### Start worker

```bash
npm run worker
```

If the worker is not running in production:
- UI can enqueue sync runs (they will show as **Queued**)
- runs will remain queued and **never execute**

### Integration queue health (admin-only)

Use `GET /api/ops/integration-queue-health` to inspect:
- pending/running counts
- recent failures
- oldest pending age
- last worker tick timestamp

### Recommended env vars for integrations

```
INTEGRATIONS_ENCRYPTION_KEY      = base64-encoded 32 bytes (recommended)
WORKER_INTERVAL_MS              = 60000
INTEGRATION_SYNC_MAX_PER_TICK   = 3
INTEGRATION_SYNC_RUN_STUCK_MS   = 900000
```

---

## Monitoring

**Phase 1**: Basic monitoring via:
- Vercel/Railway deployment logs
- `/jobs` page in the admin UI
- Sync logs visible in `/jobs/[id]`

**Phase 2** (recommended additions):
- Sentry for error tracking
- Uptime monitoring (Better Uptime / UptimeRobot)
- Scheduled sync via Vercel Cron or GitHub Actions

---

## Scheduled Sync (Phase 2 Preview)

For automated ingestion, add a Vercel Cron job in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-all",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Then create `/app/api/cron/sync-all/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { runAllActiveSources } from "@/jobs/runner";

export async function GET(req: Request) {
  // Verify Vercel cron signature
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllActiveSources("cron");
  return NextResponse.json({ results });
}
```

---

## Security Notes for Phase 1

- Single-admin password auth is intentional for Phase 1 internal use
- No public access — all routes require authentication
- Credentials stored in environment variables only
- Raw payloads stored in PostgreSQL — ensure DB access is private
- Meta API token should have minimum required permissions

Phase 2: Consider adding NextAuth with Google/GitHub provider for team access.
