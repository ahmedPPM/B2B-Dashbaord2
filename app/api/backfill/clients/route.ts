import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl, type GHLContact } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

// Imports contacts tagged `won_client` from GHL, including historical pre-2026
// clients that the main backfill filters out. Marks them client_closed=true.
export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const supa = supabaseAdmin();
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  try {
    let page = 1;
    const all: GHLContact[] = [];
    while (true) {
      const { contacts } = await ghl.getContacts({ tags: ['won_client'], limit: 100, page });
      if (!contacts?.length) break;
      all.push(...contacts);
      if (contacts.length < 100) break;
      page++;
    }

    for (const c of all) {
      const row = mapContactToLead(c);
      const now = new Date().toISOString();
      const patch = { ...row, client_closed: true, client_closed_date: now };

      const { data: existing } = await supa
        .from('leads')
        .select('id, client_closed, client_closed_date')
        .eq('ghl_contact_id', c.id)
        .maybeSingle();

      if (existing) {
        const upd: Record<string, unknown> = { client_closed: true };
        if (!existing.client_closed_date) upd.client_closed_date = now;
        await supa.from('leads').update(upd).eq('id', existing.id);
        if (!existing.client_closed) updated++;
      } else {
        const { error } = await supa.from('leads').insert(patch);
        if (error) errors.push(`${c.id}: ${error.message}`);
        else imported++;
      }
      await ghl.sleep(60);
    }

    return NextResponse.json({ ok: true, imported, updated, total: all.length, errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
