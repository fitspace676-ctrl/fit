'use client';

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { formatZonedTime } from '@/src/components/classes/date-utils';
import { CancelBookingButton } from './CancelBookingButton';
import { formatDuration, formatShortDate, relativeDayLabel } from './booking-format';

// Astryx migration (T11.14): one booking card, rebuilt on the Astryx `Card` /
// `Avatar` / `Badge` / `Button` over the Fit brand theme — the left time block,
// title, trainer/location/date row, status badge and the cancel/re-book action
// are all StyleX (`var(--color-*)`), no Tailwind utilities. The category chip
// keeps its per-category color via an inline `style` (a runtime value StyleX
// can't precompile). Cancel now runs behind an Astryx AlertDialog confirmation
// ({@link CancelBookingButton}); the underlying server action is unchanged.

const styles = stylex.create({
  card: {
    padding: '1.25rem',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1rem',
  },
  timeBlock: {
    width: '4rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    paddingBlock: '0.5rem',
    textAlign: 'center',
  },
  day: {
    margin: 0,
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)',
  },
  dayToday: {
    color: 'var(--color-text-accent)',
  },
  time: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 800,
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  duration: {
    margin: 0,
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  details: {
    minWidth: 0,
    flex: 1,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  titleMuted: {
    color: 'var(--color-text-disabled)',
  },
  // The category chip is NEUTRAL; only its 6px dot carries the category colour.
  //
  // It used to tint the whole chip — fill, border and label — from
  // `instance.color`, which is a per-class-type hex the gym picks. On the
  // Aurora-glass skin that was merely busy; under a direction that spends its
  // entire colour budget on one lime, a row of filled green/pink/purple/orange
  // pills is the loudest thing on the screen and reads as the primary signal.
  // Demoting the hue to a dot keeps the category legible at a glance, keeps the
  // gym's own colour choice meaningful, and leaves the lime as the only fill.
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  chipDot: {
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  meta: {
    marginTop: '0.375rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  metaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  actions: {
    marginInlineStart: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
});

/** The Astryx `Badge` variant for each booking status. */
const STATUS_VARIANT: Record<MemberBookingStatus, 'success' | 'warning' | 'purple' | 'neutral'> = {
  BOOKED: 'success',
  WAITLIST: 'warning',
  ATTENDED: 'purple',
  NO_SHOW: 'neutral',
  CANCELED: 'neutral',
};

export interface BookingHistoryCardProps {
  entry: MemberBookingHistoryEntry;
  /** Request-time boundary (ms since epoch), used for the relative day label. */
  now: number;
  /** Whether this card sits in the "Past" tab — switches the action to re-book. */
  past?: boolean;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/**
 * One booking on the member board, on the Astryx design system: a card with a
 * left time block (relative day · start · duration), the category chip, the
 * title (deep-linking to the class), the trainer/location/date row, the status
 * badge, and a primary action — Cancel for a live upcoming booking (behind an
 * AlertDialog confirmation that runs the cancel server action), Book again for a
 * past one, or View class otherwise.
 */
export function BookingHistoryCard({
  entry,
  now,
  past = false,
  timeZone,
}: BookingHistoryCardProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const { classInstance: instance, status } = entry;
  const muted = past && (status === 'NO_SHOW' || status === 'CANCELED');
  const cancelable = !past && (status === 'BOOKED' || status === 'WAITLIST');
  const dayLabel = relativeDayLabel(instance.startsAt, now, locale, t);
  const isToday = dayLabel === t('relative.today');

  return (
    <li>
      <Card variant="default" padding={0} xstyle={styles.card}>
        <div {...stylex.props(styles.row)}>
          {/* Time block */}
          <div {...stylex.props(styles.timeBlock)}>
            <p {...stylex.props(styles.day, isToday && styles.dayToday)}>{dayLabel}</p>
            <p {...stylex.props(styles.time)}>{formatZonedTime(instance.startsAt, timeZone)}</p>
            <p {...stylex.props(styles.duration)}>
              {formatDuration(instance.startsAt, instance.endsAt)}
            </p>
          </div>

          {/* Details */}
          <div {...stylex.props(styles.details)}>
            <div {...stylex.props(styles.titleRow)}>
              <Link
                href={`/member/classes/${instance.id}`}
                {...stylex.props(styles.title, muted && styles.titleMuted)}
              >
                {instance.title}
              </Link>
              {instance.category && (
                <span {...stylex.props(styles.chip)}>
                  <span
                    aria-hidden
                    {...stylex.props(styles.chipDot)}
                    style={{ backgroundColor: instance.color }}
                  />
                  {instance.category}
                </span>
              )}
            </div>
            <div {...stylex.props(styles.meta)}>
              {instance.trainerName ? (
                <span {...stylex.props(styles.metaItem)}>
                  <Avatar name={instance.trainerName} size={20} />
                  {instance.trainerName}
                </span>
              ) : null}
              {instance.locationName ? (
                <span {...stylex.props(styles.metaItem)}>
                  <Icon name="pin" {...stylex.props(styles.metaIcon)} sw={2} />
                  {instance.locationName}
                </span>
              ) : null}
              <span {...stylex.props(styles.metaItem)}>
                <Icon name="calendar" {...stylex.props(styles.metaIcon)} sw={2} />
                {formatShortDate(instance.startsAt, locale)}
              </span>
            </div>
          </div>

          {/* Status + action */}
          <div {...stylex.props(styles.actions)}>
            <Badge
              variant={STATUS_VARIANT[status]}
              label={
                status === 'WAITLIST' && entry.waitlistPosition !== null
                  ? t('waitlistPosition', { position: entry.waitlistPosition })
                  : t(`status.${status}`)
              }
            />
            {cancelable ? (
              <CancelBookingButton classId={instance.id} classTitle={instance.title} />
            ) : past ? (
              <Button
                as={Link}
                href={`/member/classes/${instance.id}`}
                variant="primary"
                size="sm"
                label={t('bookAgain')}
              />
            ) : (
              <Button
                as={Link}
                href={`/member/classes/${instance.id}`}
                variant="secondary"
                size="sm"
                label={t('viewClass')}
              />
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
