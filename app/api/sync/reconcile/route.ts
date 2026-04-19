import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

export const maxDuration = 300;

// Nightly reconciliation — compares every GHL contact touched in the last
// `RECONCILE_WINDOW_DAYS` days (updated OR added OR tagged `new_lead`)
// against our leads table and upserts anything the webhook + hourly cron
// somehow missed. Returns the diff so it can be monitored.
export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const windowDays = Number(process.env.RECONCILE_WINDOW_DAYS || '7');
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const supa = supabaseAdmin();

  const seen = new Set<string>();
  const toInsert: Array<Record<string, unknown>> = [];
  let inspected = 0;
  let recovered = 0;

  const passes: Array<Parameters<typeof ghl.getContacts>[0]> = [
    { tags: ['new_lead'], limit: 200 },
    { startAfterUpdatedDate: since, limit: 200 },
    { startAfterDate: since, limit: 200 },
  ];

  try {
    for (const params of passes) {
      const { contacts } = await ghl.getContacts(params);
      for (const c of contacts || []) {
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        inspected++;

        const { data: existing } = await supa
          .from('leads')
          .select('id, email')
          .eq('ghl_contact_id', c.id)
          .maybeSingle();
        if (existing) continue;

        const row = mapContactToLead(c);
        toInsert.push(row);
      }
    }

    for (const row of toInsert) {
      const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
      if (!error) recovered++;
    }

    return NextResponse.json({
      ok: true,
      window_days: windowDays,
      inspected,
      recovered,
      recovered_ids: toInsert.map((r) => r.ghl_contact_id),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
