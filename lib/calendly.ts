import crypto from 'crypto';

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
