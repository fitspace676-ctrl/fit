'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Gyms', path: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6' },
  { href: '/requests', label: 'Requests', path: 'M8 4H5v17h14V4h-3M9 3h6v4H9V3ZM8 11h8M8 15h6' },
  { href: '/activity', label: 'Activity', path: 'M3 12h4l3-8 4 16 3-8h4' },
  { href: '/blog', label: 'Blog', path: 'M5 4h10l4 4v12H5V4ZM14 4v5h5M8 13h8M8 17h5' },
];

export function OpsNav({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const pathname = usePathname();
  return (
    <nav className="ops-nav" aria-label="Console">
      {items.map((item) => {
        const active =
          item.href === '/'
            ? pathname === '/' || pathname === '/gyms' || pathname.startsWith('/gyms/')
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={item.path} />
            </svg>
            {item.label}
            {item.href === '/requests' && pendingRequests > 0 ? (
              <span className="ops-nav-count" aria-label={`${pendingRequests} awaiting approval`}>
                {pendingRequests}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
