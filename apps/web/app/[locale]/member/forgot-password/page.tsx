import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthShell } from '../../_components/auth/auth-shell';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password — Fit',
  description: 'Request a password reset link for your Fit account.',
};

// Astryx migration (T11.9): the footer cross-link back to sign-in is authored in
// compiled StyleX on the Fit theme tokens, mirroring the login and register
// pages. The locale-aware next-intl `Link` keeps the routing contract; only its
// styling moved off Tailwind.
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

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthShell
      title={t('forgot.title')}
      subtitle={t('forgot.subtitle')}
      footer={
        <Link href="/member/login" {...stylex.props(styles.link)}>
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
