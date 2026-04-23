import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const supa = supabaseAdmin();

  const [ghlRes, windsorRes, calendlyRes, hyrosRes] = await Promise.allSettled([
    supa.from('leads').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    supa.from('windsor_ad_spend').select('updated_at, date').order('updated_at', { ascending: false }).limit(1),
    supa.from('call_analyses').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    supa.from('hyros_attribution').select('synced_at').order('synced_at', { ascending: false }).limit(1),
  ]);

  const extractTime = (result: PromiseSettledResult<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>, field: string): string | null => {
    if (result.status !== 'fulfilled') return null;
    const { data, error } = result.value;
    if (error || !data || data.length === 0) return null;
    return (data[0][field] as string | null) || null;
  };

  // Windsor fallback: if no updated_at, use date field
  let windsorTime = extractTime(windsorRes as PromiseSettledResult<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>, 'updated_at');
  if (!windsorTime && windsorRes.status === 'fulfilled') {
    const d = windsorRes.value.data;
    if (d && d.length > 0) windsorTime = (d[0]['date'] as string | null) || null;
  }

  return NextResponse.json({
    ok: true,
    sources: [
      {
        name: 'GoHighLevel',
        key: 'ghl',
        last_sync: extractTime(ghlRes as PromiseSettledResult<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>, 'updated_at'),
      },
      {
        name: 'Windsor AI',
        key: 'windsor',
        last_sync: windsorTime,
      },
      {
        name: 'Calendly / GHL Calls',
        key: 'calendly',
        last_sync: extractTime(calendlyRes as PromiseSettledResult<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>, 'updated_at'),
      },
      {
        name: 'Hyros',
        key: 'hyros',
        last_sync: extractTime(hyrosRes as PromiseSettledResult<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>, 'synced_at'),
      },
    ],
  });
}
