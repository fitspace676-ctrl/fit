'use client';

// @fit/admin — role-aware sidebar navigation.
//
// Renders the destinations the current session's role may reach, with the active
// route highlighted. Visibility is resolved client-side by `visibleNavItems`
// (the same role→permission matrix the API enforces) purely to decide what to
// show — every navigation still hits `middleware.ts`, which re-checks the role.
// Until the session resolves, a skeleton stands in so the layout doesn't jump.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/hooks/use-session';
import { isNavItemActive, visibleNavItems } from '@/lib/nav';
import { NavIcon } from './nav-icon';

/** App base path (`/admin` behind the tenant proxy), stripped before matching. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

/** Normalize the router pathname to an app-relative path for active matching. */
function appPath(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

/** A close handler so tapping a link dismisses the mobile drawer. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const current = appPath(pathname);
  const items = visibleNavItems(user?.role ?? null);

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-0.5 p-4 text-ink-300">
      <Link href="/" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-[linear-gradient(135deg,#6257E3,#7A5AF8)] text-white shadow-[0_8px_24px_-8px_rgba(98,87,227,0.8)]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
          </svg>
        </span>
        <span className="font-display text-lg font-extrabold tracking-tight text-white">
          FormaCore
          <span className="ml-1 font-mono text-[10px] font-medium text-ink-500">admin</span>
        </span>
      </Link>

      {isLoading ? (
        <SidebarSkeleton />
      ) : (
        items.map((item) => {
          const active = isNavItemActive(item.href, current);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand-500 text-white shadow-[0_4px_16px_-4px_rgba(98,87,227,0.8)]'
                  : 'text-ink-400 hover:bg-white/5 hover:text-white',
              ].join(' ')}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })
      )}
    </nav>
  );
}

/** Placeholder rows shown while the session is still resolving. */
function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <div className="h-5 w-5 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}
