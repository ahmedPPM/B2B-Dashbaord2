import type { HyrosAttribution } from '@/lib/types';
import { Tag } from 'lucide-react';

export function HyrosCard({ data }: { data: HyrosAttribution | null }) {
  const tags = data?.tags?.filter(Boolean) || [];

  if (!tags.length) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
        <Tag className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium">Hyros Tags</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
