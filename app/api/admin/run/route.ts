import { NextResponse } from 'next/server';
import { runBackfill } from '@/lib/backfill';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeCallTranscript, ANALYSIS_MODEL } from '@/lib/analyze-call';

// Admin-only passthrough — same logic as /api/backfill/run and
// /api/sync/call-transcripts, but without the CRON_SECRET bearer check
// so the in-app admin UI can trigger them directly.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');

  try {
    if (kind === 'backfill') {
      const result = await runBackfill();
      return NextResponse.json({ ok: true, ...result });
    }
    if (kind === 'analysis') {
      const supa = supabaseAdmin();
      const { data: pending } = await supa
        .from('call_analyses')
        .select('*')
        .is('analyzed_at', null)
        .not('raw_transcript', 'is', null)
        .limit(20);
      let analyzed = 0;
      const errors: string[] = [];
      for (const row of pending || []) {
        try {
          const r = await analyzeCallTranscript(row.raw_transcript as string, row.call_type);
          await supa.from('call_analyses').update({
            ai_summary: r.summary,
            ai_lead_insights: r.lead_insights,
            ai_call_quality_score: r.call_quality_score,
            ai_closer_performance: r.closer_performance,
            ai_next_steps: r.next_steps,
            ai_red_flags: r.red_flags,
            ai_buying_signals: r.buying_signals,
            analyzed_at: new Date().toISOString(),
            analysis_model: ANALYSIS_MODEL,
          }).eq('id', row.id);
          if (r.outcome && row.lead_id) {
            const patch: Record<string, unknown> = {};
            if (row.call_type === 'intro') patch.intro_call_outcome = r.outcome;
            else if (row.call_type === 'demo') patch.demo_call_outcome = r.outcome;
            if (Object.keys(patch).length) await supa.from('leads').update(patch).eq('id', row.lead_id);
          }
          analyzed++;
        } catch (e) {
          errors.push(String(e).slice(0, 120));
        }
      }
      return NextResponse.json({ ok: true, analyzed, errors });
    }
    return NextResponse.json({ ok: false, error: 'unknown kind' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
