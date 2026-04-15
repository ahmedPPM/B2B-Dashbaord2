'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface Ctx {
  adsOnly: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
  qs: string; // "?adsOnly=true" or ""
}

const AdsOnlyContext = createContext<Ctx>({ adsOnly: false, toggle: () => {}, set: () => {}, qs: '' });

const KEY = 'dashboard:adsOnly';

export function AdsOnlyProvider({ children }: { children: React.ReactNode }) {
  const [adsOnly, setState] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'true') setState(true);
    } catch { /* ignore */ }
  }, []);

  const set = useCallback((v: boolean) => {
    setState(v);
    try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => set(!adsOnly), [adsOnly, set]);

  const qs = adsOnly ? '?adsOnly=true' : '';

  return (
    <AdsOnlyContext.Provider value={{ adsOnly, toggle, set, qs }}>
      {children}
    </AdsOnlyContext.Provider>
  );
}

export function useAdsOnly() {
  return useContext(AdsOnlyContext);
}

// Helper for appending adsOnly to an existing URL / query-string.
export function withAdsOnly(url: string, adsOnly: boolean): string {
  if (!adsOnly) return url;
  return url.includes('?') ? `${url}&adsOnly=true` : `${url}?adsOnly=true`;
}
