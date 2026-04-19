// Tag-based intro/demo outcome classification.
//
// Source of truth per Anas: the GHL tag on the contact. A lead can carry
// multiple lifecycle tags (e.g. demo-showed then later demo-no-show, or
// both demo-no-show and demo-cancelled if the rescheduled call also
// fell through). Priority when more than one tag applies:
//
//   cancelled  >  no-show  >  showed
//
// Cancellation is the most definitive outcome — a cancelled lead never
// made it to the call, so even if they had a "showed" tag from a prior
// attempt, the cancellation supersedes it.

export type CallOutcome = 'cancelled' | 'noshow' | 'showed' | null;

// Normalise a tag to a canonical form: lowercase, any `_` or `-` → ` `,
// collapse whitespace. `demo-no-show` and `DEMO_NOSHOW` both become
// `demo no show`.
function norm(tag: string): string {
  return tag.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function classifyFromTags(tags: string[] | null | undefined, kind: 'intro' | 'demo'): CallOutcome {
  if (!tags?.length) return null;
  const canonicalised = tags.map(norm);
  const is = (needle: RegExp) => canonicalised.some((t) => needle.test(t));

  const prefix = kind; // "intro" or "demo"
  const cancelled = new RegExp(`\\b${prefix}\\b.*\\bcancel`);
  const noshow = new RegExp(`\\b${prefix}\\b.*\\bno ?show\\b`);
  const showed = new RegExp(`\\b${prefix}\\b.*\\bshow(ed)?\\b`);

  if (is(cancelled)) return 'cancelled';
  if (is(noshow)) return 'noshow';
  if (is(showed)) return 'showed';
  return null;
}
