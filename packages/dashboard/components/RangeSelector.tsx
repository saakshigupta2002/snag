'use client';

import { usePathname, useRouter } from 'next/navigation';

const RANGES = [7, 14, 30] as const;

export function RangeSelector({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="range-selector">
      {RANGES.map((d) => (
        <button
          key={d}
          className={d === days ? 'active' : ''}
          onClick={() => router.push(`${pathname}?days=${d}`)}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
