import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 60;

// One-time cleanup: delete leads with synthetic hyros: contact IDs that are NOT
// in the confirmed hyros_attribution seed list (in_hyros_list = true).
// These were accidentally inserted during a reconcile run that lacked the seed filter.
// GET /api/admin/hyros-cleanup?manual=1   (dry run — shows what would be deleted)
// GET /api/admin/hyros-cleanup?manual=1&confirm=1  (actually deletes)

export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const confirm = url.searchParams.get('confirm') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();

  // All leads with synthetic hyros: contact IDs
  const { data: hyrosLeads, error: fetchErr } = await supa
    .from('leads')
    .select('id, ghl_contact_id, email, lead_name, date_opted_in')
    .like('ghl_contact_id', 'hyros:%');

  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  const all = hyrosLeads || [];

  // Confirmed PPM seed leads (in_hyros_list = true)
  const emails = all.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
  const { data: seedRows } = emails.length
    ? await supa.from('hyros_attribution').select('email').eq('in_hyros_list', true).in('email', emails)
    : { data: [] };
  const seedSet = new Set((seedRows || []).map((r) => (r.email || '').toLowerCase()));

  const toKeep = all.filter((l) => seedSet.has((l.email || '').toLowerCase()));
  const toDelete = all.filter((l) => !seedSet.has((l.email || '').toLowerCase()));

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      total_hyros_leads: all.length,
      would_keep: toKeep.length,
      would_delete: toDelete.length,
      sample_delete: toDelete.slice(0, 20).map((l) => ({ email: l.email, name: l.lead_name })),
    });
  }

  // Delete the non-seed ones
  const ids = toDelete.map((l) => l.id);
  let deleted = 0;
  const errors: string[] = [];
  if (ids.length) {
    const { error: delErr, count } = await supa
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (delErr) errors.push(delErr.message);
    else deleted = count || ids.length;
  }

  return NextResponse.json({
    ok: true,
    deleted,
    kept: toKeep.length,
    kept_emails: toKeep.map((l) => l.email),
    errors,
  });
}
