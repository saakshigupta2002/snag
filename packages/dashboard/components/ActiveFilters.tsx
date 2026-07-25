import Link from 'next/link';

export interface FilterChip {
  /** The query key this chip owns (or 'range' for a from+to pair). */
  key: string;
  label: string;
}

/**
 * The active-filter summary bar shown on any drilled-into list (sessions
 * today). Each chip links to the same page with that filter removed, so the
 * filter state stays legible and reversible as you move between views.
 */
export function ActiveFilters({
  chips,
  basePath,
  sp,
  filterKeys,
}: {
  chips: FilterChip[];
  basePath: string;
  sp: Record<string, string | undefined>;
  filterKeys: string[];
}) {
  const hrefWithout = (chipKey: string): string => {
    const drop = chipKey === 'range' ? ['from', 'to'] : chipKey === 'from' ? ['from', 'to'] : [chipKey];
    const p = new URLSearchParams();
    for (const k of filterKeys) {
      if (drop.includes(k)) continue;
      if (sp[k]) p.set(k, sp[k]!);
    }
    const q = p.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <div className="filterbar active-filters">
      <span className="filter-chips">
        {chips.map((c) => (
          <Link key={`${c.key}:${c.label}`} className="filter-chip" href={hrefWithout(c.key)}>
            {c.label} <span aria-hidden>✕</span>
          </Link>
        ))}
      </span>
      <Link className="mini" href={basePath}>
        Clear
      </Link>
    </div>
  );
}
