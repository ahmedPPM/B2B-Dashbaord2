// Shared definition of "from ads" / "paid" used everywhere the dashboard
// can exclude organic/manual leads.

export interface PaidFields {
  campaign_id?: string | null;
  campaign_name?: string | null;
  lead_source?: string | null;
  is_paid_ad?: boolean;       // computed server-side in /api/leads
  hyros_paid?: boolean;
}

const PAID_SOURCE_RX = /facebook|meta|google|tiktok|instagram|youtube|paid|fb\b/i;

// A lead is "from ads" if ANY signal says so:
//  - /api/leads already computed is_paid_ad (hyros OR campaign OR source match)
//  - has campaign_id / campaign_name (Meta pixel attribution)
//  - lead_source matches a known paid platform
export function isFromAds(l: PaidFields): boolean {
  if (l.is_paid_ad === true) return true;
  if (l.hyros_paid === true) return true;
  if (l.campaign_id || l.campaign_name) return true;
  const s = (l.lead_source || '').toLowerCase();
  return PAID_SOURCE_RX.test(s);
}

// A lead is "Hyros-verified" only if Hyros's pixel actually attributed it to
// a paid click. Strictest filter — drops organic, survey leads, and any
// contact Hyros never saw.
export function isHyrosVerified(l: PaidFields): boolean {
  return l.hyros_paid === true;
}

// Single helper for the dashboard's 3-way filter. Returns true when the
// lead should be visible in the given mode.
export function matchesLeadFilter(l: PaidFields, mode: 'all' | 'ads' | 'hyros'): boolean {
  if (mode === 'hyros') return isHyrosVerified(l);
  if (mode === 'ads') return isFromAds(l);
  return true;
}
