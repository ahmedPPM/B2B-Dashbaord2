import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { annotateLeads } from '@/lib/pipelines';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const supa = supabaseAdmin();
  const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
  let q = supa.from('leads').select('*').order('date_opted_in', { ascending: false }).limit(2000);
  if (!includeDeleted) q = q.is('deleted_at', null);

  const stage = url.searchParams.get('stage');
  const score = url.searchParams.get('score');
  const closed = url.searchParams.get('closed');
  const paidOnly = url.searchParams.get('paid') === 'true'; // default: all leads

  if (stage) q = q.eq('pipeline_stage', stage);
  if (score) q = q.eq('app_grading', parseInt(score, 10));
  if (closed === 'yes') q = q.eq('client_closed', true);
  if (closed === 'no') q = q.eq('client_closed', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let leads = data || [];

  // Attach Hyros attribution + is_paid_ad to each lead
  const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
  const { data: hyrosRows } = await supa
    .from('hyros_attribution')
    .select('email, is_paid_ad, in_hyros_list, traffic_source, ad_platform, ad_name, revenue_attributed, organic')
    .in('email', emails);
  const hyrosByEmail = new Map((hyrosRows || []).map((r) => [r.email, r]));

  leads = leads.map((l) => {
    const h = hyrosByEmail.get((l.email || '').toLowerCase());
    // hyros_paid = true when this lead appears in Hyros's leads list.
    // This is what drives the Hyros mode filter — strictly the cohort Hyros
    // reported, not a loose "paid platform" heuristic.
    const hyrosPaid = !!(h?.in_hyros_list);
    const ghlPaid = !!l.campaign_id;
    const sourceLooksPaid = /facebook|meta|google|tiktok|youtube|instagram/i.test(l.lead_source || '');
    const is_paid_ad = hyrosPaid || !!(h?.is_paid_ad) || ghlPaid || sourceLooksPaid;
    return {
      ...l,
      hyros_paid: hyrosPaid,
      hyros_traffic_source: h?.traffic_source || null,
      hyros_ad_platform: h?.ad_platform || null,
      hyros_ad_name: h?.ad_name || null,
      hyros_revenue: h?.revenue_attributed || 0,
      is_paid_ad,
    };
  });

  if (paidOnly) {
    leads = leads.filter((l) => l.is_paid_ad);
  }

  try {
    leads = await annotateLeads(leads);
  } catch (e) {
    console.error('annotateLeads', e);
  }
  return NextResponse.json({ ok: true, leads });
}
