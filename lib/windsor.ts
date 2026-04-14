// Windsor.ai API wrapper — fetches ad spend metrics.

const BASE = 'https://connectors.windsor.ai';

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
  const text = await res.text();
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${text.slice(0, 200)}`);
  let parsed: { data?: WindsorSpendRow[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Windsor returned non-JSON: ${text.slice(0, 200)}`);
  }
  return parsed.data || [];
}
