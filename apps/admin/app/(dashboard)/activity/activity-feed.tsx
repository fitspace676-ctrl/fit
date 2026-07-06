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
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { ActivityEvent, ActivityEventType } from '@fit/types';
import { Btn, Icon, type IconName, type Tone } from '@/components/ui';
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

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptyCard: {
    paddingInline: '1rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  feedCard: {
    padding: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
  },
  timeline: {
    position: 'relative',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  timelineLine: {
    position: 'absolute',
    bottom: '0.5rem',
    top: '0.5rem',
    left: '19px',
    width: '1px',
    backgroundColor: 'var(--color-border)',
  },
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    paddingBlock: '0.625rem',
  },
  circle: {
    position: 'relative',
    zIndex: 10,
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  circleAccent: {
    backgroundColor: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-icon-accent)',
  },
  circleSuccess: {
    backgroundColor: 'var(--color-success-muted)',
    borderColor: 'var(--color-success)',
    color: 'var(--color-success)',
  },
  circleWarning: {
    backgroundColor: 'var(--color-warning-muted)',
    borderColor: 'var(--color-warning)',
    color: 'var(--color-warning)',
  },
  circleInk: {
    backgroundColor: 'var(--color-background-muted)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
  },
  circleError: {
    backgroundColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
  },
  circleIcon: {
    width: '18px',
    height: '18px',
  },
  rowBody: {
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    alignItems: 'center',
    gap: '0.75rem',
    paddingTop: '0.25rem',
  },
  avatar: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
  },
  rowText: {
    minWidth: 0,
  },
  headline: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  actorName: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  detail: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  timeAgo: {
    marginLeft: 'auto',
    flexShrink: 0,
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** Per-tone circle style — background, text and border for the timeline node. */
const TONE_CIRCLE: Record<Tone, stylex.StyleXStyles> = {
  iris: styles.circleAccent,
  brand: styles.circleAccent,
  accent: styles.circleAccent,
  success: styles.circleSuccess,
  warning: styles.circleWarning,
  // Unused by the feed today, but the map is total over Tone so it stays safe if
  // a future kind picks one of these.
  ink: styles.circleInk,
  danger: styles.circleError,
  flame: styles.circleWarning,
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
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.circle, TONE_CIRCLE[meta.tone])}>
        <Icon name={meta.icon} {...stylex.props(styles.circleIcon)} />
      </span>
      <div {...stylex.props(styles.rowBody)}>
        <span {...stylex.props(styles.avatar)}>{initials(event.memberName)}</span>
        <div {...stylex.props(styles.rowText)}>
          <p {...stylex.props(styles.headline)}>
            <span {...stylex.props(styles.actorName)}>{event.memberName ?? t('guest')}</span>{' '}
            {event.title}
          </p>
          <p {...stylex.props(styles.detail)}>{detail}</p>
        </div>
        <span {...stylex.props(styles.timeAgo)}>{timeAgo(t, event.at)}</span>
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
      <Card variant="default" padding={0} xstyle={styles.emptyCard}>
        {t('empty')}
      </Card>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div {...stylex.props(styles.stack)}>
      <Card variant="default" padding={0} xstyle={styles.feedCard}>
        <ol {...stylex.props(styles.timeline)}>
          <span {...stylex.props(styles.timelineLine)} />
          {events.map((event) => (
            <FeedRow key={event.id} event={event} t={t} locale={locale} />
          ))}
        </ol>
      </Card>

      {/* Pager. */}
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>{t('pager.range', { from, to, total })}</span>
        <div {...stylex.props(styles.pagerBtns)}>
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
