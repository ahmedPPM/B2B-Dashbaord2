'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Lead } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ScoreBadge } from './score-badge';
import { StagePill } from './stage-pill';
import { ArrowUpDown } from 'lucide-react';

type SortKey = 'date_opted_in' | 'lead_name' | 'app_grading' | 'cash_collected' | 'contracted_mrr';

export function LeadTable({ leads }: { leads: Lead[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date_opted_in');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const out = [...leads];
    out.sort((a, b) => {
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av > bv ? 1 : -1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [leads, sortKey, sortDir]);

  function th(key: SortKey, label: string) {
    return (
      <th
        className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wider text-zinc-500 cursor-pointer select-none hover:text-zinc-300"
        onClick={() => {
          if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          else { setSortKey(key); setSortDir('desc'); }
        }}
      >
        <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-50" /></span>
      </th>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 border-b border-zinc-800">
            <tr>
              {th('date_opted_in', 'Opted In')}
              {th('lead_name', 'Name')}
              {th('app_grading', 'Score')}
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Stage</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Intro Show</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Demo Show</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Closer</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Closed</th>
              {th('cash_collected', 'Cash')}
              {th('contracted_mrr', 'MRR')}
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Ad Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                <td className="px-3 py-2 text-zinc-400">{formatDate(l.date_opted_in)}</td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/leads/${l.id}`} className="text-zinc-100 hover:text-emerald-400">
                    {l.lead_name || '—'}
                  </Link>
                </td>
                <td className="px-3 py-2"><ScoreBadge score={l.app_grading} /></td>
                <td className="px-3 py-2"><StagePill stage={l.pipeline_stage} name={(l as Lead & { stage_name?: string }).stage_name} /></td>
                <td className="px-3 py-2 text-zinc-400">{l.intro_show_status || '—'}</td>
                <td className="px-3 py-2 text-zinc-400">{l.demo_show_status || '—'}</td>
                <td className="px-3 py-2 text-zinc-400">{l.demo_assigned_closer || l.intro_closer || '—'}</td>
                <td className="px-3 py-2">
                  {l.client_closed
                    ? <span className="text-emerald-400">Yes</span>
                    : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2 text-zinc-200">{formatCurrency(l.cash_collected)}</td>
                <td className="px-3 py-2 text-zinc-200">{formatCurrency(l.contracted_mrr)}</td>
                <td className="px-3 py-2 text-zinc-400 truncate max-w-[180px]">{l.campaign_name || '—'}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-zinc-500">No leads match filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
