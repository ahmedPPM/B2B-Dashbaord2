import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const supa = supabaseAdmin();
  const [{ count: totalLeads }, { count: calls }, { count: pending }, { data: lastRun }] = await Promise.all([
    supa.from('leads').select('*', { count: 'exact', head: true }),
    supa.from('call_analyses').select('*', { count: 'exact', head: true }),
    supa.from('call_analyses').select('*', { count: 'exact', head: true }).is('analyzed_at', null),
    supa.from('backfill_runs').select('total_skipped').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return NextResponse.json({
    ok: true,
    totalLeads: totalLeads || 0,
    skipped: lastRun?.total_skipped || 0,
    calls: calls || 0,
    pending: pending || 0,
  });
}
