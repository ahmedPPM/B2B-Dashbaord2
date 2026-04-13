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
  if (process.env.CALENDLY_WEBHOOK_SECRET && !verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });
  }

  let data: CalendlyInviteePayload;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  if (data.event !== 'invitee.created') return NextResponse.json({ ok: true });

  const email = data.payload?.email;
  const startTime = data.payload?.event?.start_time;
  const eventName = data.payload?.event?.name || '';
  if (!email || !startTime) return NextResponse.json({ ok: true });

  const supa = supabaseAdmin();
  const { data: lead } = await supa.from('leads').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (!lead) return NextResponse.json({ ok: true });

  const isDemo = /demo/i.test(eventName);
  await supa
    .from('leads')
    .update(
      isDemo
        ? { demo_booked: true, demo_booked_for_date: startTime, demo_created_date: new Date().toISOString() }
        : { intro_booked: true, intro_booked_for_date: startTime, intro_created_date: new Date().toISOString() }
    )
    .eq('id', lead.id);

  return NextResponse.json({ ok: true });
}
