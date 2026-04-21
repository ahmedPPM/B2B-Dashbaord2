import type { CallAnalysisResult } from './types';

// Uses the Anthropic Messages API directly (plain HTTP) with the
// CLAUDE_CODE_OAUTH_TOKEN that comes from `claude setup-token`. That
// token bills against the Max subscription — no pay-as-you-go key, no
// SDK subprocess, no native binary.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';

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
  const oauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!oauth && !apiKey) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN (preferred) or ANTHROPIC_API_KEY missing');
  }

  // OAuth tokens go via Authorization: Bearer. Pay-as-you-go API keys go
  // via x-api-key. Anthropic requires the oauth-2025-04-20 beta flag for
  // OAuth-authenticated Messages API requests.
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (oauth) {
    headers['authorization'] = `Bearer ${oauth}`;
    headers['anthropic-beta'] = 'oauth-2025-04-20';
  } else if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: [
        { type: 'text', text: systemPrompt(callType), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
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
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]) as CallAnalysisResult;
}

export const ANALYSIS_MODEL = MODEL;
