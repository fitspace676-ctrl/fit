import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthPhotoShell } from '../../_components/auth/auth-photo-shell';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create account — Fit',
  description: 'Create your Fit account.',
};

/** The shell names the gym from the Host — never cache it. */
export const dynamic = 'force-dynamic';

/**
 * The create-account door, on the same {@link AuthPhotoShell} as sign-in.
 *
 * It used to be a centred card on a flat canvas — the last auth screen that did
 * not look like the others, which is the wrong one to single out: a visitor
 * bounces between this screen and sign-in while working out which of the two
 * they need, and the two looking different made that feel like leaving the site.
 */
const styles = stylex.create({
  footer: {
    margin: 0,
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  link: {
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
});

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthPhotoShell
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <p {...stylex.props(styles.footer)}>
          {t('register.haveAccount')}{' '}
          <Link href="/member/login" {...stylex.props(styles.link)}>
            {t('register.loginLink')}
          </Link>
        </p>
      }
    >
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthPhotoShell>
  );
}
