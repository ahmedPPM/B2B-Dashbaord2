import type { HyrosAttribution } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { DollarSign, Calendar, Tag } from 'lucide-react';

export function HyrosCard({ data }: { data: HyrosAttribution | null }) {
  if (!data) {
    return (
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <DollarSign className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium">Hyros Attribution</span>
        </div>
        <div className="text-sm text-zinc-500 italic">No Hyros data yet</div>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <DollarSign className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium">Hyros Attribution</span>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
          Revenue Attributed
        </div>
        <div className="text-2xl font-semibold text-emerald-300">
          {formatCurrency(data.revenue_attributed || 0)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-500 mb-1">
            <Calendar className="w-3.5 h-3.5" />First Order
          </div>
          <div className="text-sm text-zinc-200">
            {data.first_order_date ? formatDate(data.first_order_date) : '—'}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-500 mb-1">
            <Calendar className="w-3.5 h-3.5" />Last Order
          </div>
          <div className="text-sm text-zinc-200">
            {data.last_order_date ? formatDate(data.last_order_date) : '—'}
          </div>
        </div>
      </div>

      {data.tags && data.tags.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-500 mb-2">
            <Tag className="w-3.5 h-3.5" />Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
