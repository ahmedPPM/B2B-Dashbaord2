'use client';

export interface FilterState {
  month: string;
  score: string;
  stage: string;
  introStatus: string;
  demoStatus: string;
  closed: string;
  closer: string;
  campaign: string;
}

const MONTHS = [
  'All 2026',
  'Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026',
  'Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026',
];

export function Filters({
  value,
  onChange,
  closers,
  campaigns,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  closers: string[];
  campaigns: string[];
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="card p-3 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <select className="input" value={value.month} onChange={(e) => set('month', e.target.value)}>
          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select className="input" value={value.score} onChange={(e) => set('score', e.target.value)}>
          <option value="">All scores</option>
          <option value="4">4 — Hot</option>
          <option value="3">3 — Good</option>
          <option value="2">2 — Weak</option>
          <option value="1">1 — Trash</option>
        </select>

        <select className="input" value={value.stage} onChange={(e) => set('stage', e.target.value)}>
          <option value="">All stages</option>
          <option value="new_lead">New lead</option>
          <option value="intro_booked">Intro booked</option>
          <option value="intro_showed">Intro showed</option>
          <option value="demo_booked">Demo booked</option>
          <option value="demo_showed">Demo showed</option>
          <option value="closed">Closed</option>
        </select>

        <select className="input" value={value.introStatus} onChange={(e) => set('introStatus', e.target.value)}>
          <option value="">Intro status</option>
          <option value="showed">Showed</option>
          <option value="noshow">No-show</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select className="input" value={value.demoStatus} onChange={(e) => set('demoStatus', e.target.value)}>
          <option value="">Demo status</option>
          <option value="showed">Showed</option>
          <option value="noshow">No-show</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select className="input" value={value.closed} onChange={(e) => set('closed', e.target.value)}>
          <option value="">Closed?</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        <select className="input" value={value.closer} onChange={(e) => set('closer', e.target.value)}>
          <option value="">All closers</option>
          {closers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="input" value={value.campaign} onChange={(e) => set('campaign', e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}

export const defaultFilters: FilterState = {
  month: 'All 2026',
  score: '',
  stage: '',
  introStatus: '',
  demoStatus: '',
  closed: '',
  closer: '',
  campaign: '',
};
