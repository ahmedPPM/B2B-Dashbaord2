import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get('from') || `${new Date().getFullYear()}-01-01`;
  const toStr = url.searchParams.get('to') || `${new Date().getFullYear()}-12-31`;
  const mode = url.searchParams.get('mode') || 'all';

  const supa = supabaseAdmin();

  // Fetch all non-deleted leads
  let leadsQ = supa
    .from('leads')
    .select('id, lead_name, email, date_opted_in, pipeline_stage, campaign_name, campaign_id, lead_source, ad_set_name, cash_collected, contracted_mrr, intro_booked_for_date, demo_booked_for_date, intro_closer, demo_assigned_closer, assigned_user_name')
    .is('deleted_at', null)
    .limit(5000);

  const { data: allLeads, error: leadsErr } = await leadsQ;
  if (leadsErr) return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 });

  let leads = allLeads || [];

  // Apply mode filter
  if (mode === 'hyros') {
    const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
    const { data: hyrosRows } = await supa
      .from('hyros_attribution')
      .select('email, in_hyros_list, is_paid_ad')
      .in('email', emails);
    const hyrosPaidEmails = new Set(
      (hyrosRows || [])
        .filter((h: { email: string; in_hyros_list?: boolean; is_paid_ad?: boolean }) => h.in_hyros_list === true || h.is_paid_ad === true)
        .map((h: { email: string }) => h.email.toLowerCase())
    );
    leads = leads.filter((l) => hyrosPaidEmails.has((l.email || '').toLowerCase()));
  } else if (mode === 'ads') {
    leads = leads.filter((l) => {
      const hasCampaign = !!(l.campaign_id || l.campaign_name);
      const paidSource = /facebook|meta|google|tiktok|youtube|instagram/i.test(l.lead_source || '');
      return hasCampaign || paidSource;
    });
  }

  // --- leadsByDay ---
  const dayCounts: Record<string, number> = {};
  for (const l of leads) {
    if (!l.date_opted_in) continue;
    const d = l.date_opted_in.slice(0, 10);
    if (d < fromStr || d > toStr) continue;
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  }
  const leadsByDay = Object.entries(dayCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  // --- cplTrend ---
  const { data: spendRows } = await supa
    .from('windsor_ad_spend')
    .select('date, spend')
    .gte('date', fromStr)
    .lte('date', toStr);

  const spendByDay: Record<string, number> = {};
  for (const row of spendRows || []) {
    const d = (row.date as string).slice(0, 10);
    spendByDay[d] = (spendByDay[d] || 0) + (Number(row.spend) || 0);
  }

  const allDates = new Set([...Object.keys(dayCounts), ...Object.keys(spendByDay)]);
  const cplTrend = Array.from(allDates)
    .sort()
    .map((date) => {
      const spend = spendByDay[date] || 0;
      const leadsCount = dayCounts[date] || 0;
      const cpl = leadsCount > 0 ? spend / leadsCount : 0;
      return { date, spend, leads: leadsCount, cpl };
    });

  // --- leadsBySource ---
  const sourceCounts: Record<string, number> = {};
  for (const l of leads) {
    if (!l.date_opted_in) continue;
    const d = l.date_opted_in.slice(0, 10);
    if (d < fromStr || d > toStr) continue;
    const src = l.lead_source || 'Unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
  const leadsBySource = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  // --- leadsByPlacement ---
  const placementCounts: Record<string, number> = {};
  for (const l of leads) {
    if (!l.date_opted_in) continue;
    const d = l.date_opted_in.slice(0, 10);
    if (d < fromStr || d > toStr) continue;
    const placement = l.ad_set_name || 'Unknown';
    placementCounts[placement] = (placementCounts[placement] || 0) + 1;
  }
  const leadsByPlacement = Object.entries(placementCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([placement, count]) => ({ placement, count }));

  // --- bestCampaignsByCpl ---
  const campaignSpend: Record<string, number> = {};
  const campaignLeads: Record<string, number> = {};

  const { data: spendByCampaign } = await supa
    .from('windsor_ad_spend')
    .select('campaign_name, spend')
    .gte('date', fromStr)
    .lte('date', toStr)
    .not('campaign_name', 'is', null);

  for (const row of spendByCampaign || []) {
    if (!row.campaign_name) continue;
    campaignSpend[row.campaign_name] = (campaignSpend[row.campaign_name] || 0) + (Number(row.spend) || 0);
  }

  for (const l of leads) {
    if (!l.campaign_name) continue;
    if (!l.date_opted_in) continue;
    const d = l.date_opted_in.slice(0, 10);
    if (d < fromStr || d > toStr) continue;
    campaignLeads[l.campaign_name] = (campaignLeads[l.campaign_name] || 0) + 1;
  }

  const allCampaigns = new Set([...Object.keys(campaignSpend), ...Object.keys(campaignLeads)]);
  const bestCampaignsByCpl = Array.from(allCampaigns)
    .map((campaign) => {
      const spend = campaignSpend[campaign] || 0;
      const leadsCount = campaignLeads[campaign] || 0;
      const cpl = leadsCount > 0 && spend > 0 ? spend / leadsCount : 0;
      return { campaign, spend, leads: leadsCount, cpl };
    })
    .filter((c) => c.spend > 0 && c.leads > 0)
    .sort((a, b) => a.cpl - b.cpl)
    .slice(0, 10);

  // --- newestLeads ---
  const newestLeads = leads
    .filter((l) => l.date_opted_in)
    .sort((a, b) => (b.date_opted_in || '').localeCompare(a.date_opted_in || ''))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      lead_name: l.lead_name,
      email: l.email,
      date_opted_in: l.date_opted_in,
      pipeline_stage: l.pipeline_stage,
      campaign_name: l.campaign_name,
    }));

  // --- upcomingCalls ---
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const upcomingCalls: {
    type: 'intro' | 'demo';
    booked_for: string;
    lead_name: string | null;
    closer: string | null;
    lead_id: string;
  }[] = [];

  for (const l of leads) {
    if (l.intro_booked_for_date) {
      const d = l.intro_booked_for_date.slice(0, 10);
      if (d >= todayStr && d <= futureDate) {
        upcomingCalls.push({
          type: 'intro',
          booked_for: l.intro_booked_for_date,
          lead_name: l.lead_name,
          closer: l.intro_closer || l.assigned_user_name,
          lead_id: l.id,
        });
      }
    }
    if (l.demo_booked_for_date) {
      const d = l.demo_booked_for_date.slice(0, 10);
      if (d >= todayStr && d <= futureDate) {
        upcomingCalls.push({
          type: 'demo',
          booked_for: l.demo_booked_for_date,
          lead_name: l.lead_name,
          closer: l.demo_assigned_closer || l.assigned_user_name,
          lead_id: l.id,
        });
      }
    }
  }

  upcomingCalls.sort((a, b) => a.booked_for.localeCompare(b.booked_for));

  // --- cashCollected + cashInvoiced ---
  const cashCollected = leads.reduce((sum, l) => sum + (Number(l.cash_collected) || 0), 0);
  const cashInvoiced = leads.reduce((sum, l) => sum + (Number(l.contracted_mrr) || 0), 0);

  return NextResponse.json({
    ok: true,
    leadsByDay,
    cplTrend,
    leadsBySource,
    leadsByPlacement,
    bestCampaignsByCpl,
    newestLeads,
    upcomingCalls,
    cashCollected,
    cashInvoiced,
  });
}
