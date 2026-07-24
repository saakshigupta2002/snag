'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IssueGroup, IssueStatus, Severity } from '@snag/shared';
import { useToast } from './Toast';
import { timeAgo } from '@/lib/format';

const STATUS: (IssueStatus | 'all')[] = ['open', 'confirmed', 'dismissed', 'all'];
const SEV: (Severity | 'all')[] = ['all', 'high', 'medium', 'low'];
const SEV_RANK: Record<Severity, number> = { high: 2, medium: 1, low: 0 };

function pageOf(g: IssueGroup): string {
  const meta = g.sample?.meta as { url?: string; page?: string } | undefined;
  const raw = meta?.page || meta?.url || '';
  if (!raw) return '';
  try {
    return new URL(raw, 'http://x.local').pathname || '/';
  } catch {
    return raw.split('?')[0] || '';
  }
}

export function IssuesTable({ projectId, groups }: { projectId: string; groups: IssueGroup[] }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<IssueStatus | 'all'>('open');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [detector, setDetector] = useState('all');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, IssueStatus>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const detectors = useMemo(
    () => Array.from(new Set(groups.map((g) => g.detector))).sort(),
    [groups],
  );

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, status: overrides[g.groupKey] ?? g.status }))
      .filter((g) => (status === 'all' ? true : g.status === status))
      .filter((g) => (severity === 'all' ? true : g.severity === severity))
      .filter((g) => (detector === 'all' ? true : g.detector === detector))
      .filter((g) =>
        !query
          ? true
          : g.title.toLowerCase().includes(query) ||
            g.detector.toLowerCase().includes(query) ||
            pageOf(g).toLowerCase().includes(query),
      )
      .sort((a, b) => {
        const s = SEV_RANK[b.severity] - SEV_RANK[a.severity];
        return s !== 0 ? s : a.lastSeen < b.lastSeen ? 1 : -1;
      });
  }, [groups, status, severity, detector, q, overrides]);

  useEffect(() => {
    if (cursor >= rows.length) setCursor(Math.max(0, rows.length - 1));
  }, [rows.length, cursor]);

  // Optimistic: reflect the verdict instantly, fire the request in the
  // background, reconcile the server on success, revert on failure.
  const setGroupStatus = useCallback(
    (g: IssueGroup, next: IssueStatus) => {
      toast(
        next === 'confirmed' ? 'Confirmed — real bug' : next === 'dismissed' ? 'Dismissed' : 'Reopened',
        next === 'dismissed' ? 'info' : 'ok',
      );
      const apply = () => setOverrides((o) => ({ ...o, [g.groupKey]: next }));
      const willLeave = status !== 'all' && next !== status;
      if (willLeave) {
        setLeaving((s) => new Set(s).add(g.groupKey));
        window.setTimeout(() => {
          apply();
          setLeaving((s) => {
            const n = new Set(s);
            n.delete(g.groupKey);
            return n;
          });
        }, 170);
      } else {
        apply();
      }
      fetch(`/api/projects/${projectId}/issues/${encodeURIComponent(g.groupKey)}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          router.refresh();
        })
        .catch(() => {
          setOverrides((o) => {
            const n = { ...o };
            delete n[g.groupKey];
            return n;
          });
          toast('Could not update — try again', 'error');
        });
    },
    [status, projectId, toast, router],
  );

  // Keyboard triage — active whenever focus isn't in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /^(input|textarea|select)$/i.test(el.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const g = rows[cursor];
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter' && g) {
        router.push(`/p/${projectId}/issues/${encodeURIComponent(g.groupKey)}`);
      } else if (e.key === 'c' && g) {
        void setGroupStatus(g, 'confirmed');
      } else if (e.key === 'd' && g) {
        void setGroupStatus(g, 'dismissed');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, projectId, router, setGroupStatus]);

  // Per-severity counts within the current status filter — shown on the
  // severity tabs so the at-a-glance breakdown lives where you act on it.
  const sevCounts = useMemo(() => {
    const base = groups
      .map((g) => ({ ...g, status: overrides[g.groupKey] ?? g.status }))
      .filter((g) => (status === 'all' ? true : g.status === status));
    const by = (s: Severity) => base.filter((g) => g.severity === s).length;
    return { all: base.length, high: by('high'), medium: by('medium'), low: by('low') } as Record<
      string,
      number
    >;
  }, [groups, status, overrides]);

  const pill = (v: string, cur: string, on: () => void) => (
    <a key={v} className={v === cur ? 'active' : ''} onClick={on} role="button" tabIndex={0}>
      {v === 'all' ? 'all' : v}
    </a>
  );

  return (
    <>
      <div className="issues-toolbar">
        <input
          ref={searchRef}
          className="search mono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="/ search title, detector, page…"
        />
        <select value={detector} onChange={(e) => setDetector(e.target.value)} className="mono">
          <option value="all">all detectors</option>
          {detectors.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="filters">
        {STATUS.map((s) => pill(s, status, () => setStatus(s)))}
        <span className="sep" />
        {SEV.map((s) => (
          <a
            key={s}
            className={s === severity ? 'active' : ''}
            onClick={() => setSeverity(s as Severity | 'all')}
            role="button"
            tabIndex={0}
          >
            {s}
            <span className="pill-count">{sevCounts[s]}</span>
          </a>
        ))}
        <span className="kbd-legend mono">
          <kbd>j</kbd><kbd>k</kbd> move · <kbd>↵</kbd> open · <kbd>c</kbd> confirm · <kbd>d</kbd> dismiss
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing flagged here.</strong>
          </p>
          <p>Adjust the filters, or record more sessions from your app.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 104 }}>severity</th>
                <th>issue</th>
                <th style={{ width: 148 }}>detector</th>
                <th style={{ width: 92 }}>count</th>
                <th style={{ width: 104 }}>last seen</th>
                <th style={{ width: 168 }}>status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g, i) => (
                <tr
                  key={g.groupKey}
                  className={`issue-row ${i === cursor ? 'sel' : ''} ${leaving.has(g.groupKey) ? 'leaving' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => router.push(`/p/${projectId}/issues/${encodeURIComponent(g.groupKey)}`)}
                >
                  <td>
                    <span className={`sev ${g.severity}`}>{g.severity}</span>
                  </td>
                  <td>
                    <span className="cell-title">{g.title}</span>
                    {g.aiSummary && <div className="cell-sub">{g.aiSummary}</div>}
                  </td>
                  <td>
                    <span className="det">{g.detector}</span>
                  </td>
                  <td className="muted">{g.occurrences}</td>
                  <td className="muted">{timeAgo(g.lastSeen)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <span className={`st ${g.status}`}>{g.status}</span>
                      <div className="inline-acts">
                        <button
                          className="mini confirm"
                          title="Confirm (c)"
                          disabled={g.status === "confirmed"}
                          onClick={() => setGroupStatus(g, 'confirmed')}
                        >
                          ✓
                        </button>
                        <button
                          className="mini"
                          title="Dismiss (d)"
                          disabled={g.status === "dismissed"}
                          onClick={() => setGroupStatus(g, 'dismissed')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
