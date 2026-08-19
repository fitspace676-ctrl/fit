import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { AuthPhotoShell } from '../../_components/auth/auth-photo-shell';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password - FormaCore',
  description: 'Request a password reset link for your FormaCore account.',
};

/** The shell names the gym from the Host, same as sign-in — never cache it. */
export const dynamic = 'force-dynamic';

/**
 * The forgot-password door. Structurally it IS the sign-in page: same
 * photograph, same brand mark, same theme and language switches, same join
 * strip. Only the form column changes — one email field instead of two fields,
 * and a way back instead of the terms line.
 *
 * That sameness is the point. Someone arrives here from the sign-in screen
 * having failed at it, which is the worst possible moment to make them wonder
 * whether they are still on the right site; keeping every fixed element in place
 * means the only thing that moved is the thing they clicked.
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

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthPhotoShell
      title={t('forgot.title')}
      subtitle={t('forgot.subtitle')}
      footer={
        <Link href="/member/login" {...stylex.props(styles.back)}>
          <Icon name="arrowLeft" sw={2.2} {...stylex.props(styles.backIcon)} />
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthPhotoShell>
  );
}
