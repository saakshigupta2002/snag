'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconIssues, IconSessions, IconSettings } from './icons';

export function SideNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/p/${projectId}/issues`, label: 'Issues', Icon: IconIssues, seg: 'issues' },
    { href: `/p/${projectId}/sessions`, label: 'Sessions', Icon: IconSessions, seg: 'sessions' },
    { href: `/p/${projectId}/settings`, label: 'Settings', Icon: IconSettings, seg: 'settings' },
  ];
  return (
    <nav className="side-nav">
      {items.map(({ href, label, Icon, seg }) => {
        const active = pathname?.includes(`/${seg}`);
        return (
          <Link key={seg} href={href} className={active ? 'active' : ''}>
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
