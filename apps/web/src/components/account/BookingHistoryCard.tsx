'use client';

import * as stylex from '@stylexjs/stylex';
import { Avatar, Badge, ButtonLink, Card, type BadgeTone } from '@/src/components/ui/kit';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { formatZonedTime } from '@/src/components/classes/date-utils';
import { CancelBookingButton } from './CancelBookingButton';
import { formatDuration, formatShortDate, relativeDayLabel } from './booking-format';

// Astryx migration (T11), now on the portal kit: one booking card, rebuilt on the kit's `Card` /
// `Avatar` / `Badge` / `Button` over the FormaCore theme — the left time block,
// title, trainer/location/date row, status badge and the cancel action are all
// StyleX (`var(--color-*)`), no Tailwind utilities. The category chip keeps its
// per-category color via an inline `style` (a runtime value StyleX can't
// precompile). Cancel runs behind an Astryx AlertDialog confirmation
// ({@link CancelBookingButton}); the underlying server action is unchanged.
//
// LAYOUT PASS. The card was one `flex-wrap` row of three peers — time block,
// details, actions — centred on each other. In the two-column board that row is
// ~540px wide, and Georgian control labels are long, so it collapsed: the title
// wrapped onto a line of its own above the chip, the trainer/location/date row
// broke into three stacked lines, and the time block and the buttons — being
// shorter than the column between them — floated at its vertical middle with
// nothing to align to. The card had no reading order left.
//
// It is now a fixed left rail plus one content column, both top-aligned:
//
//   ┌──────┐  Title                        [chip]
//   │ day  │  ⬤ trainer   ⌖ location   ▤ date
//   │ TIME │
//   │  1h  │                          [ action ]
//   └──────┘
//
// The rail is the artboards' inset tile (`--fc-tile`), so the time reads as a
// tile rather than as a grey smudge, and its numeral is mono like every other
// figure the direction sets. Nothing centres on anything: the eye lands on the
// time, then the title, then the meta, then the one action.
//
// PAST CARDS CARRY NO CONTROLS. "Book again" and the status badge beside it are
// gone from the past tab (product call). A finished class is a record, not
// something to act on, and the two pills were the loudest thing on a card whose
// content is a memory — a lime "Book again" pulled harder than any upcoming
// booking on the same screen.

const styles = stylex.create({
  card: {
    padding: '1.25rem',
  },
  // The rail and the column beside it, top-aligned. `flex-start` rather than
  // `center` is the whole fix: the two are different heights by nature, and
  // centring them is what put the time block halfway down the card.
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  // The artboards' inset tile — a step DOWN from the card surface (ink-950 in
  // dark, ink-50 in light), so it reads as recessed rather than as a floating
  // grey blob.
  timeBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.125rem',
    width: '4.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    paddingBlock: '0.625rem',
    paddingInline: '0.25rem',
    textAlign: 'center',
  },
  day: {
    margin: 0,
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  dayToday: {
    color: 'var(--color-text-accent)',
  },
  // Mono, like every other figure the direction sets — the clock is the card's
  // one numeral and it should read as one.
  time: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  duration: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  body: {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    minWidth: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 800,
    lineHeight: 1.25,
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
  // Pushed to the end of the head line, so the status reads as the card's
  // right-hand answer to its title rather than as a second chip trailing the
  // category.
  badge: {
    marginInlineStart: 'auto',
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
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    paddingInline: '0.5rem',
    paddingBlock: '0.1875rem',
    fontSize: '0.625rem',
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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.875rem',
    rowGap: '0.25rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    minWidth: 0,
  },
  metaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  // Its own line at the foot of the content column. Sharing the head line with
  // the title is what squeezed the meta row into three stacked lines at board
  // width.
  actions: {
    marginTop: '0.125rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
});

/**
 * The chip tone for each booking status. Confirmed and attended are the lime;
 * everything else is ink. ATTENDED was `purple`, which the theme rendered as
 * grey — the same tone as a no-show, so the two states looked alike.
 */
const STATUS_TONE: Record<MemberBookingStatus, BadgeTone> = {
  BOOKED: 'positive',
  WAITLIST: 'pending',
  ATTENDED: 'positive',
  NO_SHOW: 'pending',
  CANCELED: 'pending',
};

export interface BookingHistoryCardProps {
  entry: MemberBookingHistoryEntry;
  /** Request-time boundary (ms since epoch), used for the relative day label. */
  now: number;
  /** Whether this card sits in the "Past" tab — a record, with no controls. */
  past?: boolean;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/**
 * One booking on the member board, on the portal kit: an inset time tile
 * (relative day · start · duration) beside a content column holding the title
 * (deep-linking to the class), the category chip, the status badge and the
 * trainer/location/date row — plus one action, Cancel, for a live upcoming
 * booking (behind an AlertDialog confirmation that runs the cancel server
 * action). A card in the Past tab carries no badge and no action: it is a
 * record of a class that has already happened.
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
  const dayLabel = relativeDayLabel(instance.startsAt, now, locale, timeZone, t);
  const isToday = dayLabel === t('relative.today');

  return (
    <li>
      <Card padding="none" xstyle={styles.card}>
        <div {...stylex.props(styles.row)}>
          {/* Time tile */}
          <div {...stylex.props(styles.timeBlock)}>
            <p {...stylex.props(styles.day, isToday && styles.dayToday)}>{dayLabel}</p>
            <p {...stylex.props(styles.time)}>{formatZonedTime(instance.startsAt, timeZone)}</p>
            <p {...stylex.props(styles.duration)}>
              {formatDuration(instance.startsAt, instance.endsAt)}
            </p>
          </div>

          {/* Title, status, meta, action */}
          <div {...stylex.props(styles.body)}>
            <div {...stylex.props(styles.head)}>
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
              {/* A finished class states nothing about itself — see the header
                  note. Only a live booking carries a status. */}
              {past ? null : (
                <Badge
                  tone={STATUS_TONE[status]}
                  label={
                    status === 'WAITLIST' && entry.waitlistPosition !== null
                      ? t('waitlistPosition', { position: entry.waitlistPosition })
                      : t(`status.${status}`)
                  }
                  xstyle={styles.badge}
                />
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
                {formatShortDate(instance.startsAt, locale, timeZone)}
              </span>
            </div>

            {past ? null : (
              <div {...stylex.props(styles.actions)}>
                {cancelable ? (
                  <CancelBookingButton classId={instance.id} classTitle={instance.title} />
                ) : (
                  <ButtonLink
                    href={`/member/classes/${instance.id}`}
                    variant="secondary"
                    size="inline"
                    label={t('viewClass')}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
