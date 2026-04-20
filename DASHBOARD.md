# PPM B2B Dashboard — Data Flow Reference

How every number on the dashboard gets there, how often it refreshes, and what breaks it.

---

## 1. Upstream systems (sources of truth)

| System | What it owns | API |
|---|---|---|
| **GHL** (GoHighLevel) | Contacts, tags, appointments, opportunities, notes, custom fields, call recordings | `services.leadconnectorhq.com/contacts/*`, `/opportunities/*`, `/conversations/*` |
| **Hyros** | Click attribution (which ad → which email), paid-vs-organic classification, revenue | `api.hyros.com/v1/api/v1.0/leads` |
| **Windsor.ai** | Meta ad spend, impressions, clicks per campaign/ad/day | Windsor API |
| **Anthropic Claude** | Call transcript analysis (summary, insights, outcome) | `api.anthropic.com/v1/messages` |
| **Calendly** | Intro/demo call bookings (some accounts) | `api.calendly.com` |

The Supabase Postgres DB is the **aggregator** — every upstream source is pulled into it. The dashboard only reads from Supabase.

---

## 2. How data flows into the DB

```
GHL ─ webhook (instant) ──────► /api/webhooks/ghl ─────► leads, call_analyses
GHL ─ cron (hourly) ──────────► /api/sync/ghl-contacts ► leads (catches webhook misses)
GHL ─ cron (hourly) ──────────► /api/sync/enrich ──────► leads.cash_collected, tags, opportunities, appointments
GHL ─ cron (hourly) ──────────► /api/sync/calls-from-ghl ► call_analyses
GHL ─ cron (nightly 6 UTC) ───► /api/sync/reconcile ────► leads (7-day safety net)
Hyros ─ cron (hourly) ────────► /api/sync/hyros?recent=1 ► hyros_attribution (last 3 days)
Hyros ─ cron (nightly 6 UTC) ─► /api/sync/hyros ────────► hyros_attribution (full 5000-lead sweep)
Hyros ─ cron (nightly 6 UTC) ─► /api/sync/hyros-reconcile ► leads (finds Hyros leads GHL missed)
Windsor ─ cron (nightly 6 UTC) ► /api/sync/windsor ─────► windsor_ad_spend
Claude ─ cron (hourly) ───────► /api/sync/call-transcripts ► call_analyses (AI fields)
Calendly ─ webhook (instant) ─► /api/webhooks/calendly ──► leads.{intro,demo}_booked
```

**Crons are fired by a dedicated Railway service `ppm-cron`** that runs `cron-runner/run.sh` on a schedule. That service also must have `CRON_SECRET` and `DASHBOARD_URL` env vars — without them, every curl in the script gets 401'd.

**When `ppm-cron` is down, every non-webhook field ages.** That's exactly what happened Apr 18 → Apr 20: service was misconfigured as a Next.js app, never fired, and everything stopped refreshing.

---

## 3. Field-by-field lineage

### Lead identity
| Field | Source | Updated by | When |
|---|---|---|---|
| `email`, `phone`, `lead_name` | GHL contact | webhook + `ghl-contacts` cron | Instant + hourly |
| `ghl_contact_id` | GHL | webhook + cron | Instant + hourly |
| `date_opted_in` | GHL `dateAdded` (fresh) OR `dateUpdated` (re-engager) | `mapContactToLead` | Instant + hourly |
| `lead_source` | GHL `source` OR UTM source | webhook + cron | Instant + hourly |

### Attribution (paid ad info)
| Field | Source | Updated by | When |
|---|---|---|---|
| `campaign_id`, `ad_id`, `ad_set_id`, `campaign_name`, `ad_name`, `ad_set_name` | GHL `attributionSource` (Meta pixel) | webhook + cron | Instant + hourly |
| `hyros_paid` (derived) | `hyros_attribution.is_paid_ad` via email match | `/api/sync/hyros` | Hourly (recent) + nightly (full) |
| `is_paid_ad` (derived) | `hyros_paid` OR campaign_id set OR source regex match | `/api/leads` on read | Live |

### Lifecycle & outcome
| Field | Source | Updated by | When |
|---|---|---|---|
| `tags[]` | GHL contact tags | `mapContactToLead` + `enrichLeadFromGhl` | Instant + hourly |
| `pipeline_stage` | GHL opportunity `pipelineStageId` | `enrichLeadFromGhl` (stage webhook also updates) | Hourly + instant on stage change |
| `intro_booked`, `intro_booked_for_date`, `intro_closer` | GHL appointment in intro calendar | appointment webhook + `enrichLeadFromGhl` | Instant + hourly |
| `demo_booked`, `demo_booked_for_date`, `demo_assigned_closer` | GHL appointment in demo calendar | appointment webhook + `enrichLeadFromGhl` | Instant + hourly |
| `intro_show_status`, `demo_show_status` | GHL appointment `appointmentStatus` | appointment webhook + enrich | Instant + hourly |
| **Outcome classification** (noshow/cancelled/showed) | **GHL tags** (e.g. `demo-no-show`) — priority: cancelled > noshow > showed | `classifyFromTags()` at read time | Live (from tags in DB) |

### Revenue
| Field | Source | Updated by | When |
|---|---|---|---|
| `cash_collected` | GHL custom field `cash_collected` | `enrichLeadFromGhl` | Hourly |
| `contracted_mrr` | GHL custom field `three_month_payment` (new) or `total_contract_revenue` (old) | `enrichLeadFromGhl` | Hourly |
| `client_closed` | GHL opportunity with `status = 'won'` | `enrichLeadFromGhl` | Hourly |
| `hyros_revenue` (derived) | `hyros_attribution.revenue_attributed` via email match | `/api/sync/hyros` | Nightly full sweep |

### Ad spend
| Field | Source | Updated by | When |
|---|---|---|---|
| `windsor_ad_spend.spend` | Windsor.ai Meta spend | `/api/sync/windsor` | **Daily at 6 UTC only** |
| `windsor_ad_spend.impressions`, `clicks` | Windsor.ai | same | same |
| Daily spend backfill | `?from=X&to=Y` param on `/api/sync/windsor` | manual trigger | as needed |

### Calls
| Field | Source | Updated by | When |
|---|---|---|---|
| `call_analyses.raw_transcript` | GHL conversation messages OR NoteCreate webhook OR intro_call_transcript custom field | `/api/sync/calls-from-ghl` + webhook | Hourly + instant |
| `call_analyses.ai_summary`, `ai_lead_insights`, etc. | Claude Sonnet 4.6 analysis of transcript | `/api/sync/call-transcripts` | Every 30 min |

---

## 4. KPI formulas on the Dashboard

All computed client-side from the leads + windsor_ad_spend feed in `lib/kpis.ts`:

- **Total Spend** = `windsor_ad_spend.spend` summed over range
- **Total Leads** = count of leads with `date_opted_in` in range
- **CPL** = Spend / Leads
- **Intros Booked (Month)** = count of leads where `intro_booked_for_date` ∈ range
- **Intros Showed** = same, minus those with `demo-no-show` / `demo-cancelled` tag
- **Intro No-Show / Cancelled** = count of leads with `intro_booked_for_date` ∈ range AND matching tag
- **Lead → Intro %** = Intros Created / Total Leads
- **Intro Show Rate** = Intros Showed / Intros Booked
- **Cost / Shown Intro** = Spend / Intros Showed
- Demo variants: same formulas with demo fields
- **Clients Closed** = `client_closed = true` AND `demo_booked_for_date` ∈ range
- **Cash Collected** = sum of `cash_collected` on closed-in-period leads
- **ROAS Cash** = Cash Collected / Spend
- **ROAS LTV** = (Clients Closed × LTV_VALUE) / Spend

### Filter modes (top-right toggle)
- **All** — every lead in DB
- **Ads only** — any paid signal (campaign ID, source regex, or Hyros says paid)
- **Hyros ✓** (default) — only leads Hyros's pixel confirms as paid

---

## 5. Known fragility / what to watch

1. **`ppm-cron` service dying silently.** When misconfigured, Railway shows it as "Active" but it never fires. Monitor: check Railway → ppm-cron → Deployments; last deploy should be recent and show `cronSchedule: 0 * * * *`.

2. **GHL rate limit (100 req / 10s).** The `enrich` sweep hits GHL ~4× per lead; with 165 leads that's 660 calls. Rate limiter throttles to 80 tokens refilling at 8/sec. Enrich takes ~3 min. If GHL tightens limits, enrich will timeout.

3. **Re-engager blind spot.** A 2023 contact who fills the survey again has `dateAdded = 2023` — old sync logic ignored them. Current fix: `ghl-contacts` cron passes `new_lead` tag without a date filter. If that tag ever gets renamed, gap reopens.

4. **Hyros pagination.** Default `pageSize` caps silently at ~50 and omits the pagination cursor. Always pass `pageSize=250`. Already fixed in `lib/hyros.ts`.

5. **Windsor-spend-to-campaign join** is by campaign NAME (lowercased), not ID. Meta's 18-digit campaign IDs don't match GHL's 17-digit IDs. If a campaign name changes in Meta, the old spend orphans.

6. **Calendly webhook** depends on GHL/Calendly not double-recording the same booking. Currently CNameSync overwrites; no history is kept.

---

## 6. Quick sanity checklist

When something looks wrong:

| Symptom | First check |
|---|---|
| New leads not showing | Was `ghl-contacts` cron fired? `curl /api/sync/ghl-contacts` with CRON_SECRET |
| Appointment not on dashboard | Is lead in DB? Is intro/demo calendar ID in `GHL_INTRO_CALENDAR_IDS` env? |
| Ad spend stale | Did Windsor cron run at 6 UTC? Manual: `curl /api/sync/windsor` |
| Demo no-show wrong | Does the lead have `demo-no-show` tag in GHL? `tags` column must be populated |
| Hyros-filter empty | Does `/api/sync/hyros?recent=true` run hourly? |
| Reconciler recovering 0 | Normal when webhooks are flowing. Non-zero = real gap |
