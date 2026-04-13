import type { Lead, WindsorRow } from './types';

const FIRST = ['Alex','Jordan','Taylor','Morgan','Riley','Casey','Jamie','Drew','Sam','Chris','Pat','Robin','Quinn','Avery','Logan'];
const LAST = ['Walker','Rivera','Brooks','Patel','Nguyen','Kim','Hayes','Foster','Bell','Reed','Cole','Ward','Grant','Hale','Pope'];
const CAMPAIGNS = ['B2B Scale 2026','Pool Pros Nurture','High-Ticket Retarget','Cold AZ Q1','FL Pool Co Push'];
const CLOSERS = ['Anas','Jake','Mia','Ryan'];
const STAGES = ['new_lead','intro_booked','intro_showed','demo_booked','demo_showed','closed','no_show','dq'];
const SHOW_STATUSES = ['showed','noshow','cancelled', null];

function rand<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function chance(p: number) { return Math.random() < p; }

function isoInYear(m: number, d: number, h = 10) {
  return new Date(Date.UTC(2026, m, d, h, 0, 0)).toISOString();
}

export function generateMockLeads(n = 40): Lead[] {
  const out: Lead[] = [];
  for (let i = 0; i < n; i++) {
    const month = Math.floor(Math.random() * 4); // Jan-Apr
    const day = 1 + Math.floor(Math.random() * 27);
    const opted = isoInYear(month, day);
    const name = `${rand(FIRST)} ${rand(LAST)}`;
    const introBooked = chance(0.55);
    const introShowed = introBooked && chance(0.7);
    const demoBooked = introShowed && chance(0.6);
    const demoShowed = demoBooked && chance(0.75);
    const closed = demoShowed && chance(0.35);
    const grading = (rand([1, 2, 2, 3, 3, 3, 4])) as 1 | 2 | 3 | 4;
    const cash = closed ? 1500 + Math.floor(Math.random() * 8500) : 0;
    const mrr = closed ? 2000 + Math.floor(Math.random() * 4000) : 0;

    out.push({
      id: `mock-${i}`,
      ghl_contact_id: `mock-ghl-${i}`,
      date_opted_in: opted,
      lead_name: name,
      phone: `+1555${String(1000000 + i).slice(-7)}`,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      app_grading: grading,
      campaign_id: null,
      ad_set_id: null,
      ad_id: null,
      campaign_name: rand(CAMPAIGNS),
      ad_set_name: null,
      ad_name: null,
      dials_per_lead: Math.floor(Math.random() * 6),
      speed_to_lead_minutes: Math.floor(Math.random() * 180),
      lead_source: rand(['Meta', 'Google', 'Referral']),
      pipeline_stage: closed ? 'closed' : demoBooked ? 'demo_booked' : introBooked ? 'intro_booked' : 'new_lead',
      intro_booked: introBooked,
      intro_created_date: introBooked ? opted : null,
      intro_booked_for_date: introBooked ? isoInYear(month, Math.min(day + 2, 28)) : null,
      intro_show_status: introBooked ? (introShowed ? 'showed' : rand(SHOW_STATUSES) || 'noshow') : null,
      intro_converted_to_demo: demoBooked,
      intro_call_outcome: introShowed ? rand(['qualified', 'needs_followup', 'not_fit']) : null,
      intro_closer: introBooked ? rand(CLOSERS) : null,
      demo_booked: demoBooked,
      demo_created_date: demoBooked ? isoInYear(month, Math.min(day + 3, 28)) : null,
      demo_booked_for_date: demoBooked ? isoInYear(month, Math.min(day + 5, 28)) : null,
      demo_show_status: demoBooked ? (demoShowed ? 'showed' : 'noshow') : null,
      demo_call_outcome: demoShowed ? (closed ? 'closed' : 'not_closed') : null,
      why_didnt_close: demoShowed && !closed ? rand(['price', 'timing', 'not_decision_maker']) : null,
      demo_assigned_closer: demoBooked ? rand(CLOSERS) : null,
      offer_pitched: demoShowed,
      client_closed: closed,
      cash_collected: cash,
      contracted_mrr: mrr,
      lead_tag: rand(['b2b typeform optin', 'new_lead']),
      backfilled: true,
      created_at: opted,
      updated_at: opted,
    });
  }
  return out;
}

export function generateMockSpend(): WindsorRow[] {
  const out: WindsorRow[] = [];
  for (let m = 0; m < 4; m++) {
    for (let d = 1; d <= 28; d += 2) {
      out.push({
        id: `spend-${m}-${d}`,
        date: `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        campaign_id: null,
        campaign_name: rand(CAMPAIGNS),
        ad_set_id: null,
        ad_id: null,
        spend: 150 + Math.floor(Math.random() * 400),
        impressions: 2000 + Math.floor(Math.random() * 8000),
        clicks: 50 + Math.floor(Math.random() * 200),
        created_at: new Date().toISOString(),
      });
    }
  }
  return out;
}
