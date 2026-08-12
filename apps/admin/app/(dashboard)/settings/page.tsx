import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { ApiError, fetchGymSettings, fetchLocations } from '@/lib/api';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = {
  title: 'Settings - Fit Admin',
  description: 'Configure your gym’s brand, locale, business hours, and operating policies.',
};

// Settings reflect live tenant state and the staff session token, so the page
// must never be statically rendered or cached.
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
  sideLink: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: '0.5rem',
    marginBlockStart: '0.5rem',
    height: '2.5rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  sideLinkIcon: { width: '1rem', height: '1rem' },
  header: {
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
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
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

/**
 * The gym settings page (T2.12), rebuilt to the formacore settings artboard.
 * Server-renders the gym's current brand, locale, business hours, and notification
 * settings from `GET /gyms/settings`, then hands them to the client
 * {@link SettingsForm} (section rail + sticky save bar). The `/settings` route is
 * already gated to a privileged session (middleware + the API's `GymManage` guard),
 * so the only failure handled here is the API call itself.
 */
export default async function SettingsPage() {
  const t = await getTranslations('admin.settings');
  try {
    const settings = await fetchGymSettings();
    // The branch list only feeds the Locations card's inline rename; a gym with no
    // locations (or a roster call that fails) still gets the full settings form.
    const locations = await fetchLocations({ limit: 100, sort: 'name', dir: 'asc' }).then(
      (page) => page.data,
      () => [],
    );
    return <SettingsForm initial={settings} locations={locations} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadSettings', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.page)}>
        <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
          <span>{t('breadcrumb.home')}</span>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <span {...stylex.props(styles.breadcrumbCurrent)}>{t('breadcrumb.settings')}</span>
        </nav>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
          {/* Its own screen rather than another rail section: twenty message
              editors do not belong in the same form as the opening hours. */}
          <Link href="/settings/email-templates" {...stylex.props(styles.sideLink)}>
            <Icon name="mail" sw={2} {...stylex.props(styles.sideLinkIcon)} />
            {t('emailTemplatesLink')}
          </Link>
        </header>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }
}
