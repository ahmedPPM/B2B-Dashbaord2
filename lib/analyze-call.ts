import type { CallAnalysisResult } from './types';

// Transcript analysis is offloaded to a Make.com scenario that calls OpenAI
// against its own OAuth connection — no API key or quota lives in this app.
// The scenario ("PPM Transcript Analyzer", id=4820261) receives
// { transcript, callType } and returns the structured analysis JSON.
const MAKE_WEBHOOK_URL =
  process.env.MAKE_TRANSCRIPT_WEBHOOK_URL
  || 'https://hook.us2.make.com/kvqkv5wkd52jayqp7hre55e9imj9j32i';
const MODEL = 'make:gpt-4o-mini';

export async function analyzeCallTranscript(
  transcript: string,
  callType: 'intro' | 'demo' | 'other'
): Promise<CallAnalysisResult> {
  const res = await fetch(MAKE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, callType }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Make webhook ${res.status}: ${t.slice(0, 300)}`);
  }

  const text = await res.text();
  if (text === 'Accepted') {
    throw new Error('Make scenario ran async — check scenario scheduling is set to immediately');
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in Make response: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]) as CallAnalysisResult;
}

export const ANALYSIS_MODEL = MODEL;
