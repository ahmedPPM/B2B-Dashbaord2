import type { CallAnalysisResult } from './types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function systemPrompt(callType: 'intro' | 'demo' | 'other') {
  const outcomes =
    callType === 'intro'
      ? '"qualified" | "not_qualified" | "needs_followup" | "no_show" | "rescheduled" | "not_fit"'
      : callType === 'demo'
      ? '"closed" | "followup_needed" | "not_closed" | "no_show" | "rescheduled" | "not_fit"'
      : '"qualified" | "not_qualified" | "needs_followup" | "closed" | "not_closed" | "no_show" | "rescheduled"';

  return `You are an elite sales analyst reviewing ${callType} calls for Premier Pool Marketing, a B2B agency that helps pool service companies scale via paid advertising.

For each transcript you receive, respond in STRICT JSON with this exact shape:

{
  "summary": "2-3 sentence summary of what happened on the call",
  "lead_insights": "Who is this lead? Their business size, pain points, decision-making authority, budget signals, timeline.",
  "call_quality_score": 1-10 integer rating the overall call quality,
  "closer_performance": "How did the closer do? Specific moments of strength or weakness.",
  "next_steps": "What are the concrete next steps? Who owes what, by when.",
  "red_flags": "Any reasons this deal might not close — objections not handled, misalignment, bad fit signals. Empty string if none.",
  "buying_signals": "Specific phrases or moments showing buyer intent. Empty string if none.",
  "outcome": ${outcomes} — pick the single best label for the call's outcome
}

Return ONLY the JSON object. No prose, no code fences.`;
}

export async function analyzeCallTranscript(
  transcript: string,
  callType: 'intro' | 'demo' | 'other'
): Promise<CallAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      // Cache the system prompt so repeat analyses of the same call_type hit the cache.
      system: [
        {
          type: 'text',
          text: systemPrompt(callType),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content?.map((c) => c.text).join('') || '';
  // Extract JSON even if model wrapped it.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  const parsed = JSON.parse(match[0]) as CallAnalysisResult;
  return parsed;
}

export const ANALYSIS_MODEL = MODEL;
