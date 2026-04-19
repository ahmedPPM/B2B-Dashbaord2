import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { classifyFromTags } from '@/lib/tag-classify';

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
  hyros_paid: boolean;        // true if this lead is confirmed paid by Hyros
  is_paid_ad: boolean;        // any paid signal (campaign / source regex / hyros)
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const supa = supabaseAdmin();
  const [leadsRes, hyrosRes] = await Promise.all([
    supa
      .from('leads')
      .select(`
        id, lead_name, email, phone, tags,
        intro_booked, intro_booked_for_date, intro_created_date, intro_show_status, intro_closer, intro_call_outcome,
        demo_booked, demo_booked_for_date, demo_created_date, demo_show_status, demo_assigned_closer, demo_call_outcome,
        assigned_user_name, campaign_name, campaign_id, lead_source
      `)
      .is('deleted_at', null),
    supa.from('hyros_attribution').select('email, is_paid_ad'),
  ]);
  const { data: leads, error } = leadsRes;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const hyrosPaidEmails = new Set<string>(
    (hyrosRes.data || []).filter((h) => h.is_paid_ad === true).map((h) => (h.email || '').toLowerCase()),
  );

  // Resolve each lead's intro/demo outcome from GHL tags (cancelled > noshow
  // > showed). Fallback to the status string only when no tags are set yet.
  const outcomeFor = (tags: string[] | null, kind: 'intro' | 'demo', fallback: string | null): 'cancelled' | 'noshow' | 'showed' => {
    const t = classifyFromTags(tags, kind);
    if (t === 'cancelled') return 'cancelled';
    if (t === 'noshow') return 'noshow';
    if (t === 'showed') return 'showed';
    const s = (fallback || '').toLowerCase();
    if (s.includes('cancel')) return 'cancelled';
    if (s.includes('no') && s.includes('show')) return 'noshow';
    return 'showed';
  };

  interface LeadWithTags {
    id: string; lead_name: string | null; email: string | null; phone: string | null;
    tags: string[] | null;
    intro_booked: boolean; intro_booked_for_date: string | null; intro_created_date: string | null;
    intro_show_status: string | null; intro_closer: string | null; intro_call_outcome: string | null;
    demo_booked: boolean; demo_booked_for_date: string | null; demo_created_date: string | null;
    demo_show_status: string | null; demo_assigned_closer: string | null; demo_call_outcome: string | null;
    assigned_user_name: string | null; campaign_name: string | null; campaign_id: string | null;
    lead_source: string | null;
  }
  const paidRx = /facebook|meta|google|tiktok|instagram|youtube|paid|fb\b/i;
  type RowWithOutcome = AppointmentRow & { outcome_class: 'cancelled' | 'noshow' | 'showed' };
  const rows: RowWithOutcome[] = [];
  for (const l of (leads || []) as LeadWithTags[]) {
    const emailKey = (l.email || '').toLowerCase();
    const hyros_paid = emailKey ? hyrosPaidEmails.has(emailKey) : false;
    const is_paid_ad = hyros_paid || !!l.campaign_id || !!l.campaign_name || paidRx.test(l.lead_source || '');
    if (l.intro_booked && l.intro_booked_for_date) {
      const cls = outcomeFor(l.tags, 'intro', l.intro_show_status);
      rows.push({
        id: `${l.id}:intro`,
        lead_id: l.id,
        lead_name: l.lead_name,
        email: l.email,
        phone: l.phone,
        type: 'intro',
        booked_for: l.intro_booked_for_date,
        created_at: l.intro_created_date,
        status: cls === 'cancelled' ? 'Cancelled' : cls === 'noshow' ? 'No-show' : (l.intro_show_status || 'Showed'),
        closer: l.intro_closer,
        assigned_user_name: l.assigned_user_name,
        campaign_name: l.campaign_name,
        campaign_id: l.campaign_id,
        lead_source: l.lead_source,
        outcome: l.intro_call_outcome,
        outcome_class: cls,
        hyros_paid,
        is_paid_ad,
      });
    }
    if (l.demo_booked && l.demo_booked_for_date) {
      const cls = outcomeFor(l.tags, 'demo', l.demo_show_status);
      rows.push({
        id: `${l.id}:demo`,
        lead_id: l.id,
        lead_name: l.lead_name,
        email: l.email,
        phone: l.phone,
        type: 'demo',
        booked_for: l.demo_booked_for_date,
        created_at: l.demo_created_date,
        status: cls === 'cancelled' ? 'Cancelled' : cls === 'noshow' ? 'No-show' : (l.demo_show_status || 'Showed'),
        closer: l.demo_assigned_closer,
        assigned_user_name: l.assigned_user_name,
        campaign_name: l.campaign_name,
        campaign_id: l.campaign_id,
        lead_source: l.lead_source,
        outcome: l.demo_call_outcome,
        outcome_class: cls,
        hyros_paid,
        is_paid_ad,
      });
    }
  }

  let filtered = rows;
  if (from) filtered = filtered.filter((r) => !r.booked_for || r.booked_for >= from);
  if (to) filtered = filtered.filter((r) => !r.booked_for || r.booked_for <= `${to}T23:59:59Z`);

  const byCampaign = new Map<string, { campaign_name: string; total: number; intros: number; demos: number; showed: number; noshow: number; cancelled: number }>();
  for (const r of filtered) {
    const name = r.campaign_name || 'Unattributed';
    const key = name.trim().toLowerCase();
    const row = byCampaign.get(key) || { campaign_name: name, total: 0, intros: 0, demos: 0, showed: 0, noshow: 0, cancelled: 0 };
    row.total++;
    if (r.type === 'intro') row.intros++;
    else row.demos++;
    if (r.outcome_class === 'noshow') row.noshow++;
    else if (r.outcome_class === 'cancelled') row.cancelled++;
    else row.showed++;
    byCampaign.set(key, row);
  }
  const campaigns = Array.from(byCampaign.values()).sort((a, b) => b.total - a.total);

  return NextResponse.json({ ok: true, rows: filtered, campaigns, totals: {
    total: filtered.length,
    intros: filtered.filter((r) => r.type === 'intro').length,
    demos: filtered.filter((r) => r.type === 'demo').length,
    showed: filtered.filter((r) => r.outcome_class === 'showed').length,
    noshow: filtered.filter((r) => r.outcome_class === 'noshow').length,
    cancelled: filtered.filter((r) => r.outcome_class === 'cancelled').length,
    upcoming: filtered.filter((r) => r.booked_for && r.booked_for > new Date().toISOString()).length,
  } });
}
