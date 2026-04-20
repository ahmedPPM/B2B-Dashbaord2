import { query } from '@anthropic-ai/claude-agent-sdk';
import { createRequire } from 'module';
import type { CallAnalysisResult } from './types';

// Locate the claude CLI that ships with @anthropic-ai/claude-code.
// Railway's npm install runs the platform-specific postinstall, which
// drops the Linux binary at node_modules/@anthropic-ai/claude-code/bin/claude.exe
// on the deploy container (same filename across platforms).
const requireFromHere = createRequire(import.meta.url);
let resolvedClaudeCliPath: string | null = null;
try {
  const pkgJsonPath = requireFromHere.resolve('@anthropic-ai/claude-code/package.json');
  resolvedClaudeCliPath = pkgJsonPath.replace(/package\.json$/, 'bin/claude.exe');
} catch {
  // The SDK has its own fallback resolver if we leave the path unset.
}

// Model served via the Claude Max subscription through the Agent SDK.
// Auth comes from CLAUDE_CODE_OAUTH_TOKEN (generated once via `claude setup-token`).
// We disable all tools — this is a one-shot structured text generation, no agent loop.
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
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN missing (run `claude setup-token` to generate one)');
  }

  const result = query({
    prompt: `Transcript:\n${transcript}`,
    options: {
      model: MODEL,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt(callType) },
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      ...(resolvedClaudeCliPath ? { pathToClaudeCodeExecutable: resolvedClaudeCliPath } : {}),
    },
  });

  let final = '';
  for await (const msg of result) {
    if (msg.type !== 'result') continue;
    if (msg.subtype === 'success') {
      final = msg.result || '';
    } else {
      throw new Error(`Agent SDK error: ${msg.subtype}`);
    }
  }
  if (!final) throw new Error('No result from Agent SDK query');

  const match = final.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${final.slice(0, 200)}`);
  return JSON.parse(match[0]) as CallAnalysisResult;
}

export const ANALYSIS_MODEL = MODEL;
