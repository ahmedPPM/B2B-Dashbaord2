'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Settings, Waves, History, BarChart3, Calendar, Phone, Trophy, Target, Menu, X } from 'lucide-react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — always visible on md+, slide-in drawer on mobile */}
      <aside
        className={cn(
          'w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col fixed md:static inset-y-0 left-0 z-40 transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-sm font-semibold">PPM</div>
              <div className="text-xs text-zinc-500">B2B Dashboard</div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-900"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition',
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                )}
              >
                <Icon className="w-4 h-4" />{label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Backdrop when mobile drawer open */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          aria-hidden="true"
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-zinc-800 px-4 md:px-6 flex items-center justify-between bg-zinc-950 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-zinc-300 hover:bg-zinc-900"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-medium text-zinc-400 truncate flex-1 md:flex-none">Premier Pool Marketing</h1>
          <button
            onClick={toggle}
            title="Exclude leads with no ad source from all metrics"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition whitespace-nowrap',
              adsOnly
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-700'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800',
            )}
          >
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{adsOnly ? 'Ads only: ON' : 'Ads only: OFF'}</span>
            <span className="sm:hidden">{adsOnly ? 'ON' : 'OFF'}</span>
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
