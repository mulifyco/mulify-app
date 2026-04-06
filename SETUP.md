# Mulify Library — Phase 1 Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local, Supabase, Neon, or Railway)
- A Meta developer account (for Meta Ads ingestion — optional for Shopify-only)

---

## 1. Clone & Install

```bash
cd Library-Mulify
npm install
```

---

## 2. Environment Configuration

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/mulify_library"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
ADMIN_PASSWORD="your-secure-password-min-12-chars"

# Optional but recommended
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@mulify.co"

# Meta Ads (optional — leave empty to skip)
META_ACCESS_TOKEN="your-meta-access-token"

# Shopify domains to crawl (optional)
SHOPIFY_TARGET_DOMAINS="store1.myshopify.com,store2.com"
```

---

## 3. Database Setup

### Create the database

```bash
# PostgreSQL local
createdb mulify_library

# Or use Supabase/Neon and just set DATABASE_URL
```

### Run migrations

```bash
npm run db:migrate
# Follow prompts to name the migration (e.g., "initial_schema")
```

### Generate Prisma client (if needed separately)

```bash
npm run db:generate
```

---

## 4. Run Development Server

```bash
npm run dev
```

Visit: [http://localhost:3000](http://localhost:3000)

Sign in with:
- Email: `admin@mulify.co` (or your ADMIN_EMAIL)
- Password: your `ADMIN_PASSWORD`

---

## 5. Create Your First Source

### Option A — Shopify Store (easiest, no API key needed)

1. Go to **Sources** → **+ New Source**
2. Choose type: `SHOPIFY_STOREFRONT`
3. Config:
```json
{
  "targetDomains": ["gymshark.com", "allbirds.com"],
  "fetchProducts": true,
  "fetchCollections": true,
  "maxProductsPerStore": 250
}
```
4. Click **Create Source**
5. Click **Run Sync**

### Option B — Meta Ads (requires API access)

You need:
1. A Meta developer app at [developers.facebook.com](https://developers.facebook.com)
2. Request Ad Library API access (under App Review)
3. Generate a User Access Token with `ads_read` permission

```json
{
  "searchTerms": ["dropshipping", "buy now"],
  "countries": ["US", "GB"],
  "adActiveStatus": "ALL"
}
```

> ⚠️ Meta Ad Library access requires app review which can take days/weeks.
> For political ads, access is easier. For commercial ads, fields like
> destination URL and spend are not available without special permissions.

---

## 6. Inspect Data

- **Dashboard**: Overview stats and recent jobs
- **Ads**: All ingested Meta ad records + confidence scores
- **Stores**: All crawled Shopify stores
- **Products**: All products with pricing and availability
- **Collections**: All product collections
- **Raw Records**: Inspect raw API payloads as received
- **Jobs**: Job history, logs, duration, failure details

---

## Adding New Shopify Targets

1. Go to the source in the UI
2. Edit config to add more domains to `targetDomains`
3. Re-run sync

OR create a new source per domain/group for better isolation.

---

## Database Inspection

```bash
npm run db:studio
```

This opens Prisma Studio at localhost:5555.

---

## Troubleshooting

### "ADMIN_PASSWORD not configured"
→ Make sure `.env.local` has `ADMIN_PASSWORD` set.

### "META_ACCESS_TOKEN is not configured"
→ Either set `META_ACCESS_TOKEN` or use Shopify sources only.

### Job fails immediately for Shopify
→ Verify the domain is a real Shopify store. Some stores disable the JSON API.
Try `curl https://yourdomain.com/products.json` — if it returns 200 with JSON, it works.

### "Cannot find module '@prisma/client'"
→ Run `npm run db:generate`

### Prisma migration fails
→ Make sure `DATABASE_URL` is correct and the database exists.
→ For Supabase: use the "Transaction" pooler URL for migrations, "Session" pooler for the app.
