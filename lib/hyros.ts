// Hyros API wrapper.
// Docs: https://api.hyros.com/v1/api/v1.0
// Auth: API-Key header.

const BASE = 'https://api.hyros.com/v1/api/v1.0';

interface HyrosSource {
  organic?: boolean;
  disregarded?: boolean;
  trafficSource?: { id?: string; name?: string };
  adSource?: { adSourceId?: string; adAccountId?: string; platform?: string };
  sourceLinkAd?: { name?: string; adSourceId?: string };
  category?: { name?: string };
  goal?: { name?: string };
  clickDate?: string;
  UTCClickDate?: string;
  name?: string;
  tag?: string;
}

export interface HyrosLead {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  creationDate?: string;
  ips?: string[];
  phoneNumbers?: string[];
  tags?: Array<string | { name?: string }>;
  firstSource?: HyrosSource;
  lastSource?: HyrosSource;
  sales?: Array<{ date?: string; price?: number; total?: number; amount?: number }>;
  firstOrderDate?: string;
  lastOrderDate?: string;
  totalRevenue?: number;
  [k: string]: unknown;
}

export interface HyrosAttribution {
  email: string;
  revenue_attributed: number;
  first_order_date?: string;
  last_order_date?: string;
  tags: string[];
  raw_payload: unknown;
  organic?: boolean;
  traffic_source?: string;
  ad_platform?: string;
  ad_name?: string;
  click_date?: string;
  is_paid_ad: boolean;
}

export class HyrosClient {
  private apiKey: string;

  constructor(apiKey = process.env.HYROS_API_KEY || '') {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      'API-Key': this.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async request<T>(path: string, init: RequestInit = {}, retries = 3): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers || {}) },
      });
      if (res.status === 429) {
        await this.sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Hyros ${res.status} ${path}: ${text.slice(0, 200)}`);
      }
      await this.sleep(150);
      return (await res.json()) as T;
    }
    throw new Error('Hyros rate limited');
  }

  async getLeadByEmail(email: string): Promise<HyrosLead | null> {
    const q = new URLSearchParams({ emails: email });
    const data = await this.request<{ result?: HyrosLead[] }>(`/leads?${q.toString()}`);
    return data.result?.[0] || null;
  }

  async getAttribution(email: string): Promise<HyrosAttribution> {
    const lead = await this.getLeadByEmail(email);
    if (!lead) {
      return { email, revenue_attributed: 0, tags: [], raw_payload: null, is_paid_ad: false };
    }

    const src = lead.firstSource || lead.lastSource || {};
    const organic = src.organic === true;
    const traffic_source = src.trafficSource?.name;
    const ad_platform = src.adSource?.platform;
    const ad_name = src.sourceLinkAd?.name;
    const click_date = src.UTCClickDate || src.clickDate;
    const is_paid_ad = !organic && !!(ad_platform || (traffic_source && /facebook|google|meta|tiktok|youtube|instagram/i.test(traffic_source)));

    // Revenue
    let revenue = typeof lead.totalRevenue === 'number' ? lead.totalRevenue : 0;
    let firstOrderDate: string | undefined;
    let lastOrderDate: string | undefined;
    if (Array.isArray(lead.sales) && lead.sales.length) {
      if (!revenue) {
        revenue = lead.sales.reduce((a, s) => a + (s.price || s.total || s.amount || 0), 0);
      }
      const dates = lead.sales.map((s) => s.date).filter((d): d is string => !!d).sort();
      if (dates.length) {
        firstOrderDate = dates[0];
        lastOrderDate = dates[dates.length - 1];
      }
    }
    if (!firstOrderDate) firstOrderDate = lead.firstOrderDate;
    if (!lastOrderDate) lastOrderDate = lead.lastOrderDate;

    const tags = (lead.tags || [])
      .map((t) => (typeof t === 'string' ? t : t?.name || ''))
      .filter(Boolean);

    return {
      email,
      revenue_attributed: revenue,
      first_order_date: firstOrderDate,
      last_order_date: lastOrderDate,
      tags,
      raw_payload: lead,
      organic,
      traffic_source,
      ad_platform,
      ad_name,
      click_date,
      is_paid_ad,
    };
  }

  // Back-compat shims
  async getLeadRevenue(email: string) {
    const a = await this.getAttribution(email);
    return {
      revenueAttributed: a.revenue_attributed,
      firstOrderDate: a.first_order_date,
      lastOrderDate: a.last_order_date,
    };
  }

  async getLeadTags(email: string): Promise<string[]> {
    const a = await this.getAttribution(email);
    return a.tags;
  }
}

export const hyros = new HyrosClient();
