import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeKpis } from '@/lib/kpis';
import type { Lead, WindsorRow } from '@/lib/types';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get('from') || `${new Date().getFullYear()}-01-01`;
  const toStr = url.searchParams.get('to') || `${new Date().getFullYear()}-12-31`;
  const from = new Date(fromStr);
  const to = new Date(`${toStr}T23:59:59Z`);

  const supa = supabaseAdmin();
  const [{ data: leads }, { data: spend }] = await Promise.all([
    supa.from('leads').select('*').limit(5000),
    supa.from('windsor_ad_spend').select('*').gte('date', fromStr).lte('date', toStr),
  ]);

  const stats = computeKpis((leads || []) as Lead[], (spend || []) as WindsorRow[], { from, to });
  return NextResponse.json({ ok: true, stats, range: { from: fromStr, to: toStr } });
}
