'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SideNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const items = [
    { seg: 'issues', label: 'issues' },
    { seg: 'sessions', label: 'sessions' },
    { seg: 'settings', label: 'settings' },
  ];
  return (
    <nav className="side-nav">
      {items.map(({ seg, label }) => (
        <Link
          key={seg}
          href={`/p/${projectId}/${seg}`}
          className={pathname?.includes(`/${seg}`) ? 'active' : ''}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
