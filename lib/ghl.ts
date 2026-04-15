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
  assignedTo?: string;
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
  callStatus?: string;
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
  } = {}): Promise<{ contacts: GHLContact[]; total?: number }> {
    const filters: Array<{ field: string; operator: string; value: unknown }> = [];
    if (params.tags?.length) {
      for (const t of params.tags) {
        filters.push({ field: 'tags', operator: 'contains', value: t });
      }
    }
    if (params.startAfterDate) {
      filters.push({
        field: 'dateAdded',
        operator: 'range',
        value: { gte: params.startAfterDate },
      });
    }
    const body = {
      locationId: this.locationId,
      page: params.page ?? 1,
      pageLimit: params.limit ?? 100,
      filters,
    };
    return this.request(`/contacts/search`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getContact(id: string): Promise<{ contact: GHLContact }> {
    return this.request(`/contacts/${id}`);
  }

  async getOpportunityByContact(contactId: string): Promise<{ opportunities: GHLOpportunity[] }> {
    // Do NOT filter by pipeline_id — leads can live on any pipeline (B2B setting,
    // deals, etc.). We want whichever opportunity exists for this contact.
    const q = new URLSearchParams();
    q.set('location_id', this.locationId);
    q.set('contact_id', contactId);
    return this.request(`/opportunities/search?${q.toString()}`);
  }

  async getAppointments(contactId: string): Promise<{ events: GHLAppointment[] }> {
    return this.request(`/contacts/${contactId}/appointments`);
  }

  async searchContactByEmail(email: string): Promise<{ contacts: GHLContact[] }> {
    return this.request(`/contacts/search`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: this.locationId,
        page: 1,
        pageLimit: 20,
        filters: [{ field: 'email', operator: 'eq', value: email }],
      }),
    });
  }

  async getConversations(contactId: string): Promise<{ conversations: Array<{ id: string; contactId?: string; dateUpdated?: number }> }> {
    const q = new URLSearchParams();
    q.set('locationId', this.locationId);
    q.set('contactId', contactId);
    return this.request(`/conversations/search?${q.toString()}`);
  }

  async getConversationMessages(conversationId: string): Promise<{ messages: { messages: GHLMessage[]; nextPage?: boolean; lastMessageId?: string } }> {
    return this.request(`/conversations/${conversationId}/messages`, {}, 2);
  }

  /**
   * Returns all call-type messages across all conversations for a contact.
   */
  async getCalls(contactId: string): Promise<{ calls: GHLCall[] }> {
    const calls: GHLCall[] = [];
    try {
      const { conversations } = await this.getConversations(contactId);
      for (const conv of conversations || []) {
        try {
          const res = await this.getConversationMessages(conv.id);
          const msgs = res?.messages?.messages || [];
          for (const m of msgs) {
            if (m.messageType === 'TYPE_CALL' || m.type === 'CALL') {
              const meta = (m.meta || {}) as { call?: { duration?: number; status?: string; recordingUrl?: string } };
              calls.push({
                id: m.id,
                contactId,
                dateAdded: m.dateAdded,
                duration: meta.call?.duration ?? undefined,
                recordingUrl: meta.call?.recordingUrl ?? undefined,
                direction: m.direction,
                callStatus: meta.call?.status,
              });
            }
          }
        } catch (e) {
          console.error('getConversationMessages failed', conv.id, e);
        }
      }
    } catch (e) {
      console.error('getConversations failed', contactId, e);
    }
    return { calls };
  }

  /**
   * Fetch the timestamped transcription for a call message. Returns the joined
   * transcript text, or null if GHL has no transcript for it.
   */
  async getCallTranscription(messageId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${BASE}/conversations/locations/${this.locationId}/messages/${messageId}/transcription`,
        { headers: this.headers() }
      );
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const segs = (await res.json()) as Array<{ transcript?: string }>;
      const text = segs.map((s) => s?.transcript || '').join(' ').replace(/\s+/g, ' ').trim();
      return text || null;
    } catch (e) {
      console.error('getCallTranscription', messageId, e);
      return null;
    }
  }

  async getUsers(): Promise<{ users: Array<{ id: string; name?: string; firstName?: string; lastName?: string; email?: string }> }> {
    const q = new URLSearchParams();
    q.set('locationId', this.locationId);
    return this.request(`/users/?${q.toString()}`);
  }

  async getCalendarEvents(calendarId: string, startMs: number, endMs: number): Promise<{ events: GHLAppointment[] }> {
    const q = new URLSearchParams();
    q.set('locationId', this.locationId);
    q.set('calendarId', calendarId);
    q.set('startTime', String(startMs));
    q.set('endTime', String(endMs));
    return this.request(`/calendars/events?${q.toString()}`);
  }
}

export interface GHLMessage {
  id: string;
  type?: number | string;
  messageType?: string;
  direction?: string;
  dateAdded?: string;
  contactId?: string;
  conversationId?: string;
  body?: string;
  meta?: unknown;
  [k: string]: unknown;
}

export const ghl = new GHLClient();
