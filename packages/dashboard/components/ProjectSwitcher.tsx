'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SwitcherProject {
  id: string;
  name: string;
  openIssues: number;
}

export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: SwitcherProject[];
  currentId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === currentId);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="switcher-name">{current?.name ?? 'project'}</span>
        {current?.openIssues ? <span className="switcher-count">{current.openIssues}</span> : null}
        <span className="switcher-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <div className="switcher-menu" role="menu">
          <div className="switcher-head">projects</div>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`switcher-item ${p.id === currentId ? 'on' : ''}`}
              onClick={() => go(`/p/${p.id}`)}
              role="menuitem"
            >
              <span className="switcher-item-name">{p.name}</span>
              {p.openIssues ? <span className="switcher-count">{p.openIssues}</span> : null}
              {p.id === currentId && <span className="switcher-check">✓</span>}
            </button>
          ))}
          <div className="switcher-sep" />
          <button className="switcher-item new" onClick={() => go('/new')} role="menuitem">
            + New project
          </button>
        </div>
      )}
    </div>
  );
}
