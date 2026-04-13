import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';

export async function POST(req: Request) {
  const { emails } = (await req.json()) as { emails: string[] };
  if (!Array.isArray(emails)) {
    return NextResponse.json({ ok: false, error: 'emails[] required' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const imported: string[] = [];
  const skipped: string[] = [];
  const notFound: string[] = [];

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const { data: existing } = await supa
      .from('leads')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      skipped.push(email);
      continue;
    }

    try {
      const { contacts } = await ghl.searchContactByEmail(email);
      const c = (contacts || [])[0];
      if (!c) {
        notFound.push(email);
        continue;
      }
      const row = mapContactToLead(c);
      await supa.from('leads').insert(row);
      imported.push(email);
      await ghl.sleep(80);
    } catch (e) {
      console.error('by-emails probe failed', email, e);
      notFound.push(email);
    }
  }

  return NextResponse.json({ ok: true, imported, skipped, notFound });
}
