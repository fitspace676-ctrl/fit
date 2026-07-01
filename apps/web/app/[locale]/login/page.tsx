import { Suspense } from 'react';
import type { Metadata } from 'next';
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
          <Link
            href="/register"
            className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
          >
            {t('login.registerLink')}
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <CredentialsLoginForm />
      </Suspense>

      <div className="mt-3 text-right">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          {t('login.forgotPassword')}
        </Link>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-400">
        <span className="h-px flex-1 bg-ink-200 dark:bg-white/10" />
        {t('orContinueWith')}
        <span className="h-px flex-1 bg-ink-200 dark:bg-white/10" />
      </div>

      <div className="flex flex-col items-center gap-3">
        <GoogleSignInButton />
        <AppleSignInButton />
      </div>
    </AuthShell>
  );
}
