import { Suspense } from 'react';
import { Card } from '@fit/ui-kit';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { StaffLoginForm } from './staff-login-form';

export const metadata: Metadata = {
  title: 'Staff sign in — Fit',
  description: 'Sign in to the Fit staff console.',
};

/**
 * The console's sign-in (`/admin/login`).
 *
 * The console used to have no door of its own: an unauthenticated request was
 * bounced to the *member* site's `/login`, which meant staff and members typed
 * their passwords into the same form and the member front door doubled as the
 * staff entrance. Now each surface owns its own sign-in, and this one sits
 * inside the `/admin` basePath so an operator can bookmark the console and stay
 * there.
 *
 * Deliberately plain — no social sign-in, no "create an account", no password
 * reset link. Staff accounts are provisioned by invitation from the console
 * itself, so every one of those would be a path to nowhere. Recovery is the
 * member site's reset flow, which sets the same session.
 *
 * Rendered outside the `(dashboard)` route group so it gets none of the console
 * chrome — a signed-out operator has no gym context to render a sidebar from.
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
    backgroundColor: 'var(--color-background-body)',
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

export default function AdminLoginPage() {
  return (
    <main {...stylex.props(styles.main)}>
      <Card padding="none" xstyle={styles.card}>
        <div {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>Staff sign in</h1>
          <p {...stylex.props(styles.subtitle)}>
            Use your staff account to open the console for this gym.
          </p>
        </div>
        <div {...stylex.props(styles.body)}>
          {/* `useSearchParams` (the `?from` return path) needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <StaffLoginForm />
          </Suspense>
        </div>
      </Card>
    </main>
  );
}
