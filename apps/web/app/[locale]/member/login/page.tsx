import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthPhotoShell } from '../../_components/auth/auth-photo-shell';
import { AppleSignInButton } from './apple-sign-in-button';
import { CredentialsLoginForm } from './credentials-login-form';
import { GoogleSignInButton } from './google-sign-in-button';

export const metadata: Metadata = {
  title: 'Sign in — Fit',
  description: 'Sign in to your account, or join the gym.',
};

/** The shell names the gym from the Host — never cache it. */
export const dynamic = 'force-dynamic';

/**
 * The tenant subdomain's front door.
 *
 * Everything that is not the sign-in form itself — the gym photograph, the brand
 * mark, the theme and language switches, the "not a member yet" doorway — lives
 * in {@link AuthPhotoShell}, which the forgot-password, reset-password and
 * register screens mount too. This page owns only what is specific to signing
 * in: the credentials form, the optional social block, and the terms line.
 *
 * Staff sign in here too, but land elsewhere: `middleware.ts` sends a non-MEMBER
 * session to `/admin` after login. The console's own sign-in lives at
 * `/admin/login` for anyone arriving there directly.
 */

/**
 * Whether each social provider is wired up. Both buttons render an explanatory
 * "not configured" line when their client id is absent, which is right for a
 * developer and wrong for a member: the divider would promise an alternative
 * that is not there. Read here so the whole block can be omitted instead.
 */
const GOOGLE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const APPLE_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_APPLE_CLIENT_ID) &&
  Boolean(process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI);
const hasSocialSignIn = GOOGLE_CONFIGURED || APPLE_CONFIGURED;

const styles = stylex.create({
  divider: {
    marginBlock: '1.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  rule: {
    height: '1px',
    flex: 1,
    backgroundColor: 'var(--color-border)',
  },
  social: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  terms: {
    margin: 0,
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
  },
  // The policy clause, marked in the brand lime and ready to become a link.
  // `--color-text-accent` is lime-as-INK (brand-700 on light, brand-300 on dark)
  // rather than the block colour, which at 12px on a panel would be unreadable.
  termsPolicy: {
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
});

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthPhotoShell
      title={t('login.title')}
      footer={
        <p {...stylex.props(styles.terms)}>
          {t.rich('termsRich', {
            policy: (chunks) => <span {...stylex.props(styles.termsPolicy)}>{chunks}</span>,
          })}
        </p>
      }
    >
      <Suspense fallback={null}>
        <CredentialsLoginForm />
      </Suspense>

      {hasSocialSignIn ? (
        <>
          <div {...stylex.props(styles.divider)}>
            <span {...stylex.props(styles.rule)} />
            {t('orContinueWith')}
            <span {...stylex.props(styles.rule)} />
          </div>

          <div {...stylex.props(styles.social)}>
            {GOOGLE_CONFIGURED ? <GoogleSignInButton /> : null}
            {APPLE_CONFIGURED ? <AppleSignInButton /> : null}
          </div>
        </>
      ) : null}
    </AuthPhotoShell>
  );
}
