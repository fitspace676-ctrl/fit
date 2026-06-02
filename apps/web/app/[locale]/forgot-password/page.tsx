import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthShell } from '../_components/auth/auth-shell';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset password — Fit',
  description: 'Request a password reset link for your Fit account.',
};

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
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
