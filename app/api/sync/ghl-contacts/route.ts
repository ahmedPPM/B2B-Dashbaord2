import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 24h window — catches stragglers whose tag was added late,
  // or contacts the webhook missed entirely.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const supa = supabaseAdmin();
  const seen = new Set<string>();
  let upserted = 0;

  try {
    // Still scan tagged contacts (fast path) AND the untagged date window (catch-all).
    const queries: Array<Parameters<typeof ghl.getContacts>[0]> = [
      { tags: ['b2b typeform optin'], startAfterDate: since, limit: 100 },
      { tags: ['new_lead'], startAfterDate: since, limit: 100 },
      { startAfterDate: since, limit: 100 },
    ];
    for (const q of queries) {
      const { contacts } = await ghl.getContacts(q);
      for (const c of contacts || []) {
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        const row = mapContactToLead(c);
        const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
        if (!error) upserted++;
      }
    }
    return NextResponse.json({ ok: true, upserted, scanned: seen.size });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
