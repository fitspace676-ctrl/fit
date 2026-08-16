import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAutomationRulesQuerySchema,
  roleHasPermission,
  type ListAutomationRulesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchAutomationRules,
  fetchAutomationStats,
  fetchAutomationTemplates,
} from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { AutomationTabs, type AutomationTab } from './automation-tabs';
import { AutomationStatsCards } from './automation-stats';
import { AutomationView } from './automation-view';
import { TemplatesView } from './templates-view';

export const metadata: Metadata = {
  title: 'Automation - Fit Admin',
  description: 'Automated "when X happens, do Y" rules that engage members and streamline ops.',
};

// The rules reflect live tenant state and the staff session token, so this must
// never be statically rendered or cached.
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

/** Resolve the shell tab from the `tab` URL param (default: rules). */
function resolveTab(raw: SearchParams): AutomationTab {
  return raw.tab === 'templates' ? 'templates' : 'rules';
}

/**
 * The Automation workspace on Astryx + brand-tokened StyleX: a Rules | Templates
 * shell. Rules (T12.6) is a filtered, server-paginated roster of
 * `GET /automation/rules` with an active toggle, category/timing badges and the
 * create/edit builder, save-as-template and delete behind `AutomationManage`;
 * Templates lists `GET /automation/templates` as a gallery whose cards seed a
 * fresh rule. URL search params are the single source of truth: the client
 * writes `?tab=&search=&active=…` and this server page re-renders.
 */
export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.automation');
  const raw = await searchParams;
  const tab = resolveTab(raw);

  // The route is MANAGER+; writes are `AutomationManage` (OWNER / MANAGER). A
  // read-only role sees the roster without the create/edit/toggle affordances.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.AutomationManage);

  // Header KPI cards — fail-soft so a stats hiccup never blanks the workspace.
  const stats = await fetchAutomationStats().catch(() => null);

  let content;
  if (tab === 'templates') {
    try {
      const result = await fetchAutomationTemplates();
      content = <TemplatesView templates={result.data} canManage={canManage} />;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? t('errors.loadTemplates', { status: error.status, message: error.message })
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
    // The same schema the API validates with — coerces page/limit/active, applies
    // defaults, and drops anything malformed (incl. the `tab` param).
    const parsed = listAutomationRulesQuerySchema.safeParse(raw);
    const query: ListAutomationRulesQuery = parsed.success
      ? parsed.data
      : listAutomationRulesQuerySchema.parse({});

    try {
      const result = await fetchAutomationRules(query);
      content = (
        <AutomationView
          rules={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          sort={query.sort}
          dir={query.dir}
          search={query.search ?? ''}
          active={typeof raw.active === 'string' ? raw.active : ''}
          canManage={canManage}
        />
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? t('errors.loadRules', { status: error.status, message: error.message })
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
          {t('breadcrumb.home')}
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>{t('breadcrumb.automation')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('shell.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('shell.subtitle')}
          </Text>
        </Stack>
      </HStack>

      {stats ? <AutomationStatsCards stats={stats} /> : null}

      <AutomationTabs active={tab} />

      {content}
    </Stack>
  );
}
