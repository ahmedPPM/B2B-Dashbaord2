import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from('windsor_ad_spend')
    .select('*')
    .order('date', { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, spend: data || [] });
}
