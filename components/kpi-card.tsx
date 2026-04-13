import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number | null;
  tooltip?: string;
  format?: 'currency' | 'percent' | 'number' | 'raw';
  accent?: 'positive' | 'negative' | 'neutral';
}

export function KpiCard({ label, value, delta, tooltip, accent = 'neutral' }: KpiCardProps) {
  const accentColor =
    accent === 'positive' ? 'text-emerald-400' :
    accent === 'negative' ? 'text-red-400' :
    'text-zinc-100';

  return (
    <div className="card p-4" title={tooltip}>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5">{label}</div>
      <div className={cn('text-2xl font-semibold', accentColor)}>{value}</div>
      {delta !== undefined && delta !== null && !isNaN(delta) && (
        <div className={cn(
          'text-xs mt-1 flex items-center gap-1',
          delta >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {delta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
