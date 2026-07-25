'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Quietly re-fetches the current server component tree on an interval so the
 * overview's "live now" and counts stay fresh without a manual reload. Pauses
 * while the tab is hidden to avoid pointless background work.
 */
export function LiveRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
