import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeKpis } from '@/lib/kpis';
import type { Lead, WindsorRow } from '@/lib/types';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get('from') || `${new Date().getFullYear()}-01-01`;
  const toStr = url.searchParams.get('to') || `${new Date().getFullYear()}-12-31`;
  const from = new Date(fromStr);
  const to = new Date(`${toStr}T23:59:59Z`);

  const supa = supabaseAdmin();
  const [{ data: leads }, { data: spend }, { data: hyros }] = await Promise.all([
    supa.from('leads').select('*').limit(5000),
    supa.from('windsor_ad_spend').select('*').gte('date', fromStr).lte('date', toStr),
    supa.from('hyros_attribution').select('email, revenue_attributed, last_order_date, lead_id'),
  ]);

  const leadRows = (leads || []) as Lead[];
  const stats = computeKpis(leadRows, (spend || []) as WindsorRow[], { from, to });

  // Hyros revenue within range — prefer leads matched by lead_id or email that fall in range via last_order_date
  const inRange = (d?: string | null) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };
  const hyrosRows = (hyros || []) as Array<{
    email: string;
    revenue_attributed: number;
    last_order_date: string | null;
    lead_id: string | null;
  }>;
  const leadIdSet = new Set(leadRows.map((l) => l.id));
  const leadEmailSet = new Set(
    leadRows.map((l) => (l.email || '').trim().toLowerCase()).filter(Boolean)
  );
  const hyrosRevenue = hyrosRows
    .filter(
      (h) =>
        inRange(h.last_order_date) &&
        ((h.lead_id && leadIdSet.has(h.lead_id)) ||
          leadEmailSet.has((h.email || '').trim().toLowerCase()))
    )
    .reduce((a, b) => a + (Number(b.revenue_attributed) || 0), 0);

  const revenue_source: 'hyros' | 'cash_collected' =
    hyrosRevenue > 0 ? 'hyros' : 'cash_collected';
  const primaryRevenue = hyrosRevenue > 0 ? hyrosRevenue : stats.cashCollected;

  const enrichedStats = {
    ...stats,
    cashCollected: primaryRevenue,
    roasCash: stats.totalSpend ? primaryRevenue / stats.totalSpend : 0,
  };

  return NextResponse.json({
    ok: true,
    stats: enrichedStats,
    revenue_source,
    hyros_revenue: hyrosRevenue,
    range: { from: fromStr, to: toStr },
  });
}
