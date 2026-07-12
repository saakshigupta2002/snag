'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IssueGroup } from '@snag/shared';

interface Item {
  id: string;
  label: string;
  hint?: string;
  kind: 'nav' | 'project' | 'issue';
  run: () => void;
}

export function CommandPalette({
  projectId,
  projects,
}: {
  projectId: string;
  projects: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [issues, setIssues] = useState<IssueGroup[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load issues for search the first time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 20);
    fetch(`/api/projects/${projectId}/issues`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setIssues(Array.isArray(d) ? d : []))
      .catch(() => setIssues([]));
  }, [open, projectId]);

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: 'nav-overview', label: 'Overview', hint: 'go', kind: 'nav', run: () => go(`/p/${projectId}`) },
      { id: 'nav-issues', label: 'Issues', hint: 'go', kind: 'nav', run: () => go(`/p/${projectId}/issues`) },
      { id: 'nav-sessions', label: 'Sessions', hint: 'go', kind: 'nav', run: () => go(`/p/${projectId}/sessions`) },
      { id: 'nav-settings', label: 'Settings', hint: 'go', kind: 'nav', run: () => go(`/p/${projectId}/settings`) },
    ];
    const proj: Item[] = projects
      .filter((p) => p.id !== projectId)
      .map((p) => ({
        id: `proj-${p.id}`,
        label: p.name,
        hint: 'project',
        kind: 'project',
        run: () => go(`/p/${p.id}/issues`),
      }));
    const iss: Item[] = issues.slice(0, 40).map((g) => ({
      id: `iss-${g.groupKey}`,
      label: g.title,
      hint: g.severity,
      kind: 'issue',
      run: () => go(`/p/${projectId}/issues/${encodeURIComponent(g.groupKey)}`),
    }));
    const all = [...nav, ...proj, ...iss];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q));
  }, [issues, projects, projectId, query, go]);

  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1));
  }, [items.length, cursor]);

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input mono"
          value={query}
          placeholder="Jump to a page, project, or issue…"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              items[cursor]?.run();
            }
          }}
        />
        <div className="cmdk-list">
          {items.length === 0 && <div className="cmdk-empty">No matches.</div>}
          {items.map((i, idx) => (
            <button
              key={i.id}
              className={`cmdk-item ${idx === cursor ? 'on' : ''}`}
              onMouseEnter={() => setCursor(idx)}
              onClick={i.run}
            >
              <span className={`cmdk-kind ${i.kind}`}>{i.kind === 'issue' ? '!' : i.kind === 'project' ? '#' : '›'}</span>
              <span className="cmdk-label">{i.label}</span>
              {i.hint && <span className="cmdk-hint mono">{i.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cmdk-foot mono">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
