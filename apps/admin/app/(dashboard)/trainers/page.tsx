import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminTrainersQuerySchema,
  roleHasPermission,
  type ListAdminTrainersQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainers } from '@/lib/api';
import { gymCalendarContext } from '@/lib/gym-time';
import { Icon } from '@/components/ui';
import { TrainersRoster } from './trainers-roster';

export const metadata: Metadata = {
  title: 'Trainers - FormaCore Admin',
  description:
    'The gym trainer roster: KPIs, specialty filter, search, and a card per coach with live rating, classes this week and next class.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  breadcrumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  addLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  addIcon: {
    width: '1rem',
    height: '1rem',
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

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The trainers roster (T4.4), rebuilt on Astryx Card/Badge + brand-tokened StyleX.
 * Server-renders one filtered, server-paginated page of `GET /admin/trainers`
 * (now carrying the gym-wide KPI `summary` and each card's live figures) and hands
 * it to the client roster (specialty segment + search + the card grid). The
 * `/trainers` route already requires staff (middleware) and the API enforces
 * `TrainerRead`, so the only failure handled here is the API call itself.
 */
export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.trainers');
  const raw = await searchParams;
  const parsed = listAdminTrainersQuerySchema.safeParse(raw);
  const query: ListAdminTrainersQuery = parsed.success
    ? parsed.data
    : listAdminTrainersQuerySchema.parse({});

  // "Add trainer" is a `TrainerWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  let subtitle = t('list.subtitleDefault');
  let content;
  try {
    const [result, { timeZone }] = await Promise.all([fetchTrainers(query), gymCalendarContext()]);
    const { total, active } = result.summary;
    subtitle = total === 0 ? t('list.subtitleEmpty') : t('list.subtitleCount', { total, active });
    content = (
      <TrainersRoster
        trainers={result.data}
        summary={result.summary}
        total={result.total}
        page={result.page}
        limit={result.limit}
        canWrite={canWrite}
        timeZone={timeZone}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadTrainers', { status: error.status, message: error.message })
        : t('errors.unreachable');
    content = (
      <div {...stylex.props(styles.errorCard)}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <p role="alert" {...stylex.props(styles.errorText)}>
          {message}
        </p>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('list.breadcrumbAria')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.breadcrumbCurrent)}>{t('list.breadcrumb')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headText)}>
          <h1 {...stylex.props(styles.title)}>{t('list.title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
        </div>
        {canWrite ? (
          <Link href="/trainers/new" {...stylex.props(styles.addLink)}>
            <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
            {t('list.addTrainer')}
          </Link>
        ) : null}
      </header>

      {content}
    </div>
  );
}
