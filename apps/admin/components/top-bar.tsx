'use client';

// @fit/admin — console top bar (formacore).
//
// Sits above the page content: the mobile drawer toggle, the gym being managed, a
// search field, a theme toggle, notifications, and a session control (role +
// sign out). Sign-out clears the shared session cookie via `DELETE /api/session`.

import { useSession } from '@/hooks/use-session';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';

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
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  const signOut = async (): Promise<void> => {
    try {
      await fetch(`${BASE_PATH}/api/session`, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // Ignore — redirect to /login regardless; middleware re-gates the session.
    }
    window.location.href = `${BASE_PATH}/login`;
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/70 sm:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/5 md:hidden"
      >
        <Icon name="filter" className="h-5 w-5" />
      </button>

      {/* Search */}
      <div className="hidden max-w-md flex-1 items-center gap-2.5 rounded-field border border-ink-200 bg-ink-50 px-3.5 py-2 text-ink-400 dark:border-white/10 dark:bg-white/[0.04] sm:flex">
        <Icon name="search" className="h-4 w-4" />
        <input
          type="search"
          placeholder="Search…"
          className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white"
        />
      </div>

      <div className="min-w-0 flex-1 sm:hidden">
        {gymSlug ? (
          <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">{gymSlug}</span>
        ) : (
          <span className="truncate text-sm text-ink-400">FormaCore Admin</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {gymSlug && (
          <span className="hidden rounded-pill bg-ink-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-600 dark:bg-white/10 dark:text-ink-300 lg:inline">
            {gymSlug}
          </span>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light' : 'Switch to dark'}
          className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Icon name={isDark ? 'sun' : 'moon'} className="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="relative grid h-10 w-10 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Icon name="bell" className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-ink-950" />
        </button>

        {!isLoading && user && (
          <div className="flex items-center gap-2 pl-1">
            <span className="hidden rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600 dark:bg-white/10 dark:text-ink-300 sm:inline">
              {user.role}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 hover:bg-danger-50 hover:text-danger-600 dark:text-ink-400 dark:hover:bg-danger-500/10 dark:hover:text-danger-300"
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
