# PPM B2B Dashboard

Premier Pool Marketing B2B lead dashboard. Next.js 15, Supabase, Claude AI call analysis, GHL + Calendly + Windsor.ai integrations.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in credentials
npm run dev
```

Open http://localhost:3000 — redirects to `/dashboard`.

## Stack

- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4
- Supabase (Postgres + Auth + Realtime)
- Anthropic Claude (call analysis)
- GoHighLevel CRM integration
- Calendly + Windsor.ai integrations

## Environment

See `.env.local.example` for all variables. Defaults baked in for GHL, Calendly UUID, Windsor key. Supabase + Anthropic + webhook secrets are user-filled.

## Database

Run the SQL at `supabase/schema.sql` in the Supabase SQL editor.

## Cron

Cron routes are defined in `vercel.json`. Each one is guarded by `Bearer ${CRON_SECRET}`.

## Structure

- `app/dashboard/*` — authed UI
- `app/api/*` — webhooks, sync, backfill, stats
- `lib/*` — ghl, calendly, windsor, scoring, analyze-call, kpis, backfill
- `supabase/schema.sql` — schema + RLS + realtime

## Notes

- Dashboard uses mock data (40 leads) when DB is empty so the UI renders before creds are wired.
- VEO is not involved here (this is the dashboard, not the video pipeline).
