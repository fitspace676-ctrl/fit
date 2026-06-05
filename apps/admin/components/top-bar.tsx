'use client';

// @fit/admin — console top bar.
//
// Sits above the page content: the mobile drawer toggle (hidden on `md`+ where
// the sidebar is always visible), the gym the operator is managing, and a
// session control showing the role plus a sign-out button. Sign-out clears the
// shared session cookie via `DELETE /api/session` and returns to the sign-in
// flow — the same cookie the `web` app sets, so it logs out everywhere.

import { useSession } from '@/hooks/use-session';

/** Base path (`/admin` behind the tenant proxy); applied to non-router fetch/redirect. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

interface TopBarProps {
  /** The gym slug being managed, resolved server-side; `null` off a tenant host. */
  gymSlug: string | null;
  /** Opens the mobile navigation drawer. */
  onOpenNav: () => void;
}

export function TopBar({ gymSlug, onOpenNav }: TopBarProps) {
  const { user, isLoading } = useSession();

  const signOut = async (): Promise<void> => {
    try {
      await fetch(`${BASE_PATH}/api/session`, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // Ignore — redirect to /login regardless; middleware re-gates the session.
    }
    window.location.href = `${BASE_PATH}/login`;
  };

  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-100 bg-white px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-card p-2 text-slate-600 hover:bg-slate-50 md:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="h-5 w-5"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        {gymSlug ? (
          <span className="truncate text-sm font-medium text-slate-900">{gymSlug}</span>
        ) : (
          <span className="truncate text-sm text-slate-400">Fit Admin</span>
        )}
      </div>

      {!isLoading && user && (
        <div className="flex items-center gap-3">
          <span className="hidden rounded-card bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">
            {user.role}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-card px-2 py-1 text-sm font-medium text-slate-600 hover:text-brand-600"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
