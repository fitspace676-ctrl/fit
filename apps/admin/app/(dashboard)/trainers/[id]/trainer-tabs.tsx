'use client';

import { useState } from 'react';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AdminTrainerDetail, WeeklyAvailability } from '@fit/types';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';
import { formatClassDateTime } from '../format';
import { TrainerAvailabilityEditor } from './availability-editor';

type T = ReturnType<typeof useTranslations>;

/** The detail tabs, matching the reference order. */
const TABS = ['Overview', 'Schedule', 'Clients', 'Reviews', 'Availability'] as const;
type Tab = (typeof TABS)[number];

/** Translation key per tab. */
const TAB_LABEL_KEYS: Record<Tab, string> = {
  Overview: 'tabs.overview',
  Schedule: 'tabs.schedule',
  Clients: 'tabs.clients',
  Reviews: 'tabs.reviews',
  Availability: 'tabs.availability',
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  tabStrip: {
    display: 'flex',
    gap: '0.25rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    // No rule under the bar in light mode — the active pill alone carries the
    // state; dark keeps the hairline under its underline tabs.
    borderBottomColor: 'light-dark(transparent, var(--color-border))',
  },
  tabBtn: {
    marginBottom: '-1px',
    borderStyle: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabBtnActive: {
    borderBottomColor: 'var(--color-text-accent)',
    color: 'var(--color-text-accent)',
  },
  // The active tab, light mode: a brand pill — the raw lime with the theme's
  // on-accent ink, the member portal's pairing (mirrors the dashboard's
  // segment tabs). A separate per-theme style, not `light-dark()`: the pill's
  // radius is a length, which `light-dark()` cannot carry — and dark must keep
  // its straight underline.
  tabBtnActiveLight: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    borderBottomColor: 'transparent',
    borderRadius: '9999px',
  },
  tabBtnInactive: {
    borderBottomColor: 'transparent',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  overviewGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  aboutCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.25rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  bioText: {
    margin: 0,
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    lineHeight: 1.625,
    color: 'var(--color-text-primary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  secondaryText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  tag: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  weekCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1.25rem',
  },
  weekRows: {
    marginTop: '0.25rem',
    display: 'flex',
    flexDirection: 'column',
  },
  weekRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    ':first-child': {
      borderTopWidth: 0,
    },
  },
  weekLabel: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  weekValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  panelCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  nextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  iconTile: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  tileIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  nextTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  nextTime: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  note: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  richLink: {
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
    paddingBlock: '3rem',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
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
  emptyBody: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  reviewHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  ratingGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  bigStar: {
    width: '1.5rem',
    height: '1.5rem',
    color: 'var(--color-warning)',
  },
  bigRating: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  manageLink: {
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-text-primary)',
    },
  },
});

/** One "This week" row in the Overview side card. */
function WeekRow({ label, value }: { label: string; value: number }) {
  return (
    <div {...stylex.props(styles.weekRow)}>
      <span {...stylex.props(styles.weekLabel)}>{label}</span>
      <span {...stylex.props(styles.weekValue)}>{value}</span>
    </div>
  );
}

/**
 * The trainer detail tab strip + panels (client). Local state mirrors the
 * members detail pattern. The Overview panel renders the real About card + the
 * trainer's live "This week" counts; the other tabs surface real, tenant-scoped
 * facts (next class, rating, review moderation, availability editor) or state
 * honestly where the schema has no source (PT clients aren't modelled).
 */
export function TrainerTabs({
  trainer,
  availability,
  canEditAvailability,
  timeZone,
}: {
  trainer: AdminTrainerDetail;
  availability: WeeklyAvailability;
  /** Whether the staff session holds `TrainerScheduleManage` (the Availability tab edits). */
  canEditAvailability: boolean;
  /** The gym's IANA zone — the next-class time is read on it. */
  timeZone: string;
}) {
  const t = useTranslations('admin.trainers');
  const { theme } = useTheme();
  const locale = useLocale();
  const [active, setActive] = useState<Tab>('Overview');

  return (
    <div {...stylex.props(styles.stack)}>
      <div role="tablist" {...stylex.props(styles.tabStrip)}>
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              {...stylex.props(
                styles.tabBtn,
                isActive ? styles.tabBtnActive : styles.tabBtnInactive,
                isActive && theme === 'light' && styles.tabBtnActiveLight,
              )}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'Overview' && <OverviewPanel trainer={trainer} t={t} />}
        {active === 'Schedule' && (
          <SchedulePanel trainer={trainer} t={t} locale={locale} timeZone={timeZone} />
        )}
        {active === 'Clients' && <ClientsPanel t={t} />}
        {active === 'Reviews' && <ReviewsPanel trainer={trainer} t={t} />}
        {active === 'Availability' && (
          <AvailabilityPanel
            trainer={trainer}
            availability={availability}
            canWrite={canEditAvailability}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Overview - the About card plus the "This week" side card.
 *
 * There is no Certifications block. There used to be, and it printed
 * `trainer.specialties` a second time as "Certified - {tag}" under a heading the
 * schema has no column for; an empty roster then read "this gym tracks
 * specialties, not formal certificates", explaining an absence the UI had
 * invented. Specialties are listed once, above, which is the whole of what is
 * actually recorded.
 */
function OverviewPanel({ trainer, t }: { trainer: AdminTrainerDetail; t: T }) {
  return (
    <div {...stylex.props(styles.overviewGrid)}>
      <Card padding="none" xstyle={styles.aboutCard}>
        <div {...stylex.props(styles.block)}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('tabs.about')}</h3>
          {trainer.bio ? (
            <p {...stylex.props(styles.bioText)}>{trainer.bio}</p>
          ) : (
            <p {...stylex.props(styles.mutedText)}>{t('tabs.noBio')}</p>
          )}
        </div>

        <div {...stylex.props(styles.block)}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('tabs.specialties')}</h3>
          {trainer.specialties.length > 0 ? (
            <div {...stylex.props(styles.tagRow)}>
              {trainer.specialties.map((tag) => (
                <span key={tag} {...stylex.props(styles.tag)}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p {...stylex.props(styles.mutedText)}>{t('tabs.noSpecialties')}</p>
          )}
        </div>
      </Card>

      <Card padding="none" xstyle={styles.weekCard}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('tabs.thisWeek')}</h3>
        <div {...stylex.props(styles.weekRows)}>
          <WeekRow label={t('tabs.classesLed')} value={trainer.thisWeek.classesLed} />
          <WeekRow label={t('tabs.newReviews')} value={trainer.thisWeek.newReviews} />
          <WeekRow label={t('tabs.membersTrained')} value={trainer.thisWeek.membersTrained} />
        </div>
      </Card>
    </div>
  );
}

/** Schedule — the trainer's next class this cycle (real upcoming occurrence). */
function SchedulePanel({
  trainer,
  t,
  locale,
  timeZone,
}: {
  trainer: AdminTrainerDetail;
  t: T;
  locale: string;
  timeZone: string;
}) {
  return (
    <Card padding="none" xstyle={styles.panelCard}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('tabs.nextClass')}</h3>
      {trainer.nextClass ? (
        <div {...stylex.props(styles.nextRow)}>
          <span {...stylex.props(styles.iconTile)}>
            <Icon name="calendar" {...stylex.props(styles.tileIcon)} />
          </span>
          <div>
            <p {...stylex.props(styles.nextTitle)}>{trainer.nextClass.title}</p>
            <p {...stylex.props(styles.nextTime)}>
              {formatClassDateTime(trainer.nextClass.startsAt, locale, timeZone)}
            </p>
          </div>
        </div>
      ) : (
        <p {...stylex.props(styles.mutedText)}>{t('tabs.noUpcomingClass')}</p>
      )}
      <p {...stylex.props(styles.note)}>
        {t.rich('tabs.scheduleCalendarNote', {
          count: trainer.classesThisWeek,
          link: (chunks) => (
            <Link href="/classes" {...stylex.props(styles.richLink)}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Card>
  );
}

/**
 * Clients — the schema has no personal-training relationship, so this states that
 * honestly rather than fabricating a client list or count.
 */
function ClientsPanel({ t }: { t: T }) {
  return (
    <Card padding="none" xstyle={styles.emptyCard}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="users" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('tabs.clientsTitle')}</p>
      <p {...stylex.props(styles.emptyBody)}>{t('tabs.clientsBody')}</p>
    </Card>
  );
}

/** Reviews — the live aggregate + a link into the moderation queue. */
function ReviewsPanel({ trainer, t }: { trainer: AdminTrainerDetail; t: T }) {
  return (
    <Card padding="none" xstyle={styles.panelCard}>
      <div {...stylex.props(styles.reviewHead)}>
        <div {...stylex.props(styles.ratingGroup)}>
          <Icon name="star" {...stylex.props(styles.bigStar)} />
          <span {...stylex.props(styles.bigRating)}>{trainer.rating.toFixed(1)}</span>
        </div>
        <p {...stylex.props(styles.secondaryText)}>
          {t('tabs.reviewsSummary', {
            count: trainer.reviewCount,
            newReviews: trainer.thisWeek.newReviews,
          })}
        </p>
      </div>
      {trainer.reviewCount === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('tabs.noReviews')}</p>
      ) : (
        <p {...stylex.props(styles.secondaryText)}>{t('tabs.reviewsModerate')}</p>
      )}
    </Card>
  );
}

/**
 * Availability — the trainer's weekly recurring hours, edited in place. This tab
 * used to be a blurb linking to `/trainers/:id/edit`, which edits the profile and
 * has never touched availability; the editor below is the real control the copy
 * was promising.
 */
function AvailabilityPanel({
  trainer,
  availability,
  canWrite,
}: {
  trainer: AdminTrainerDetail;
  availability: WeeklyAvailability;
  canWrite: boolean;
}) {
  return (
    <TrainerAvailabilityEditor trainerId={trainer.id} initial={availability} canWrite={canWrite} />
  );
}
