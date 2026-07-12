'use client';

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
  const router = useRouter();
  return (
    <div className="switcher">
      <select
        value={currentId}
        onChange={(e) => {
          if (e.target.value === '__new__') router.push('/');
          else router.push(`/p/${e.target.value}`);
        }}
        aria-label="Switch project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.openIssues ? ` · ${p.openIssues} open` : ''}
          </option>
        ))}
        <option value="__new__">+ new project…</option>
      </select>
      <span className="switcher-chevron" aria-hidden="true">
        ⌄
      </span>
    </div>
  );
}
