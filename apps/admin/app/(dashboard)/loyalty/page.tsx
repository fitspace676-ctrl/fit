import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listRedemptionsQuerySchema,
  roleHasPermission,
  type ListRedemptionsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLoyaltyProgram, fetchLoyaltyRewards, fetchRedemptions } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { LoyaltyTabs, type LoyaltyTab } from './loyalty-tabs';
import { ProgramView } from './program-view';
import { RewardsView } from './rewards-view';
import { RedemptionsView } from './redemptions-view';

export const metadata: Metadata = {
  title: 'Loyalty — Fit Admin',
  description:
    'Configure the points program, manage the rewards catalogue, and review member redemptions.',
};

// Program config, rewards and redemptions reflect live tenant state and the staff
// session token, so this must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  crumbIcon: { width: '0.875rem', height: '0.875rem' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Resolve the shell tab from the `tab` URL param (default: program). */
function resolveTab(raw: SearchParams): LoyaltyTab {
  const tab = raw.tab;
  if (tab === 'rewards' || tab === 'redemptions') {
    return tab;
  }
  return 'program';
}

/**
 * The Loyalty workspace on Astryx + brand-tokened StyleX: a Program | Rewards |
 * Redemptions shell. Program (T12.11) is the points-program config — an
 * enable/disable toggle plus the earn rules; Rewards is the catalogue with CRUD
 * and an active toggle; Redemptions is the server-paginated, status/type-filtered
 * roster of `GET /loyalty/redemptions`. URL search params are the single source
 * of truth: the client writes `?tab=&status=&…` and this server page re-renders.
 */
export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.loyalty');
  const raw = await searchParams;
  const tab = resolveTab(raw);

  // The route is RECEPTIONIST+ (loyalty:read); writes are `LoyaltyManage`. A
  // read-only role sees the config + rosters without the edit affordances.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.LoyaltyManage);

  const errorCard = (message: string) => (
    <Card variant="default" padding={0} xstyle={styles.errorCard}>
      <Icon name="info" {...stylex.props(styles.errorIcon)} />
      <p role="alert" {...stylex.props(styles.errorText)}>
        {message}
      </p>
    </Card>
  );

  const loadError = (error: unknown) =>
    error instanceof ApiError
      ? t('errors.load', { status: error.status, message: error.message })
      : t('errors.apiUnreachable');

  let content;
  if (tab === 'rewards') {
    try {
      const rewards = await fetchLoyaltyRewards();
      content = <RewardsView rewards={rewards.data} canManage={canManage} />;
    } catch (error) {
      content = errorCard(loadError(error));
    }
  } else if (tab === 'redemptions') {
    // The same schema the API validates with (coerces page/limit, applies
    // defaults, drops the `tab` param and anything malformed).
    const parsed = listRedemptionsQuerySchema.safeParse(raw);
    const query: ListRedemptionsQuery = parsed.success
      ? parsed.data
      : listRedemptionsQuerySchema.parse({});

    try {
      const result = await fetchRedemptions(query);
      content = (
        <RedemptionsView
          redemptions={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          status={typeof raw.status === 'string' ? raw.status : ''}
          type={typeof raw.type === 'string' ? raw.type : ''}
        />
      );
    } catch (error) {
      content = errorCard(loadError(error));
    }
  } else {
    try {
      const program = await fetchLoyaltyProgram();
      content = <ProgramView program={program} canManage={canManage} />;
    } catch (error) {
      content = errorCard(loadError(error));
    }
  }

  return (
    <Stack gap={6}>
      <Breadcrumbs
        label={t('breadcrumb.label')}
        variant="supporting"
        separator={<Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />}
      >
        <BreadcrumbItem as={Link} href="/">
          Iron Gym
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>{t('breadcrumb.loyalty')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('shell.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('shell.subtitle')}
          </Text>
        </Stack>
      </HStack>

      <LoyaltyTabs active={tab} />

      {content}
    </Stack>
  );
}
