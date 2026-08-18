import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { OperatorLoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Operator sign in — FormaCore',
  description: 'Sign in to the FormaCore platform operator console.',
};

/**
 * The console's sign-in (`/login`).
 *
 * The operator console needs a door of its own because its session cookies are
 * host-only (see `lib/auth-session.ts`): no other surface can mint a session for
 * this host, so there is nowhere else to be sent.
 *
 * Deliberately plain — no "create an account", no password reset. A SUPER_ADMIN
 * is flagged in the database by hand; both would be paths to nowhere. Recovery
 * runs through the member site's reset flow, which sets the same credentials.
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
    width: '100%',
    maxWidth: '24rem',
    padding: '2rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  body: {
    marginTop: '1.75rem',
  },
});

export default function OperatorLoginPage() {
  return (
    <main {...stylex.props(styles.main)}>
      <Card padding="none" xstyle={styles.card}>
        <div {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>Operator sign in</h1>
          <p {...stylex.props(styles.subtitle)}>
            Platform administrators only. Every gym on FormaCore is managed from here.
          </p>
        </div>
        <div {...stylex.props(styles.body)}>
          {/* `useSearchParams` (the `?from` return path) needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <OperatorLoginForm />
          </Suspense>
        </div>
      </Card>
    </main>
  );
}
