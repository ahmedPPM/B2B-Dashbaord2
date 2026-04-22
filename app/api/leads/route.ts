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

  // Attach Hyros attribution + is_paid_ad to each lead.
  // Try to include in_hyros_list; if the column doesn't exist yet (migration
  // pending) the query returns an error — fall back to the column-safe select.
  const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
  let { data: hyrosRows, error: hyrosErr } = await supa
    .from('hyros_attribution')
    .select('email, is_paid_ad, in_hyros_list, traffic_source, ad_platform, ad_name, revenue_attributed, organic')
    .in('email', emails);
  if (hyrosErr) {
    // Column likely missing — fall back without in_hyros_list
    const fallback = await supa
      .from('hyros_attribution')
      .select('email, is_paid_ad, traffic_source, ad_platform, ad_name, revenue_attributed, organic')
      .in('email', emails);
    hyrosRows = fallback.data;
  }
  const hyrosByEmail = new Map((hyrosRows || []).map((r) => [r.email, r]));

  leads = leads.map((l) => {
    const h = hyrosByEmail.get((l.email || '').toLowerCase()) as Record<string, unknown> | undefined;
    // hyros_paid = in_hyros_list once the column exists and is seeded.
    // Falls back to is_paid_ad until the migration runs.
    const inList = h != null && 'in_hyros_list' in h ? !!(h.in_hyros_list) : null;
    const hyrosPaid = inList !== null ? inList : !!(h?.is_paid_ad);
    const ghlPaid = !!l.campaign_id;
    const sourceLooksPaid = /facebook|meta|google|tiktok|youtube|instagram/i.test(l.lead_source || '');
    const is_paid_ad = hyrosPaid || !!(h?.is_paid_ad) || ghlPaid || sourceLooksPaid;
    return {
      ...l,
      hyros_paid: hyrosPaid,
      hyros_traffic_source: (h?.traffic_source as string) || null,
      hyros_ad_platform: (h?.ad_platform as string) || null,
      hyros_ad_name: (h?.ad_name as string) || null,
      hyros_revenue: (h?.revenue_attributed as number) || 0,
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
