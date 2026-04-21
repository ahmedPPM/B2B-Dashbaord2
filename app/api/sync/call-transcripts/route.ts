import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeCallTranscript, ANALYSIS_MODEL } from '@/lib/analyze-call';

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const { data: pending } = await supa
    .from('call_analyses')
    .select('*')
    .is('analyzed_at', null)
    .not('raw_transcript', 'is', null)
    .limit(20);

  if (!pending?.length) return NextResponse.json({ ok: true, analyzed: 0 });

  let analyzed = 0;
  const errors: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const row of pending) {
    let lastErr: unknown;
    // Retry each transcript up to 4 times with exponential backoff on 429s.
    // Max plan enforces per-minute limits; a short wait clears them.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await analyzeCallTranscript(row.raw_transcript as string, row.call_type);
        await supa
          .from('call_analyses')
          .update({
            ai_summary: result.summary,
            ai_lead_insights: result.lead_insights,
            ai_call_quality_score: result.call_quality_score,
            ai_closer_performance: result.closer_performance,
            ai_next_steps: result.next_steps,
            ai_red_flags: result.red_flags,
            ai_buying_signals: result.buying_signals,
            analyzed_at: new Date().toISOString(),
            analysis_model: ANALYSIS_MODEL,
          })
          .eq('id', row.id);
        analyzed++;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const msg = String(e);
        if (msg.includes('429') || msg.toLowerCase().includes('rate_limit')) {
          await sleep(Math.min(60000, 5000 * 2 ** attempt));
          continue;
        }
        break; // non-rate-limit error, don't retry
      }
    }
    if (lastErr) errors.push(`${row.id}: ${String(lastErr).slice(0, 150)}`);
    // Small gap between transcripts so we never burst at the rate ceiling.
    await sleep(1500);
  }

  return NextResponse.json({ ok: true, analyzed, errors });
}
