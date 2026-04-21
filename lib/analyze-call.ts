import type { CallAnalysisResult } from './types';

// Uses OpenAI's gpt-4o-mini — cheap, fast, strong enough for structured
// call analysis. Bypass the Anthropic pay-as-you-go billing problem.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt(callType) },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty OpenAI response');
  return JSON.parse(text) as CallAnalysisResult;
}

export const ANALYSIS_MODEL = MODEL;
