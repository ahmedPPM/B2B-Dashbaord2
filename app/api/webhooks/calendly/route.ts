import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyWebhookSignature } from '@/lib/calendly';

interface CalendlyInviteePayload {
  event?: string;
  payload?: {
    email?: string;
    event?: { start_time?: string; name?: string; uri?: string };
    questions_and_answers?: Array<{ question: string; answer: string }>;
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('calendly-webhook-signature');
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyWebhookSignature(raw, sig)) {
      return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('Calendly webhook: CALENDLY_WEBHOOK_SECRET missing in production');
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 503 });
  }

  let data: CalendlyInviteePayload;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  const evt = data.event;
  if (evt !== 'invitee.created' && evt !== 'invitee.canceled' && evt !== 'invitee.cancelled') {
    return NextResponse.json({ ok: true });
  }

  const email = data.payload?.email;
  const startTime = data.payload?.event?.start_time;
  const eventName = data.payload?.event?.name || '';
  if (!email || !startTime) return NextResponse.json({ ok: true });

  const supa = supabaseAdmin();
  const { data: lead } = await supa
    .from('leads')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (!lead) return NextResponse.json({ ok: true });

  const isDemo = /demo/i.test(eventName);
  const canceled = evt === 'invitee.canceled' || evt === 'invitee.cancelled';
  const status = canceled ? 'Cancelled' : 'Scheduled';
  const patch = isDemo
    ? {
        demo_booked: !canceled,
        demo_booked_for_date: startTime,
        demo_created_date: new Date().toISOString(),
        demo_show_status: status,
      }
    : {
        intro_booked: !canceled,
        intro_booked_for_date: startTime,
        intro_created_date: new Date().toISOString(),
        intro_show_status: status,
      };
  const { error } = await supa.from('leads').update(patch).eq('id', lead.id);
  if (error) console.error('calendly webhook update', error);

  return NextResponse.json({ ok: true });
}
