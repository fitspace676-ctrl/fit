import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthShell } from '../_components/auth/auth-shell';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create account — Fit',
  description: 'Create your Fit account.',
};

// Astryx migration (T11.8): the footer cross-link to sign-in is authored in
// compiled StyleX on the Fit theme tokens, mirroring the login page. The
// locale-aware next-intl `Link` keeps the routing contract; only styling moved
// off Tailwind.
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

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthShell
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <>
          {t('register.haveAccount')}{' '}
          <Link href="/login" {...stylex.props(styles.link)}>
            {t('register.loginLink')}
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
