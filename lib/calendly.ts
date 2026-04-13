import crypto from 'crypto';
import { supabaseAdmin } from './supabase/server';

const BASE = 'https://api.calendly.com';

export interface CalendlyEvent {
  uri: string;
  name?: string;
  start_time: string;
  end_time: string;
  status?: string;
  invitees_counter?: { active?: number };
  event_type?: string;
}

interface CalendlyInvitee {
  uri?: string;
  email?: string;
  status?: string;
}

export async function getScheduledEvents(
  userUuid: string,
  dateRange: { from: string; to: string }
): Promise<CalendlyEvent[]> {
  const key = process.env.CALENDLY_API_KEY;
  if (!key) throw new Error('CALENDLY_API_KEY missing');

  const q = new URLSearchParams();
  q.set('user', `https://api.calendly.com/users/${userUuid}`);
  q.set('min_start_time', dateRange.from);
  q.set('max_start_time', dateRange.to);
  q.set('count', '100');

  const res = await fetch(`${BASE}/scheduled_events?${q.toString()}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}`);
  const data = (await res.json()) as { collection?: CalendlyEvent[] };
  return data.collection || [];
}

async function calendlyRequest<T>(url: string): Promise<T | null> {
  const key = process.env.CALENDLY_API_KEY;
  if (!key) return null;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.error('Calendly', res.status, url);
    return null;
  }
  return (await res.json()) as T;
}

/**
 * Pull all scheduled events for the PPM Calendly user since BACKFILL_START_DATE
 * and update matching leads' intro_booked fields.
 * Returns number of leads updated.
 */
export async function backfillCalendly(): Promise<number> {
  const userUuid = process.env.CALENDLY_USER_UUID;
  const key = process.env.CALENDLY_API_KEY;
  if (!userUuid || !key) {
    console.warn('backfillCalendly: missing CALENDLY_USER_UUID or CALENDLY_API_KEY, skipping');
    return 0;
  }
  const startDate = process.env.BACKFILL_START_DATE || '2026-01-01';
  const minStart = `${startDate}T00:00:00Z`;

  const supa = supabaseAdmin();
  let updated = 0;
  let pageUrl: string | null =
    `${BASE}/scheduled_events?user=https://api.calendly.com/users/${userUuid}&min_start_time=${encodeURIComponent(
      minStart
    )}&count=100`;

  while (pageUrl) {
    const page: {
      collection: Array<CalendlyEvent & { uri: string; status?: string }>;
      pagination?: { next_page?: string | null };
    } | null = await calendlyRequest(pageUrl);
    if (!page) break;
    for (const evt of page.collection || []) {
      try {
        const invResp = await calendlyRequest<{ collection: CalendlyInvitee[] }>(
          `${evt.uri}/invitees`
        );
        const invitees = invResp?.collection || [];
        for (const inv of invitees) {
          const email = (inv.email || '').toLowerCase().trim();
          if (!email) continue;
          const { data: lead } = await supa
            .from('leads')
            .select('id')
            .eq('email', email)
            .maybeSingle();
          if (!lead) continue;
          const status = evt.status || inv.status;
          const showStatus =
            status === 'canceled' || status === 'cancelled' ? 'Cancelled' : 'Scheduled';
          await supa
            .from('leads')
            .update({
              intro_booked: true,
              intro_booked_for_date: evt.start_time,
              intro_created_date: evt.start_time,
              intro_show_status: showStatus,
            })
            .eq('id', lead.id);
          updated++;
        }
      } catch (e) {
        console.error('backfillCalendly event', evt.uri, e);
      }
    }
    pageUrl = page.pagination?.next_page || null;
  }
  return updated;
}

export function verifyWebhookSignature(body: string, header: string | null): boolean {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  // Calendly signatures are of the form: t=TIMESTAMP,v1=SIGNATURE
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const signedPayload = `${t}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
