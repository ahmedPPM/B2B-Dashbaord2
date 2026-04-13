'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Lead } from '@/lib/types';
import { generateMockLeads } from '@/lib/mock-data';
import { LeadTable } from '@/components/lead-table';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supa = supabaseBrowser();
        const { data } = await supa.from('leads').select('*').order('date_opted_in', { ascending: false }).limit(1000);
        setLeads(data?.length ? (data as Lead[]) : generateMockLeads(40));
      } catch {
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
