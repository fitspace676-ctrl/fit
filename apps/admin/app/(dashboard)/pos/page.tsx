import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { PosBoard } from '@/components/pos/pos-board';

export const metadata: Metadata = {
  title: 'Point of sale - Fit Admin',
  description:
    'The gym’s in-person point of sale: search products, build a cart with quantity and discounts, and attach the sale to a member by name, phone, or QR scan.',
};

// The POS reflects the live catalogue and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  forbiddenPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1.5rem',
  },
  forbiddenTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  page: {
    display: 'flex',
    height: '100vh',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '1rem',
  },
  shortcuts: {
    margin: 0,
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'block',
    },
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  endOfDayLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-accent)',
    },
    textDecoration: 'none',
  },
});

/**
 * The point-of-sale workspace (T7.2). The `/pos` route already requires staff
 * (middleware), and the POS reuses the tenant-scoped product/member endpoints
 * which enforce `ProductRead` / `MemberRead` API-side; selling is a product-read
 * capability every front-desk role (RECEPTIONIST and up) holds, so the page gates
 * on `ProductRead` and renders a forbidden notice rather than a broken board for
 * anyone without it.
 *
 * The cart itself is in-memory (a client Zustand store), so the page is a thin
 * server shell: it checks the capability, then hands off to the client board.
 */
export default async function PosPage() {
  const t = await getTranslations('admin.pos');
  const session = await getServerSession();
  const canSell = session !== null && roleHasPermission(session.role, Permission.ProductRead);
  const canReconcile = session !== null && roleHasPermission(session.role, Permission.BillingRead);

  if (!canSell) {
    return (
      <div {...stylex.props(styles.forbiddenPage)}>
        <h1 {...stylex.props(styles.forbiddenTitle)}>{t('title')}</h1>
        <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>{t('forbidden')}</span>
        </Card>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <div {...stylex.props(styles.headerMeta)}>
          <p {...stylex.props(styles.shortcuts)}>{t('shortcuts')}</p>
          {canReconcile ? (
            <Link href="/pos/reconciliation" {...stylex.props(styles.endOfDayLink)}>
              {t('endOfDay')}
            </Link>
          ) : null}
        </div>
      </header>
      <PosBoard />
    </div>
  );
}
