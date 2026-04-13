'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Mail, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Premier Pool Marketing</div>
          <h1 className="text-2xl font-semibold">B2B Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-2">Sign in with a magic link.</p>
        </div>

        {status === 'sent' ? (
          <div className="p-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 text-emerald-300 text-sm">
            Check your email for a magic link.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-zinc-400 mb-1.5 block">Email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@premierpoolmarketing.com"
                  className="input w-full pl-9"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Send magic link
            </button>

            {error && <div className="text-sm text-red-400">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
