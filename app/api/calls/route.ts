import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Returns leads who have at least one call, each with their calls attached.
export async function GET() {
  const supa = supabaseAdmin();

  const { data: calls, error } = await supa
    .from('call_analyses')
    .select('*')
    .order('call_date', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const leadIds = Array.from(new Set((calls || []).map((c) => c.lead_id).filter(Boolean) as string[]));
  const { data: leads } = leadIds.length
    ? await supa
        .from('leads')
        .select('id, ghl_contact_id, lead_name, email, phone, assigned_user_name, campaign_name, pipeline_stage, intro_closer, demo_assigned_closer, date_opted_in')
        .in('id', leadIds)
        .is('deleted_at', null)
    : { data: [] };

  const callsByLead = new Map<string, typeof calls>();
  for (const c of calls || []) {
    if (!c.lead_id) continue;
    const arr = callsByLead.get(c.lead_id) || [];
    arr.push(c);
    callsByLead.set(c.lead_id, arr);
  }

  const rows = (leads || [])
    .map((l) => {
      const leadCalls = callsByLead.get(l.id) || [];
      return {
        ...l,
        calls: leadCalls,
        call_count: leadCalls.length,
        analyzed_count: leadCalls.filter((c) => c.ai_summary).length,
        last_call_date: leadCalls[0]?.call_date || null,
        has_intro: leadCalls.some((c) => c.call_type === 'intro'),
        has_demo: leadCalls.some((c) => c.call_type === 'demo'),
      };
    })
    .sort((a, b) => (b.last_call_date || '').localeCompare(a.last_call_date || ''));

  return NextResponse.json({ ok: true, rows });
}
