import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthShell } from '../_components/auth/auth-shell';
import { AppleSignInButton } from './apple-sign-in-button';
import { CredentialsLoginForm } from './credentials-login-form';
import { GoogleSignInButton } from './google-sign-in-button';

export const metadata: Metadata = {
  title: 'Sign in — Fit',
  description: 'Sign in to your Fit account.',
};

// Astryx migration (T11.7): page chrome — the forgot-password row, the
// "or continue with" divider, the social-button stack and the footer link — is
// authored in compiled StyleX on the Fit theme tokens. The locale-aware
// next-intl `Link` keeps the routing contract; only its styling moved off
// Tailwind.
const styles = stylex.create({
  forgotRow: {
    marginTop: '0.75rem',
    textAlign: 'right',
  },
  link: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-accent)',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
  },
  divider: {
    marginBlock: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
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
    alignItems: 'center',
    gap: '0.75rem',
  },
});

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthShell
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <>
          {t('login.noAccount')}{' '}
          <Link href="/register" {...stylex.props(styles.link)}>
            {t('login.registerLink')}
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <CredentialsLoginForm />
      </Suspense>

      <div {...stylex.props(styles.forgotRow)}>
        <Link href="/forgot-password" {...stylex.props(styles.link)}>
          {t('login.forgotPassword')}
        </Link>
      </div>

      <div {...stylex.props(styles.divider)}>
        <span {...stylex.props(styles.rule)} />
        {t('orContinueWith')}
        <span {...stylex.props(styles.rule)} />
      </div>

      <div {...stylex.props(styles.social)}>
        <GoogleSignInButton />
        <AppleSignInButton />
      </div>
    </AuthShell>
  );
}
