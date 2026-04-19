import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros } from '@/lib/hyros';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

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

  // Which Hyros emails already live in our DB?
  const { data: known } = await supa.from('leads').select('email').in('email', hyrosEmails);
  const knownSet = new Set((known || []).map((r) => (r.email || '').toLowerCase()));

  const missingEmails = hyrosEmails.filter((e) => !knownSet.has(e));

  let recovered = 0;
  const orphans: Array<{ email: string; reason: string }> = [];

  for (const email of missingEmails) {
    try {
      const { contacts } = await ghl.searchContactByEmail(email);
      const c = contacts?.[0];
      if (!c?.id) {
        orphans.push({ email, reason: 'not in GHL' });
        continue;
      }
      const row = mapContactToLead(c);
      const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
      if (error) {
        orphans.push({ email, reason: `upsert failed: ${error.message}` });
      } else {
        recovered++;
      }
    } catch (e) {
      orphans.push({ email, reason: `ghl search error: ${String(e).slice(0, 120)}` });
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
    orphans,
  });
}
