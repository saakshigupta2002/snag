'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DemoNav({ publicId }: { publicId: string }) {
  const pathname = usePathname();
  const base = `/demo/${publicId}`;
  const items = [
    { href: base, label: 'overview', active: pathname === base },
    { href: `${base}/issues`, label: 'issues', active: !!pathname?.includes('/issues') },
    { href: `${base}/sessions`, label: 'sessions', active: !!pathname?.includes('/sessions') },
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
