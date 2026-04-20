import type { GHLContact } from './ghl';

// Lead scoring heuristics — returns 1 (trash) → 4 (hot).
// 4 = high-revenue pool company in top-tier city
// 3 = qualified mid-market
// 2 = small but legit
// 1 = spam / competitor / unqualified

const TOP_TIER_CITIES = new Set([
  'phoenix', 'scottsdale', 'miami', 'dallas', 'houston', 'austin', 'tampa',
  'orlando', 'jacksonville', 'las vegas', 'los angeles', 'san diego',
  'palm springs', 'sarasota', 'naples', 'fort lauderdale', 'atlanta',
]);

const COMPETITOR_KEYWORDS = ['competitor', 'agency', 'marketing consultant'];

function cf(contact: GHLContact, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = (contact as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function parseRevenue(s: string | undefined): number {
  if (!s) return 0;
  const digits = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(digits);
  if (isNaN(n)) return 0;
  if (/m/i.test(s)) return n * 1_000_000;
  if (/k/i.test(s)) return n * 1_000;
  return n;
}

export function calculateLeadScore(contact: GHLContact): 1 | 2 | 3 | 4 {
  const email = (contact.email || '').toLowerCase();
  const phone = contact.phone || '';
  const city = (cf(contact, ['city']) || '').toLowerCase();
  const revenueStr = cf(contact, ['revenue', 'annual_revenue', 'company_revenue']);
  const revenue = parseRevenue(revenueStr);
  // GHL webhooks occasionally send `tags` as a comma-delimited string
  // instead of an array, so normalise before joining.
  const rawTags = contact.tags as unknown;
  const tagArr = Array.isArray(rawTags)
    ? (rawTags as string[])
    : typeof rawTags === 'string'
      ? (rawTags as string).split(',').map((s) => s.trim())
      : [];
  const tags = tagArr.join(' ').toLowerCase();

  // Trash signals
  if (!email || !phone) return 1;
  if (/(test|noreply|example\.com|mailinator)/.test(email)) return 1;
  if (COMPETITOR_KEYWORDS.some((k) => tags.includes(k))) return 1;

  // Top-tier
  if (revenue > 2_000_000 && TOP_TIER_CITIES.has(city)) return 4;
  if (revenue > 500_000) return 3;
  if (revenue > 0) return 2;

  // Default: no revenue info but has contact -> 2
  return 2;
}
