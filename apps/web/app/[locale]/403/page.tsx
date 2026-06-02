import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';

export const metadata: Metadata = {
  title: 'Access denied — Fit',
  description: 'You do not have permission to view this page.',
};

export default async function ForbiddenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('errors.forbidden');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        {t('badge')}
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('title')}</h1>
      <p className="max-w-sm text-slate-500">{t('description')}</p>
      <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        {t('backHome')}
      </Link>
    </main>
  );
}
