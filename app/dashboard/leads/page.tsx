'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Lead } from '@/lib/types';
import { LeadTable } from '@/components/lead-table';
import { useAdsOnly } from '@/lib/ads-only-context';
import { isFromAds } from '@/lib/is-paid';
import { Search } from 'lucide-react';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

const RANGES = [
  { label: 'Last 7d', from: () => daysAgo(7), to: () => today() },
  { label: 'Last 30d', from: () => daysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => today() },
  { label: 'YTD', from: () => '2026-01-01', to: () => today() },
  { label: 'All', from: () => '2020-01-01', to: () => '2030-12-31' },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
  const [rangeIdx, setRangeIdx] = useState(4); // default All
  const { adsOnly } = useAdsOnly();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/leads');
        const json = await res.json();
        setLeads((json?.leads || []) as Lead[]);
      } catch (e) {
        console.error('leads list fetch', e);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = RANGES[rangeIdx];
    const from = r.from() + 'T00:00:00Z';
    const to = r.to() + 'T23:59:59Z';
    return leads.filter((l) => {
      if (adsOnly && !isFromAds(l)) return false;
      if (l.date_opted_in) {
        if (l.date_opted_in < from || l.date_opted_in > to) return false;
      }
      if (!q) return true;
      return (
        (l.lead_name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.assigned_user_name || '').toLowerCase().includes(q) ||
        (l.campaign_name || '').toLowerCase().includes(q)
      );
    });
  }, [leads, query, adsOnly, rangeIdx]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-semibold">All Leads</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, closer…"
            className="input w-full pl-9"
          />
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            className={`px-3 py-2 text-xs rounded min-h-[40px] ${i === rangeIdx ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="text-xs text-zinc-500">
        {filtered.length} of {leads.length} leads
      </div>
      <LeadTable leads={filtered} />
    </div>
  );
}
