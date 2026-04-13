// Windsor.ai API wrapper — fetches ad spend metrics.

const BASE = 'https://windsor.ai/api/v1';

export interface WindsorSpendRow {
  date: string;
  campaign_id?: string;
  campaign?: string;
  adset_id?: string;
  adset?: string;
  ad_id?: string;
  ad?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
}

export async function fetchAdSpend(dateRange: {
  from: string;
  to: string;
}): Promise<WindsorSpendRow[]> {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error('WINDSOR_API_KEY missing');

  const q = new URLSearchParams();
  q.set('api_key', key);
  q.set('date_from', dateRange.from);
  q.set('date_to', dateRange.to);
  q.set('fields', 'date,campaign_id,campaign,adset_id,adset,ad_id,ad,spend,impressions,clicks');

  const res = await fetch(`${BASE}/all?${q.toString()}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Windsor ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: WindsorSpendRow[] };
  return data.data || [];
}
