import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppleSignInButton } from './apple-sign-in-button';
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-gutter text-center">
      <h1 className="text-3xl font-bold tracking-tight text-brand-600">{t('signInTitle')}</h1>
      <p className="max-w-sm text-slate-500">{t('signInSubtitle')}</p>
      <GoogleSignInButton />
      <AppleSignInButton />
    </main>
  );
}
