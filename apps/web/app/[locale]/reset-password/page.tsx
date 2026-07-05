import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthShell } from '../_components/auth/auth-shell';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password — Fit',
  description: 'Choose a new password for your Fit account.',
};

// Astryx migration (T11.9): the reset screen reuses the shared Astryx auth shell
// and its footer cross-link back to sign-in is authored in compiled StyleX on
// the Fit theme tokens, mirroring the login, register and forgot-password pages.
// The form reads the single-use token from the query string, so it is wrapped in
// Suspense (it calls `useSearchParams`).
const styles = stylex.create({
  link: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-accent)',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
  },
});

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthShell
      title={t('reset.title')}
      subtitle={t('reset.subtitle')}
      footer={
        <Link href="/login" {...stylex.props(styles.link)}>
          {t('reset.backToLogin')}
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
