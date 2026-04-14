-- PPM B2B Dashboard Schema
-- Run this in the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- =======================================================
-- leads
-- =======================================================
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  ghl_contact_id text unique not null,
  date_opted_in timestamptz,
  lead_name text,
  phone text,
  email text,
  app_grading int check (app_grading between 1 and 4),
  campaign_id text,
  ad_set_id text,
  ad_id text,
  campaign_name text,
  ad_set_name text,
  ad_name text,
  dials_per_lead int default 0,
  speed_to_lead_minutes numeric,
  lead_source text,
  pipeline_stage text,
  intro_booked boolean default false,
  intro_created_date timestamptz,
  intro_booked_for_date timestamptz,
  intro_show_status text,
  intro_converted_to_demo boolean default false,
  intro_call_outcome text,
  intro_closer text,
  demo_booked boolean default false,
  demo_created_date timestamptz,
  demo_booked_for_date timestamptz,
  demo_show_status text,
  demo_call_outcome text,
  why_didnt_close text,
  demo_assigned_closer text,
  offer_pitched boolean default false,
  client_closed boolean default false,
  cash_collected numeric default 0,
  contracted_mrr numeric default 0,
  lead_tag text,
  backfilled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_leads_ghl on public.leads(ghl_contact_id);
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_leads_tag on public.leads(lead_tag);
create index if not exists idx_leads_stage on public.leads(pipeline_stage);
create index if not exists idx_leads_opt on public.leads(date_opted_in);

-- =======================================================
-- pipeline_events
-- =======================================================
create table if not exists public.pipeline_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete cascade,
  ghl_contact_id text,
  from_stage text,
  to_stage text,
  changed_at timestamptz default now(),
  source text
);

create index if not exists idx_pe_lead on public.pipeline_events(lead_id);

-- =======================================================
-- call_analyses
-- =======================================================
create table if not exists public.call_analyses (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete cascade,
  ghl_contact_id text,
  ghl_call_id text unique,
  call_type text check (call_type in ('intro','demo','other')),
  call_date timestamptz,
  call_duration_seconds int,
  call_recording_url text,
  raw_transcript text,
  ai_summary text,
  ai_lead_insights text,
  ai_call_quality_score int check (ai_call_quality_score between 1 and 10),
  ai_closer_performance text,
  ai_next_steps text,
  ai_red_flags text,
  ai_buying_signals text,
  analyzed_at timestamptz,
  analysis_model text,
  created_at timestamptz default now()
);

create index if not exists idx_ca_lead on public.call_analyses(lead_id);

-- =======================================================
-- windsor_ad_spend
-- =======================================================
create table if not exists public.windsor_ad_spend (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  campaign_id text,
  campaign_name text,
  ad_set_id text,
  ad_id text,
  spend numeric default 0,
  impressions int default 0,
  clicks int default 0,
  created_at timestamptz default now(),
  unique(date, campaign_id, ad_set_id, ad_id)
);

create index if not exists idx_windsor_date on public.windsor_ad_spend(date);

-- =======================================================
-- backfill_runs
-- =======================================================
create table if not exists public.backfill_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_imported int default 0,
  total_skipped int default 0,
  status text default 'running',
  error text
);

-- =======================================================
-- Realtime
-- =======================================================
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;

-- =======================================================
-- RLS
-- =======================================================
alter table public.leads enable row level security;
alter table public.pipeline_events enable row level security;
alter table public.call_analyses enable row level security;
alter table public.windsor_ad_spend enable row level security;
alter table public.backfill_runs enable row level security;

do $$ begin
  create policy "authed read leads" on public.leads for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authed read pipeline_events" on public.pipeline_events for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authed read call_analyses" on public.call_analyses for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authed read windsor" on public.windsor_ad_spend for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authed read backfill_runs" on public.backfill_runs for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- =======================================================
-- hyros_attribution
-- =======================================================
CREATE TABLE IF NOT EXISTS hyros_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  revenue_attributed NUMERIC DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,
  tags TEXT[],
  raw_payload JSONB,
  organic BOOLEAN,
  traffic_source TEXT,
  ad_platform TEXT,
  ad_name TEXT,
  click_date TIMESTAMPTZ,
  is_paid_ad BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);
ALTER TABLE hyros_attribution
  ADD COLUMN IF NOT EXISTS organic BOOLEAN,
  ADD COLUMN IF NOT EXISTS traffic_source TEXT,
  ADD COLUMN IF NOT EXISTS ad_platform TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS click_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_paid_ad BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_hyros_email ON hyros_attribution(email);
CREATE INDEX IF NOT EXISTS idx_hyros_lead_id ON hyros_attribution(lead_id);
ALTER TABLE hyros_attribution ENABLE ROW LEVEL SECURITY;
do $$ begin
  CREATE POLICY "authed read hyros" ON hyros_attribution FOR SELECT TO authenticated USING (true);
exception when duplicate_object then null; end $$;
