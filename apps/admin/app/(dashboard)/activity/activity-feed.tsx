'use client';

// @fit/admin — the Activity screen's unified event timeline (T3.9).
//
// Renders one server-fetched page of the merged activity stream (signups,
// bookings, check-ins, sales, subscription enrolments) as the formacore
// "Aurora-glass" timeline: a type-toned icon per event, the acting member, the
// event headline + detail, and a relative "time ago" on the right. A client-side
// pager reads/writes the URL search params so the server page stays the single
// source of truth — nothing here mutates, the feed is derived and read-only.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ActivityEvent, ActivityEventType } from '@fit/types';
import { Btn, Card, Icon, type IconName, type Tone } from '@/components/ui';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';

/** Translator for the `admin.activity` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** Per-event-kind icon + tone, driving the timeline node's glyph and colour. */
const TYPE_META: Record<ActivityEventType, { icon: IconName; tone: Tone }> = {
  signup: { icon: 'users', tone: 'iris' },
  booking: { icon: 'calendar', tone: 'brand' },
  checkin: { icon: 'qr', tone: 'accent' },
  sale: { icon: 'card', tone: 'success' },
  subscription: { icon: 'ticket', tone: 'warning' },
};

/**
 * Static (JIT-safe) circle classes per tone — background, text and ring in both
 * themes. Kept as whole class strings, never interpolated, so Tailwind can see
 * every variant at build time.
 */
const TONE_CIRCLE: Record<Tone, string> = {
  iris: 'bg-iris-50 text-iris-600 ring-iris-500/25 dark:bg-iris-500/15 dark:text-iris-300 dark:ring-iris-400/30',
  brand:
    'bg-brand-50 text-brand-600 ring-brand-500/25 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-400/30',
  accent:
    'bg-accent-50 text-accent-600 ring-accent-500/25 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-400/30',
  success:
    'bg-success-50 text-success-600 ring-success-500/25 dark:bg-success-500/15 dark:text-success-300 dark:ring-success-400/30',
  warning:
    'bg-warning-50 text-warning-700 ring-warning-500/25 dark:bg-warning-500/15 dark:text-warning-300 dark:ring-warning-400/30',
  // Unused by the feed today, but the map is total over Tone so it stays safe if
  // a future kind picks one of these.
  ink: 'bg-ink-100 text-ink-600 ring-ink-300/40 dark:bg-white/10 dark:text-ink-300 dark:ring-white/15',
  danger:
    'bg-danger-50 text-danger-600 ring-danger-500/25 dark:bg-danger-500/15 dark:text-danger-300 dark:ring-danger-400/30',
  flame:
    'bg-flame-50 text-flame-600 ring-flame-500/25 dark:bg-flame-500/15 dark:text-flame-300 dark:ring-flame-400/30',
};

/** Two-letter initials for the actor avatar, or `·` when there is no name. */
function initials(name: string | null): string {
  if (!name) {
    return '·';
  }
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '·';
}

/** Render an ISO instant as a compact localized "time ago". */
function timeAgo(t: T, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t('relative.justNow');
  if (mins < 60) return t('relative.minutes', { mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('relative.hours', { hours });
  return t('relative.days', { days: Math.round(hours / 24) });
}

/**
 * One timeline row: the toned kind icon, the actor's initials + name, the event
 * headline, its detail (with the captured amount appended for a sale), and the
 * relative time. `title` / `detail` are the API's denormalised English
 * projections of a real record — rendered as-is; the surrounding chrome is
 * localized.
 */
function FeedRow({ event, t, locale }: { event: ActivityEvent; t: T; locale: string }) {
  const meta = TYPE_META[event.type];
  const money =
    event.amount !== null && event.currency
      ? new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: event.currency,
          maximumFractionDigits: 2,
        }).format(event.amount / 100)
      : null;
  const detail = money ? `${event.detail} · ${money}` : event.detail;

  return (
    <li className="relative flex items-start gap-4 py-2.5">
      <span
        className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-inset ${TONE_CIRCLE[meta.tone]}`}
      >
        <Icon name={meta.icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-3 pt-1">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-600 dark:bg-white/10 dark:text-ink-300">
          {initials(event.memberName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-700 dark:text-ink-200">
            <span className="font-semibold text-ink-900 dark:text-white">
              {event.memberName ?? t('guest')}
            </span>{' '}
            {event.title}
          </p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">{detail}</p>
        </div>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-400 dark:text-ink-500">
          {timeAgo(t, event.at)}
        </span>
      </div>
    </li>
  );
}

/**
 * The activity timeline + pager (T3.9). Server-rendered, read-only data with a
 * client-side pager that navigates by writing the `page` search param, so the
 * server page remains the single source of truth.
 */
export function ActivityFeed({
  events,
  total,
  page,
  limit,
}: {
  events: ActivityEvent[];
  total: number;
  page: number;
  limit: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity');
  const locale = useLocale();

  // Keep the live feed live: poll the server page only while viewing the first
  // (latest) page, so a refresh never yanks the list out from under someone
  // paging back through history.
  useLiveRefresh(LIVE_REFRESH_MS.activity, page <= 1);

  /** Build a URL with the page param overridden. */
  function pageHref(nextPage: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  if (events.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
        {t('empty')}
      </Card>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 sm:p-6">
        <ol className="relative">
          <span className="absolute bottom-2 left-[19px] top-2 w-px bg-ink-200 dark:bg-white/10" />
          {events.map((event) => (
            <FeedRow key={event.id} event={event} t={t} locale={locale} />
          ))}
        </ol>
      </Card>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="tabular-nums">{t('pager.range', { from, to, total })}</span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
          >
            {t('pager.previous')}
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
          >
            {t('pager.next')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
