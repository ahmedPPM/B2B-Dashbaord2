'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Lead } from '@/lib/types';
import { LeadTable } from '@/components/lead-table';
import { useAdsOnly } from '@/lib/ads-only-context';
import { isFromAds } from '@/lib/is-paid';
import { Search } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
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
    return leads.filter((l) => {
      if (adsOnly && !isFromAds(l)) return false;
      if (!q) return true;
      return (
        (l.lead_name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.assigned_user_name || '').toLowerCase().includes(q) ||
        (l.campaign_name || '').toLowerCase().includes(q)
      );
    });
  }, [leads, query, adsOnly]);

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
      <div className="text-xs text-zinc-500">
        {filtered.length} of {leads.length} leads
      </div>
      <LeadTable leads={filtered} />
    </div>
  );
}
