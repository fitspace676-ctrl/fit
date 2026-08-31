import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { ApiError, fetchGymSettings } from '@/lib/api';
import { Icon } from '@/components/ui';
import { MemberPortalForm } from './member-portal-form';

export const metadata: Metadata = {
  title: 'Member portal - FormaCore Admin',
  description: 'Choose the colours and the sign-in photograph your members see.',
};

// The portal's look is live tenant state read with the staff session token, so
// the page must never be statically rendered or cached.
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
 * The member portal's own look — its two colours and the sign-in photograph.
 *
 * A DESTINATION, not a Settings tab. Settings is the gym's operating policy —
 * what the desk collects, what the till accepts, how invoices are numbered — and
 * it is arranged as a rail of forms because that is what policy is. This screen
 * is a design surface: two colours, a photograph, and a live mock of the door the
 * member actually arrives at. It is opened for a different reason, by a different
 * person, on a different day, and it needs the width the preview costs.
 *
 * Server-renders the whole settings blob from `GET /gyms/settings` and hands it to
 * the client {@link MemberPortalForm}. The whole blob rather than just
 * `memberPortal`, because the null-means-inherit colours can only be *rendered* —
 * in the controls and in the preview — beside the brand values they fall back to,
 * and the preview also wants the gym's name and logo to look like the real door.
 *
 * The route is gated to `OWNER`+ by `middleware.ts` (`ROUTE_PERMISSIONS`) and the
 * API re-checks `GymManage` behind every write, so the only failure handled here
 * is the read itself.
 */
export default async function MemberPortalPage() {
  const t = await getTranslations('admin.memberPortal');
  try {
    const settings = await fetchGymSettings();
    return <MemberPortalForm initial={settings} />;
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
          <span {...stylex.props(styles.breadcrumbCurrent)}>{t('breadcrumb.current')}</span>
        </nav>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </header>
        <Card padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }
}
