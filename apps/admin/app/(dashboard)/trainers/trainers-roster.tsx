'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge';
import type { AdminTrainerRow, AdminTrainerSummary, TrainerStatus } from '@fit/types';
import { Button, Card, CountUp } from '@fit/ui-kit';
import { Icon, type IconName } from '@/components/ui';
import { formatNextClass } from './format';

type T = ReturnType<typeof useTranslations>;

/** Astryx badge variant per trainer status — success active, warning inactive. */
const STATUS_VARIANTS: Record<TrainerStatus, BadgeVariant> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
};

/** Translation key per trainer status. */
const STATUS_LABEL_KEYS: Record<TrainerStatus, string> = {
  ACTIVE: 'status.active',
  INACTIVE: 'status.onLeave',
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
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
  controls: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 1024px)': 'row',
    },
    gap: '0.75rem',
    alignItems: {
      default: 'stretch',
      '@media (min-width: 1024px)': 'center',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 1024px)': 'space-between',
    },
  },
  segmentList: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.25rem',
  },
  segBtn: {
    borderStyle: 'none',
    borderRadius: 'var(--radius-inner)',
    paddingInline: '0.875rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'color, background-color',
    transitionDuration: '150ms',
  },
  segBtnActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  segBtnInactive: {
    backgroundColor: 'transparent',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  searchWrap: {
    position: 'relative',
    width: {
      default: 'auto',
      '@media (min-width: 1024px)': '18rem',
    },
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchIcon: {
    pointerEvents: 'none',
    position: 'absolute',
    insetBlock: 0,
    left: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-secondary)',
  },
  searchIconSvg: {
    width: '1rem',
    height: '1rem',
  },
  searchInput: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingLeft: '2.25rem',
    paddingRight: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  cardGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1280px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  trainerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    transitionProperty: 'border-color',
    transitionDuration: '150ms',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  avatarImg: {
    height: '3rem',
    width: '3rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
  },
  avatarFallback: {
    display: 'flex',
    height: '3rem',
    width: '3rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  cardBody: {
    minWidth: 0,
    flex: 1,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  nameLink: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  headline: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  ratingRow: {
    marginTop: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
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
  kebab: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  kebabDot: {
    fontSize: '1.125rem',
    lineHeight: 1,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  tag: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.5rem',
  },
  statTile: {
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  statValue: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  footer: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
    fontSize: '0.75rem',
  },
  footerMeta: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '0.375rem',
    color: 'var(--color-text-secondary)',
  },
  smIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  viewLink: {
    flexShrink: 0,
    fontWeight: 600,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '1rem',
    paddingBlock: '3.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  emptyIconSvg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  noMatchCard: {
    paddingInline: '1rem',
    paddingBlock: '3rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pageRange: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** One roster KPI card — icon tile, animated headline value, label, and context. */
function KpiCard({
  label,
  value,
  context,
  icon,
  decimals = false,
}: {
  label: string;
  value: number;
  context: string;
  icon: IconName;
  decimals?: boolean;
}) {
  return (
    <Card padding="none" xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.iconTile)}>
        <Icon name={icon} {...stylex.props(styles.icon)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>
        {decimals ? value.toFixed(1) : <CountUp to={value} />}
      </p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/** A compact stat tile inside a trainer card (Classes / wk · PT clients). */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.statTile)}>
      <p {...stylex.props(styles.statValue)}>{value}</p>
      <p {...stylex.props(styles.statLabel)}>{label}</p>
    </div>
  );
}

/** A single trainer card in the 2-up grid. */
function TrainerCard({
  trainer,
  t,
  locale,
  timeZone,
}: {
  trainer: AdminTrainerRow;
  t: T;
  locale: string;
  timeZone: string;
}) {
  return (
    <Card padding="none" xstyle={styles.trainerCard}>
      <div {...stylex.props(styles.cardTop)}>
        {trainer.photoUrl ? (
          <img src={trainer.photoUrl} alt="" {...stylex.props(styles.avatarImg)} />
        ) : (
          <span {...stylex.props(styles.avatarFallback)}>{initialsOf(trainer.name)}</span>
        )}
        <div {...stylex.props(styles.cardBody)}>
          <div {...stylex.props(styles.nameRow)}>
            <Link href={`/trainers/${trainer.id}`} {...stylex.props(styles.nameLink)}>
              {trainer.name}
            </Link>
            <Badge
              variant={STATUS_VARIANTS[trainer.status]}
              label={t(STATUS_LABEL_KEYS[trainer.status])}
            />
          </div>
          {trainer.headline ? <p {...stylex.props(styles.headline)}>{trainer.headline}</p> : null}
          <div {...stylex.props(styles.ratingRow)}>
            <Icon name="star" {...stylex.props(styles.starIcon)} />
            <span {...stylex.props(styles.ratingValue)}>{trainer.rating.toFixed(1)}</span>
            <span>· {t('reviews', { count: trainer.reviewCount })}</span>
          </div>
        </div>
        <Link
          href={`/trainers/${trainer.id}`}
          aria-label={t('list.openTrainer', { name: trainer.name })}
          {...stylex.props(styles.kebab)}
        >
          <span aria-hidden {...stylex.props(styles.kebabDot)}>
            ⋯
          </span>
        </Link>
      </div>

      {trainer.specialties.length > 0 ? (
        <div {...stylex.props(styles.tagRow)}>
          {trainer.specialties.map((tag) => (
            <span key={tag} {...stylex.props(styles.tag)}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div {...stylex.props(styles.statGrid)}>
        <StatTile label={t('list.statClassesPerWk')} value={String(trainer.classesThisWeek)} />
        <StatTile label={t('list.statReviews')} value={String(trainer.reviewCount)} />
      </div>

      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.footerMeta)}>
          <Icon name="calendar" {...stylex.props(styles.smIcon)} />
          {trainer.nextClass ? (
            <span {...stylex.props(styles.truncate)}>
              {formatNextClass(trainer.nextClass.startsAt, t, locale, timeZone)} ·{' '}
              {trainer.nextClass.title}
            </span>
          ) : (
            <span>{t('list.noUpcomingClass')}</span>
          )}
        </span>
        <Link href={`/trainers/${trainer.id}`} {...stylex.props(styles.viewLink)}>
          {t('list.view')}
        </Link>
      </div>
    </Card>
  );
}

/**
 * The trainers roster (client): the four gym-wide KPI cards, a specialty
 * segmented filter + search, and the 2-up card grid with a pager. The KPI figures
 * and each card's live numbers are backed by real tenant-scoped queries (they
 * arrive on the server response). The specialty segment + search filter the
 * *current page* client-side over real specialties; sort/pagination stay on the
 * server via the URL. Renders correctly with an empty roster.
 */
export function TrainersRoster({
  trainers,
  summary,
  total,
  page,
  limit,
  canWrite,
  timeZone,
}: {
  trainers: AdminTrainerRow[];
  summary: AdminTrainerSummary;
  total: number;
  page: number;
  limit: number;
  canWrite: boolean;
  /** The gym's IANA zone — every class time on the roster is read on it. */
  timeZone: string;
}) {
  const t = useTranslations('admin.trainers');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [specialty, setSpecialty] = useState<string>('All');
  const [search, setSearch] = useState('');

  // The segment options are the real specialties present on this page, so nothing
  // is hardcoded — "All" plus each distinct tag, in first-seen order.
  const specialties = useMemo(() => {
    const seen: string[] = [];
    for (const trainer of trainers) {
      for (const tag of trainer.specialties) {
        if (!seen.includes(tag)) seen.push(tag);
      }
    }
    return ['All', ...seen];
  }, [trainers]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return trainers.filter((trainer) => {
      const matchesSpecialty = specialty === 'All' || trainer.specialties.includes(specialty);
      const matchesSearch =
        needle === '' ||
        trainer.name.toLowerCase().includes(needle) ||
        trainer.headline.toLowerCase().includes(needle);
      return matchesSpecialty && matchesSearch;
    });
  }, [trainers, specialty, search]);

  function pageHref(next: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div {...stylex.props(styles.stack)}>
      {/* Gym-wide KPI cards — real aggregates over the whole filtered roster. */}
      <section aria-label={t('list.rosterMetricsAria')} {...stylex.props(styles.kpiGrid)}>
        <KpiCard
          label={t('list.kpiTrainers')}
          value={summary.total}
          context={t('list.kpiTrainersContext', { count: summary.active })}
          icon="users"
        />
        <KpiCard
          label={t('list.kpiClassesPerWeek')}
          value={summary.classesPerWeek}
          context={t('list.kpiClassesPerWeekContext')}
          icon="calendar"
        />
        <KpiCard
          label={t('list.kpiAvgRating')}
          value={summary.avgRating}
          context={t('list.kpiAvgRatingContext')}
          icon="star"
          decimals
        />
        <KpiCard
          label={t('list.kpiReviews')}
          value={trainers.reduce((sum, row) => sum + row.reviewCount, 0)}
          context={t('list.kpiReviewsContext')}
          icon="message"
        />
      </section>

      {/* Specialty segment + search. */}
      <div {...stylex.props(styles.controls)}>
        <div
          role="tablist"
          aria-label={t('list.filterBySpecialtyAria')}
          {...stylex.props(styles.segmentList)}
        >
          {specialties.map((option) => {
            const active = option === specialty;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSpecialty(option)}
                {...stylex.props(
                  styles.segBtn,
                  active ? styles.segBtnActive : styles.segBtnInactive,
                )}
              >
                {option === 'All' ? t('list.filterAll') : option}
              </button>
            );
          })}
        </div>

        <div {...stylex.props(styles.searchWrap)}>
          <label htmlFor="trainer-search" {...stylex.props(styles.srOnly)}>
            {t('list.searchLabel')}
          </label>
          <span {...stylex.props(styles.searchIcon)}>
            <Icon name="search" {...stylex.props(styles.searchIconSvg)} />
          </span>
          <input
            id="trainer-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('list.searchPlaceholder')}
            {...stylex.props(styles.searchInput)}
          />
        </div>
      </div>

      {/* The 2-up card grid. */}
      {trainers.length === 0 ? (
        <Card padding="none" xstyle={styles.emptyCard}>
          <span {...stylex.props(styles.emptyIcon)}>
            <Icon name="users" {...stylex.props(styles.emptyIconSvg)} />
          </span>
          <p {...stylex.props(styles.emptyTitle)}>{t('list.emptyTitle')}</p>
          <p {...stylex.props(styles.emptyHint)}>
            {canWrite ? t('list.emptyHintCanWrite') : t('list.emptyHint')}
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="none" xstyle={styles.noMatchCard}>
          {t('list.noMatch')}
        </Card>
      ) : (
        <div {...stylex.props(styles.cardGrid)}>
          {visible.map((trainer) => (
            <TrainerCard
              key={trainer.id}
              trainer={trainer}
              t={t}
              locale={locale}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}

      {/* Server-side pager (the search/segment are client-side over this page). */}
      {total > limit ? (
        <div {...stylex.props(styles.pager)}>
          <span {...stylex.props(styles.pageRange)}>
            {t('list.pageRange', { from, to, total })}
          </span>
          <div {...stylex.props(styles.pagerBtns)}>
            <Button
              variant="secondary"
              size="inline"
              onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
              disabled={!hasPrev}
              label={t('list.previous')}
            />
            <Button
              variant="secondary"
              size="inline"
              onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
              disabled={!hasNext}
              label={t('list.next')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
