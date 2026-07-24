'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { HeatmapPageStat } from '@snag/shared';

export function HeatmapPagePicker({
  pages,
  current,
}: {
  pages: HeatmapPageStat[];
  current: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <nav className="heat-pagelist" aria-label="Pages">
      {pages.map((p) => (
        <button
          key={p.page}
          className={p.page === current ? 'active' : ''}
          onClick={() => router.push(`${pathname}?page=${encodeURIComponent(p.page)}`)}
          title={p.page}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.page}
          </span>
          <span className="heat-count">{p.clicks}</span>
        </button>
      ))}
    </nav>
  );
}
