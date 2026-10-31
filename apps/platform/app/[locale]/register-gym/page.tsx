import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterGymForm } from '@/components/signup/register-gym-form';
import { localeAlternates } from '@/src/i18n/metadata';
import { Link } from '@/src/i18n/navigation';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'signup' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: localeAlternates('/register-gym'),
  };
}

/**
 * Owner-signup page (`/register-gym`) — the conversion endpoint every marketing
 * CTA points at. A centred single-column card so the form is the sole focus; the
 * brand wordmark links back to the homepage. The form itself ({@link
 * RegisterGymForm}) is the only client component on this surface.
 */
export default async function RegisterGymPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('signup');
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto w-full max-w-6xl px-gutter py-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-600">
          {t('page.brand')}
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-gutter py-10">
        <div className="w-full max-w-md rounded-card border border-slate-100 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('page.title')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('page.intro')}</p>
          </div>
          <RegisterGymForm />
        </div>
      </div>
    </main>
  );
}
