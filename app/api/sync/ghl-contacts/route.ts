import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const supa = supabaseAdmin();
  let upserted = 0;

  try {
    for (const tag of ['b2b typeform optin', 'new_lead']) {
      const { contacts } = await ghl.getContacts({ tags: [tag], startAfterDate: since, limit: 100 });
      for (const c of contacts || []) {
        const row = mapContactToLead(c);
        const { error } = await supa.from('leads').upsert(row, { onConflict: 'ghl_contact_id' });
        if (!error) upserted++;
      }
    }
    return NextResponse.json({ ok: true, upserted });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
