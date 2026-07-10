import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listCampaignsQuerySchema,
  roleHasPermission,
  type ListCampaignsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchCampaigns,
  fetchMarketingCatalog,
  fetchMarketingSegments,
  fetchMessageTemplates,
  fetchPromoCodes,
} from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { MarketingTabs, type MarketingTab } from './marketing-tabs';
import { CampaignsView } from './campaigns-view';
import { TemplatesView } from './templates-view';
import { PromoCodesView } from './promo-codes-view';
import { AudienceView } from './audience-view';

export const metadata: Metadata = {
  title: 'Marketing — Fit Admin',
  description:
    'Reach members with campaigns, promo codes, audience segments, and message templates.',
};

// Campaigns/templates reflect live tenant state and the staff session token, so
// this must never be statically rendered or cached.
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

/** Resolve the shell tab from the `tab` URL param (default: campaigns). */
function resolveTab(raw: SearchParams): MarketingTab {
  const tab = raw.tab;
  if (tab === 'promo' || tab === 'audience' || tab === 'templates') {
    return tab;
  }
  return 'campaigns';
}

/**
 * The Marketing workspace on Astryx + brand-tokened StyleX: a Campaigns | Promo
 * Codes | Audience | Templates shell. Campaigns (T12.8) is a filtered,
 * server-paginated roster of `GET /marketing/campaigns` with the four-step create
 * wizard (type → audience → content → schedule), duplicate, save-as-template and
 * delete; Templates (T12.8) is the message-template gallery with CRUD and "use in
 * campaign". Promo Codes (T12.9) is the discount-code roster with CRUD + an
 * active/inactive toggle, and Audience (T12.9) is the segment builder with a live
 * matching-members preview and saved-segment management. URL search params are the
 * single source of truth: the client writes `?tab=&status=&…` and this server page
 * re-renders.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.marketing');
  const raw = await searchParams;
  const tab = resolveTab(raw);

  // The route is MANAGER+; writes are `MarketingManage`. A read-only role sees
  // the rosters without the create/edit/delete affordances.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.MarketingManage);

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
  if (tab === 'promo') {
    try {
      const promoCodes = await fetchPromoCodes();
      content = <PromoCodesView promoCodes={promoCodes.data} canManage={canManage} />;
    } catch (error) {
      content = errorCard(loadError(error));
    }
  } else if (tab === 'audience') {
    try {
      const segments = await fetchMarketingSegments();
      content = <AudienceView segments={segments.data} canManage={canManage} />;
    } catch (error) {
      content = errorCard(loadError(error));
    }
  } else if (tab === 'templates') {
    try {
      const [templates, catalog, segments] = await Promise.all([
        fetchMessageTemplates(),
        fetchMarketingCatalog(),
        fetchMarketingSegments(),
      ]);
      content = (
        <TemplatesView
          templates={templates.data}
          canManage={canManage}
          catalog={catalog}
          segments={segments.data}
        />
      );
    } catch (error) {
      content = errorCard(loadError(error));
    }
  } else {
    // Campaigns — the same schema the API validates with (coerces page/limit,
    // applies defaults, drops the `tab` param and anything malformed).
    const parsed = listCampaignsQuerySchema.safeParse(raw);
    const query: ListCampaignsQuery = parsed.success
      ? parsed.data
      : listCampaignsQuerySchema.parse({});

    try {
      const [result, catalog, segments, templates] = await Promise.all([
        fetchCampaigns(query),
        fetchMarketingCatalog(),
        fetchMarketingSegments(),
        fetchMessageTemplates(),
      ]);
      content = (
        <CampaignsView
          campaigns={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          sort={query.sort}
          dir={query.dir}
          search={query.search ?? ''}
          status={typeof raw.status === 'string' ? raw.status : ''}
          channel={typeof raw.channel === 'string' ? raw.channel : ''}
          canManage={canManage}
          catalog={catalog}
          segments={segments.data}
          templates={templates.data}
        />
      );
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
          {t('breadcrumb.home')}
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>{t('breadcrumb.marketing')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('shell.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('shell.subtitle')}
          </Text>
        </Stack>
      </HStack>

      <MarketingTabs active={tab} />

      {content}
    </Stack>
  );
}
