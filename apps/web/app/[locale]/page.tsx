import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tc] = await Promise.all([getTranslations('home'), getTranslations('common')]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        {tc('appName')}
      </span>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-brand-600">{t('title')}</h1>
      <p className="max-w-md text-slate-500">{t('subtitle')}</p>
      <Link
        href="/classes"
        className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {tc('cta.getStarted')}
      </Link>
    </main>
  );
}
