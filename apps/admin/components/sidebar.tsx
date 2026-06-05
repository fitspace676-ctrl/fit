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
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 p-4">
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-4 flex items-center gap-2 px-2 text-lg font-bold tracking-tight text-brand-600"
      >
        <span className="rounded-card bg-brand-600 px-2 py-0.5 text-sm text-white">Fit</span>
        Admin
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
                'flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
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
          <div className="h-5 w-5 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
