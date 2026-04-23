'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function yearStart() { return `${new Date().getFullYear()}-01-01`; }

const RANGES = [
  { label: '7d', from: () => daysAgo(7), to: () => today() },
  { label: '30d', from: () => daysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => today() },
  { label: 'YTD', from: () => yearStart(), to: () => today() },
];

interface CloserStat {
  name: string;
  intros: number;
  demos: number;
  introsShowed: number;
  demosShowed: number;
  introShowRate: number;
  demoShowRate: number;
  closed: number;
  closeRate: number;
  cashCollected: number;
}

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5' };

export default function ClosersPage() {
  const [rangeIdx, setRangeIdx] = useState(2);
  const [closers, setClosers] = useState<CloserStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    const from = r.from();
    const to = r.to();
    setLoading(true);
    fetch(`/api/closers?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((json) => {
        setClosers(json.closers || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [rangeIdx]);

  const kpiData = closers.map((c) => ({
    name: c.name.split(' ')[0],
    Intros: c.intros,
    Demos: c.demos,
    Closed: c.closed,
  }));

  const revenueData = closers.map((c) => ({
    name: c.name.split(' ')[0],
    Cash: c.cashCollected,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">Closer Performance</h1>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                rangeIdx === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : closers.length === 0 ? (
        <div className="text-zinc-500 text-sm">No closer data for this period.</div>
      ) : (
        <>
          {/* Closer cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {closers.map((c) => (
              <div key={c.name} className="card p-4 space-y-3">
                <div className="text-base font-semibold text-zinc-100">{c.name}</div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Intros</div>
                    <div className="text-xl font-semibold text-zinc-100">{c.intros}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Demos</div>
                    <div className="text-xl font-semibold text-zinc-100">{c.demos}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Cash</div>
                    <div className="text-xl font-semibold text-emerald-400">{formatCurrency(c.cashCollected)}</div>
                  </div>
                </div>

                {/* Rate row */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 mb-1">Intro Show%</div>
                    <div className={`text-sm font-medium ${c.introShowRate >= 60 ? 'text-emerald-400' : c.introShowRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {formatPercent(c.introShowRate)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 mb-1">Demo Show%</div>
                    <div className={`text-sm font-medium ${c.demoShowRate >= 60 ? 'text-emerald-400' : c.demoShowRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {formatPercent(c.demoShowRate)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 mb-1">Close Rate</div>
                    <div className={`text-sm font-medium ${c.closeRate >= 30 ? 'text-emerald-400' : c.closeRate >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {formatPercent(c.closeRate)}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-zinc-500">
                  {c.closed} closed · {c.introsShowed} intros showed · {c.demosShowed} demos showed
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* KPI Comparison */}
            <div className="card p-4">
              <div className="text-sm font-medium text-zinc-100 mb-4">KPIs Comparison</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={kpiData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="Intros" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Demos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Closed" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Closer */}
            <div className="card p-4">
              <div className="text-sm font-medium text-zinc-100 mb-4">Revenue by Closer</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number) => [formatCurrency(v), 'Cash Collected']} />
                  <Bar dataKey="Cash" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
