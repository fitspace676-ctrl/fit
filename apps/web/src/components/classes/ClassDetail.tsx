import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import type { ClassInstanceDetail } from '@fit/types';
import { ClassBookingCta } from './ClassBookingCta';
import { ClassOccupancy } from './ClassOccupancy';
import { ClassOccupancyLive } from './ClassOccupancyLive';
import { formatDate, formatTime } from './date-utils';

// Astryx migration (T11.12): the class-detail body is rebuilt on the Astryx
// `Card` / `Badge` over the Fit brand theme, with the layout, status banner, and
// definition list authored in compiled StyleX (`var(--color-*)`). The occupancy
// meter reuses the shared brand `ClassOccupancy`. No Tailwind utilities and no
// formacore Aurora-glass primitives; the booking/live islands are unchanged.

const styles = stylex.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    padding: '1.5rem',
  },
  accent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '0.25rem',
  },
  head: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  date: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  banner: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-warning-muted)',
    backgroundColor: 'var(--color-background-yellow)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: 0,
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
  },
  dl: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingBlock: '1.25rem',
    margin: 0,
    fontSize: '0.875rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  dt: {
    margin: 0,
    color: 'var(--color-text-secondary)',
  },
  dd: {
    margin: 0,
    textAlign: 'right',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  mono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  capacity: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  capLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  spots: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  spotsFull: {
    color: 'var(--color-error)',
  },
  cta: {
    paddingTop: '0.25rem',
  },
});

export interface ClassDetailProps {
  instance: ClassInstanceDetail;
  /**
   * The gym in scope, used to open the live occupancy stream (T8.10). `null` on
   * the apex / preview URL, where the page renders without a live subscription.
   */
  gymId: string | null;
}

/**
 * The member-facing class detail page body (T5.9): one occurrence's full detail
 * on a deep-linkable `/classes/:id` URL — the schedule, trainer, location, and
 * live capacity, plus the auth-gated booking CTA.
 *
 * Reuses the calendar's pure date helpers so the detail page and the calendar
 * format times identically, and the same capacity treatment as the calendar
 * drawer. Mostly a static Server Component; only the booking CTA
 * ({@link ClassBookingCta}) is a client island. When the occurrence is no longer
 * `SCHEDULED` (a shared link to a since-canceled / completed class) a banner
 * explains it and the booking CTA is withheld.
 */
export function ClassDetail({ instance, gymId }: ClassDetailProps) {
  const t = useTranslations('classes');
  const locale = useLocale();

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const isScheduled = instance.status === 'SCHEDULED';

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      {/* Accent colour bar from the class instance. */}
      <span
        aria-hidden
        {...stylex.props(styles.accent)}
        style={{ backgroundColor: instance.color }}
      />

      <div {...stylex.props(styles.head)}>
        {instance.category && <Badge variant="purple" label={instance.category} />}
        <h1 {...stylex.props(styles.title)}>{instance.title}</h1>
        <p {...stylex.props(styles.date)}>{formatDate(instance.startsAt, locale)}</p>
      </div>

      {!isScheduled && (
        <p role="status" {...stylex.props(styles.banner)}>
          {instance.status === 'CANCELED'
            ? t('detail.status.canceled')
            : t('detail.status.completed')}
        </p>
      )}

      {instance.description && <p {...stylex.props(styles.description)}>{instance.description}</p>}

      <dl {...stylex.props(styles.dl)}>
        <DetailRow label={t('detail.time')}>
          <span {...stylex.props(styles.mono)}>
            {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
          </span>
        </DetailRow>
        <DetailRow label={t('detail.duration')}>
          {t('detail.minutes', { count: instance.durationMinutes })}
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('detail.trainer')}>{instance.trainerName}</DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('detail.location')}>{instance.locationName}</DetailRow>
        ) : null}
        {instance.room ? <DetailRow label={t('detail.room')}>{instance.room}</DetailRow> : null}
      </dl>

      <div {...stylex.props(styles.capacity)}>
        <span {...stylex.props(styles.capLabel)}>{t('detail.capacity')}</span>
        <ClassOccupancy value={instance.bookedCount} cap={instance.capacity} />
        <p {...stylex.props(styles.spots, isFull && styles.spotsFull)}>
          {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
        </p>
        {/* Headless island: refreshes this page when another member books / cancels
            / is promoted, pushed over SSE (T8.10). */}
        <ClassOccupancyLive
          gymId={gymId}
          instanceId={instance.id}
          bookedCount={instance.bookedCount}
          capacity={instance.capacity}
          status={instance.status}
        />
      </div>

      {isScheduled && (
        <div {...stylex.props(styles.cta)}>
          <ClassBookingCta classId={instance.id} isFull={isFull} />
        </div>
      )}
    </Card>
  );
}

/** A labelled detail line in the detail page's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      <dt {...stylex.props(styles.dt)}>{label}</dt>
      <dd {...stylex.props(styles.dd)}>{children}</dd>
    </div>
  );
}
