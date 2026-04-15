'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Settings, Waves, History, BarChart3, Calendar, Phone, Trophy, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdsOnlyProvider, useAdsOnly } from '@/lib/ads-only-context';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/appointments', label: 'Appointments', icon: Calendar },
  { href: '/dashboard/calls', label: 'Calls', icon: Phone },
  { href: '/dashboard/clients', label: 'Won Clients', icon: Trophy },
  { href: '/dashboard/ads', label: 'Ads Performance', icon: BarChart3 },
  { href: '/dashboard/admin/activity', label: 'Activity Log', icon: History },
  { href: '/dashboard/admin/backfill', label: 'Backfill Admin', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdsOnlyProvider>
      <LayoutInner>{children}</LayoutInner>
    </AdsOnlyProvider>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { adsOnly, toggle } = useAdsOnly();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-sm font-semibold">PPM</div>
              <div className="text-xs text-zinc-500">B2B Dashboard</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                )}
              >
                <Icon className="w-4 h-4" />{label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-950">
          <h1 className="text-sm font-medium text-zinc-400">Premier Pool Marketing</h1>
          <button
            onClick={toggle}
            title="Exclude leads with no ad source from all metrics"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition ${
              adsOnly
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-700'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            {adsOnly ? 'Ads only: ON' : 'Ads only: OFF'}
          </button>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
