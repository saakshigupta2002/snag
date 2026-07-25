'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { Segment } from '@snag/shared';
import { useToast } from './Toast';

const DIMS: { key: string; label: string }[] = [
  { key: 'device', label: 'Device' },
  { key: 'browser', label: 'Browser' },
  { key: 'os', label: 'OS' },
  { key: 'country', label: 'Country' },
  { key: 'channel', label: 'Channel' },
];

type Filters = Record<string, string>;

export function FilterBar({
  projectId,
  days,
  filters,
  options,
  segments,
}: {
  projectId: string;
  days: number;
  filters: Filters;
  options: Record<string, string[]>;
  segments: Segment[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const active = DIMS.filter((d) => filters[d.key]);

  const go = (next: Filters) => {
    const p = new URLSearchParams();
    p.set('days', String(days));
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    router.push(`${pathname}?${p.toString()}`);
  };

  const set = (key: string, val: string) => {
    const next = { ...filters };
    if (val) next[key] = val;
    else delete next[key];
    go(next);
  };

  const saveSegment = async () => {
    if (!active.length) return;
    const name = window.prompt('Name this segment');
    if (!name?.trim()) return;
    const seg: Segment = {
      id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `s-${Date.now()}`,
      name: name.trim(),
      filters,
    };
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: { segments: [...segments, seg] } }),
      });
      if (!r.ok) throw new Error();
      toast('Segment saved', 'ok');
      router.refresh();
    } catch {
      toast('Could not save segment', 'error');
    }
  };

  return (
    <div className="filterbar">
      {DIMS.map((d) => (
        <select
          key={d.key}
          value={filters[d.key] ?? ''}
          onChange={(e) => set(d.key, e.target.value)}
          aria-label={d.label}
        >
          <option value="">{d.label}: all</option>
          {(options[d.key] ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}

      {segments.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const seg = segments.find((s) => s.id === e.target.value);
            if (seg) go(seg.filters);
          }}
          aria-label="Saved segments"
        >
          <option value="">Segments…</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {active.length > 0 && (
        <>
          <span className="filter-chips">
            {active.map((d) => (
              <button key={d.key} className="filter-chip" onClick={() => set(d.key, '')}>
                {filters[d.key]} <span aria-hidden>✕</span>
              </button>
            ))}
          </span>
          <button className="mini" onClick={saveSegment} title="Save these filters as a segment">
            Save segment
          </button>
          <button className="mini" onClick={() => go({})} title="Clear filters">
            Clear
          </button>
        </>
      )}
    </div>
  );
}
