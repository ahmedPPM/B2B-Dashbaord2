// GoHighLevel API wrapper.
// Docs: https://highlevel.stoplight.io/docs/integrations

const BASE = 'https://services.leadconnectorhq.com';

export interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
  source?: string;
  customFields?: Array<{ id: string; value: unknown }>;
  attributionSource?: {
    campaign?: string;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
    adName?: string;
    adSetName?: string;
    medium?: string;
    utmSource?: string;
  };
  [k: string]: unknown;
}

export interface GHLOpportunity {
  id: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  monetaryValue?: number;
  status?: string;
  name?: string;
  [k: string]: unknown;
}

export interface GHLAppointment {
  id: string;
  contactId?: string;
  calendarId?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  title?: string;
  [k: string]: unknown;
}

export interface GHLCall {
  id: string;
  contactId?: string;
  dateAdded?: string;
  duration?: number;
  recordingUrl?: string;
  transcript?: string;
  direction?: string;
  [k: string]: unknown;
}

export class GHLClient {
  private apiKey: string;
  private locationId: string;

  constructor(apiKey = process.env.GHL_API_KEY || '', locationId = process.env.GHL_LOCATION_ID || '') {
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Version: '2021-07-28',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async request<T>(path: string, init: RequestInit = {}, retries = 3): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers || {}) } });
      if (res.status === 429) {
        await this.sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL ${res.status} ${path}: ${text.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    }
    throw new Error('GHL rate limited');
  }

  async getContacts(params: {
    tags?: string[];
    startAfterDate?: string;
    limit?: number;
    page?: number;
  } = {}): Promise<{ contacts: GHLContact[]; meta?: { total?: number; nextPageUrl?: string } }> {
    const q = new URLSearchParams();
    q.set('locationId', this.locationId);
    q.set('limit', String(params.limit ?? 100));
    if (params.page) q.set('page', String(params.page));
    if (params.startAfterDate) q.set('startAfterDate', params.startAfterDate);
    if (params.tags?.length) q.set('tags', params.tags.join(','));
    return this.request(`/contacts/?${q.toString()}`);
  }

  async getContact(id: string): Promise<{ contact: GHLContact }> {
    return this.request(`/contacts/${id}`);
  }

  async getOpportunityByContact(contactId: string): Promise<{ opportunities: GHLOpportunity[] }> {
    const pipelineId = process.env.GHL_PIPELINE_ID || '';
    const q = new URLSearchParams();
    q.set('location_id', this.locationId);
    q.set('contact_id', contactId);
    if (pipelineId) q.set('pipeline_id', pipelineId);
    return this.request(`/opportunities/search?${q.toString()}`);
  }

  async getAppointments(contactId: string): Promise<{ events: GHLAppointment[] }> {
    return this.request(`/contacts/${contactId}/appointments`);
  }

  async getCalls(contactId: string): Promise<{ calls: GHLCall[] }> {
    // Conversations search for this contact
    const q = new URLSearchParams();
    q.set('locationId', this.locationId);
    q.set('contactId', contactId);
    return this.request(`/conversations/search?${q.toString()}`);
  }

  async getCall(callId: string): Promise<{ call: GHLCall }> {
    return this.request(`/conversations/messages/${callId}`);
  }
}

export const ghl = new GHLClient();
