'use client';

import { useEffect, useState } from 'react';

interface SyncSource {
  name: string;
  key: string;
  last_sync: string | null;
}

const SYNC_ENDPOINTS: Record<string, string> = {
  ghl: '/api/sync/ghl-contacts?manual=1',
  windsor: '/api/sync/windsor?manual=1',
  hyros: '/api/sync/hyros-list?manual=1',
  calendly: '/api/sync/calls-from-ghl?manual=1',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never synced';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusDot(iso: string | null): string {
  if (!iso) return 'bg-red-500';
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs <= 2) return 'bg-emerald-500';
  if (hrs <= 24) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function SettingsPage() {
  const [sources, setSources] = useState<SyncSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncingAll, setSyncingAll] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings/sync-status');
      const json = await res.json();
      setSources(json.sources || []);
    } catch (err) {
      console.error('sync-status fetch', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const triggerSync = async (key: string) => {
    const endpoint = SYNC_ENDPOINTS[key];
    if (!endpoint) return;
    setSyncing((prev) => ({ ...prev, [key]: true }));
    try {
      await fetch(endpoint);
      await fetchStatus();
    } catch (err) {
      console.error('sync error', key, err);
    } finally {
      setSyncing((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      for (const key of Object.keys(SYNC_ENDPOINTS)) {
        await fetch(SYNC_ENDPOINTS[key]);
      }
      await fetchStatus();
    } catch (err) {
      console.error('sync all error', err);
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <button
          onClick={handleSyncAll}
          disabled={syncingAll}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition"
        >
          {syncingAll ? 'Syncing…' : 'Sync All'}
        </button>
      </div>

      {/* Data Sync Status */}
      <div className="card p-4 space-y-4">
        <div className="text-sm font-medium text-zinc-100">Data Sync Status</div>

        {loading ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {sources.map((src) => (
              <div key={src.key} className="flex items-center gap-3">
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(src.last_sync)}`} />
                {/* Name + time */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200">{src.name}</div>
                  <div className="text-xs text-zinc-500">
                    {src.last_sync
                      ? `Last synced: ${timeAgo(src.last_sync)}`
                      : 'Never synced'}
                  </div>
                </div>
                {/* Sync button */}
                <button
                  onClick={() => triggerSync(src.key)}
                  disabled={syncing[src.key]}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {syncing[src.key] ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Syncing
                    </>
                  ) : (
                    'Sync'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Schedule */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium text-zinc-100">Sync Schedule</div>
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <div>
              <div className="text-sm text-zinc-300">GHL, Hyros</div>
              <div className="text-xs text-zinc-500">Every 30 minutes</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 shrink-0" />
            <div>
              <div className="text-sm text-zinc-300">Windsor AI</div>
              <div className="text-xs text-zinc-500">Every 6 hours</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
            <div>
              <div className="text-sm text-zinc-300">Calls / Calendly</div>
              <div className="text-xs text-zinc-500">On demand</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
