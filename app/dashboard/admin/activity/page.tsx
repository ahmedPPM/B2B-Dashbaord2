'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { RotateCcw, Loader2, Search } from 'lucide-react';

interface Row {
  id: string;
  lead_id: string | null;
  action: string;
  actor: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
  lead: { id: string; lead_name: string | null; email: string | null; deleted_at: string | null } | null;
}

export default function ActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'edit' | 'delete' | 'restore'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (r.actor || '').toLowerCase().includes(q) ||
        (r.lead?.lead_name || '').toLowerCase().includes(q) ||
        (r.lead?.email || '').toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q)
      );
    });
  }, [rows, query, actionFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/activity?limit=200');
      const json = await res.json();
      setRows((json?.rows || []) as Row[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function restore(leadId: string) {
    setRestoring(leadId);
    try {
      await fetch(`/api/leads/${leadId}?restore=true`, { method: 'DELETE' });
      await load();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Activity Log</h2>
          <p className="text-sm text-zinc-500">All edits, deletes, and restores. Most recent first.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['all', 'edit', 'delete', 'restore'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                className={`px-3 py-1.5 text-xs rounded ${actionFilter === a ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lead, actor…"
              className="input w-full pl-9"
            />
          </div>
        </div>
      </div>
      <div className="text-xs text-zinc-500">{filtered.length} of {rows.length} entries</div>

      {loading && <div className="text-zinc-500">Loading…</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 border-b border-zinc-800">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">When</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Action</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Lead</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Actor</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Details</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-zinc-800/50 align-top">
                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <ActionBadge action={r.action} />
                </td>
                <td className="px-3 py-2">
                  {r.lead ? (
                    <Link href={`/dashboard/leads/${r.lead.id}`} className="text-zinc-100 hover:text-emerald-400">
                      {r.lead.lead_name || r.lead.email || r.lead.id.slice(0, 8)}
                    </Link>
                  ) : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2 text-zinc-400">{r.actor || 'dashboard'}</td>
                <td className="px-3 py-2 text-zinc-300 text-xs">
                  <DiffSummary before={r.before} after={r.after} action={r.action} />
                </td>
                <td className="px-3 py-2">
                  {r.action === 'delete' && r.lead && r.lead.deleted_at && (
                    <button
                      onClick={() => r.lead_id && restore(r.lead_id)}
                      disabled={restoring === r.lead_id}
                      className="btn inline-flex items-center gap-1 text-emerald-400"
                    >
                      {restoring === r.lead_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-zinc-500 text-sm">
            {rows.length === 0 ? 'No activity yet.' : 'No matches.'}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color =
    action === 'delete' ? 'bg-red-950/50 text-red-300 border-red-900/50' :
    action === 'restore' ? 'bg-emerald-950/50 text-emerald-300 border-emerald-900/50' :
    'bg-zinc-800/50 text-zinc-300 border-zinc-700';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs border ${color}`}>{action}</span>;
}

function DiffSummary({ before, after, action }: { before: unknown; after: unknown; action: string }) {
  if (action === 'delete') return <span className="text-red-400">deleted</span>;
  if (action === 'restore') return <span className="text-emerald-400">restored</span>;
  if (action === 'edit' && before && after && typeof before === 'object' && typeof after === 'object') {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = Object.keys(a);
    return (
      <div className="space-y-0.5">
        {keys.map((k) => (
          <div key={k}>
            <span className="text-zinc-500">{k}:</span>{' '}
            <span className="text-red-300 line-through">{String(b[k] ?? '—')}</span>{' → '}
            <span className="text-emerald-300">{String(a[k] ?? '—')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
