'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

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

interface Props {
  value: FilterState;
  onChange: (v: FilterState) => void;
  closers: string[];
  campaigns: string[];
  stages?: string[];
}

export function Filters({ value, onChange, closers, campaigns, stages }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = [value.score, value.stage, value.introStatus, value.demoStatus, value.closed, value.closer, value.campaign].filter(Boolean).length;

  return (
    <div className="mb-4">
      {/* Mobile trigger */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-full card p-3 flex items-center justify-between text-sm text-zinc-300 hover:bg-zinc-900/60"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filters — {value.month}
            {activeCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-emerald-600/30 text-emerald-300">
                {activeCount}
              </span>
            )}
          </span>
          <span className="text-zinc-500 text-xs">Tap to adjust</span>
        </button>
      </div>

      {/* Mobile bottom sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 inset-x-0 bg-zinc-950 rounded-t-2xl border-t border-zinc-800 max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 py-3">
              <h3 className="font-medium">Filters</h3>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <FilterInputs value={value} onChange={onChange} closers={closers} campaigns={campaigns} stages={stages} stacked />
              <button
                onClick={() => setMobileOpen(false)}
                className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium mt-4 text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop grid */}
      <div className="hidden md:block card p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <FilterInputs value={value} onChange={onChange} closers={closers} campaigns={campaigns} stages={stages} />
        </div>
      </div>
    </div>
  );
}

function FilterInputs({
  value, onChange, closers, campaigns, stages, stacked,
}: Props & { stacked?: boolean }) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: v });
  const cls = stacked ? 'input w-full' : 'input';

  return (
    <>
      <select className={cls} value={value.month} onChange={(e) => set('month', e.target.value)}>
        {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <select className={cls} value={value.score} onChange={(e) => set('score', e.target.value)}>
        <option value="">All scores</option>
        <option value="4">4 — Hot</option>
        <option value="3">3 — Good</option>
        <option value="2">2 — Weak</option>
        <option value="1">1 — Trash</option>
      </select>

      <select className={cls} value={value.stage} onChange={(e) => set('stage', e.target.value)}>
        <option value="">All stages</option>
        {(stages && stages.length ? stages : ['New Lead','Intro Booked','Intro Showed','Demo Booked','Demo Showed','Closed']).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select className={cls} value={value.introStatus} onChange={(e) => set('introStatus', e.target.value)}>
        <option value="">Intro status</option>
        <option value="scheduled">Scheduled</option>
        <option value="showed">Showed</option>
        <option value="noshow">No-show</option>
        <option value="cancelled">Cancelled</option>
      </select>

      <select className={cls} value={value.demoStatus} onChange={(e) => set('demoStatus', e.target.value)}>
        <option value="">Demo status</option>
        <option value="scheduled">Scheduled</option>
        <option value="showed">Showed</option>
        <option value="noshow">No-show</option>
        <option value="cancelled">Cancelled</option>
      </select>

      <select className={cls} value={value.closed} onChange={(e) => set('closed', e.target.value)}>
        <option value="">Closed?</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>

      <select className={cls} value={value.closer} onChange={(e) => set('closer', e.target.value)}>
        <option value="">All closers</option>
        {closers.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select className={cls} value={value.campaign} onChange={(e) => set('campaign', e.target.value)}>
        <option value="">All campaigns</option>
        {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </>
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
