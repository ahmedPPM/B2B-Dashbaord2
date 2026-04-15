import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { resolveAssignedUserNames } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

// First populates `assigned_user_id` on existing leads from GHL (if missing),
// then resolves IDs to names.
export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const supa = supabaseAdmin();
  const { data: leads } = await supa
    .from('leads')
    .select('id, ghl_contact_id, assigned_user_id')
    .not('ghl_contact_id', 'is', null);

  let fetched = 0;
  for (const l of leads || []) {
    if (l.assigned_user_id) continue;
    try {
      const { contact } = await ghl.getContact(l.ghl_contact_id as string);
      if (contact?.assignedTo) {
        await supa.from('leads').update({ assigned_user_id: contact.assignedTo }).eq('id', l.id);
        fetched++;
      }
      await ghl.sleep(60);
    } catch (e) {
      console.error('closers fetch', l.ghl_contact_id, e);
    }
  }

  const namesUpdated = await resolveAssignedUserNames();
  return NextResponse.json({ ok: true, fetched, namesUpdated });
}
