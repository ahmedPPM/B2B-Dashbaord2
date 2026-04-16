import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Flattens a lead's intro + demo bookings into a unified appointment list.
// One lead can produce 0, 1, or 2 appointments.
export interface AppointmentRow {
  id: string;                 // `${lead_id}:${type}`
  lead_id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  type: 'intro' | 'demo';
  booked_for: string | null;  // when the call is scheduled
  created_at: string | null;  // when it was booked
  status: string | null;      // show status (Scheduled / Showed / No-show / Cancelled)
  closer: string | null;
  assigned_user_name: string | null;
  campaign_name: string | null;
  campaign_id: string | null;
  lead_source: string | null;
  outcome: string | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const supa = supabaseAdmin();
  const { data: leads, error } = await supa
    .from('leads')
    .select(`
      id, lead_name, email, phone,
      intro_booked, intro_booked_for_date, intro_created_date, intro_show_status, intro_closer, intro_call_outcome,
      demo_booked, demo_booked_for_date, demo_created_date, demo_show_status, demo_assigned_closer, demo_call_outcome,
      assigned_user_name, campaign_name, campaign_id, lead_source
    `)
    .is('deleted_at', null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows: AppointmentRow[] = [];
  for (const l of leads || []) {
    if (l.intro_booked && l.intro_booked_for_date) {
      rows.push({
        id: `${l.id}:intro`,
        lead_id: l.id,
        lead_name: l.lead_name,
        email: l.email,
        phone: l.phone,
        type: 'intro',
        booked_for: l.intro_booked_for_date,
        created_at: l.intro_created_date,
        status: l.intro_show_status,
        closer: l.intro_closer,
        assigned_user_name: l.assigned_user_name,
        campaign_name: l.campaign_name,
        campaign_id: l.campaign_id,
        lead_source: l.lead_source,
        outcome: l.intro_call_outcome,
      });
    }
    if (l.demo_booked && l.demo_booked_for_date) {
      rows.push({
        id: `${l.id}:demo`,
        lead_id: l.id,
        lead_name: l.lead_name,
        email: l.email,
        phone: l.phone,
        type: 'demo',
        booked_for: l.demo_booked_for_date,
        created_at: l.demo_created_date,
        status: l.demo_show_status,
        closer: l.demo_assigned_closer,
        assigned_user_name: l.assigned_user_name,
        campaign_name: l.campaign_name,
        campaign_id: l.campaign_id,
        lead_source: l.lead_source,
        outcome: l.demo_call_outcome,
      });
    }
  }

  let filtered = rows;
  if (from) filtered = filtered.filter((r) => !r.booked_for || r.booked_for >= from);
  if (to) filtered = filtered.filter((r) => !r.booked_for || r.booked_for <= `${to}T23:59:59Z`);

  // Status classifiers — default to SHOWED unless explicitly no-show or cancelled.
  // (Policy: Eraldi marks only failures; unmarked / Scheduled / confirmed → showed.)
  const isNo = (s: string | null) => {
    const v = (s || '').toLowerCase();
    return v.includes('no') && v.includes('show');
  };
  const isCancel = (s: string | null) => (s || '').toLowerCase().includes('cancel');
  const isShown = (s: string | null) => !isNo(s) && !isCancel(s);

  // Campaign breakdown: how many appts per campaign
  const byCampaign = new Map<string, { campaign_name: string; total: number; intros: number; demos: number; showed: number; noshow: number; cancelled: number }>();
  for (const r of filtered) {
    const name = r.campaign_name || 'Unattributed';
    const key = name.trim().toLowerCase();
    const row = byCampaign.get(key) || { campaign_name: name, total: 0, intros: 0, demos: 0, showed: 0, noshow: 0, cancelled: 0 };
    row.total++;
    if (r.type === 'intro') row.intros++;
    else row.demos++;
    if (isNo(r.status)) row.noshow++;
    else if (isCancel(r.status)) row.cancelled++;
    else row.showed++;
    byCampaign.set(key, row);
  }
  const campaigns = Array.from(byCampaign.values()).sort((a, b) => b.total - a.total);

  return NextResponse.json({ ok: true, rows: filtered, campaigns, totals: {
    total: filtered.length,
    intros: filtered.filter((r) => r.type === 'intro').length,
    demos: filtered.filter((r) => r.type === 'demo').length,
    showed: filtered.filter((r) => isShown(r.status)).length,
    noshow: filtered.filter((r) => isNo(r.status)).length,
    cancelled: filtered.filter((r) => isCancel(r.status)).length,
    upcoming: filtered.filter((r) => r.booked_for && r.booked_for > new Date().toISOString()).length,
  } });
}
