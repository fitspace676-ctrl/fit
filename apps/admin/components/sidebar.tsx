'use client';

// @fit/admin — role-aware sidebar navigation (formacore control-room rail).
//
// Renders the destinations the current session's role may reach, with the active
// route highlighted. Visibility is resolved client-side by `visibleNavItems`
// (the same role→permission matrix the API enforces) purely to decide what to
// show — every navigation still hits `middleware.ts`, which re-checks the role.
// Until the session resolves, a skeleton stands in so the layout doesn't jump.
//
// Below the nav sit two real-signal widgets, both fed by the server-resolved
// {@link ShellSystemState}: a SYSTEM status card whose "online" reflects whether
// the Fit API answered, and a user card built from the verified session role +
// the active gym. The Check-in item carries today's live arrival count as a badge.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from '@/hooks/use-session';
import { isNavItemActive, visibleNavItems } from '@/lib/nav';
import { Dot } from '@/components/ui';
import type { ShellSystemState } from './admin-shell';
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

/** Title-case a role token (`OWNER` → `Owner`) for the user card. */
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export interface SidebarProps {
  /** The gym slug being managed (for the user card), or `null` off a tenant host. */
  gymSlug: string | null;
  /** Live system signal — the SYSTEM widget + Check-in badge source. */
  system: ShellSystemState;
  /** A close handler so tapping a link dismisses the mobile drawer. */
  onNavigate?: () => void;
}

export function Sidebar({ gymSlug, system, onNavigate }: SidebarProps) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const t = useTranslations('admin');
  const current = appPath(pathname);
  const items = visibleNavItems(user?.role ?? null);

  return (
    <nav aria-label="Primary" className="flex h-full flex-col p-4 text-ink-300">
      {/* Brand — the "F" gradient tile + wordmark. */}
      <Link href="/" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-1">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] font-display text-lg font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(98,87,227,0.8)]">
          F
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-sm font-extrabold tracking-tight text-white">
            {t('common.brand')}
          </span>
          <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-ink-500">
            {t('common.brandTagline')}
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {isLoading ? (
          <SidebarSkeleton />
        ) : (
          items.map((item) => {
            const active = isNavItemActive(item.href, current);
            const badge =
              item.icon === 'checkin' && system.checkInCount && system.checkInCount > 0
                ? system.checkInCount
                : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.8)]'
                    : 'text-ink-400 hover:bg-white/5 hover:text-white',
                ].join(' ')}
              >
                <NavIcon name={item.icon} />
                <span className="flex-1">{t(item.labelKey)}</span>
                {badge !== null && (
                  <span
                    className={[
                      'grid h-5 min-w-5 shrink-0 place-items-center rounded-pill px-1.5 font-mono text-[10px] font-bold tabular-nums',
                      active ? 'bg-white/25 text-white' : 'bg-brand-500/20 text-brand-200',
                    ].join(' ')}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>

      {!isLoading && <SystemWidget system={system} />}

      {!isLoading && user && (
        <div className="mt-3 flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] font-display text-sm font-bold text-white">
            {roleLabel(user.role).charAt(0)}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-white">
              {roleLabel(user.role)}
            </span>
            <span className="truncate font-mono text-[10px] text-ink-500">
              {roleLabel(user.role)}
              {gymSlug ? ` · ${gymSlug}` : ''}
            </span>
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * The SYSTEM status widget. "online" is a REAL signal — whether the Fit API
 * answered the layout's check-in stats call — not a constant. When online the
 * three subsystems (sync engine, check-in, POS terminal) read as connected; when
 * the API is unreachable they degrade to offline together.
 */
function SystemWidget({ system }: { system: ShellSystemState }) {
  const t = useTranslations('admin.system');
  const online = system.online;
  const rows = ['syncEngine', 'checkIn', 'posTerminal'] as const;
  return (
    <div className="mt-3 rounded-card border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          {t('title')}
        </span>
        <span
          className={[
            'rounded-pill px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
            online ? 'bg-success-500/15 text-success-300' : 'bg-danger-500/15 text-danger-300',
          ].join(' ')}
        >
          {online ? t('uptime') : t('offline')}
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((key) => (
          <li key={key} className="flex items-center justify-between text-xs">
            <span className="text-ink-400">{t(key)}</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Dot c={online ? 'bg-success-400' : 'bg-danger-400'} />
              <span className={online ? 'text-success-300' : 'text-danger-300'}>
                {online ? t('online') : t('offline')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
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
