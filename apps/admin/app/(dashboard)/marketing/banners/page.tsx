import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchBanners } from '@/lib/api';
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@/components/ui';
import { MarketingTabs } from '../marketing-tabs';
import { BannersView } from './banners-view';

export const metadata: Metadata = {
  title: 'Banners - FormaCore Admin',
  description: 'Author the promotional carousel on the member app’s home screen.',
};

// The reel reflects live tenant state and the staff session token, so this must
// never be statically rendered or cached.
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

/**
 * Banners (T1.16) — the member app's home-screen carousel, authored here.
 *
 * ITS OWN ROUTE UNDER `/marketing`, not a fifth `?tab=` on the workspace page.
 * The other four surfaces are one screen switching content; this one is a
 * different job with a different write set (artwork upload, whole-reel reorder)
 * and it earns a URL an operator can be sent. `MarketingTabs` renders it as a tab
 * regardless, so the shell still reads as one workspace — and `ROUTE_PERMISSIONS`
 * already gates every path under `/marketing` on `MarketingRead`, so the route is
 * covered by the same entry the workspace is.
 *
 * Reads are `MarketingRead` (the route gate); writes are `MarketingManage`, so a
 * read-only role gets the reel without the new / edit / delete / reorder
 * affordances — and the Server Actions re-check regardless.
 */
export default async function BannersPage() {
  const t = await getTranslations('admin.marketing');

  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.MarketingManage);

  let content;
  try {
    const banners = await fetchBanners();
    content = <BannersView banners={banners} canManage={canManage} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.load', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    content = (
      <Card padding="none" xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <p role="alert" {...stylex.props(styles.errorText)}>
          {message}
        </p>
      </Card>
    );
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
        <BreadcrumbItem as={Link} href="/marketing">
          {t('breadcrumb.marketing')}
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>{t('shellTabs.banners')}</BreadcrumbItem>
      </Breadcrumbs>

      <HStack as="header" justify="between" align="start" gap={4} wrap="wrap">
        <Stack gap={1}>
          <Heading level={1}>{t('shell.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('shell.subtitle')}
          </Text>
        </Stack>
      </HStack>

      <MarketingTabs active="banners" />

      {content}
    </Stack>
  );
}
