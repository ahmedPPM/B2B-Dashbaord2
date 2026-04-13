// Hyros API wrapper.
// Docs: https://api.hyros.com/v1
// Auth: API-Key header.

const BASE = 'https://api.hyros.com/v1';

export interface HyrosLead {
  email?: string;
  emails?: string[];
  firstName?: string;
  lastName?: string;
  tags?: string[] | Array<{ name?: string } | string>;
  sales?: Array<{
    date?: string;
    price?: number;
    total?: number;
    amount?: number;
    currency?: string;
  }>;
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
      // Gentle rate-limit pacing
      await this.sleep(200);
      return (await res.json()) as T;
    }
    throw new Error('Hyros rate limited');
  }

  async getLeadByEmail(email: string): Promise<HyrosLead | null> {
    const q = new URLSearchParams();
    q.set('emails', email);
    const data = await this.request<{ result?: HyrosLead[]; data?: HyrosLead[] }>(
      `/leads?${q.toString()}`
    );
    const rows = data.result || data.data || [];
    return rows[0] || null;
  }

  async getLeadRevenue(email: string): Promise<{
    revenueAttributed: number;
    firstOrderDate?: string;
    lastOrderDate?: string;
  }> {
    const lead = await this.getLeadByEmail(email);
    if (!lead) return { revenueAttributed: 0 };

    let revenue = 0;
    let firstOrderDate: string | undefined;
    let lastOrderDate: string | undefined;

    if (typeof lead.totalRevenue === 'number') {
      revenue = lead.totalRevenue;
    }
    if (Array.isArray(lead.sales) && lead.sales.length) {
      if (!revenue) {
        revenue = lead.sales.reduce(
          (a, s) => a + (s.price || s.total || s.amount || 0),
          0
        );
      }
      const dates = lead.sales
        .map((s) => s.date)
        .filter((d): d is string => !!d)
        .sort();
      if (dates.length) {
        firstOrderDate = dates[0];
        lastOrderDate = dates[dates.length - 1];
      }
    }
    if (!firstOrderDate && lead.firstOrderDate) firstOrderDate = lead.firstOrderDate;
    if (!lastOrderDate && lead.lastOrderDate) lastOrderDate = lead.lastOrderDate;

    return { revenueAttributed: revenue, firstOrderDate, lastOrderDate };
  }

  async getLeadTags(email: string): Promise<string[]> {
    const lead = await this.getLeadByEmail(email);
    if (!lead || !lead.tags) return [];
    return (lead.tags as Array<string | { name?: string }>)
      .map((t) => (typeof t === 'string' ? t : t?.name || ''))
      .filter(Boolean);
  }

  async getAttribution(email: string): Promise<HyrosAttribution> {
    const lead = await this.getLeadByEmail(email);
    if (!lead) {
      return {
        email,
        revenue_attributed: 0,
        tags: [],
        raw_payload: null,
      };
    }
    const { revenueAttributed, firstOrderDate, lastOrderDate } = await this.getLeadRevenue(email);
    const tags = await this.getLeadTags(email);
    return {
      email,
      revenue_attributed: revenueAttributed,
      first_order_date: firstOrderDate,
      last_order_date: lastOrderDate,
      tags,
      raw_payload: lead,
    };
  }
}

export const hyros = new HyrosClient();
