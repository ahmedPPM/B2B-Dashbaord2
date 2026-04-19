'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// 3-way lead-visibility filter used across every dashboard page:
//   'all'   → every lead in the DB
//   'ads'   → any lead with a paid signal (campaign_id, paid source regex, hyros)
//   'hyros' → only leads Hyros confirms as paid (strictest view; default)
export type LeadFilterMode = 'all' | 'ads' | 'hyros';

interface Ctx {
  mode: LeadFilterMode;
  setMode: (m: LeadFilterMode) => void;
  cycle: () => void;
  // Back-compat — existing consumers only know `adsOnly`. True whenever
  // the filter is anything stricter than 'all'.
  adsOnly: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
  hyrosOnly: boolean;
  qs: string;
}

const AdsOnlyContext = createContext<Ctx>({
  mode: 'hyros',
  setMode: () => {},
  cycle: () => {},
  adsOnly: true,
  toggle: () => {},
  set: () => {},
  hyrosOnly: true,
  qs: '',
});

const KEY = 'dashboard:leadFilterMode';
const LEGACY_KEY = 'dashboard:adsOnly';
const ORDER: LeadFilterMode[] = ['all', 'ads', 'hyros'];

export function AdsOnlyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<LeadFilterMode>('hyros');

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'all' || v === 'ads' || v === 'hyros') {
        setModeState(v);
        return;
      }
      // Migrate the old binary toggle if present.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'true') setModeState('ads');
      else if (legacy === 'false') setModeState('all');
    } catch { /* ignore */ }
  }, []);

  const setMode = useCallback((m: LeadFilterMode) => {
    setModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }, []);

  const cycle = useCallback(() => {
    const idx = ORDER.indexOf(mode);
    setMode(ORDER[(idx + 1) % ORDER.length]);
  }, [mode, setMode]);

  const adsOnly = mode !== 'all';
  const hyrosOnly = mode === 'hyros';
  const set = useCallback((v: boolean) => setMode(v ? 'ads' : 'all'), [setMode]);
  const toggle = useCallback(() => set(!adsOnly), [set, adsOnly]);

  const qs = hyrosOnly ? '?hyrosOnly=true' : adsOnly ? '?adsOnly=true' : '';

  return (
    <AdsOnlyContext.Provider value={{ mode, setMode, cycle, adsOnly, toggle, set, hyrosOnly, qs }}>
      {children}
    </AdsOnlyContext.Provider>
  );
}

export function useAdsOnly() {
  return useContext(AdsOnlyContext);
}

export function withAdsOnly(url: string, adsOnly: boolean): string {
  if (!adsOnly) return url;
  return url.includes('?') ? `${url}&adsOnly=true` : `${url}?adsOnly=true`;
}
