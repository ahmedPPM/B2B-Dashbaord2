import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const leadId = url.searchParams.get('leadId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 1000);
  const supa = supabaseAdmin();
  let q = supa.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (leadId) q = q.eq('lead_id', leadId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const leadIds = Array.from(new Set((data || []).map((r) => r.lead_id).filter(Boolean)));
  const { data: leads } = leadIds.length
    ? await supa.from('leads').select('id, lead_name, email, deleted_at').in('id', leadIds)
    : { data: [] };
  const leadsById = new Map((leads || []).map((l) => [l.id, l]));

  const rows = (data || []).map((r) => ({
    ...r,
    lead: r.lead_id ? leadsById.get(r.lead_id) || null : null,
  }));
  return NextResponse.json({ ok: true, rows });
}
