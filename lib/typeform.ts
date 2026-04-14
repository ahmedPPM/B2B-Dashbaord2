// Typeform responses API wrapper.
// Docs: https://www.typeform.com/developers/responses/

const BASE = 'https://api.typeform.com';

interface TypeformAnswer {
  type?: string;
  email?: string;
  text?: string;
  phone_number?: string;
  field?: { id?: string; type?: string; ref?: string };
}

export interface TypeformResponse {
  response_id: string;
  landed_at?: string;
  submitted_at?: string;
  hidden?: Record<string, string>;
  answers?: TypeformAnswer[];
  metadata?: { user_agent?: string; platform?: string; referer?: string; network_id?: string };
}

export interface TypeformForm {
  id: string;
  title: string;
}

export class TypeformClient {
  constructor(private apiKey = process.env.TYPEFORM_API_KEY || '') {}

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' };
  }

  async listForms(): Promise<TypeformForm[]> {
    const res = await fetch(`${BASE}/forms?page_size=200`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Typeform ${res.status}`);
    const body = (await res.json()) as { items: TypeformForm[] };
    return body.items || [];
  }

  async listResponses(formId: string): Promise<TypeformResponse[]> {
    const all: TypeformResponse[] = [];
    let before: string | undefined;
    // Typeform paginates via `before=<token>`; we use submitted_at cursor via 'before' param
    while (true) {
      const q = new URLSearchParams({ page_size: '1000' });
      if (before) q.set('before', before);
      const res = await fetch(`${BASE}/forms/${formId}/responses?${q.toString()}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Typeform responses ${res.status}`);
      const body = (await res.json()) as { items: TypeformResponse[]; page_count?: number };
      const items = body.items || [];
      if (!items.length) break;
      all.push(...items);
      if (items.length < 1000) break;
      before = items[items.length - 1].response_id;
    }
    return all;
  }

  /**
   * Extract email + UTM from a response. Returns null if no email found.
   */
  static extract(r: TypeformResponse): {
    email: string;
    utm_source?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_medium?: string;
    utm_term?: string;
    ad_id?: string;
    campaign_id?: string;
    submitted_at?: string;
  } | null {
    const email = r.answers?.find((a) => a.type === 'email')?.email?.toLowerCase();
    if (!email) return null;
    const h = r.hidden || {};
    const out = { email, submitted_at: r.submitted_at } as ReturnType<typeof TypeformClient.extract> & { email: string };
    for (const k of ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_term', 'ad_id', 'campaign_id'] as const) {
      const v = h[k];
      if (v && v !== '') (out as Record<string, string | undefined>)[k] = v;
    }
    return out;
  }
}

export const typeform = new TypeformClient();
