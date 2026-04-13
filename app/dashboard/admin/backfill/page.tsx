'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Play, Loader2, BrainCircuit, DatabaseBackup } from 'lucide-react';

interface Stats {
  totalLeads: number;
  skipped: number;
  calls: number;
  pending: number;
}

export default function BackfillAdminPage() {
  const [stats, setStats] = useState<Stats>({ totalLeads: 0, skipped: 0, calls: 0, pending: 0 });
  const [email, setEmail] = useState<string>('');
  const [running, setRunning] = useState<null | 'backfill' | 'analysis'>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supa = supabaseBrowser();
        const { data: user } = await supa.auth.getUser();
        setEmail(user.user?.email || '');
        const [{ count: totalLeads }, { count: calls }, { count: pending }, { data: lastRun }] = await Promise.all([
          supa.from('leads').select('*', { count: 'exact', head: true }),
          supa.from('call_analyses').select('*', { count: 'exact', head: true }),
          supa.from('call_analyses').select('*', { count: 'exact', head: true }).is('analyzed_at', null),
          supa.from('backfill_runs').select('total_skipped').order('started_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        setStats({
          totalLeads: totalLeads || 0,
          skipped: lastRun?.total_skipped || 0,
          calls: calls || 0,
          pending: pending || 0,
        });
      } catch {
        setStats({ totalLeads: 0, skipped: 0, calls: 0, pending: 0 });
      }
    })();
  }, []);

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdmin = !adminEmail || !email || email === adminEmail;

  async function run(kind: 'backfill' | 'analysis') {
    setRunning(kind);
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] starting ${kind}…`]);
    try {
      const path = kind === 'backfill' ? '/api/backfill/run' : '/api/sync/call-transcripts?manual=1';
      const res = await fetch(path, { method: kind === 'backfill' ? 'POST' : 'GET' });
      const data = await res.json();
      setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${kind}: ${JSON.stringify(data)}`]);
    } catch (e) {
      setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${kind} error: ${String(e)}`]);
    } finally {
      setRunning(null);
    }
  }

  if (!isAdmin) {
    return <div className="card p-6 text-sm text-zinc-400">Admin only.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold mb-1">Backfill Admin</h2>
        <p className="text-sm text-zinc-500">Run one-time syncs from GHL and trigger AI call analysis.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Leads" value={stats.totalLeads} />
        <Stat label="Skipped (last run)" value={stats.skipped} />
        <Stat label="Calls Found" value={stats.calls} />
        <Stat label="Pending Analyses" value={stats.pending} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <DatabaseBackup className="w-4 h-4 text-emerald-400" />
            <h3 className="font-medium">Run GHL Backfill</h3>
          </div>
          <p className="text-sm text-zinc-400 mb-4">Pull all contacts with B2B tags from {process.env.NEXT_PUBLIC_BACKFILL_START_DATE || '2026-01-01'} forward and upsert.</p>
          <button onClick={() => run('backfill')} disabled={running !== null} className="btn btn-primary inline-flex items-center gap-2">
            {running === 'backfill' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Backfill
          </button>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="w-4 h-4 text-emerald-400" />
            <h3 className="font-medium">Run Call Analysis</h3>
          </div>
          <p className="text-sm text-zinc-400 mb-4">Run Claude on up to 20 pending call transcripts.</p>
          <button onClick={() => run('analysis')} disabled={running !== null} className="btn btn-primary inline-flex items-center gap-2">
            {running === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Call Analysis
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Log</div>
          <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{log.join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
