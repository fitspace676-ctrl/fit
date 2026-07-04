'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, type IconName } from '@/src/components/ui';

/** One inbox row as the `/api/notifications` proxy returns it (mirrors the API's
 * `NotificationDto`). */
interface InboxItem {
  id: string;
  category: 'BOOKING' | 'BILLING' | 'SYSTEM';
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

interface InboxResponse {
  data: InboxItem[];
  unread: number;
}

/** The icon rendered per notification category. */
const CATEGORY_ICON: Record<InboxItem['category'], IconName> = {
  BOOKING: 'calendar',
  BILLING: 'card',
  SYSTEM: 'info',
};

/**
 * Member notification bell + inbox dropdown (T6.10).
 *
 * Loads the caller's recent notifications + unread count from the same-origin
 * `/api/notifications` proxy (which forwards the httpOnly session token to the
 * inbox API, T8.4). The bell shows an unread badge; opening the dropdown lists
 * the items, tapping one marks it read and follows its deep-link, and a header
 * action marks everything read. All reads/writes are best-effort — a failure
 * leaves the bell quietly empty rather than breaking the header.
 */
export function NotificationBell() {
  const t = useTranslations('member.shell');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!res.ok) return;
      const body = (await res.json()) as InboxResponse;
      setItems(Array.isArray(body.data) ? body.data : []);
      setUnread(typeof body.unread === 'number' ? body.unread : 0);
    } catch {
      /* best-effort: leave the bell as-is on a transient failure */
    }
  }, []);

  // Populate the badge on mount, and refresh the list each time the panel opens.
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markRead = useCallback(async (ids?: string[]) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { unread?: number };
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) =>
          (ids ? ids.includes(n.id) : true) && !n.readAt ? { ...n, readAt: now } : n,
        ),
      );
      if (typeof body.unread === 'number') setUnread(body.unread);
    } catch {
      /* best-effort */
    }
  }, []);

  const onItemClick = (item: InboxItem): void => {
    if (!item.readAt) void markRead([item.id]);
    if (item.href) {
      setOpen(false);
      router.push(item.href);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notifications')}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-ink-950"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-card border border-ink-200 bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-white/10">
              <p className="text-sm font-bold text-ink-900 dark:text-white">{t('notifications')}</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markRead()}
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-400"
                >
                  {t('markAllRead')}
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="grid place-items-center gap-2 px-4 py-10 text-center">
                <Icon name="check" className="h-6 w-6 text-ink-300 dark:text-ink-500" />
                <p className="text-sm text-ink-500 dark:text-ink-400">{t('noNotifications')}</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-ink-100 overflow-y-auto dark:divide-white/10">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50 dark:hover:bg-white/5 ${
                        item.readAt ? '' : 'bg-brand-50/60 dark:bg-brand-500/5'
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                          item.readAt
                            ? 'bg-ink-100 text-ink-500 dark:bg-white/5 dark:text-ink-400'
                            : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
                        }`}
                      >
                        <Icon name={CATEGORY_ICON[item.category]} className="h-4 w-4" sw={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                            {item.title}
                          </span>
                          {!item.readAt && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500 dark:text-ink-400">
                          {item.body}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-ink-400 dark:text-ink-500">
                          {formatRelative(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Compact relative age of an ISO timestamp: `now`, `5m`, `3h`, `2d`, else a
 * short date. Locale-agnostic (numeric), so no message catalog is needed. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toISOString().slice(0, 10);
}
