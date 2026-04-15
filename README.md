# Mulify Library

Internal growth intelligence platform for ingesting external data sources (ads, storefront signals, integrations), normalizing them into a shared schema, and surfacing analysis in an admin UI.

## Main modules
- **Admin web app (Next.js)**: dashboards, boards, ops, settings, integrations UI
- **Ingestion/jobs**: source sync pipelines (Meta/Shopify/TikTok best-effort) + job tracking
- **Integrations (Facebook first)**: workspace-scoped credentials, connection status, queued sync runs, integration record store
- **Worker**: background execution for queued sync runs + periodic maintenance (stuck job recovery, scheduling)

## Local development

### 1) Install

```bash
npm install
```

### 2) Environment variables

Create `.env.local` with the basics:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/mulify_library"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@mulify.co"
ADMIN_PASSWORD="your-secure-password"

# Recommended for production-grade credential encryption
INTEGRATIONS_ENCRYPTION_KEY="base64-32-bytes"
```

### 3) Prisma setup

```bash
npm run db:push
npm run db:generate
```

### 4) Start the web app

```bash
npm run dev
```

Open `http://localhost:3000`.

### 5) Start the worker (required for queued sync)

```bash
npm run worker
```

**Important:** Integration sync runs (e.g. Facebook “Sync now”) are queue-based. If the worker is not running, runs will stay **Queued** and won’t execute.

## Deployment & release docs
- **Deployment guide**: `DEPLOYMENT.md`
- **Facebook integration release checklist**: `RELEASE_CHECKLIST_FACEBOOK_INTEGRATION.md`
