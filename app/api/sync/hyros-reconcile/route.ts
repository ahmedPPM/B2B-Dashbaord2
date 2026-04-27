import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros, type HyrosLead } from '@/lib/hyros';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

const PPM_FB_ACCOUNT_ID = '696535455232096';

function isPPMLead(lead: HyrosLead): boolean {
  const src = (lead.firstSource || lead.lastSource || {}) as Record<string, unknown>;
  const adSource = (src.adSource || {}) as Record<string, string>;
  return adSource.adAccountId === PPM_FB_ACCOUNT_ID;
}

function mapHyrosOrphanToLead(lead: HyrosLead): Record<string, unknown> {
  const email = (lead.email || '').toLowerCase().trim();
  const src = (lead.firstSource || lead.lastSource || {}) as Record<string, unknown>;
  const adSource = (src.adSource || {}) as Record<string, string>;
  const sourceLinkAd = (src.sourceLinkAd || {}) as Record<string, string>;
  const trafficSource = (src.trafficSource || {}) as Record<string, string>;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || null;
  const phone = Array.isArray(lead.phoneNumbers) && lead.phoneNumbers.length ? lead.phoneNumbers[0] : null;
  return {
    ghl_contact_id: `hyros:${email}`,
    email,
    lead_name: name,
    phone: phone || null,
    date_opted_in: lead.creationDate || new Date().toISOString(),
    lead_source: trafficSource.name || adSource.platform || 'facebook',
    campaign_name: sourceLinkAd.name || null,
    backfilled: true,
    updated_at: new Date().toISOString(),
  };
}

export const maxDuration = 300;

// Hyros-driven reconciliation. Hyros is the source of truth for paid leads —
// this cron pulls Hyros's recent-leads list and makes sure every one of them
// lands in our DB, filling in via GHL when we're behind.
//
// Four states per Hyros lead:
//   - in DB           → no action
//   - in DB but missing GHL id → also try to link to a GHL contact
//   - not in DB, in GHL → upsert the GHL contact as a new lead
//   - not in DB, not in GHL → log as orphan (Hyros saw a click+opt-in that
//                              never made it to GHL — surface for manual fix)
export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || process.env.HYROS_RECONCILE_WINDOW_DAYS || '7');
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);
  const supa = supabaseAdmin();

  let hyrosLeads: Awaited<ReturnType<typeof hyros.listLeads>> = [];
  try {
    hyrosLeads = await hyros.listLeads({ fromDate, toDate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `hyros listLeads: ${String(e)}` }, { status: 500 });
  }

  const hyrosEmails = Array.from(
    new Set(
      hyrosLeads
        .map((l) => (l.email || '').toLowerCase().trim())
        .filter((e) => e && e.includes('@')),
    ),
  );
  if (!hyrosEmails.length) {
    return NextResponse.json({ ok: true, from: fromDate, to: toDate, hyros_leads: 0, recovered: 0, orphans: [] });
  }

  // Mark every email Hyros reported as in_hyros_list=true so Hyros mode
  // filters to exactly the cohort Hyros knows about.
  for (const email of hyrosEmails) {
    await supa
      .from('hyros_attribution')
      .upsert({ email, in_hyros_list: true, synced_at: new Date().toISOString() }, { onConflict: 'email' });
  }

  // Which Hyros emails already live in our DB?
  const { data: known } = await supa.from('leads').select('email').in('email', hyrosEmails);
  const knownSet = new Set((known || []).map((r) => (r.email || '').toLowerCase()));

  const missingEmails = hyrosEmails.filter((e) => !knownSet.has(e));

  let recovered = 0;
  let recoveredFromHyros = 0;
  const orphans: Array<{ email: string; reason: string }> = [];

  // Build a map of ALL Hyros leads keyed by email for orphan fallback.
  const hyrosLeadByEmail = new Map(
    hyrosLeads.map((l) => [(l.email || '').toLowerCase().trim(), l])
  );

  // Only upsert from Hyros for emails that are confirmed PPM leads (in_hyros_list).
  // This prevents consumer/homeowner leads that clicked the B2B ad from polluting the DB.
  const { data: hyrosListRows } = await supa
    .from('hyros_attribution')
    .select('email')
    .eq('in_hyros_list', true);
  const hyrosListSet = new Set((hyrosListRows || []).map((r) => (r.email || '').toLowerCase()));

  for (const email of missingEmails) {
    try {
      const { contacts } = await ghl.searchContactByEmail(email);
      const c = contacts?.[0];
      if (c?.id) {
        const row = mapContactToLead(c);
        const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
        if (error) {
          orphans.push({ email, reason: `upsert failed: ${error.message}` });
        } else {
          recovered++;
        }
        continue;
      }

      // Not in GHL — only upsert from Hyros if email is a confirmed PPM seed lead
      const hyrosLead = hyrosLeadByEmail.get(email);
      if (hyrosLead && hyrosListSet.has(email)) {
        const row = mapHyrosOrphanToLead(hyrosLead);
        const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
        if (error) {
          orphans.push({ email, reason: `hyros upsert failed: ${error.message}` });
        } else {
          recoveredFromHyros++;
        }
      } else {
        orphans.push({ email, reason: 'not in GHL, not in confirmed PPM seed list' });
      }
    } catch (e) {
      orphans.push({ email, reason: `error: ${String(e).slice(0, 120)}` });
    }
  }

  return NextResponse.json({
    ok: true,
    from: fromDate,
    to: toDate,
    hyros_leads: hyrosLeads.length,
    hyros_unique_emails: hyrosEmails.length,
    already_in_db: hyrosEmails.length - missingEmails.length,
    recovered,
    recovered_from_hyros: recoveredFromHyros,
    orphans,
  });
}
