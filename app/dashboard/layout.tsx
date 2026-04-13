'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { LayoutDashboard, Users, Settings, LogOut, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/admin/backfill', label: 'Backfill Admin', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const supa = supabaseBrowser();
        const { data } = await supa.auth.getUser();
        if (data.user?.email) setEmail(data.user.email);
      } catch {
        // no creds
      }
    })();
  }, []);

  async function logout() {
    try {
      const supa = supabaseBrowser();
      await supa.auth.signOut();
    } catch {
      // ignore
    }
    router.push('/login');
  }

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

        <button
          onClick={logout}
          className="m-3 p-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />Logout
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-950">
          <h1 className="text-sm font-medium text-zinc-400">Premier Pool Marketing</h1>
          <div className="text-xs text-zinc-500">{email || 'not signed in'}</div>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
