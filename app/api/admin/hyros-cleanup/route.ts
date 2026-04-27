import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 60;

// Cleanup after the reconcile over-insertion incident.
// 1. Deletes ALL leads with synthetic hyros: contact IDs.
// 2. Resets in_hyros_list=false for all hyros_attribution rows.
//    (hyros-list sync will re-seed the correct PPM-account-only set.)
//
// GET ?manual=1            — dry run
// GET ?manual=1&confirm=1  — execute

export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const confirm = url.searchParams.get('confirm') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();

  const { data: hyrosLeads, error: fetchErr } = await supa
    .from('leads')
    .select('id, email, lead_name')
    .like('ghl_contact_id', 'hyros:%');

  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  const toDelete = hyrosLeads || [];

  const { count: flaggedCount } = await supa
    .from('hyros_attribution')
    .select('email', { count: 'exact', head: true })
    .eq('in_hyros_list', true);

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      leads_to_delete: toDelete.length,
      hyros_list_flags_to_reset: flaggedCount,
      sample: toDelete.slice(0, 10).map((l) => ({ email: l.email, name: l.lead_name })),
    });
  }

  // 1. Delete all hyros: leads
  const ids = toDelete.map((l) => l.id);
  let deleted = 0;
  const errors: string[] = [];
  if (ids.length) {
    const { error: delErr, count } = await supa
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (delErr) errors.push(`delete leads: ${delErr.message}`);
    else deleted = count || ids.length;
  }

  // 2. Reset in_hyros_list for all rows (hyros-list sync will re-seed correctly)
  const { error: resetErr } = await supa
    .from('hyros_attribution')
    .update({ in_hyros_list: false })
    .eq('in_hyros_list', true);
  if (resetErr) errors.push(`reset flags: ${resetErr.message}`);

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    flags_reset: flaggedCount,
    errors,
    next_step: 'Run GET /api/sync/hyros-list?manual=1 to re-seed the correct PPM leads, then /api/sync/hyros-reconcile to recover any orphans.',
  });
}
