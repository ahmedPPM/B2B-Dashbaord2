import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const supa = supabaseAdmin();
  let q = supa.from('leads').select('*').order('date_opted_in', { ascending: false }).limit(1000);

  const stage = url.searchParams.get('stage');
  const score = url.searchParams.get('score');
  const closed = url.searchParams.get('closed');

  if (stage) q = q.eq('pipeline_stage', stage);
  if (score) q = q.eq('app_grading', parseInt(score, 10));
  if (closed === 'yes') q = q.eq('client_closed', true);
  if (closed === 'no') q = q.eq('client_closed', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, leads: data || [] });
}
