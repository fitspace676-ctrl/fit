import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  gymMemberIntakeSettingsSchema,
  listMembersQuerySchema,
  roleHasPermission,
  type ListMembersQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchGymSettings, fetchMembers } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { MembersTable } from './members-table';
import { AddMemberDrawer } from './add-member-drawer';

export const metadata: Metadata = {
  title: 'Members — Fit Admin',
  description: 'The gym member roster: plan mix, search, filter, sort, open a profile, and export.',
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
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
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
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The members roster (T4.2), rebuilt on Astryx + brand-tokened StyleX (T11.19):
 * a breadcrumb + "Add member" accent button, an "N total · N active" subtitle,
 * a gym-wide plan-mix bar, segmented tabs-with-counts, search + filter, and the
 * enriched table (plan / status / last visit / next billing per row). Server-
 * renders one filtered, server-paginated page of `GET /members` (now carrying
 * `planMix` + tab `counts`) and hands it to the client table. The whole `/members`
 * route already requires `MemberRead` staff (middleware + the API guards), so the
 * only failure handled here is the API call itself.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.members');
  const raw = await searchParams;
  // The same schema the API validates with — coerces page/limit, applies defaults,
  // and drops anything malformed so a hand-edited URL can't break the page.
  const parsed = listMembersQuerySchema.safeParse(raw);
  const query: ListMembersQuery = parsed.success ? parsed.data : listMembersQuerySchema.parse({});

  // "Add member" is a `MemberWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  // The Add-Member drawer's field visibility is config-driven (Settings → Membership).
  // Only the drawer (rendered below when `canWrite`) consumes it, so skip the round-trip
  // for read-only staff; when it does fetch, kick it off here (before `await fetchMembers`)
  // so it overlaps with the members fetch instead of adding a serial hop. Fall back to
  // schema defaults if the settings fetch fails so the drawer still renders.
  const memberIntakePromise = canWrite
    ? fetchGymSettings()
        .then((s) => s.memberIntake)
        .catch(() => gymMemberIntakeSettingsSchema.parse({}))
    : null;

  let subtitle = t('list.subtitle');
  let content;
  try {
    const result = await fetchMembers(query);
    const { all, active } = result.counts;
    subtitle = all === 0 ? t('list.subtitleEmpty') : t('list.subtitleCounts', { all, active });
    content = (
      <MembersTable
        members={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        planMix={result.planMix}
        counts={result.counts}
        sort={query.sort}
        dir={query.dir}
        search={query.search ?? ''}
        status={query.status ?? ''}
        view={query.view}
        frozen={query.frozen}
        planId={query.planId ?? ''}
        tag={query.tag ?? ''}
        availableTags={result.availableTags}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadMembers', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    content = (
      <Card variant="default" padding={0} xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <p role="alert" {...stylex.props(styles.errorText)}>
          {message}
        </p>
      </Card>
    );
  }

  const memberIntake = memberIntakePromise ? await memberIntakePromise : null;

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
        <BreadcrumbItem isCurrent>{t('breadcrumb.members')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('list.title')}</Heading>
          <Text type="supporting" color="secondary">
            {subtitle}
          </Text>
        </Stack>
        {canWrite && memberIntake ? <AddMemberDrawer intake={memberIntake} /> : null}
      </HStack>

      {content}
    </Stack>
  );
}
