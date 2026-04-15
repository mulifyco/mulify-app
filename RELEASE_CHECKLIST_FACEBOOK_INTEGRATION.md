# Facebook Integration — Release Checklist

## Required env vars
- `DATABASE_URL`
- `NEXTAUTH_SECRET` (or `AUTH_SECRET`)
- `NEXTAUTH_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `INTEGRATIONS_ENCRYPTION_KEY` (recommended for production; 32 bytes base64 preferred)

## Optional / operational knobs
- `WORKER_INTERVAL_MS` (default 60000)
- `INTEGRATION_SYNC_MAX_PER_TICK` (default 3)
- `INTEGRATION_SYNC_RUN_STUCK_MS` (default 15m)

## Database / Prisma
- [ ] `npm run db:push`
- [ ] `npm run db:generate`

## Deploy processes
- **Web process**
  - [ ] Deploy Next.js web app
  - [ ] Verify login works: `/login`
- **Worker process**
  - [ ] Deploy and run worker: `npm run worker`
  - [ ] If worker is not running, sync runs will remain **QUEUED** (PENDING) and never execute.

## Health checks
- [ ] Confirm worker heartbeat: `GET /api/ops/integration-queue-health` (admin-only)
- [ ] Pending/running counters look sane

## Functional checks (live)
- [ ] Go to `/settings/apis`
- [ ] Connect valid Facebook credentials
- [ ] Test connection succeeds
- [ ] Click Sync now → status becomes QUEUED then RUNNING then IDLE/CONNECTED
- [ ] Verify `IntegrationRecord` rows are created for CAMPAIGN/ADSET/AD/INSIGHT
- [ ] Disconnect clears credentials and status becomes DISCONNECTED

## Rollback note
- If you rollback web without rolling back worker (or vice versa), queued runs may accumulate.
- Safe action: stop worker, deploy consistent versions, then restart worker and monitor queue health.

