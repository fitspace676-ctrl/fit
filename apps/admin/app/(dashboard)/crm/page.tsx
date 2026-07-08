import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listLeadsQuerySchema,
  listOpportunitiesQuerySchema,
  roleHasPermission,
  type ListLeadsQuery,
  type ListOpportunitiesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchCrmForecast,
  fetchCrmPipeline,
  fetchLeads,
  fetchLocations,
  fetchMembers,
  fetchOpportunities,
  fetchRecentCrmActivities,
  fetchStaff,
} from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { CrmTabs, type CrmTab } from './crm-tabs';
import { LeadsView, type SelectOption } from './leads-view';
import { OpportunitiesView } from './opportunities-view';
import { ForecastView } from './forecast-view';

export const metadata: Metadata = {
  title: 'CRM — Fit Admin',
  description: 'The gym sales pipeline: leads, opportunities, and the revenue forecast.',
};

// The pipeline reflects live tenant state and the staff session token, so it
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
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

/** Resolve the shell tab from the `tab` URL param (default: leads). */
function resolveTab(raw: SearchParams): CrmTab {
  return raw.tab === 'opportunities' || raw.tab === 'forecast' ? raw.tab : 'leads';
}

/**
 * The CRM workspace on Astryx + brand-tokened StyleX: a Leads | Opportunities |
 * Forecast shell. Leads (T12.3) and Opportunities (T12.4) are filtered,
 * server-paginated rosters of `GET /crm/leads` / `GET /crm/opportunities` with
 * status chips fed by gym-wide per-status counts, add/edit forms and the
 * won/lost close dialogs; Forecast (T12.4) renders the pipeline funnel, revenue
 * forecast and recent-activity aggregations. URL search params are the single
 * source of truth: the client tables write `?tab=&search=&status=…` and this
 * server page re-renders.
 */
export default async function CrmPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('admin.crm');
  const raw = await searchParams;
  const tab = resolveTab(raw);

  // Writes (add/edit/close/delete + activities/tasks) are a `CrmManage`
  // capability — OWNER/MANAGER. Receptionists hold `CrmRead` and get a
  // read-only roster.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.CrmManage);

  let content;
  if (tab === 'leads') {
    // The same schema the API validates with — coerces page/limit, applies
    // defaults, and drops anything malformed (incl. the `tab` param).
    const parsed = listLeadsQuerySchema.safeParse(raw);
    const query: ListLeadsQuery = parsed.success ? parsed.data : listLeadsQuerySchema.parse({});

    // Filter/form option lists. `GET /staff` sits behind `StaffManage` and
    // `GET /admin/locations` behind `LocationRead`, so each is fetched only
    // when the role holds the permission and degrades to an empty list on any
    // failure — a receptionist still gets the full roster, minus that filter.
    const canListStaff = role !== null && roleHasPermission(role, Permission.StaffManage);
    const canListLocations = role !== null && roleHasPermission(role, Permission.LocationRead);
    const [staffOptions, locationOptions] = await Promise.all([
      canListStaff
        ? fetchStaff()
            .then((r) =>
              r.staff.map((s): SelectOption => ({ id: s.userId, name: s.name || s.email })),
            )
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
      canListLocations
        ? fetchLocations({ limit: 100 })
            .then((r) => r.data.map((l): SelectOption => ({ id: l.id, name: l.name })))
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
    ]);

    try {
      const result = await fetchLeads(query);
      content = (
        <LeadsView
          leads={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          counts={result.counts}
          sort={query.sort}
          dir={query.dir}
          search={query.search ?? ''}
          status={query.status ?? ''}
          source={query.source ?? ''}
          assignedToId={query.assignedToId ?? ''}
          locationId={query.locationId ?? ''}
          staffOptions={staffOptions}
          locationOptions={locationOptions}
          canManage={canManage}
        />
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? t('errors.loadLeads', { status: error.status, message: error.message })
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
  } else if (tab === 'opportunities') {
    // The same schema the API validates with — coerces page/limit, applies
    // defaults, and drops anything malformed (incl. the `tab` param).
    const parsed = listOpportunitiesQuerySchema.safeParse(raw);
    const query: ListOpportunitiesQuery = parsed.success
      ? parsed.data
      : listOpportunitiesQuerySchema.parse({});

    // The Add-Opportunity form needs a member picker + a staff selector; each
    // sits behind its own permission, is fetched only when the role holds it,
    // and degrades to an empty list on any failure. Both are only needed by the
    // write UI, so they are fetched only for `CrmManage` roles.
    const canListStaff = role !== null && roleHasPermission(role, Permission.StaffManage);
    const canListMembers = role !== null && roleHasPermission(role, Permission.MemberRead);
    const [staffOptions, memberOptions] = await Promise.all([
      canManage && canListStaff
        ? fetchStaff()
            .then((r) =>
              r.staff.map((s): SelectOption => ({ id: s.userId, name: s.name || s.email })),
            )
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
      canManage && canListMembers
        ? fetchMembers({ limit: 100, sort: 'name', dir: 'asc' })
            .then((r) => r.data.map((m): SelectOption => ({ id: m.id, name: m.name })))
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
    ]);

    try {
      const result = await fetchOpportunities(query);
      content = (
        <OpportunitiesView
          opportunities={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          counts={result.counts}
          sort={query.sort}
          dir={query.dir}
          search={query.search ?? ''}
          status={query.status ?? ''}
          type={query.type ?? ''}
          assignedToId={query.assignedToId ?? ''}
          memberOptions={memberOptions}
          staffOptions={staffOptions}
          canManage={canManage}
        />
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? t('errors.loadOpportunities', { status: error.status, message: error.message })
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
  } else {
    // Forecast tab — the pipeline funnel, revenue forecast and recent-activity
    // aggregations. A failure of any of the three endpoints degrades the whole
    // tab to an honest error card rather than a partial dashboard.
    try {
      const [pipeline, forecast, recent] = await Promise.all([
        fetchCrmPipeline(),
        fetchCrmForecast(),
        fetchRecentCrmActivities(12),
      ]);
      content = <ForecastView pipeline={pipeline} forecast={forecast} recent={recent} />;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? t('errors.loadForecast', { status: error.status, message: error.message })
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
        <BreadcrumbItem isCurrent>{t('breadcrumb.crm')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('shell.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('shell.subtitle')}
          </Text>
        </Stack>
      </HStack>

      <CrmTabs active={tab} />

      {content}
    </Stack>
  );
}
