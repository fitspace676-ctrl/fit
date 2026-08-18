import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { AuthPhotoShell } from '../../_components/auth/auth-photo-shell';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password - FormaCore',
  description: 'Choose a new password for your FormaCore account.',
};

/** The shell names the gym from the Host, same as sign-in — never cache it. */
export const dynamic = 'force-dynamic';

/**
 * The second half of the reset flow, reached from the emailed link. It shares
 * the sign-in frame with the request screen for the same reason that one does:
 * a visitor arriving from their inbox has left the site and come back, and the
 * page they land on should be visibly the same door they started at.
 *
 * The form reads the single-use token from the query string, so it is wrapped in
 * Suspense (it calls `useSearchParams`).
 */
const styles = stylex.create({
  back: {
    marginTop: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  backIcon: { height: '0.875rem', width: '0.875rem' },
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
    <AuthPhotoShell
      title={t('reset.title')}
      subtitle={t('reset.subtitle')}
      footer={
        <Link href="/member/login" {...stylex.props(styles.back)}>
          <Icon name="arrowLeft" sw={2.2} {...stylex.props(styles.backIcon)} />
          {t('reset.backToLogin')}
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthPhotoShell>
  );
}
