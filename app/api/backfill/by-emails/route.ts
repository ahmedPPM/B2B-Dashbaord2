import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

// Enrich-only: for each email, look up the lead in Supabase. If it exists,
// refresh its fields from GHL. Never creates new leads.
export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const { emails } = (await req.json()) as { emails: string[] };
  if (!Array.isArray(emails)) {
    return NextResponse.json({ ok: false, error: 'emails[] required' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const enriched: string[] = [];
  const notInDb: string[] = [];
  const notInGhl: string[] = [];

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const { data: existing } = await supa
      .from('leads')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!existing) {
      notInDb.push(email);
      continue;
    }

    try {
      const { contacts } = await ghl.searchContactByEmail(email);
      const c = (contacts || [])[0];
      if (!c) {
        notInGhl.push(email);
        continue;
      }
      const row = mapContactToLead(c);
      // Never clobber id; update-only patch
      delete (row as Record<string, unknown>).id;
      await supa.from('leads').update(row).eq('id', existing.id);
      enriched.push(email);
      await ghl.sleep(80);
    } catch (e) {
      console.error('by-emails enrich failed', email, e);
      notInGhl.push(email);
    }
  }

  return NextResponse.json({ ok: true, enriched, notInDb, notInGhl });
}
