import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge';
import {
  Permission,
  roleHasPermission,
  weeklyAvailabilitySchema,
  type AdminTrainerDetail,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer, fetchTrainerAvailability } from '@/lib/api';
import { Btn, Icon, type IconName } from '@/components/ui';
import { TrainerActions } from './trainer-actions';
import { TrainerTabs } from './trainer-tabs';

export const metadata: Metadata = {
  title: 'Trainer — Fit Admin',
};

// The detail reflects live trainer state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Astryx badge variant per status, matching the roster cards' pills. */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
};

/** Translation key per status. */
const STATUS_LABEL_KEYS: Record<string, string> = {
  ACTIVE: 'status.active',
  INACTIVE: 'status.onLeave',
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  topRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbLink: {
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  identityCard: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'space-between',
    },
    gap: '1rem',
    padding: '1.25rem',
  },
  identityLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  photoImg: {
    height: '4rem',
    width: '4rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
  },
  photoFallback: {
    display: 'flex',
    height: '4rem',
    width: '4rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  nameBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  nameRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  headline: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  ratingInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  starIcon: {
    width: '0.875rem',
    height: '0.875rem',
    color: 'var(--color-warning)',
  },
  ratingValue: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  kpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '1.25rem',
  },
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  addedNote: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  errorStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    padding: '1rem',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Hired March 2025" from an ISO instant, or an em dash when absent/invalid. */
function formatHired(
  iso: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: string,
): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : t('detail.hired', {
        date: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      });
}

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** One detail KPI card — icon tile, headline value, label, and sub-context. */
function DetailKpi({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: IconName;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.iconTile)}>
        <Icon name={icon} {...stylex.props(styles.icon)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>{value}</p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/**
 * The trainer detail page (T4.4), rebuilt on Astryx Card/Badge + brand-tokened
 * StyleX: a breadcrumb + Message action, a back link, an identity header card, four
 * live KPI cards, and the Overview/Schedule/Clients/Reviews/Availability tabs. Every
 * figure comes from the enriched `GET /admin/trainers/:id` (real tenant-scoped
 * queries). A `404` from the API — unknown or cross-tenant id — becomes Next's
 * `notFound()`; any other failure surfaces inline.
 */
export default async function TrainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('admin.trainers');
  const locale = await getLocale();

  let trainer: AdminTrainerDetail;
  try {
    trainer = await fetchTrainer(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadTrainer', { status: error.status, message: error.message })
        : t('errors.unreachable');
    return (
      <div {...stylex.props(styles.errorStack)}>
        <Link href="/trainers" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          {t('detail.backToTrainers')}
        </Link>
        <div {...stylex.props(styles.errorCard)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </div>
      </div>
    );
  }

  const statusVariant = STATUS_VARIANTS[trainer.status] ?? 'neutral';
  const statusLabel = STATUS_LABEL_KEYS[trainer.status]
    ? t(STATUS_LABEL_KEYS[trainer.status]!)
    : trainer.status;

  // Write controls (edit + deactivate + the availability editor) are a
  // `TrainerWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  // The weekly hours the Availability tab edits. Fail-soft: a trainer whose
  // availability call fails still gets a rendered page (the editor opens on a
  // fully-unavailable week) rather than a 500 over one secondary read.
  const availability = await fetchTrainerAvailability(trainer.id)
    .then((res) => res.availability)
    .catch(() => weeklyAvailabilitySchema.parse({}));

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.topRow)}>
        <nav aria-label={t('list.breadcrumbAria')} {...stylex.props(styles.breadcrumb)}>
          <span>Iron Gym</span>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <Link href="/trainers" {...stylex.props(styles.crumbLink)}>
            {t('list.breadcrumb')}
          </Link>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <span {...stylex.props(styles.crumbCurrent)}>{trainer.name}</span>
        </nav>
        <Btn v="outline" size="sm" icon="message" disabled>
          {t('detail.message')}
        </Btn>
      </div>

      <Link href="/trainers" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('detail.backToTrainers')}
      </Link>

      {/* Identity header card. */}
      <Card variant="default" padding={0} xstyle={styles.identityCard}>
        <div {...stylex.props(styles.identityLeft)}>
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt={t('detail.photoAlt', { name: trainer.name })}
              {...stylex.props(styles.photoImg)}
            />
          ) : (
            <span {...stylex.props(styles.photoFallback)}>{initialsOf(trainer.name)}</span>
          )}
          <div {...stylex.props(styles.nameBlock)}>
            <div {...stylex.props(styles.nameRow)}>
              <h1 {...stylex.props(styles.title)}>{trainer.name}</h1>
              <Badge variant={statusVariant} label={statusLabel} />
              {trainer.specialties[0] ? (
                <Badge variant="purple" label={trainer.specialties[0]} />
              ) : null}
            </div>
            {trainer.headline ? <p {...stylex.props(styles.headline)}>{trainer.headline}</p> : null}
            <div {...stylex.props(styles.metaRow)}>
              <span {...stylex.props(styles.ratingInline)}>
                <Icon name="star" {...stylex.props(styles.starIcon)} />
                <span {...stylex.props(styles.ratingValue)}>{trainer.rating.toFixed(1)}</span>·{' '}
                {t('reviews', { count: trainer.reviewCount })}
              </span>
              <span aria-hidden>·</span>
              <span>{formatHired(trainer.hiredAt, t, locale)}</span>
            </div>
          </div>
        </div>
        {canWrite ? <TrainerActions trainerId={trainer.id} status={trainer.status} /> : null}
      </Card>

      {/* Four live KPI cards. */}
      <section aria-label={t('detail.metricsAria')} {...stylex.props(styles.kpiGrid)}>
        <DetailKpi
          label={t('detail.kpiRating')}
          value={trainer.rating.toFixed(1)}
          context={t('reviews', { count: trainer.reviewCount })}
          icon="star"
        />
        <DetailKpi
          label={t('detail.kpiClassesPerWeek')}
          value={String(trainer.classesThisWeek)}
          context={t('detail.kpiClassesPerWeekContext')}
          icon="calendar"
        />
        <DetailKpi
          label={t('detail.kpiReviews')}
          value={String(trainer.reviewCount)}
          context={t('detail.kpiReviewsContext', { count: trainer.thisWeek.newReviews })}
          icon="message"
        />
        <DetailKpi
          label={t('detail.kpiShowUpRate')}
          value={trainer.showUpRate === null ? '—' : `${trainer.showUpRate}%`}
          context={t('detail.kpiShowUpRateContext')}
          icon="check"
        />
      </section>

      <TrainerTabs trainer={trainer} availability={availability} canWrite={canWrite} />

      <p {...stylex.props(styles.addedNote)}>
        {t('detail.profileAdded', { date: formatDate(trainer.createdAt, locale) })}
      </p>
    </div>
  );
}
