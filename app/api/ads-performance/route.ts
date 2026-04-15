import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface CampaignRow {
  campaign_id: string | null;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  intros_booked: number;
  demos_booked: number;
  clients_closed: number;
  cash_collected: number;
  mrr: number;
  hyros_revenue: number;
  cpl: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas_cash: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '2026-01-01';
  const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

  const supa = supabaseAdmin();
  const [spendRes, leadsRes, hyrosRes] = await Promise.all([
    supa
      .from('windsor_ad_spend')
      .select('date, campaign_id, campaign_name, spend, impressions, clicks')
      .gte('date', from)
      .lte('date', to),
    supa
      .from('leads')
      .select('campaign_id, campaign_name, intro_booked, demo_booked, client_closed, cash_collected, contracted_mrr, email, date_opted_in')
      .is('deleted_at', null)
      .gte('date_opted_in', `${from}T00:00:00Z`)
      .lte('date_opted_in', `${to}T23:59:59Z`),
    supa
      .from('hyros_attribution')
      .select('email, revenue_attributed, ad_name, is_paid_ad'),
  ]);

  const hyrosByEmail = new Map<string, { revenue: number; ad_name: string | null }>();
  for (const h of hyrosRes.data || []) {
    hyrosByEmail.set((h.email || '').toLowerCase(), {
      revenue: h.revenue_attributed || 0,
      ad_name: h.ad_name || null,
    });
  }

  const byCampaign = new Map<string, CampaignRow>();
  // Windsor campaign_ids (18-digit Meta ad IDs) don't match GHL lead campaign_ids
  // (17-digit or different). Match on normalized campaign_name instead.
  const keyOf = (name: string | null, id: string | null) => {
    const n = (name || '').trim().toLowerCase();
    if (n) return n;
    return id || 'unattributed';
  };

  for (const s of spendRes.data || []) {
    const k = keyOf(s.campaign_name, s.campaign_id);
    const r = byCampaign.get(k) || blankRow(s.campaign_id, s.campaign_name);
    r.spend += s.spend || 0;
    r.impressions += s.impressions || 0;
    r.clicks += s.clicks || 0;
    byCampaign.set(k, r);
  }

  for (const l of leadsRes.data || []) {
    const k = keyOf(l.campaign_name, l.campaign_id);
    const r = byCampaign.get(k) || blankRow(l.campaign_id, l.campaign_name);
    r.leads++;
    if (l.intro_booked) r.intros_booked++;
    if (l.demo_booked) r.demos_booked++;
    if (l.client_closed) r.clients_closed++;
    r.cash_collected += l.cash_collected || 0;
    r.mrr += l.contracted_mrr || 0;
    const h = hyrosByEmail.get((l.email || '').toLowerCase());
    if (h) r.hyros_revenue += h.revenue;
    byCampaign.set(k, r);
  }

  const rows = Array.from(byCampaign.values()).map((r) => ({
    ...r,
    cpl: r.leads ? r.spend / r.leads : 0,
    cpc: r.clicks ? r.spend / r.clicks : 0,
    ctr: r.impressions ? (r.clicks / r.impressions) * 100 : 0,
    cpa: r.clients_closed ? r.spend / r.clients_closed : 0,
    roas_cash: r.spend ? r.cash_collected / r.spend : 0,
  }));

  rows.sort((a, b) => b.spend - a.spend);

  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
      intros_booked: acc.intros_booked + r.intros_booked,
      demos_booked: acc.demos_booked + r.demos_booked,
      clients_closed: acc.clients_closed + r.clients_closed,
      cash_collected: acc.cash_collected + r.cash_collected,
      mrr: acc.mrr + r.mrr,
      hyros_revenue: acc.hyros_revenue + r.hyros_revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, intros_booked: 0, demos_booked: 0, clients_closed: 0, cash_collected: 0, mrr: 0, hyros_revenue: 0 },
  );

  // Daily trend
  const dailyMap = new Map<string, { date: string; spend: number; clicks: number; impressions: number }>();
  for (const s of spendRes.data || []) {
    const d = dailyMap.get(s.date) || { date: s.date, spend: 0, clicks: 0, impressions: 0 };
    d.spend += s.spend || 0;
    d.clicks += s.clicks || 0;
    d.impressions += s.impressions || 0;
    dailyMap.set(s.date, d);
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ ok: true, rows, totals, daily, from, to });
}

function blankRow(campaign_id: string | null, campaign_name: string | null): CampaignRow {
  return {
    campaign_id,
    campaign_name,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    intros_booked: 0,
    demos_booked: 0,
    clients_closed: 0,
    cash_collected: 0,
    mrr: 0,
    hyros_revenue: 0,
    cpl: 0,
    cpc: 0,
    ctr: 0,
    cpa: 0,
    roas_cash: 0,
  };
}
