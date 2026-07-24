'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SideNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/p/${projectId}`;
  const items = [
    { href: base, label: 'overview', active: pathname === base },
    { href: `${base}/issues`, label: 'issues', active: !!pathname?.includes('/issues') },
    { href: `${base}/sessions`, label: 'sessions', active: !!pathname?.includes('/sessions') },
    { href: `${base}/heatmap`, label: 'heatmaps', active: !!pathname?.includes('/heatmap') },
    { href: `${base}/settings`, label: 'settings', active: !!pathname?.includes('/settings') },
  ];
  return (
    <nav className="side-nav">
      {items.map(({ href, label, active }) => (
        <Link key={label} href={href} className={active ? 'active' : ''}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
