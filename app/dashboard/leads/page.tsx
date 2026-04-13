'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/lib/types';
import { generateMockLeads } from '@/lib/mock-data';
import { LeadTable } from '@/components/lead-table';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/leads');
        const json = await res.json();
        const rows = (json?.leads || []) as Lead[];
        setLeads(rows.length ? rows : generateMockLeads(40));
      } catch (e) {
        console.error('leads list fetch', e);
        setLeads(generateMockLeads(40));
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">All Leads</h2>
      <LeadTable leads={leads} />
    </div>
  );
}
