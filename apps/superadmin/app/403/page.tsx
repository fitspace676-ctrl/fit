import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { Badge, Card } from '@fit/ui-kit';
import { SignOutButton } from '@/components/sign-out-button';

export const metadata: Metadata = {
  title: 'Access denied - FormaCore SuperAdmin',
  description: 'This console is restricted to platform operators.',
};

/**
 * Where an authenticated non-operator lands.
 *
 * Distinct from the sign-in page, because signing in again would not help: this
 * account is not flagged `isSuperAdmin` and no amount of re-authenticating will
 * change that. The one useful action is to drop the session that got here, so
 * the operator can sign in as themselves.
 */
const styles = stylex.create({
  main: {
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: '1.5rem',
    paddingBlock: '4rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '26rem',
    padding: '2rem',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  body: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  action: {
    marginTop: '0.75rem',
    width: '100%',
    maxWidth: '12rem',
  },
});

export default function ForbiddenPage() {
  return (
    <main {...stylex.props(styles.main)}>
      <Card padding="none" xstyle={styles.card}>
        <Badge label="403" tone="danger" />
        <h1 {...stylex.props(styles.title)}>Access denied</h1>
        <p {...stylex.props(styles.body)}>
          This console is restricted to platform operators. You are signed in, but this account is
          not one.
        </p>
        <div {...stylex.props(styles.action)}>
          <SignOutButton />
        </div>
      </Card>
    </main>
  );
}
